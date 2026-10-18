import os

from .base import VoiceEngine


def load() -> VoiceEngine:
    """The engine named by VOICEBANK_ENGINE (default: xtts)."""
    name = os.environ.get("VOICEBANK_ENGINE", "xtts")
    if name == "xtts":
        from .xtts import XTTSEngine
        return XTTSEngine()
    raise ValueError(f"Unknown VOICEBANK_ENGINE {name!r}")
