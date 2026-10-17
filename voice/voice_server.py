"""
Voice server (Justin's half of the project).

Joey's lip reader (lipread/) turns mouth movement into text, and Clark's frontend shows it.
The frontend sends that text here, and this server speaks it in the patient's cloned
voice (Coqui XTTS-v2, see voice.py).

Runs on port 8001 so it doesn't clash with the lip-reading server (lipread/server.py, :8000).

Setup, from the repo root:
  cd voice
  pip install -r requirements.txt
  Install FFmpeg (Windows: winget install --id Gyan.FFmpeg.Shared -e), then open a new terminal
  Record ~20 seconds of yourself talking and save it as voice/my_voice.wav

Test once:        python voice_server.py --test "i need water"     (writes out.wav)
Run the server:   python voice_server.py            (listens on http://0.0.0.0:8001)

  GET  /speak?text=i%20need%20water           -> .wav (whole file once it's ready)
  POST /speak   {"text": "i need water"}      -> same
  GET  /speak/stream?text=i%20need%20water    -> .wav that starts playing while it's generated
  GET  /health                                -> {"ok": true, "device": "cpu" | "cuda"}

In the browser:  new Audio(`${VOICE_URL}/speak/stream?text=${encodeURIComponent(text)}`).play()
"""

import argparse
import os
import shutil
import struct

import voice

# Pre-spoken at startup so these play instantly during the demo
PHRASES = [
    "i am in pain", "i can't breathe", "i need water", "call the nurse",
    "call my family", "i am cold", "i am hot", "yes", "no", "thank you",
    "i need to use the bathroom", "where am i", "i am scared",
]


def wav_header(rate=voice.SAMPLE_RATE):
    """WAV header for a stream of unknown length (16-bit mono); browsers play it as it arrives."""
    unknown = 0xFFFFFFFF
    return struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", unknown, b"WAVE", b"fmt ", 16, 1, 1,
                       rate, rate * 2, 2, 16, b"data", unknown)


def make_app():
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, StreamingResponse
    from pydantic import BaseModel

    app = FastAPI(title="Voice")
    # The frontend is served from a different address, so let browsers call this server
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.on_event("startup")
    def load_model():
        try:
            voice.warm_cache(PHRASES)  # every ICU phrase pre-spoken in your voice
        except FileNotFoundError as e:
            print(f"Voice disabled: {e}")

    @app.get("/health")
    def health():
        return {"ok": True, "device": voice.DEVICE}

    def clean(text):
        text = text.strip().lower()
        if not text:
            raise HTTPException(400, "text is empty")
        return text

    class SpeakRequest(BaseModel):
        text: str
        language: str = "en"

    @app.get("/speak")
    def speak_get(text: str, language: str = "en"):
        """Returns a .wav of `text` in your voice."""
        try:
            return FileResponse(voice.speak_to_file(clean(text), language), media_type="audio/wav")
        except FileNotFoundError as e:
            raise HTTPException(503, str(e))

    @app.post("/speak")
    def speak_post(req: SpeakRequest):
        return speak_get(req.text, req.language)

    @app.get("/speak/stream")
    def speak_stream(text: str, language: str = "en"):
        """Same audio as /speak, but sent while it's generated so playback starts sooner."""
        text = clean(text)
        if not os.path.isfile(voice.VOICE_SAMPLE):
            raise HTTPException(503, f"Record your voice sample first: {voice.VOICE_SAMPLE}")

        def audio():
            yield wav_header()
            yield from voice.speak_stream(text, language)

        return StreamingResponse(audio(), media_type="audio/wav")

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", help="speak this text once and write out.wav")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8001)))
    opts = parser.parse_args()

    if opts.test:
        shutil.copy(voice.speak_to_file(opts.test.strip().lower()), "out.wav")
        print("Wrote out.wav")
    else:
        import uvicorn
        uvicorn.run(make_app(), host="0.0.0.0", port=opts.port)
