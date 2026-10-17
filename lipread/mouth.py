"""Per-frame mouth features from MediaPipe Face Landmarker, plus template matching."""
from collections import deque
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL = Path(__file__).resolve().parent / "face_landmarker.task"

# blendshapes that describe mouth/jaw shape
BLENDSHAPES = [
    "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker", "mouthSmileLeft", "mouthSmileRight",
    "mouthStretchLeft", "mouthStretchRight", "mouthRollLower", "mouthRollUpper",
    "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight",
    "mouthUpperUpLeft", "mouthUpperUpRight",
]
JAW_OPEN = 0  # index of jawOpen in the feature vector
N_FEATURES = len(BLENDSHAPES) + 2

# landmark indices: inner lip top/bottom, inner lip corners, outer eye corners
LIP_TOP, LIP_BOTTOM, LIP_L, LIP_R, EYE_L, EYE_R = 13, 14, 78, 308, 33, 263


class MouthTracker:
    def __init__(self):
        opts = vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(MODEL)),
            running_mode=vision.RunningMode.VIDEO,
            output_face_blendshapes=True,
            num_faces=1,
        )
        self.lm = vision.FaceLandmarker.create_from_options(opts)
        self.ts = 0

    def __call__(self, bgr, dt_ms):
        """Return (features or None, landmarks or None) for one upright BGR frame."""
        self.ts += max(int(dt_ms), 1)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        res = self.lm.detect_for_video(img, self.ts)
        if not res.face_landmarks:
            return None, None
        pts = res.face_landmarks[0]
        scores = {c.category_name: c.score for c in res.face_blendshapes[0]}
        h, w = bgr.shape[:2]
        xy = lambda i: np.array([pts[i].x * w, pts[i].y * h])
        eye = np.linalg.norm(xy(EYE_L) - xy(EYE_R))  # scale: distance between eyes
        opening = np.linalg.norm(xy(LIP_TOP) - xy(LIP_BOTTOM)) / eye
        width = np.linalg.norm(xy(LIP_L) - xy(LIP_R)) / eye
        feat = np.array([scores[n] for n in BLENDSHAPES] + [opening * 3, width], dtype=np.float32)
        return feat, pts


def read_video(path, max_side=960):
    """Yield (upright BGR frame, dt_ms). Applies the phone's rotation tag, which OpenCV ignores."""
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 0)
    rot = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}.get(
        int(cap.get(cv2.CAP_PROP_ORIENTATION_META))
    )
    dt = 1000 / (cap.get(cv2.CAP_PROP_FPS) or 30)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if rot is not None:
            frame = cv2.rotate(frame, rot)
        s = max_side / max(frame.shape[:2])
        yield cv2.resize(frame, None, fx=s, fy=s), dt
    cap.release()


def video_features(path):
    """Per-frame feature array for a video; frames with no face repeat the previous values."""
    tracker, feats = MouthTracker(), []
    for frame, dt in read_video(path):
        f, _ = tracker(frame, dt)
        feats.append(f if f is not None else (feats[-1] if feats else np.zeros(N_FEATURES, np.float32)))
    return np.array(feats)


def smooth(seq, k=3):
    seq = np.asarray(seq, dtype=np.float32)
    if len(seq) < k:
        return seq
    pad = np.pad(seq, ((k // 2, k // 2), (0, 0)), mode="edge")
    return np.stack([np.convolve(pad[:, d], np.ones(k) / k, mode="valid") for d in range(seq.shape[1])], 1)


def trim_to_speech(feats, thresh=0.03, gap=8, pad=3):
    """Keep the main burst of mouth movement: split at pauses (>= `gap` still frames), take the busiest."""
    jaw = feats[:, JAW_OPEN]
    idx = np.where(jaw > thresh)[0]
    if len(idx) == 0:
        return feats
    segments = np.split(idx, np.where(np.diff(idx) >= gap)[0] + 1)
    best = max(segments, key=lambda seg: jaw[seg[0]:seg[-1] + 1].sum())
    return feats[max(best[0] - pad, 0):best[-1] + 1 + pad]


def subseq_dtw(template, window):
    """Cost of the best match of `template` anywhere inside `window` (open begin/end DTW).

    Lower is better; ~0 means the window contains a tempo-warped copy of the template.
    """
    n, m = len(template), len(window)
    cost = np.linalg.norm(template[:, None] - window[None], axis=2)
    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, :] = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            acc[i, j] = cost[i - 1, j - 1] + min(acc[i - 1, j], acc[i, j - 1], acc[i - 1, j - 1])
    return acc[n, 1:].min() / n


class Matcher:
    """Rolling window over live features; push() returns the best distance to any template."""

    def __init__(self, templates, min_jaw=0.15):
        self.templates = templates
        self.buf = deque(maxlen=int(max(len(t) for t in templates) * 1.6))
        self.min_jaw = min_jaw

    def push(self, feat):
        self.buf.append(feat)
        if len(self.buf) < self.buf.maxlen:
            return np.inf
        win = smooth(np.array(self.buf))
        if win[:, JAW_OPEN].max() < self.min_jaw:  # mouth never really opened: nothing said
            return np.inf
        return min(subseq_dtw(t, win) for t in self.templates)


def load_templates(directory):
    return [np.load(p) for p in sorted(Path(directory).glob("*.npy"))]
