"""Runs vsr.LipReader's model in a separate process.

Its beam search is mostly Python, so in-process it holds the GIL for seconds at a time
and starves frame handling (we saw clips arrive at 1-6 fps). Here the mouth crop runs in
the calling process (cheap) and only the small cropped clip crosses to the worker.
"""
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor

import numpy as np

_reader = None  # worker-process LipReader


def _init():
    global _reader
    from vsr import LipReader

    _reader = LipReader()


def _decode(mouth, beam):
    import torch

    model = _reader.pipe.model
    model.beam_search.beam_size = beam
    video = _reader.pipe.dataloader.video_transform(torch.tensor(mouth))
    return model.infer(video).strip().lower()


class Decoder:
    def __init__(self):
        import sys

        from vsr import AVSR_DIR

        sys.path.insert(0, str(AVSR_DIR))
        from pipelines.detectors.mediapipe.video_process import VideoProcess

        self.video_process = VideoProcess(convert_gray=True)  # same crop LipReader uses
        self.pool = ProcessPoolExecutor(max_workers=1, mp_context=mp.get_context("spawn"), initializer=_init)
        self.pool.submit(int).result()  # load the model now, not on the first phrase
        self.device = "cpu"

    def __call__(self, frames_rgb, kps, beam):
        """Same as vsr.LipReader.__call__, with the model call in the worker process."""
        mouth = self.video_process(np.array(frames_rgb), list(kps))
        if mouth is None:
            raise ValueError("no face found in clip")
        return self.pool.submit(_decode, mouth, beam).result()
