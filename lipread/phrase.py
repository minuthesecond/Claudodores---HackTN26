"""Clip loading, speech-span windows, and consensus voting for the lip reader."""
import re
from collections import namedtuple

import cv2
import numpy as np

from mouth import JAW_OPEN, N_FEATURES, MouthTracker, read_video, smooth
from vsr import MODEL_FPS, keypoints, tick_indices

# how much the mouth shape changes per 25fps frame (summed over all mouth features):
# above MOVING the lips are moving; below STILL they're at rest. At rest it's ~0.005-0.04, speaking peaks at 0.17-0.8.
MOVING, STILL = 0.08, 0.04
SINGLE = (0.6, 1.0)  # seconds kept before / after the speech: what live.py does by default
VOTE = [SINGLE, (0.3, 0.5), (0.9, 1.5)]  # the window variants whose answers get voted on

# frames: upright RGB; kps: 4x2 face anchors or None; jaw: jaw-open score; feat: all mouth features; at MODEL_FPS
Clip = namedtuple("Clip", "frames kps jaw feat")


def load_clip(path):
    """Read a video file into a Clip at MODEL_FPS (tracks only the frames it keeps)."""
    tracker, frames, kps, jaw, feats, t, next_tick = MouthTracker(), [], [], [], [], 0.0, 0.0
    for bgr, dt in read_video(path):
        if t + 1e-6 >= next_tick:
            feat, pts = tracker(bgr, 1000 / MODEL_FPS)
            h, w = bgr.shape[:2]
            frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            kps.append(None if pts is None else keypoints(pts, w, h))
            feats.append(feat if feat is not None else (feats[-1] if feats else np.zeros(N_FEATURES, np.float32)))
            jaw.append(0.0 if feat is None else float(feat[JAW_OPEN]))
            next_tick += 1 / MODEL_FPS
        t += dt / 1000
    return Clip(frames, kps, np.array(jaw), np.array(feats))


def clip_from_stream(frames, kps, times, jaw, feat):
    """Turn frames captured at an irregular rate (webcam) into a Clip at MODEL_FPS."""
    idx = tick_indices(times)
    return Clip([frames[i] for i in idx], [kps[i] for i in idx], np.array([jaw[i] for i in idx]), np.array([feat[i] for i in idx]))


def mouth_motion(feat):
    """Per-frame change in mouth shape (feat sampled at MODEL_FPS), lightly smoothed."""
    ft = smooth(feat, 3)
    change = np.abs(np.diff(ft, axis=0, prepend=ft[:1])).sum(1)
    return smooth(change[:, None], 5)[:, 0]


def speech_span(clip):
    """(first, last) frame index where the lips are moving, or None if they never move."""
    moving = np.where(mouth_motion(clip.feat) > MOVING)[0]
    return (moving[0], moving[-1]) if len(moving) else None


def read_variants(reader, clip, pads=VOTE):
    """One transcript per (before, after) padding around the speech. pads[0] comes first."""
    span = speech_span(clip)
    if span is None:
        return []
    out = []
    for pre, post in pads:
        i0 = max(0, span[0] - int(pre * MODEL_FPS))
        i1 = min(len(clip.frames), span[1] + int(post * MODEL_FPS) + 1)
        try:
            out.append(reader(clip.frames[i0:i1], clip.kps[i0:i1]).strip().lower())
        except Exception:  # e.g. no face found in this window
            out.append("")
    return out


def words(text):
    return re.sub(r"[^a-z0-9' ]", "", text.lower()).split()


def word_errors(ref, hyp):
    """Word-level edit distance between two strings."""
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(h, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
    return d[-1]


def consensus(hyps):
    """The answer closest (in word edits) to all the others."""
    hyps = [h for h in hyps if h]
    return min(hyps, key=lambda h: sum(word_errors(h, o) for o in hyps)) if hyps else ""
