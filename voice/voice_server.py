"""
Voice server (Justin's half of the project).

Joey's lip reader (lipread/) turns mouth movement into text, and Clark's frontend shows it.
The frontend sends that text here, and this server speaks it with an XTTS-v2 built-in
voice (default Claribel Dervla; see voice.py to change it or clone a real voice).

Runs on port 8001 so it doesn't clash with the lip-reading server (lipread/server.py, :8000).

Setup, from the repo root:
  cd voice
  pip install -r requirements.txt
  Install FFmpeg (Windows: winget install --id Gyan.FFmpeg.Shared -e), then open a new terminal

Test once:        python voice_server.py --test "i need water"     (writes out.wav)
Run the server:   python voice_server.py            (listens on http://0.0.0.0:8001)

  GET  /speak?text=i%20need%20water           -> .wav (whole file once it's ready)
  POST /speak   {"text": "i need water"}      -> same
  GET  /speak/stream?text=i%20need%20water    -> .wav that starts playing while it's generated
  GET  /voices                                -> the 58 built-in voices; add &voice=Ana%20Florence to pick one
  GET  /health                                -> {"ok": true, "device": "cpu" | "cuda", "voice": ...}

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
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, StreamingResponse
    from pydantic import BaseModel

    app = FastAPI(title="Voice")
    # The frontend is served from a different address, so let browsers call this server
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.on_event("startup")
    def load_model():
        voice.warm_cache(PHRASES)  # every ICU phrase pre-spoken in the default voice

    @app.get("/health")
    def health():
        return {"ok": True, "device": voice.DEVICE, "voice": voice.default_voice()}

    @app.get("/voices")
    def voices():
        """XTTS's built-in voices; pass one as ?voice=... to the speak endpoints."""
        return {"default": voice.default_voice(), "voices": voice.speakers()}

    def clean(text):
        text = text.strip().lower()
        if not text:
            raise HTTPException(400, "text is empty")
        return text

    def check_voice(name):
        """Fail with a clear error before any audio is sent, rather than mid-stream."""
        name = name or voice.default_voice()
        try:
            voice._conditioning(name)
        except ValueError as e:
            raise HTTPException(400, str(e))
        except FileNotFoundError as e:
            raise HTTPException(503, str(e))
        return name

    class SpeakRequest(BaseModel):
        text: str
        language: str = "en"
        voice: str | None = None

    @app.get("/speak")
    def speak_get(text: str, language: str = "en", voice_name: str | None = Query(None, alias="voice")):
        """Returns a .wav of `text`."""
        return FileResponse(voice.speak_to_file(clean(text), language, check_voice(voice_name)),
                            media_type="audio/wav")

    @app.post("/speak")
    def speak_post(req: SpeakRequest):
        return speak_get(req.text, req.language, req.voice)

    @app.get("/speak/stream")
    def speak_stream(text: str, language: str = "en", voice_name: str | None = Query(None, alias="voice")):
        """Same audio as /speak, but sent while it's generated so playback starts sooner."""
        text, name = clean(text), check_voice(voice_name)

        def audio():
            yield wav_header()
            yield from voice.speak_stream(text, language, name)

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
