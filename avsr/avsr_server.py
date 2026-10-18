"""
Auto-AVSR lip-reading server (Justin's half of the project).

Your partner's MediaPipe script records a clip of someone mouthing words and POSTs it here.
This server crops the mouth, runs Auto-AVSR, snaps the guess to the closest ICU phrase,
and sends back JSON.

Put this file in the ROOT of the auto_avsr repo (same folder as lightning.py).

Setup (Python 3.10 recommended):
  git clone https://github.com/mpc001/auto_avsr && cd auto_avsr
  pip install torch torchvision torchaudio pytorch-lightning sentencepiece av
  pip install -r preparation/requirements.txt
  pip install "mediapipe==0.10.14" fastapi uvicorn python-multipart
  curl -L -o vsr_trlrs3_base.pth "https://drive.usercontent.google.com/download?id=12PNM5szUsk_CuaV1yB9dL_YWvSM1zvAd&export=download&confirm=t"

Test on a file:   python avsr_server.py --test some_clip.mp4
Run the server:   python avsr_server.py            (listens on http://0.0.0.0:8000)
"""

import argparse
import difflib
import os
import tempfile
import time

import av
import numpy as np
import torch

from datamodule.transforms import VideoTransform
from lightning import ModelModule

MODEL_PATH = os.environ.get("VSR_MODEL", "vsr_trlrs3_base.pth")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_FPS = 25  # Auto-AVSR was trained on 25 fps video (LRS3)

# Keep this list identical to the one in your partner's script
PHRASES = [
    "i am in pain", "i can't breathe", "i need water", "call the nurse",
    "call my family", "i am cold", "i am hot", "yes", "no", "thank you",
    "i need to use the bathroom", "where am i", "i am scared",
]


class NoFaceError(Exception):
    pass


def read_frames(video_path):
    """Decode a video with PyAV (newer torchvision no longer has read_video)."""
    with av.open(video_path) as container:
        stream = container.streams.video[0]
        fps = float(stream.average_rate or MODEL_FPS)
        frames = np.stack([f.to_ndarray(format="rgb24") for f in container.decode(stream)])
    return frames, fps


class LipReader:
    """Same steps as Auto-AVSR's tutorials/inference.ipynb, using the MediaPipe face detector
    (runs on CPU) and loading the model once so each request is fast."""

    def __init__(self, ckpt_path):
        from preparation.detectors.mediapipe.detector import LandmarksDetector
        from preparation.detectors.mediapipe.video_process import VideoProcess

        self.landmarks_detector = LandmarksDetector()
        self.video_process = VideoProcess(convert_gray=False)
        self.video_transform = VideoTransform(subset="test")

        args = argparse.Namespace(modality="video")
        self.model = ModelModule(args)
        ckpt = torch.load(ckpt_path, map_location="cpu")
        self.model.model.load_state_dict(ckpt)
        self.model.eval().to(DEVICE)

    @torch.no_grad()
    def __call__(self, video_path):
        frames, fps = read_frames(video_path)                 # T x H x W x 3, RGB
        if fps > MODEL_FPS + 1:  # webcams usually record at 30 fps; drop frames down to 25
            keep = np.arange(0, len(frames), fps / MODEL_FPS).astype(int)
            frames = frames[keep]

        landmarks = self.landmarks_detector(frames)          # finds the face in each frame
        try:
            mouth = self.video_process(frames, landmarks)    # crops a 96x96 mouth region per frame
        except (AssertionError, OverflowError):
            mouth = None
        if mouth is None:  # video_process returns None when no frame has a face
            raise NoFaceError
        x = torch.tensor(mouth).permute(0, 3, 1, 2)
        x = self.video_transform(x).to(DEVICE)
        return self.model(x).strip().lower()


def closest_phrase(text):
    match = difflib.get_close_matches(text, PHRASES, n=1, cutoff=0.3)
    return match[0] if match else None


reader = None


def get_reader():
    global reader
    if reader is None:
        print(f"Loading {MODEL_PATH} on {DEVICE}...")
        reader = LipReader(MODEL_PATH)
    return reader


def transcribe(video_path):
    start = time.time()
    try:
        raw = get_reader()(video_path)
    except NoFaceError:
        return {"raw": "", "phrase": None, "error": "no face found in clip"}
    return {
        "raw": raw,
        "phrase": closest_phrase(raw),
        "seconds": round(time.time() - start, 2),
    }


# ---------- web server ----------
def make_app():
    from fastapi import FastAPI, File, UploadFile

    app = FastAPI(title="Lip Reader")

    @app.on_event("startup")
    def load_model():
        get_reader()

    @app.get("/health")
    def health():
        return {"ok": True, "device": DEVICE}

    # Plain def (not async) so FastAPI runs the slow model call in a worker thread
    # instead of blocking the server while it works.
    @app.post("/transcribe")
    def transcribe_endpoint(file: UploadFile = File(...)):
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(file.file.read())
            path = tmp.name
        try:
            return transcribe(path)
        finally:
            os.remove(path)

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", help="run once on a video file and print the result")
    parser.add_argument("--port", type=int, default=8000)
    opts = parser.parse_args()

    if opts.test:
        print(transcribe(opts.test))
    else:
        import uvicorn
        uvicorn.run(make_app(), host="0.0.0.0", port=opts.port)
