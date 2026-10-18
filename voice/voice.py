"""
Speaks text with Coqui XTTS-v2, using one of its 58 built-in voices (default: Claribel Dervla).

Pick another built-in voice with VOICE_SPEAKER (see speakers() or GET /voices on the server),
or clone a real person instead by pointing VOICE_SAMPLE at ~20 seconds of their speech.

Because the ICU phrase list is fixed, every phrase is pre-generated once at startup
and cached in voice_cache/, so playback during the demo is instant. Anything else is
streamed: speak_stream() yields audio as XTTS generates it, so playback can start
before the whole sentence is done (real time on a GPU).

Setup:  pip install -r requirements.txt
Test:   python voice.py "I need water"     -> writes out.wav
"""

import hashlib
import os
import queue
import sys
import threading
import wave

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
SPEAKER = os.environ.get("VOICE_SPEAKER", "Claribel Dervla")  # an XTTS built-in voice
VOICE_SAMPLE = os.environ.get("VOICE_SAMPLE")  # optional: clone this recording instead
CACHE_DIR = os.path.join(HERE, "voice_cache")
# Apple-silicon GPUs (mps) start speaking in ~0.2 s and keep up with playback; CPU takes ~1 s and falls behind
DEVICE = os.environ.get("VOICE_DEVICE") or (
    "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
)
STREAM_CHUNK = int(os.environ.get("VOICE_STREAM_CHUNK", 10))  # smaller: first audio sooner (XTTS default 20)
SAMPLE_RATE = 24000  # XTTS-v2 output: 24 kHz, mono, 16-bit

_tts = None
_latents = {}  # voice -> (gpt_cond_latent, speaker_embedding)
_lock = threading.Lock()  # XTTS can't run two generations at once


def _model():
    global _tts
    if _tts is None:
        from TTS.api import TTS
        os.environ.setdefault("COQUI_TOS_AGREED", "1")  # XTTS asks you to accept its non-commercial license
        print(f"Loading XTTS-v2 on {DEVICE}...")
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)
    return _tts


def speakers():
    """Names of XTTS's built-in voices."""
    return list(_model().synthesizer.tts_model.speaker_manager.speakers)


def default_voice():
    return f"clone:{os.path.basename(VOICE_SAMPLE)}" if VOICE_SAMPLE else SPEAKER


def _conditioning(voice):
    """Voice fingerprint for a built-in speaker name, or for VOICE_SAMPLE when cloning."""
    if voice not in _latents:
        model = _model().synthesizer.tts_model
        if voice.startswith("clone:"):
            if not os.path.isfile(VOICE_SAMPLE):
                raise FileNotFoundError(f"Voice sample not found: {VOICE_SAMPLE}")
            _latents[voice] = tuple(t.to(DEVICE) for t in model.get_conditioning_latents(audio_path=[VOICE_SAMPLE]))
        elif voice in model.speaker_manager.speakers:
            s = model.speaker_manager.speakers[voice]
            _latents[voice] = (s["gpt_cond_latent"].to(DEVICE), s["speaker_embedding"].to(DEVICE))
        else:
            raise ValueError(f"Unknown voice {voice!r}. Built-in voices: {', '.join(speakers())}")
    return _latents[voice]


def _cache_path(text, language, voice):
    key = hashlib.md5(f"{voice}|{language}|{text}".encode()).hexdigest()[:12]
    return os.path.join(CACHE_DIR, f"{key}.wav")


def _to_pcm(audio):
    audio = torch.as_tensor(audio).clamp(-1, 1).cpu().numpy()
    return (audio * 32767).astype(np.int16).tobytes()


def _save(path, pcm):
    """Writes the cache file in one step, so a reader never finds it half written."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = f"{path}.{threading.get_ident()}.part"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)
    os.replace(tmp, path)


def background_stream(generate):
    """Runs `generate` (a generator of chunks) to the end on its own thread and yields its chunks.

    The caller can stop reading at any time (a browser closing the connection mid-sentence)
    without leaving the generator suspended inside a `with _lock:`, which would hold the lock
    forever and stall every later sentence."""
    q = queue.Queue()

    def work():
        try:
            for chunk in generate():
                q.put(chunk)
        except Exception as e:  # noqa: BLE001 - handed to the reader
            q.put(e)
        finally:
            q.put(None)

    threading.Thread(target=work, daemon=True).start()
    while (item := q.get()) is not None:
        if isinstance(item, Exception):
            raise item
        yield item


def speak_to_file(text, language="en", voice=None):
    """Returns the path to a .wav of `text` (cached by voice + language + text)."""
    voice = voice or default_voice()
    path = _cache_path(text, language, voice)
    if not os.path.isfile(path):
        with _lock:
            out = _model().synthesizer.tts_model.inference(text, language, *_conditioning(voice))
            _save(path, _to_pcm(out["wav"]))
    return path


def speak_stream(text, language="en", voice=None):
    """Yields 16-bit PCM chunks (SAMPLE_RATE, mono) as soon as XTTS makes them.
    Cached text comes straight from the cache; new text is cached once it finishes."""
    voice = voice or default_voice()
    path = _cache_path(text, language, voice)
    if os.path.isfile(path):
        with wave.open(path) as w:
            yield w.readframes(w.getnframes())
        return

    def generate():
        chunks = []
        with _lock:
            model = _model().synthesizer.tts_model
            for chunk in model.inference_stream(text, language, *_conditioning(voice), stream_chunk_size=STREAM_CHUNK):
                chunks.append(_to_pcm(chunk))
                yield chunks[-1]
        _save(path, b"".join(chunks))  # cached even if the listener left early

    yield from background_stream(generate)


def warm_cache(phrases, language="en"):
    """Pre-generate every phrase so the demo never waits on TTS."""
    voice = default_voice()
    for p in phrases:
        speak_to_file(p, language, voice)
    # The first streamed sentence pays a one-time warm-up (~30 s on CPU); pay it now instead
    with _lock:
        for _ in _model().synthesizer.tts_model.inference_stream("ready", language, *_conditioning(voice)):
            pass
    print(f"Voice cache ready: {len(phrases)} phrases in {voice}", flush=True)


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or "I need water"
    src = speak_to_file(text)
    out = os.path.join(HERE, "out.wav")
    with open(src, "rb") as a, open(out, "wb") as b:
        b.write(a.read())
    print(f"Wrote {out} ({default_voice()})")
