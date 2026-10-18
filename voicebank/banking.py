"""
Turns recordings and uploads into the reference clips a voice is cloned from.

Recordings: ffmpeg decodes whatever the browser sent (webm/opus, mp4, wav), trims leading and
trailing silence and normalizes loudness.

Uploads (old phone videos): ffmpeg decodes the audio track, Demucs (htdemucs) keeps only the
vocals, 60 s at a time so memory stays flat on long videos, then pauses are cut and loudness is
normalized. The video itself is never kept.

candidates() + select_refs() then pick which stretches of audio the voice is cloned from.
Speaker diarization comes in a later step.
"""

import json
import os
import subprocess
import tempfile
import threading
import wave

import numpy as np

SAMPLE_RATE = 24000

MAX_UPLOAD_BYTES = 500 * 1024 * 1024
MAX_MEDIA_SECONDS = 15 * 60
MAX_UPLOADS = 10
MIN_CLIP_S, MAX_CLIP_S = 1.0, 15.0  # a prompt can be short; long takes are split
MAX_CLIPS, MAX_TOTAL_S = 8, 90.0
WINDOW_S, WINDOWS_PER_UPLOAD = 12.0, 4  # an upload contributes up to 4 windows spread across it
DEMUCS_CHUNK_S = 60
MIN_SPEECH_S, TARGET_SPEECH_S = 6.0, 30.0


class MediaError(ValueError):
    """Bad input the user can fix (no audio, too long, unreadable)."""


def probe(path):
    """(duration seconds, has audio) via ffprobe."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path],
        capture_output=True, text=True,
    )
    if out.returncode:
        raise MediaError("Couldn't read that file")
    info = json.loads(out.stdout or "{}")
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    try:
        duration = float(info.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = 0.0  # MediaRecorder webm often has no duration header; measured after decoding
    return duration, has_audio


def validate_upload(path):
    """Checks an upload before any heavy work; returns its duration in seconds."""
    duration, has_audio = probe(path)
    if not has_audio:
        raise MediaError("That file has no audio track")
    if duration > MAX_MEDIA_SECONDS:
        raise MediaError(f"That's {duration / 60:.0f} min long; the limit is {MAX_MEDIA_SECONDS // 60} min")
    return duration


# Trim silence at both ends (reverse trick), high-pass rumble, then EBU R128 loudness to -20 LUFS
_CLEAN = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,"
          "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
          "highpass=f=70,loudnorm=I=-20:TP=-2:LRA=11")


TOO_QUIET_DB = -42.0  # mean level of a take below this is whispering or silent mouthing, not a voice


def mean_volume(path):
    """Mean level of the audio in dBFS (ffmpeg volumedetect)."""
    out = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-vn", "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "mean_volume:" in line:
            return float(line.split("mean_volume:")[1].split()[0])
    return -91.0


def clean_recording(src, dst):
    """Decodes `src` to a cleaned 24 kHz mono WAV at `dst`; returns its duration in seconds."""
    validate_upload(src)
    if mean_volume(src) < TOO_QUIET_DB:
        raise MediaError("That take is almost silent. Speak out loud, a little closer to the mic.")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-af", _CLEAN,
         "-ar", str(SAMPLE_RATE), "-sample_fmt", "s16", dst],
        capture_output=True, text=True,
    )
    if out.returncode:
        raise MediaError(f"Couldn't decode the audio ({out.stderr.strip()[-200:]})")
    seconds = wav_seconds(dst)
    if seconds < 0.5:
        raise MediaError("No speech heard in that recording")
    return seconds


# For Demucs vocals: high-pass, normalize, then cut every pause longer than 0.6 s so what's left is speech
_CLEAN_UPLOAD = ("highpass=f=70,loudnorm=I=-20:TP=-2:LRA=11,"
                 "silenceremove=start_periods=1:start_threshold=-38dB:"
                 "stop_periods=-1:stop_duration=0.6:stop_threshold=-38dB")

_demucs = None
_demucs_lock = threading.Lock()  # one separation at a time


def _separator():
    global _demucs
    if _demucs is None:
        import torch
        from demucs.pretrained import get_model
        print("Loading Demucs (htdemucs)...", flush=True)
        _demucs = get_model("htdemucs").eval()
        _demucs.device = os.environ.get("VOICE_DEVICE") or (
            "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    return _demucs


def separate_vocals(chunk):
    """(2, n) float32 stereo at 44.1 kHz -> the vocals stem, same shape."""
    import torch
    from demucs.apply import apply_model
    model = _separator()
    x = torch.from_numpy(np.ascontiguousarray(chunk))
    mono = x.mean(0)
    mean, std = mono.mean(), mono.std() + 1e-8  # Demucs expects normalized input (as its CLI does)
    with torch.no_grad():
        out = apply_model(model, ((x - mean) / std)[None], device=model.device, shifts=0, split=True, overlap=0.25)
    vocals = out[0, model.sources.index("vocals")] * std + mean
    return vocals.cpu().numpy().astype(np.float32)


def process_upload(src, dst, on_progress=lambda stage, frac: None):
    """Old video/audio -> Demucs vocals, pauses cut, 24 kHz mono WAV at `dst`. Returns seconds of speech."""
    duration = validate_upload(src)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    rate = 44100
    chunk_bytes = DEMUCS_CHUNK_S * rate * 2 * 4  # stereo float32
    decode = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", src, "-vn", "-ac", "2", "-ar", str(rate), "-f", "f32le", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    with tempfile.TemporaryFile() as err:
        encode = subprocess.Popen(
            ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(rate), "-ac", "2", "-i", "-",
             "-af", _CLEAN_UPLOAD, "-ac", "1", "-ar", str(SAMPLE_RATE), "-sample_fmt", "s16", dst],
            stdin=subprocess.PIPE, stderr=err)
        done = 0.0
        try:
            with _demucs_lock:
                on_progress("separating", 0.0)
                while raw := decode.stdout.read(chunk_bytes):
                    raw = raw[: len(raw) // 8 * 8]
                    chunk = np.frombuffer(raw, np.float32).reshape(-1, 2).T
                    encode.stdin.write(separate_vocals(chunk).T.tobytes())
                    done += chunk.shape[1] / rate
                    on_progress("separating", min(1.0, done / max(duration, 1e-6)))
        finally:
            decode.stdout.close()
            decode.wait()
            encode.stdin.close()
            encode.wait()
        if encode.returncode or decode.returncode:
            err.seek(0)
            raise MediaError(f"Couldn't process the audio ({err.read().decode(errors='replace').strip()[-200:]})")
    seconds = wav_seconds(dst)
    if seconds < 0.5:
        raise MediaError("No speech found after removing background sound")
    return seconds


def wav_seconds(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def candidates(recordings, uploads):
    """Stretches of audio that could become reference clips, best first.

    `recordings` and `uploads` are lists of (path, seconds). Recordings come first, whole (each is
    one short prompt). Each upload is cut into up to WINDOWS_PER_UPLOAD windows of WINDOW_S spread
    across it, and uploads are interleaved so several videos all get a say.
    Returns [(path, start_s, seconds)].
    """
    out = [(path, 0.0, secs) for path, secs in recordings]
    per_upload = []
    for path, secs in uploads:
        n = max(1, min(WINDOWS_PER_UPLOAD, int(secs // WINDOW_S)))
        step = (secs - min(secs, WINDOW_S)) / max(1, n - 1) if n > 1 else 0.0
        per_upload.append([(path, round(i * step, 2), min(secs, WINDOW_S)) for i in range(n)])
    for i in range(max((len(w) for w in per_upload), default=0)):
        out += [w[i] for w in per_upload if i < len(w)]
    return out


def select_refs(clips):
    """Picks which clips to clone from.

    `clips` is a list of (path, start_s, seconds) in preference order. Clips shorter than
    MIN_CLIP_S are skipped, longer ones are cut to MAX_CLIP_S, and selection stops at
    MAX_CLIPS / MAX_TOTAL_S. Returns [(path, start_s, seconds_to_use)].
    """
    chosen, total = [], 0.0
    for path, start, seconds in clips:
        if seconds < MIN_CLIP_S:
            continue
        use = min(seconds, MAX_CLIP_S, MAX_TOTAL_S - total)
        if use < MIN_CLIP_S:
            break
        chosen.append((path, start, use))
        total += use
        if len(chosen) == MAX_CLIPS:
            break
    return chosen


def write_refs(chosen, out_dir):
    """Copies each chosen stretch into out_dir as ref_NN.wav; returns the paths."""
    os.makedirs(out_dir, exist_ok=True)
    for old in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, old))
    paths = []
    for i, (src, start, seconds) in enumerate(chosen):
        dst = os.path.join(out_dir, f"ref_{i:02d}.wav")
        with wave.open(src) as r, wave.open(dst, "wb") as w:
            w.setparams(r.getparams())
            r.setpos(int(start * r.getframerate()))
            w.writeframes(r.readframes(int(seconds * r.getframerate())))
        paths.append(dst)
    return paths


def warnings_for(speech_seconds):
    if speech_seconds < MIN_SPEECH_S:  # one decimal, so 5.5 s never reads as "6 s, need 6 s"
        return [f"Only {speech_seconds:.1f} s of speech. Record at least {MIN_SPEECH_S:.0f} s to build a voice."]
    if speech_seconds < TARGET_SPEECH_S:
        return [f"{speech_seconds:.0f} s of speech found; {TARGET_SPEECH_S:.0f} s or more sounds more like them."]
    return []
