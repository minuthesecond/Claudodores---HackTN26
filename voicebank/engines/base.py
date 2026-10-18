"""
The boundary between voicebank and whatever model clones and speaks.

XTTS-v2 (engines/xtts.py) fills it in for the demo. Its license is non-commercial, so a paid
deployment swaps in another engine with the same two methods; nothing else in voicebank changes.
"""

from typing import Iterator


class VoiceEngine:
    name = "base"
    sample_rate = 24000  # every engine streams 16-bit mono PCM at this rate

    def clone(self, ref_wavs: list[str]) -> bytes:
        """Reference clips -> an opaque voice fingerprint, saved as latents.pt."""
        raise NotImplementedError

    def speak_stream(self, text: str, voice: bytes, language: str = "en") -> Iterator[bytes]:
        """Yields 16-bit mono PCM chunks as they're generated."""
        raise NotImplementedError

    @property
    def device(self) -> str:
        return "cpu"
