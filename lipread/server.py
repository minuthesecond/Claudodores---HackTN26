"""HTTP/WebSocket wrapper around live.py's pipeline, for the web frontend (../frontend).

WS /stream: the browser streams camera frames; each connection runs live.py's loop on
them (Face Landmarker -> jawOpen phrase segmentation -> keypoints -> 25fps resample ->
Auto-AVSR LRS3_V_WER19.1 + language model). While a phrase is being mouthed, a fast
partial decode is sent about once a second; when the speaker pauses, the full decode
finalizes it.

POST /transcribe: one-shot decode of an uploaded clip (handy for testing).

Run:  python lipread/server.py [--port 8000]
Test: python lipread/server.py --test talking.MOV
"""
import argparse
import asyncio
import json
import os
import struct
import tempfile
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import av
import cv2
import numpy as np

from mouth import JAW_OPEN, MouthTracker
from vsr import LipReader, keypoints, resample

env = lambda name, default: type(default)(os.environ.get(name, default))

# Same as live.py
START = 0.10  # jaw opening that starts a phrase
STILL = 0.04  # jaw opening below this counts as a pause
PAUSE = env("PAUSE", 1.0)  # seconds of pause that ends a phrase
MAX_SECONDS = 8.0
MIN_SECONDS = 0.8
PREROLL = 0.6  # seconds kept before the phrase starts
MAX_SIDE = 960  # same downscale as mouth.read_video

FINAL_BEAM = env("FINAL_BEAM", 40)  # live.py's config
PARTIAL_BEAM = env("PARTIAL_BEAM", 4)  # in-progress text only; finals always use FINAL_BEAM
PARTIAL_EVERY = env("PARTIAL_EVERY", 0.5)  # seconds between partial decodes

print("loading lip-reading model...")
reader = LipReader()
model_lock = threading.Lock()
model_pool = ThreadPoolExecutor(max_workers=1)  # one decode at a time, like live.py


def read(clip, beam=FINAL_BEAM):
    """clip: list of (rgb frame, keypoints or None, seconds). Returns lower-case text."""
    frames, kps, times = zip(*clip)
    frames, kps = resample(list(frames), list(kps), list(times))
    with model_lock:
        reader.pipe.model.beam_search.beam_size = beam
        return reader(frames, kps).strip().lower()


class Session:
    """live.py's main loop, fed by frames from one browser connection."""

    def __init__(self, emit):
        self.emit = emit  # thread-safe: emit(dict) sends a message to the browser
        self.tracker = MouthTracker()
        self.prev_t = None
        self.preroll = deque()
        self.clip = None
        self.clip_id = 0
        self.quiet_since = None
        self.last_partial = 0.0
        self.final = None
        self.partial = None

    def on_frame(self, jpeg, t):
        bgr = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            return
        s = MAX_SIDE / max(bgr.shape[:2])
        if s < 1:
            bgr = cv2.resize(bgr, None, fx=s, fy=s)
        feat, pts = self.tracker(bgr, 33 if self.prev_t is None else (t - self.prev_t) * 1000)
        self.prev_t = t
        h, w = bgr.shape[:2]
        jaw = 0.0 if feat is None else float(feat[JAW_OPEN])
        kp = None if pts is None else keypoints(pts, w, h)
        item = (cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), kp, t)

        if self.clip is None:  # idle: keep a short rolling pre-roll, wait for the mouth to open
            self.preroll.append(item)
            while self.preroll and t - self.preroll[0][2] > PREROLL:
                self.preroll.popleft()
            if jaw > START and not running(self.final):
                self.clip_id += 1
                self.clip, self.quiet_since, self.last_partial = list(self.preroll), None, t
                self.emit({"type": "status", "status": "recording", "clip": self.clip_id})
            return

        self.clip.append(item)
        self.quiet_since = (self.quiet_since or t) if jaw < STILL else None
        done = self.quiet_since is not None and t - self.quiet_since > PAUSE
        if done or t - self.clip[0][2] > MAX_SECONDS:
            self.finish()
        elif (
            self.quiet_since is None  # mouth moving; once it's still, keep the model free for the final
            and t - self.last_partial >= PARTIAL_EVERY
            and t - self.clip[0][2] >= MIN_SECONDS
            and not running(self.partial)
            and not running(self.final)
        ):
            self.last_partial = t
            self.partial = model_pool.submit(self._partial, list(self.clip), self.clip_id)

    def flush(self):
        if self.clip is not None:
            self.finish()

    def finish(self):
        clip, cid = self.clip, self.clip_id
        self.clip = None
        self.preroll.clear()
        if len(clip) >= 2:  # diagnostics: the model wants ~25 fps of sharp frames with a face
            dur = clip[-1][2] - clip[0][2]
            faces = sum(kp is not None for _, kp, _ in clip)
            h, w = clip[0][0].shape[:2]
            print(f"clip {cid}: {dur:.1f}s, {len(clip)} frames ({len(clip) / dur:.0f} fps), {w}x{h}, "
                  f"face in {100 * faces // len(clip)}%", flush=True)
        if len(clip) < 2 or clip[-1][2] - clip[0][2] <= MIN_SECONDS:
            self.emit({"type": "status", "status": "idle"})
            return
        if not any(kp is not None for _, kp, _ in clip):
            self.emit({"type": "final", "clip": cid, "text": "", "error": "no face found in clip"})
            self.emit({"type": "status", "status": "idle"})
            return
        self.emit({"type": "status", "status": "processing", "clip": cid})
        self.final = model_pool.submit(self._final, clip, cid, time.time())

    def _partial(self, clip, cid):
        try:
            text = read(clip, PARTIAL_BEAM)
        except Exception:
            return
        if cid == self.clip_id and self.clip is not None:  # phrase still open
            self.emit({"type": "partial", "clip": cid, "text": text})

    def _final(self, clip, cid, start):
        try:
            msg = {"type": "final", "clip": cid, "text": read(clip), "seconds": round(time.time() - start, 2)}
        except Exception as e:
            msg = {"type": "final", "clip": cid, "text": "", "error": str(e) or type(e).__name__}
        print(f"clip {cid}: {msg.get('text') or msg.get('error')!r} in {time.time() - start:.1f}s", flush=True)
        self.emit(msg)
        self.emit({"type": "status", "status": "idle"})

    def close(self):
        self.tracker.lm.close()


def running(future):
    return future is not None and not future.done()


# ---------- one-shot clips ----------
clip_tracker = MouthTracker()
clip_lock = threading.Lock()


def decode(path):
    """Yield (upright BGR frame, timestamp seconds) using the clip's real timestamps."""
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        for i, frame in enumerate(container.decode(stream)):
            t = frame.time if frame.time is not None else i / float(stream.average_rate or 30)
            bgr = frame.to_ndarray(format="bgr24")
            s = MAX_SIDE / max(bgr.shape[:2])
            if s < 1:
                bgr = cv2.resize(bgr, None, fx=s, fy=s)
            yield bgr, t


def transcribe(path):
    start = time.time()
    with clip_lock:
        items, prev = [], None
        for bgr, t in decode(path):
            feat, pts = clip_tracker(bgr, 33 if prev is None else (t - prev) * 1000)
            prev = t
            h, w = bgr.shape[:2]
            jaw = 0.0 if feat is None else float(feat[JAW_OPEN])
            kp = None if pts is None else keypoints(pts, w, h)
            items.append((cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), kp, t, jaw))

    if not any(kp is not None for _, kp, _, _ in items):
        return {"raw": "", "error": "no face found in clip"}

    # Trim the lead-in to live.py's pre-roll: start PREROLL s before the mouth first opens.
    first = next((t for *_, t, jaw in items if jaw > START), items[0][2])
    clip = [(f, k, t) for f, k, t, _ in items if t >= first - PREROLL]
    if len(clip) < 2:
        return {"raw": "", "error": "clip too short"}
    return {"raw": read(clip), "seconds": round(time.time() - start, 2)}


# ---------- web server ----------
def make_app():
    from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect

    app = FastAPI(title="Lip Reader (live.py pipeline)")

    @app.get("/health")
    def health():
        return {"ok": True, "device": reader.device, "model": "LRS3_V_WER19.1", "stream": True}

    @app.post("/transcribe")
    def transcribe_endpoint(file: UploadFile = File(...)):
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "clip.webm").suffix) as tmp:
            tmp.write(file.file.read())
            tmp.flush()
            try:
                return transcribe(tmp.name)
            except Exception as e:  # e.g. undecodable clip; live.py shows these as "(error: ...)"
                return {"raw": "", "error": str(e) or type(e).__name__}

    @app.websocket("/stream")
    async def stream(ws: WebSocket):
        """Binary message = 8-byte little-endian float64 capture time (ms) + JPEG frame.
        Text message {"type": "flush"} = finish the open phrase now."""
        await ws.accept()
        loop = asyncio.get_running_loop()
        outbox: asyncio.Queue = asyncio.Queue()
        session = Session(lambda msg: loop.call_soon_threadsafe(outbox.put_nowait, msg))

        async def sender():
            while True:
                await ws.send_json(await outbox.get())

        send_task = asyncio.create_task(sender())
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    data = msg["bytes"]
                    t = struct.unpack("<d", data[:8])[0] / 1000
                    # Tracking runs off the event loop; awaiting it keeps frames in order.
                    await loop.run_in_executor(None, session.on_frame, data[8:], t)
                elif msg.get("text") and json.loads(msg["text"]).get("type") == "flush":
                    await loop.run_in_executor(None, session.flush)
        except WebSocketDisconnect:
            pass
        finally:
            send_task.cancel()
            session.close()

    return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", help="run once on a video file and print the result")
    ap.add_argument("--port", type=int, default=8000)
    opts = ap.parse_args()

    if opts.test:
        print(transcribe(opts.test))
    else:
        import uvicorn

        uvicorn.run(make_app(), host="0.0.0.0", port=opts.port)
