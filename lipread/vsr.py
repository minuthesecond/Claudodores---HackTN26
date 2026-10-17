"""Open-vocabulary lip reading: Face Landmarker keypoints -> Auto-AVSR (LRS3 visual-only) -> text.

The model and code in third_party/auto_avsr are research/non-commercial only (see its LICENSE).
"""
import contextlib
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

AVSR_DIR = Path(__file__).resolve().parent.parent / "third_party" / "auto_avsr"
CONFIG = "configs/LRS3_V_WER19.1.ini"
MODEL_FPS = 25

# Face Landmarker indices for the four anchors the cropper aligns on:
# right eye, left eye, nose base, mouth center (right/left from the subject's point of view)
_ANCHORS = [(33, 133), (362, 263), (98, 327, 2), (0, 17, 61, 291)]


def keypoints(pts, w, h):
    """4x2 pixel anchors (eyes, nose, mouth) from Face Landmarker landmarks."""
    return np.array([[np.mean([pts[i].x for i in grp]) * w, np.mean([pts[i].y for i in grp]) * h] for grp in _ANCHORS])


def tick_indices(times, fps=MODEL_FPS):
    """Index of the frame nearest to each tick of a fixed-rate clock (webcams and phones aren't 25fps)."""
    times = np.asarray(times, dtype=np.float64)
    ticks = np.arange(times[0], times[-1], 1.0 / fps)
    return np.clip(np.searchsorted(times, ticks), 0, len(times) - 1)


def resample(frames, kps, times, fps=MODEL_FPS):
    idx = tick_indices(times, fps)
    return [frames[i] for i in idx], [kps[i] for i in idx]


class LipReader:
    def __init__(self, device=None):
        sys.path.insert(0, str(AVSR_DIR))
        from pipelines.pipeline import InferencePipeline

        self.device = device or "cpu"
        with contextlib.chdir(AVSR_DIR) if hasattr(contextlib, "chdir") else _chdir(AVSR_DIR):
            self.pipe = InferencePipeline(CONFIG, detector="mediapipe", face_track=False, device=self.device)

    def __call__(self, frames_rgb, kps):
        """frames_rgb: list of upright RGB frames at ~25fps; kps: matching list of 4x2 anchors (None = no face)."""
        loader = self.pipe.dataloader
        video = loader.video_process(np.array(frames_rgb), list(kps))
        video = loader.video_transform(torch.tensor(video))
        return self.pipe.model.infer(video)


@contextlib.contextmanager
def _chdir(path):
    old = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)
