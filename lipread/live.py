"""Live webcam lip reading. Run: python lipread/live.py [--camera N]
Start mouthing a phrase; when you pause, the model's guess appears under the video.
Keys: space = finish the current phrase now, c = clear the on-screen captions, q = quit.
Every caption is also saved to a JSON file (lipread/captions.json by default) as soon as it is read.
With --phrases FILE, each caption is picked from that list: when the phrase the model scores highest and
the phrase closest to its free-form guess agree, that phrase is shown; if they disagree, both are shown
with a "?"; if the guess isn't close to any phrase, the guess itself is shown. The guess is always shown
underneath as "heard: ...".
"""
import argparse
import json
import os
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from mediapipe.tasks.python import vision

from mouth import JAW_OPEN, N_FEATURES, MouthTracker, read_video
from phrase import MOVING, STILL, clip_from_stream, consensus, load_phrases, pick_phrase, read_variants
from vsr import LipReader, keypoints

ap = argparse.ArgumentParser()
ap.add_argument("--camera", type=int, default=0)
ap.add_argument("--video", help="read this file instead of the camera (no window; prints guesses)")
ap.add_argument("--start", type=float, default=MOVING, help="mouth-shape change that starts a phrase")
ap.add_argument("--still", type=float, default=STILL, help="mouth-shape change below this counts as a pause")
ap.add_argument("--pause", type=float, default=1.0, help="seconds of pause that ends a phrase")
ap.add_argument("--vote", action="store_true", help="read 3 windows and keep the consensus (3x slower)")
ap.add_argument("--max-seconds", type=float, default=8.0)
ap.add_argument("--captions", default=str(Path(__file__).resolve().parent / "captions.json"),
                help="JSON file rewritten whenever the status changes or a caption is read")
ap.add_argument("--phrases", help="text file of allowed phrases (one per line, or id|phrase like sentences.txt)")
args = ap.parse_args()
if args.phrases and args.vote:
    raise SystemExit("use --phrases or --vote, not both")
phrases = load_phrases(args.phrases) if args.phrases else None

LIPS = [(c.start, c.end) for c in vision.FaceLandmarksConnections.FACE_LANDMARKS_LIPS]
PREROLL = 0.6  # seconds kept before the phrase starts

print("loading lip-reading model...")
reader = LipReader()
for p in phrases or []:
    reader.tokens(p)  # fail now, not mid-session, if a phrase can't be spelled with the model's word pieces
tracker = MouthTracker()
pool = ThreadPoolExecutor(max_workers=1)



def camera_frames():
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit(f"Could not open camera {args.camera} (check macOS camera permission for your terminal)")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        yield frame, time.time()
    cap.release()


def video_frames():
    t = time.time()
    for frame, dt in read_video(args.video):
        t += dt / 1000
        yield frame, t


def finish(clip):
    """Start reading a phrase in the background. Returns (future, phrase start time, phrase end time)."""
    return pool.submit(transcribe, [(f, k, t - clip[0][2], j, x) for f, k, t, j, x in clip]), clip[0][2], clip[-1][2]


def iso(t):
    return datetime.fromtimestamp(t).astimezone().isoformat(timespec="milliseconds")


def save_captions(status):
    """Rewrite the captions file. Writes a temp file and renames it, so a reader never sees half a file."""
    data = {"updated": iso(time.time()), "status": status, "captions": captions}
    tmp = args.captions + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, args.captions)


def add_caption(job):
    future, start, end = job
    try:
        raw, ranked = future.result()
        raw = raw.strip().lower() or "(nothing)"
    except Exception as e:  # e.g. no face found in the clip
        raw, ranked = f"(error: {e})", None
    entry = {"id": len(captions) + 1, "text": raw, "raw": raw, "started": iso(start), "ended": iso(end),
             "seconds": round(end - start, 2)}
    shown = [raw]  # caption lines on screen
    if ranked:
        match, scored, near = pick_phrase(raw, ranked, phrases)
        entry.update(match=match, scored=scored, nearest=near)
        if match:
            entry["text"] = match
            shown = [match, f"heard: {raw}"]
        elif near:  # the two matchers disagree: show both rather than guess
            shown = [f"? {scored} | {near}", f"heard: {raw}"]
        # else: the guess isn't close to any phrase, so show the guess itself
    captions.append(entry)
    history.append(shown)


def wrap(text, width=38):
    lines, cur = [], ""
    for word in text.split():
        if len(cur) + len(word) + 1 > width:
            lines.append(cur)
            cur = ""
        cur = f"{cur} {word}".strip()
    return lines + [cur] if cur else lines


def transcribe(items):
    frames, kps, times, jaw, feat = zip(*items)
    clip = clip_from_stream(list(frames), list(kps), list(times), list(jaw), list(feat))
    if args.vote:
        return consensus(read_variants(reader, clip)), None
    return reader.read(clip.frames, clip.kps, phrases)


history, pending = [], None  # on-screen guesses (newest last), in-flight (future, start, end)
captions, saved_status = [], None  # everything read this session, as written to the JSON file
preroll, clip, quiet_since = deque(), None, None
ema, prev_ema, motion = None, None, 0.0
prev = time.time()
save_captions("idle")
for frame, now in (video_frames() if args.video else camera_frames()):
    dt = now - prev
    feat, pts = tracker(frame, dt * 1000)
    prev = now
    h, w = frame.shape[:2]
    jaw = 0.0 if feat is None else float(feat[JAW_OPEN])
    kp = None if pts is None else keypoints(pts, w, h)
    if feat is not None:  # mouth-shape change, scaled to a 25fps frame so the thresholds match phrase.py
        ema = feat if ema is None else 0.5 * ema + 0.5 * feat
        if prev_ema is not None:
            motion = 0.7 * motion + 0.3 * float(np.abs(ema - prev_ema).sum()) * (0.04 / max(dt, 1e-3))
        prev_ema = ema
    item = (cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), kp, now, jaw, feat if feat is not None else ema if ema is not None else np.zeros(N_FEATURES, np.float32))

    if clip is None:  # idle: keep a short rolling pre-roll, wait for the mouth to open
        preroll.append(item)
        while preroll and now - preroll[0][2] > PREROLL:
            preroll.popleft()
        if motion > args.start and pending is None:
            clip, quiet_since = list(preroll), None
    else:
        clip.append(item)
        quiet_since = (quiet_since or now) if motion < args.still else None
        done = quiet_since is not None and now - quiet_since > args.pause
        if done or now - clip[0][2] > args.max_seconds:
            if clip[-1][2] - clip[0][2] > 0.8:
                pending = finish(clip)
            preroll.clear()
            clip = None

    new_caption = pending is not None and pending[0].done()
    if new_caption:
        add_caption(pending)
        pending = None
    status = "recording" if clip is not None else "reading" if pending is not None else "idle"
    if new_caption or status != saved_status:
        save_captions(status)
        saved_status = status

    if args.video:
        continue

    if pts is not None:
        for a, b in LIPS:
            cv2.line(frame, (int(pts[a].x * w), int(pts[a].y * h)), (int(pts[b].x * w), int(pts[b].y * h)), (0, 255, 0), 2)
    frame = cv2.flip(frame, 1)  # mirror for display only
    label = {"recording": "recording...", "reading": "reading lips...", "idle": "say something"}[status]
    color = {"recording": (0, 0, 255), "reading": (0, 200, 255), "idle": (200, 200, 200)}[status]
    cv2.putText(frame, label, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
    if pts is None:
        cv2.putText(frame, "no face", (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

    # caption bar with the latest guesses
    lines = [l for entry in history[-2:] for part in entry for l in wrap(part)][-5:]
    if lines:
        bar = 40 + 38 * len(lines)
        cv2.rectangle(frame, (0, h - bar), (w, h), (0, 0, 0), -1)
        for i, line in enumerate(lines):
            cv2.putText(frame, line, (20, h - bar + 38 * (i + 1) - 8), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

    cv2.imshow("lipread", frame)
    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break
    if key == ord("c"):
        history.clear()
    if key == ord(" ") and clip is not None:
        quiet_since = now - args.pause - 1

if args.video:  # the file ended: finish any open phrase and print the guesses
    if clip is not None and clip[-1][2] - clip[0][2] > 0.8:
        pending = finish(clip)
    if pending is not None:
        add_caption(pending)
    print("guesses:", history)
save_captions("stopped")
cv2.destroyAllWindows()
