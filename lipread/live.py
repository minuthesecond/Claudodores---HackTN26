"""Live webcam lip reading. Run: python lipread/live.py [--camera N]
Start mouthing a phrase; when you pause, the model's guess appears under the video.
Keys: space = finish the current phrase now, c = clear, q = quit.
"""
import argparse
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from mediapipe.tasks.python import vision

from mouth import JAW_OPEN, MouthTracker, read_video
from vsr import LipReader, keypoints, resample

ap = argparse.ArgumentParser()
ap.add_argument("--camera", type=int, default=0)
ap.add_argument("--video", help="read this file instead of the camera (no window; prints guesses)")
ap.add_argument("--start", type=float, default=0.10, help="jaw opening that starts a phrase")
ap.add_argument("--still", type=float, default=0.04, help="jaw opening below this counts as a pause")
ap.add_argument("--pause", type=float, default=1.0, help="seconds of pause that ends a phrase")
ap.add_argument("--max-seconds", type=float, default=8.0)
args = ap.parse_args()

LIPS = [(c.start, c.end) for c in vision.FaceLandmarksConnections.FACE_LANDMARKS_LIPS]
PREROLL = 0.6  # seconds kept before the phrase starts

print("loading lip-reading model...")
reader = LipReader()
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
    return pool.submit(transcribe, [(f, k, t - clip[0][2]) for f, k, t in clip])


def wrap(text, width=38):
    lines, cur = [], ""
    for word in text.split():
        if len(cur) + len(word) + 1 > width:
            lines.append(cur)
            cur = ""
        cur = f"{cur} {word}".strip()
    return lines + [cur] if cur else lines


def transcribe(clip):
    frames, kps, times = zip(*clip)
    frames, kps = resample(list(frames), list(kps), list(times))
    return reader(frames, kps)


history, pending = [], None  # finished guesses (newest last), in-flight future
preroll, clip, quiet_since = deque(), None, None
prev = time.time()
for frame, now in (video_frames() if args.video else camera_frames()):
    feat, pts = tracker(frame, (now - prev) * 1000)
    prev = now
    h, w = frame.shape[:2]
    jaw = 0.0 if feat is None else float(feat[JAW_OPEN])
    kp = None if pts is None else keypoints(pts, w, h)
    item = (cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), kp, now)

    if clip is None:  # idle: keep a short rolling pre-roll, wait for the mouth to open
        preroll.append(item)
        while preroll and now - preroll[0][2] > PREROLL:
            preroll.popleft()
        if jaw > args.start and pending is None:
            clip, quiet_since = list(preroll), None
    else:
        clip.append(item)
        quiet_since = (quiet_since or now) if jaw < args.still else None
        done = quiet_since is not None and now - quiet_since > args.pause
        if done or now - clip[0][2] > args.max_seconds:
            if clip[-1][2] - clip[0][2] > 0.8:
                pending = finish(clip)
            preroll.clear()
            clip = None

    if pending is not None and pending.done():
        try:
            history.append(pending.result().strip().lower() or "(nothing)")
        except Exception as e:  # e.g. no face found in the clip
            history.append(f"(error: {e})")
        pending = None

    if args.video:
        if pending is not None and pending.done():
            pass
        continue

    if pts is not None:
        for a, b in LIPS:
            cv2.line(frame, (int(pts[a].x * w), int(pts[a].y * h)), (int(pts[b].x * w), int(pts[b].y * h)), (0, 255, 0), 2)
    frame = cv2.flip(frame, 1)  # mirror for display only
    status = "recording..." if clip is not None else "reading lips..." if pending is not None else "say something"
    color = (0, 0, 255) if clip is not None else (0, 200, 255) if pending is not None else (200, 200, 200)
    cv2.putText(frame, status, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
    if pts is None:
        cv2.putText(frame, "no face", (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

    # caption bar with the latest guesses
    lines = [l for g in history[-2:] for l in wrap(g)][-4:]
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
        history.append(pending.result().strip().lower())
    print("guesses:", history)
cv2.destroyAllWindows()
