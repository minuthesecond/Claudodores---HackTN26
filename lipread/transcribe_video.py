"""Read lips in a video file. Run: python lipread/transcribe_video.py VIDEO [VIDEO ...]"""
import sys
import time

import cv2

from mouth import MouthTracker, read_video
from vsr import LipReader, keypoints, resample

reader = LipReader()
for path in sys.argv[1:]:
    tracker, frames, kps, times, t = MouthTracker(), [], [], [], 0.0
    for bgr, dt in read_video(path):
        _, pts = tracker(bgr, dt)
        h, w = bgr.shape[:2]
        frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        kps.append(None if pts is None else keypoints(pts, w, h))
        times.append(t)
        t += dt / 1000
    frames, kps = resample(frames, kps, times)
    start = time.time()
    print(f"{path}: {reader(frames, kps)!r}  ({len(frames)} frames, {time.time() - start:.1f}s)")
