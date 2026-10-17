"""Open-vocabulary lip reading: Face Landmarker keypoints -> Auto-AVSR (LRS3 visual-only) -> text.

The model and code in third_party/auto_avsr are research/non-commercial only (see its LICENSE).
"""
import contextlib
import os
import re
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

AVSR_DIR = Path(__file__).resolve().parent.parent / "third_party" / "auto_avsr"
CONFIG = "configs/LRS3_V_WER19.1.ini"
UNITS = AVSR_DIR / "pipelines" / "tokens" / "unigram5000_units.txt"
MODEL_FPS = 25
CTC_WEIGHT = 0.1  # same mix of CTC and attention scores the model's own decoder uses (see CONFIG)

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
        from espnet.asr.asr_utils import add_results_to_json
        from espnet.nets.pytorch_backend.transformer.mask import subsequent_mask
        from pipelines.pipeline import InferencePipeline

        self._to_json, self._mask = add_results_to_json, subsequent_mask
        self.device = device or "cpu"
        with contextlib.chdir(AVSR_DIR) if hasattr(contextlib, "chdir") else _chdir(AVSR_DIR):
            self.pipe = InferencePipeline(CONFIG, detector="mediapipe", face_track=False, device=self.device)
        # word piece -> token id; the model's token list is <blank> followed by these, in file order
        self.units = {line.split()[0]: i for i, line in enumerate(UNITS.read_text(encoding="utf-8").splitlines(), 1)}
        self._tokens = {}

    def __call__(self, frames_rgb, kps):
        """frames_rgb: list of upright RGB frames at ~25fps; kps: matching list of 4x2 anchors (None = no face)."""
        return self.read(frames_rgb, kps)[0]

    def read(self, frames_rgb, kps, phrases=None):
        """Return (free-form guess, ranked). ranked is None without phrases, otherwise a list of
        (phrase, score) best first. The score is the model's average log-probability per word piece:
        averaging (not summing) keeps short phrases from winning just for having fewer pieces."""
        loader, avsr = self.pipe.dataloader, self.pipe.model
        video = loader.video_transform(torch.tensor(loader.video_process(np.array(frames_rgb), list(kps))))
        with torch.no_grad():
            enc = avsr.model.encode(video.to(self.device))
            best = [h.asdict() for h in avsr.beam_search(enc)[:1]]
            text = self._to_json(best, avsr.token_list).replace("▁", " ").strip().replace("<eos>", "")
            if not phrases:
                return text, None
            # +1 for the end-of-sentence token, which is scored too
            scores = np.array([self._score(enc, self.tokens(p)) / (len(self.tokens(p)) + 1) for p in phrases])
        return text, [(phrases[i], float(scores[i])) for i in np.argsort(-scores)]

    def tokens(self, phrase):
        """Spell a phrase with the model's word pieces, using as few pieces per word as possible."""
        if phrase not in self._tokens:
            ids = []
            for word in re.sub(r"[^A-Z0-9' ]", "", phrase.upper()).split():
                pieces = self._segment("▁" + word)
                if pieces is None:
                    raise ValueError(f"can't spell {word!r} with the model's word pieces")
                ids += pieces
            self._tokens[phrase] = ids
        return self._tokens[phrase]

    def _segment(self, s):
        """Fewest pieces; on a tie, the longest piece first (APPLES -> APPLE+S, as the model spells it)."""
        n, inf = len(s), float("inf")
        left = [inf] * n + [0]  # left[i]: fewest pieces that spell s[i:]
        for i in range(n - 1, -1, -1):
            left[i] = min((left[j] + 1 for j in range(i + 1, n + 1) if s[i:j] in self.units), default=inf)
        if left[0] == inf:
            return None
        ids, i = [], 0
        while i < n:
            j = max(j for j in range(i + 1, n + 1) if s[i:j] in self.units and left[j] == left[i] - 1)
            ids.append(self.units[s[i:j]])
            i = j
        return ids

    def _score(self, enc, ids):
        """Log-probability of the token sequence `ids` given the encoded video (attention + CTC mix)."""
        e2e = self.pipe.model.model
        hs = enc.unsqueeze(0)
        ys_in = torch.tensor([[e2e.sos] + ids], device=hs.device)
        ys_out = torch.tensor(ids + [e2e.eos], device=hs.device)
        logits, _ = e2e.decoder(ys_in, self._mask(len(ids) + 1, device=hs.device).unsqueeze(0), hs, None)
        att = torch.log_softmax(logits, -1)[0].gather(1, ys_out[:, None]).sum()
        log_probs = e2e.ctc.log_softmax(hs).transpose(0, 1)  # (frames, 1, tokens)
        ctc = -F.ctc_loss(log_probs, torch.tensor([ids]), torch.tensor([log_probs.shape[0]]), torch.tensor([len(ids)]),
                          blank=0, reduction="sum")
        return float((1 - CTC_WEIGHT) * att + CTC_WEIGHT * ctc)


@contextlib.contextmanager
def _chdir(path):
    old = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)
