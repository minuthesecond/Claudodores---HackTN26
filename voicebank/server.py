"""
Voicebank server: banks a patient's voice and speaks transcripts in it. Runs on :8003, next to the
lip reader (:8000) and the built-in voice server (:8001), which it doesn't touch.

Run:   ./run.sh                 (makes .venv on first run)
Test:  ./run.sh --test

  POST   /auth/signup {"username", "password", "name", "claim": [ids]}  -> {"token", "user"}
  POST   /auth/login {"username", "password"}     -> {"token", "user"}
  POST   /auth/logout                             -> ends this token's session
  GET    /auth/me                                 -> the signed-in user

  GET    /health                                  -> {"ok", "device", "engine"}
  GET    /prompts                                 -> what to read aloud when recording
  GET    /profiles[?ids=a,b]                      -> your voices (signed in), plus unowned ones you made (ids)
  POST   /profiles {"name", "consent": true}      -> new draft voice
  GET    /profiles/{id}                           -> voice + its recordings + warnings
  DELETE /profiles/{id}                           -> removes every file of that voice
  POST   /profiles/{id}/media  (multipart: file, kind=recording, prompt=N)  -> cleaned right away
  POST   /profiles/{id}/media  (multipart: file, kind=upload)              -> queued; Demucs in the background
  DELETE /profiles/{id}/media/{mid}
  GET    /profiles/{id}/media/{mid}/audio.wav
  POST   /profiles/{id}/build                     -> clone from the recordings; status -> preview
  POST   /profiles/{id}/redo                      -> back to draft
  POST   /profiles/{id}/approve                   -> status -> approved, pre-speaks the ICU phrases
  GET    /speak?profile={id}&text=...             -> .wav (whole file)
  GET    /speak/stream?profile={id}&text=...      -> .wav streamed as it's generated (same format as voice/)

Accounts: send `Authorization: Bearer <token>`. A voice made while signed in belongs to that account and
only its owner can see or change it. One made before signing up has no owner (whoever has its id can use
it) until signup claims it. Audio and speech URLs work by id alone, so <audio> elements can play them.
"""

import argparse
import hashlib
import sqlite3
import os
import queue
import shutil
import struct
import tempfile
import threading
import time
import wave

import auth
import banking
import engines
import prompts
import store

engine = engines.load()
_latents = {}  # profile id -> (mtime, bytes)
_warming = set()  # profile ids whose phrases are being pre-spoken
_uploads = queue.Queue()  # (profile id, media id, incoming path); one worker, one upload at a time


def wav_header(rate=banking.SAMPLE_RATE):
    """WAV header for a stream of unknown length (16-bit mono); browsers play it as it arrives."""
    unknown = 0xFFFFFFFF
    return struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", unknown, b"WAVE", b"fmt ", 16, 1, 1,
                       rate, rate * 2, 2, 16, b"data", unknown)


def save_wav(path, pcm):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(banking.SAMPLE_RATE)
        w.writeframes(pcm)
    os.replace(tmp, path)


def phrase_path(pid, text, language="en"):
    key = hashlib.md5(f"{language}|{text}".encode()).hexdigest()[:12]
    return os.path.join(store.phrases_dir(pid), f"{key}.wav")


def latents(pid):
    path = store.latents_path(pid)
    mtime = os.path.getmtime(path)
    if pid not in _latents or _latents[pid][0] != mtime:
        with open(path, "rb") as f:
            _latents[pid] = (mtime, f.read())
    return _latents[pid][1]


def speech_seconds(media):
    return sum(m["duration_s"] for m in media if m["status"] == "ready")


def describe(p):
    """A profile as the UI sees it: the row, its recordings, warnings, phrase progress."""
    media = store.list_media(p["id"])
    secs = speech_seconds(media)
    processing = sum(m["status"] == "processing" for m in media)
    done = sum(os.path.isfile(phrase_path(p["id"], t)) for t in prompts.PHRASES)
    return {
        **p,
        "speech_seconds": round(secs, 1),
        "media": media,
        "processing": processing,
        "warnings": banking.warnings_for(secs),
        "can_build": secs >= banking.MIN_SPEECH_S and not processing,
        "phrases": {"done": done, "total": len(prompts.PHRASES), "warming": p["id"] in _warming},
    }


def warm_phrases(pid):
    """Pre-speaks the ICU phrases in a newly approved voice, one at a time, so live sentences can run between them."""
    try:
        for text in prompts.PHRASES:
            if not store.get_profile(pid):
                return  # deleted meanwhile
            path = phrase_path(pid, text)
            if not os.path.isfile(path):
                save_wav(path, b"".join(engine.speak_stream(text, latents(pid))))
        print(f"Phrases ready for {pid}", flush=True)
    finally:
        _warming.discard(pid)


def upload_worker():
    """Processes queued uploads one at a time: Demucs vocals, pauses cut. The original file is
    deleted as soon as it's done (or fails), so no video stays on disk."""
    while True:
        pid, mid, src = _uploads.get()
        try:
            if not store.get_media(mid):
                continue  # removed while queued

            def progress(stage, frac):
                store.update_media(mid, stage=stage, progress=round(frac, 3))

            secs = banking.process_upload(src, store.media_path(pid, mid), progress)
            if not store.get_media(mid):  # removed while it was processing
                os.remove(store.media_path(pid, mid))
                continue
            store.update_media(mid, status="ready", stage=None, progress=None, duration_s=round(secs, 2))
        except banking.MediaError as e:
            store.update_media(mid, status="failed", stage=None, error=str(e))
        except Exception as e:
            if store.get_media(mid):  # a deleted voice takes its folder with it mid-job; that's fine
                print(f"Upload {mid} failed: {e!r}", flush=True)
                store.update_media(mid, status="failed", stage=None, error="Processing failed; try another file")
        finally:
            try:
                os.remove(src)
            except FileNotFoundError:
                pass


def make_app():
    from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
    from pydantic import BaseModel

    app = FastAPI(title="Voicebank")

    @app.middleware("http")
    async def reject_huge_uploads(request, call_next):
        """413 from the headers alone, before a 500 MB+ body is read (64 KB slack for the multipart wrapping,
        which is a few hundred bytes; save_capped() still enforces the exact limit on the file itself)."""
        if request.url.path.endswith("/media") and \
                int(request.headers.get("content-length") or 0) > banking.MAX_UPLOAD_BYTES + (64 << 10):
            return JSONResponse({"detail": "Files are limited to 500 MB"}, status_code=413)
        return await call_next(request)

    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.on_event("startup")
    def startup():
        # A server restart mid-build or mid-upload leaves things stuck; reset them
        for p in store.list_profiles():
            if p["status"] == "building":
                store.update_profile(p["id"], status="draft")
            for m in store.list_media(p["id"]):
                if m["status"] == "processing":
                    store.update_media(m["id"], status="failed", stage=None,
                                       error="The server restarted while this was processing; add it again")
            shutil.rmtree(os.path.dirname(store.incoming_path(p["id"], "x", "")), ignore_errors=True)
        threading.Thread(target=upload_worker, daemon=True).start()
        engine.warm()
        print("Voicebank ready", flush=True)

    def current_user(authorization: str | None = Header(None)):
        """The signed-in user, or None for a visitor."""
        token = auth.bearer(authorization)
        return store.session_user(auth.token_hash(token)) if token else None

    def signed_in(user=Depends(current_user)):
        if not user:
            raise HTTPException(401, "Sign in first")
        return user

    def profile_or_404(pid, user=None, owner_only=True):
        """A voice; someone else's counts as missing unless `owner_only` is off (audio by id)."""
        p = store.get_profile(pid)
        if not p or (owner_only and p.get("user_id") and (not user or user["id"] != p["user_id"])):
            raise HTTPException(404, "No such voice")
        return p

    # ---- accounts

    class Signup(BaseModel):
        username: str
        password: str
        name: str = ""
        claim: list[str] = []

    class Login(BaseModel):
        username: str
        password: str

    def session_for(user):
        token, hashed, expires = auth.new_token()
        store.add_session(hashed, user["id"], expires)
        return {"token": token, "user": user}

    @app.post("/auth/signup")
    def signup(req: Signup):
        username = req.username.strip()
        error = auth.check_signup(username, req.password)
        if error:
            raise HTTPException(400, error)
        try:
            user = store.create_user(username, (req.name.strip() or username)[:80], auth.hash_password(req.password))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That username is taken")
        for pid in req.claim[:20]:
            store.claim_profile(pid, user["id"])
        return session_for(user)

    @app.post("/auth/login")
    def login(req: Login):
        row = store.get_user_login(req.username.strip())
        if not row or not auth.check_password(req.password, row["password"]):
            raise HTTPException(401, "Wrong username or password")
        return session_for(store.get_user(row["id"]))

    @app.post("/auth/logout")
    def logout(authorization: str | None = Header(None)):
        token = auth.bearer(authorization)
        if token:
            store.delete_session(auth.token_hash(token))
        return {"ok": True}

    @app.get("/auth/me")
    def me(user=Depends(signed_in)):
        return user

    @app.get("/health")
    def health():
        return {"ok": True, "device": engine.device, "engine": engine.name}

    @app.get("/prompts")
    def get_prompts():
        return {"prompts": prompts.PROMPTS, "preview": prompts.PREVIEW}

    class NewProfile(BaseModel):
        name: str
        consent: bool = False

    @app.get("/profiles")
    def list_profiles(ids: str = "", user=Depends(current_user)):
        mine = [i for i in ids.split(",") if i][:20]
        if not user and not mine:
            return []
        return [describe(p) for p in store.list_profiles(user["id"] if user else None, mine)]

    @app.post("/profiles")
    def create_profile(req: NewProfile, user=Depends(current_user)):
        name = req.name.strip()
        if not name:
            raise HTTPException(400, "Give the voice a name")
        if not req.consent:
            raise HTTPException(400, "Consent is required to bank a voice")
        p = store.create_profile(name[:80])
        if user:
            store.claim_profile(p["id"], user["id"])
        return describe(store.get_profile(p["id"]))

    @app.get("/profiles/{pid}")
    def get_profile(pid: str, user=Depends(current_user)):
        return describe(profile_or_404(pid, user))

    @app.delete("/profiles/{pid}")
    def delete_profile(pid: str, user=Depends(current_user)):
        profile_or_404(pid, user)
        store.delete_profile(pid)
        _latents.pop(pid, None)
        return {"ok": True}

    def save_capped(file, path, on_too_big):
        """Streams the upload to `path`, giving up past MAX_UPLOAD_BYTES (in case Content-Length lied)."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        size = 0
        with open(path, "wb") as out:
            while chunk := file.file.read(1 << 20):
                size += len(chunk)
                if size > banking.MAX_UPLOAD_BYTES:
                    break
                out.write(chunk)
        if size > banking.MAX_UPLOAD_BYTES:
            os.remove(path)
            on_too_big()
            raise HTTPException(413, "Files are limited to 500 MB")

    @app.post("/profiles/{pid}/media")
    def add_media(pid: str, file: UploadFile = File(...),
                  kind: str = Form("recording"), prompt: int | None = Form(None), user=Depends(current_user)):
        p = profile_or_404(pid, user)
        if p["status"] == "building":
            raise HTTPException(409, "Wait for the build to finish")
        if kind not in ("recording", "upload"):
            raise HTTPException(400, "kind must be recording or upload")
        ext = os.path.splitext(file.filename or "")[1].lower()[:8] or ".webm"

        if kind == "upload":
            uploads = [m for m in store.list_media(pid) if m["kind"] == "upload" and m["status"] != "failed"]
            if len(uploads) >= banking.MAX_UPLOADS:
                raise HTTPException(400, f"A voice can have at most {banking.MAX_UPLOADS} uploads; remove one first")
            m = store.add_media(pid, kind, None, file.filename)
            src = store.incoming_path(pid, m["id"], ext)
            save_capped(file, src, lambda: store.delete_media(m["id"]))
            try:
                secs = banking.validate_upload(src)  # fast: reject before queuing heavy work
            except banking.MediaError as e:
                os.remove(src)
                store.delete_media(m["id"])
                raise HTTPException(422, str(e))
            store.update_media(m["id"], stage="queued", progress=0.0, duration_s=round(secs, 2))
            _uploads.put((pid, m["id"], src))
        else:
            # Re-recording a prompt replaces the old take
            if prompt is not None:
                for old in store.list_media(pid):
                    if old["kind"] == "recording" and old["prompt"] == prompt:
                        store.delete_media(old["id"])
            m = store.add_media(pid, kind, prompt, file.filename)
            with tempfile.TemporaryDirectory() as tmp:
                src = os.path.join(tmp, f"take{ext}")
                save_capped(file, src, lambda: store.delete_media(m["id"]))
                try:
                    secs = banking.clean_recording(src, store.media_path(pid, m["id"]))
                    store.update_media(m["id"], status="ready", duration_s=round(secs, 2))
                except banking.MediaError as e:
                    store.update_media(m["id"], status="failed", error=str(e))

        if p["status"] != "draft":  # new audio means the clone is out of date
            store.update_profile(pid, status="draft")
        return describe(store.get_profile(pid))

    @app.delete("/profiles/{pid}/media/{mid}")
    def delete_media(pid: str, mid: str, user=Depends(current_user)):
        profile_or_404(pid, user)
        store.delete_media(mid)
        store.update_profile(pid, status="draft")
        return describe(store.get_profile(pid))

    @app.get("/profiles/{pid}/media/{mid}/audio.wav")
    def media_audio(pid: str, mid: str):
        path = store.media_path(pid, mid)
        if not os.path.isfile(path):
            raise HTTPException(404, "No such recording")
        return FileResponse(path, media_type="audio/wav")

    @app.post("/profiles/{pid}/build")
    def build(pid: str, user=Depends(current_user)):
        p = profile_or_404(pid, user)
        if p["status"] == "building":
            raise HTTPException(409, "Already building")
        all_media = store.list_media(pid)
        if any(m["status"] == "processing" for m in all_media):
            raise HTTPException(409, "Wait for uploads to finish processing")
        media = [m for m in all_media if m["status"] == "ready"]
        if speech_seconds(media) < banking.MIN_SPEECH_S:
            raise HTTPException(400, banking.warnings_for(speech_seconds(media))[0])

        # Recordings in prompt order (the first prompts are the clearest), then windows from uploads
        recs = sorted((m for m in media if m["kind"] == "recording"), key=lambda m: (m["prompt"] or 0, m["created_at"]))
        ups = [m for m in media if m["kind"] == "upload"]
        clip = lambda m: (store.media_path(pid, m["id"]), m["duration_s"])  # noqa: E731

        store.update_profile(pid, status="building", error=None)
        try:
            chosen = banking.select_refs(banking.candidates([clip(m) for m in recs], [clip(m) for m in ups]))
            refs = banking.write_refs(chosen, store.refs_dir(pid))
            voice = engine.clone(refs)
            with open(store.latents_path(pid), "wb") as f:
                f.write(voice)
            shutil.rmtree(store.phrases_dir(pid), ignore_errors=True)  # cached phrases are in the old voice
            store.update_profile(pid, status="preview")
        except Exception as e:
            store.update_profile(pid, status="failed", error=str(e)[:300])
            raise HTTPException(500, f"Couldn't build the voice: {e}")
        return describe(store.get_profile(pid))

    @app.post("/profiles/{pid}/redo")
    def redo(pid: str, user=Depends(current_user)):
        profile_or_404(pid, user)
        store.update_profile(pid, status="draft", approved_at=None)
        return describe(store.get_profile(pid))

    @app.post("/profiles/{pid}/approve")
    def approve(pid: str, user=Depends(current_user)):
        p = profile_or_404(pid, user)
        if p["status"] not in ("preview", "approved"):
            raise HTTPException(409, "Build and preview the voice first")
        store.update_profile(pid, status="approved", approved_at=time.time())
        if pid not in _warming:
            _warming.add(pid)
            threading.Thread(target=warm_phrases, args=(pid,), daemon=True).start()
        return describe(store.get_profile(pid))

    def ready_voice(pid):
        p = profile_or_404(pid, owner_only=False)
        if p["status"] not in ("preview", "approved") or not os.path.isfile(store.latents_path(pid)):
            raise HTTPException(409, "That voice isn't built yet")
        return latents(pid)

    def clean(text):
        text = text.strip().lower()
        if not text:
            raise HTTPException(400, "text is empty")
        return text

    @app.get("/speak")
    def speak(text: str, profile: str, language: str = "en"):
        text, voice = clean(text), ready_voice(profile)
        path = phrase_path(profile, text, language)
        if not os.path.isfile(path):
            save_wav(path, b"".join(engine.speak_stream(text, voice, language)))
        return FileResponse(path, media_type="audio/wav")

    @app.get("/speak/stream")
    def speak_stream(text: str, profile: str, language: str = "en"):
        """Same audio as /speak, sent while it's generated. Cached phrases come straight from disk."""
        text, voice = clean(text), ready_voice(profile)
        path = phrase_path(profile, text, language)

        def audio():
            yield wav_header()
            if os.path.isfile(path):
                with wave.open(path) as w:
                    yield w.readframes(w.getnframes())
                return
            yield from engine.speak_stream(text, voice, language)

        return StreamingResponse(audio(), media_type="audio/wav")

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8003)))
    opts = parser.parse_args()

    import uvicorn
    uvicorn.run(make_app(), host="0.0.0.0", port=opts.port)
