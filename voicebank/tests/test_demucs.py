"""Demucs really removes background music (step 2 goal). Uses the model, so it takes ~10 s."""

import os
import subprocess

import numpy as np
import pytest

import banking

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPEECH = os.path.join(REPO, "talking.MOV")


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-9)


def decode(path, rate=44100, channels=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", str(channels), "-ar", str(rate),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, channels).T


@pytest.fixture(scope="module")
def mix(tmp_path_factory):
    """3 s of music alone, then the same music under talking.MOV's speech."""
    out = str(tmp_path_factory.mktemp("demucs") / "mix.wav")
    music = "aevalsrc='0.25*sin(2*PI*220*t)*(1+sin(2*PI*2*t))/2+0.2*sin(2*PI*330*t)+0.15*sin(2*PI*440*t)':s=44100:d=7"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", music, "-i", SPEECH, "-filter_complex",
                    "[1:a]adelay=3000|3000,volume=2[s];[0:a][s]amix=inputs=2:duration=first:normalize=0",
                    "-ac", "2", out], check=True)
    return out


def test_music_alone_is_removed(mix):
    x = decode(mix)
    vocals = banking.separate_vocals(x)
    before, after = rms_db(x[:, : 3 * 44100]), rms_db(vocals[:, : 3 * 44100])
    assert before - after > 20, f"music-only part only dropped {before - after:.1f} dB"


def test_speech_survives(mix):
    x = decode(mix)
    vocals = banking.separate_vocals(x)
    speech = vocals[:, int(3.3 * 44100): int(5.5 * 44100)]
    music_only = vocals[:, : 3 * 44100]
    assert rms_db(speech) - rms_db(music_only) > 15


def test_process_upload_makes_speech_wav(mix, tmp_path):
    stages = []
    secs = banking.process_upload(mix, str(tmp_path / "out.wav"), lambda s, f: stages.append((s, f)))
    assert 1.0 < secs < 4.5  # the music-only start is cut as a pause
    assert stages[0] == ("separating", 0.0) and stages[-1][1] == pytest.approx(1.0, abs=0.01)
