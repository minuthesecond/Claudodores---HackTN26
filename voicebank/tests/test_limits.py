import subprocess

import pytest

import banking


def make(path, *args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args, path], check=True)


def test_decodes_and_measures(tmp_path):
    src, dst = tmp_path / "in.webm", tmp_path / "out.wav"
    make(str(src), "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-c:a", "libopus")
    secs = banking.clean_recording(str(src), str(dst))
    assert 2.5 < secs < 3.5
    assert banking.wav_seconds(str(dst)) == pytest.approx(secs)


def test_rejects_video_without_audio(tmp_path):
    src = tmp_path / "silent.mp4"
    make(str(src), "-f", "lavfi", "-i", "color=black:size=64x64:duration=1")
    with pytest.raises(banking.MediaError, match="no audio track"):
        banking.clean_recording(str(src), str(tmp_path / "out.wav"))


def test_rejects_silence(tmp_path):
    src = tmp_path / "quiet.wav"
    make(str(src), "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "2")
    with pytest.raises(banking.MediaError, match="almost silent"):
        banking.clean_recording(str(src), str(tmp_path / "out.wav"))


def test_rejects_silent_mouthing():
    # lip_talking.MOV is mouthed almost silently (mean ~-45 dB): no voice to clone
    import os
    clip = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "lip_talking.MOV")
    with pytest.raises(banking.MediaError, match="almost silent"):
        banking.clean_recording(clip, "/dev/null")


def test_rejects_too_long(tmp_path, monkeypatch):
    monkeypatch.setattr(banking, "MAX_MEDIA_SECONDS", 1)
    src = tmp_path / "long.wav"
    make(str(src), "-f", "lavfi", "-i", "sine=duration=3")
    with pytest.raises(banking.MediaError, match="limit"):
        banking.clean_recording(str(src), str(tmp_path / "out.wav"))
