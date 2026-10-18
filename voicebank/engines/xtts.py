"""
XTTS-v2 engine: zero-shot cloning from a few reference clips, the same technique as voice/voice.py.

Its own model instance and lock, so banking never waits on the voice server (and vice versa).
"""

import io
import os
import queue
import threading

import numpy as np
import torch

from .base import VoiceEngine

STREAM_CHUNK = int(os.environ.get("VOICE_STREAM_CHUNK", 10))  # smaller: first audio sooner (XTTS default 20)


def _to_pcm(audio):
    audio = torch.as_tensor(audio).clamp(-1, 1).cpu().numpy()
    return (audio * 32767).astype(np.int16).tobytes()


class XTTSEngine(VoiceEngine):
    name = "xtts-v2"

    def __init__(self):
        self._device = os.environ.get("VOICE_DEVICE") or (
            "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        )
        self._tts = None
        self.lock = threading.Lock()  # XTTS can't run two generations at once

    @property
    def device(self):
        return self._device

    def _model(self):
        if self._tts is None:
            from TTS.api import TTS
            os.environ.setdefault("COQUI_TOS_AGREED", "1")  # XTTS asks you to accept its non-commercial license
            print(f"Loading XTTS-v2 on {self._device}...", flush=True)
            self._tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(self._device)
        return self._tts.synthesizer.tts_model

    def warm(self):
        """Load the model and pay the first-stream warm-up now rather than on the first sentence."""
        model = self._model()
        with self.lock:
            s = next(iter(model.speaker_manager.speakers.values()))
            for _ in model.inference_stream("ready", "en", s["gpt_cond_latent"].to(self._device),
                                            s["speaker_embedding"].to(self._device)):
                pass

    def clone(self, ref_wavs):
        """The speaker embedding is averaged over every clip (each cut at 15 s); the prosody latent
        reads the first 30 s of all clips joined, in 6 s chunks, so pass the best clips first.
        (XTTS's own default is only 6 s of prosody.)"""
        with self.lock:
            gpt, spk = self._model().get_conditioning_latents(
                audio_path=list(ref_wavs), max_ref_length=15, gpt_cond_len=30, gpt_cond_chunk_len=6)
        buf = io.BytesIO()
        torch.save({"gpt_cond_latent": gpt.cpu(), "speaker_embedding": spk.cpu()}, buf)
        return buf.getvalue()

    def _latents(self, voice):
        d = torch.load(io.BytesIO(voice), map_location="cpu")
        return d["gpt_cond_latent"].to(self._device), d["speaker_embedding"].to(self._device)

    def speak_stream(self, text, voice, language="en"):
        """Yields PCM chunks as XTTS makes them. Generation runs on its own thread to the end,
        so a listener who disconnects mid-sentence can't leave the lock held forever."""
        gpt, spk = self._latents(voice)
        q = queue.Queue()

        def work():
            try:
                with self.lock:
                    for chunk in self._model().inference_stream(text, language, gpt, spk, stream_chunk_size=STREAM_CHUNK):
                        q.put(_to_pcm(chunk))
            except Exception as e:  # noqa: BLE001 - handed to the reader
                q.put(e)
            finally:
                q.put(None)

        threading.Thread(target=work, daemon=True).start()
        while (item := q.get()) is not None:
            if isinstance(item, Exception):
                raise item
            yield item
