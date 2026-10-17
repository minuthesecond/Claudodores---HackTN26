"""
Speaks text in YOUR voice using Coqui XTTS-v2 voice cloning.

You record ~20 seconds of yourself talking (my_voice.wav), and XTTS copies your voice
from that sample. No training needed.

Because the ICU phrase list is fixed, every phrase is pre-generated once at startup
and cached in voice_cache/, so playback during the demo is instant. Anything else is
streamed: speak_stream() yields audio as XTTS generates it, so playback can start
before the whole sentence is done (real time on a GPU).

Setup:
  pip install -r requirements.txt
  Record my_voice.wav (see CLAUDE.md), put it in this folder.

Test:  python voice.py "I need water"     -> writes out.wav in your voice
"""

import hashlib
import os
import sys
import threading
import wave

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE_SAMPLE = os.environ.get("VOICE_SAMPLE", os.path.join(HERE, "my_voice.wav"))
CACHE_DIR = os.path.join(HERE, "voice_cache")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SAMPLE_RATE = 24000  # XTTS-v2 output: 24 kHz, mono, 16-bit

_tts = None
_latents = None  # (gpt_cond_latent, speaker_embedding) for VOICE_SAMPLE
_lock = threading.Lock()  # XTTS can't run two generations at once


def _model():
    global _tts
    if _tts is None:
        from TTS.api import TTS
        os.environ.setdefault("COQUI_TOS_AGREED", "1")  # XTTS asks you to accept its non-commercial license
        print(f"Loading XTTS-v2 on {DEVICE}...")
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)
    return _tts


def _check_sample():
    if not os.path.isfile(VOICE_SAMPLE):
        raise FileNotFoundError(f"Record your voice sample first: {VOICE_SAMPLE}")


def _conditioning():
    """Voice fingerprint of VOICE_SAMPLE, computed once and reused by every streamed sentence."""
    global _latents
    if _latents is None:
        _latents = _model().synthesizer.tts_model.get_conditioning_latents(audio_path=[VOICE_SAMPLE])
    return _latents


def _cache_path(text, language):
    key = hashlib.md5(f"{language}|{text}".encode()).hexdigest()[:12]
    return os.path.join(CACHE_DIR, f"{key}.wav")


def speak_to_file(text, language="en"):
    """Returns the path to a .wav of `text` spoken in your voice (cached by text + language)."""
    _check_sample()
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = _cache_path(text, language)
    if not os.path.isfile(path):
        with _lock:
            _model().tts_to_file(text=text, speaker_wav=VOICE_SAMPLE, language=language, file_path=path)
    return path


def speak_stream(text, language="en"):
    """Yields 16-bit PCM chunks (SAMPLE_RATE, mono) as soon as XTTS makes them.
    Cached phrases come straight from the cache; new text is cached once it finishes."""
    _check_sample()
    path = _cache_path(text, language)
    if os.path.isfile(path):
        with wave.open(path) as w:
            yield w.readframes(w.getnframes())
        return

    chunks = []
    with _lock:
        model = _model().synthesizer.tts_model
        for chunk in model.inference_stream(text, language, *_conditioning()):
            pcm = (chunk.clamp(-1, 1).cpu().numpy() * 32767).astype(np.int16).tobytes()
            chunks.append(pcm)
            yield pcm

    os.makedirs(CACHE_DIR, exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(b"".join(chunks))


def warm_cache(phrases, language="en"):
    """Pre-generate every phrase so the demo never waits on TTS."""
    for p in phrases:
        speak_to_file(p, language)
    # The first streamed sentence pays a one-time warm-up (~30 s on CPU); pay it now instead
    with _lock:
        for _ in _model().synthesizer.tts_model.inference_stream("ready", language, *_conditioning()):
            pass
    print(f"Voice cache ready: {len(phrases)} phrases", flush=True)


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or "I need water"
    src = speak_to_file(text)
    out = os.path.join(HERE, "out.wav")
    with open(src, "rb") as a, open(out, "wb") as b:
        b.write(a.read())
    print(f"Wrote {out}")
