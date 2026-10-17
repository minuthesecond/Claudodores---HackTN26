"""HTTP wrapper around live.py's pipeline, for the web frontend (../frontend).

The browser cuts a clip per phrase and POSTs it here. Each clip goes through exactly
what live.py does with camera frames: Face Landmarker -> keypoints -> 25fps resample
-> Auto-AVSR (LRS3_V_WER19.1 + language model) -> open-vocabulary text.

Run:  python lipread/server.py [--port 8000]
Test: python lipread/server.py --test talking.MOV
"""
import argparse
import tempfile
import threading
import time
from pathlib import Path

import av
import cv2
import numpy as np

from mouth import JAW_OPEN, MouthTracker
from vsr import LipReader, keypoints, resample

START = 0.10  # same as live.py --start: jaw opening that starts a phrase
PREROLL = 0.6  # same as live.py: seconds kept before the phrase starts
MAX_SIDE = 960  # same downscale as mouth.read_video

print("loading lip-reading model...")
reader = LipReader()
tracker = MouthTracker()
lock = threading.Lock()  # one model + one VIDEO-mode tracker: serve one clip at a time


def decode(path):
    """Yield (upright BGR frame, timestamp seconds) using the clip's real timestamps."""
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        for i, frame in enumerate(container.decode(stream)):
            t = frame.time if frame.time is not None else i / float(stream.average_rate or 30)
            bgr = frame.to_ndarray(format="bgr24")
            s = MAX_SIDE / max(bgr.shape[:2])
            if s < 1:
                bgr = cv2.resize(bgr, None, fx=s, fy=s)
            yield bgr, t


def transcribe(path):
    start = time.time()
    with lock:
        items, prev = [], None
        for bgr, t in decode(path):
            feat, pts = tracker(bgr, 33 if prev is None else (t - prev) * 1000)
            prev = t
            h, w = bgr.shape[:2]
            jaw = 0.0 if feat is None else float(feat[JAW_OPEN])
            kp = None if pts is None else keypoints(pts, w, h)
            items.append((cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), kp, t, jaw))

        if not any(kp is not None for _, kp, _, _ in items):
            return {"raw": "", "error": "no face found in clip"}

        # Trim the lead-in to live.py's pre-roll: start PREROLL s before the mouth first opens.
        first = next((t for *_, t, jaw in items if jaw > START), items[0][2])
        clip = [(f, k, t) for f, k, t, _ in items if t >= first - PREROLL]
        if len(clip) < 2:
            return {"raw": "", "error": "clip too short"}

        frames, kps, times = zip(*clip)
        frames, kps = resample(list(frames), list(kps), list(times))
        text = reader(frames, kps).strip().lower()
    return {"raw": text, "seconds": round(time.time() - start, 2)}


def make_app():
    from fastapi import FastAPI, File, UploadFile

    app = FastAPI(title="Lip Reader (live.py pipeline)")

    @app.get("/health")
    def health():
        return {"ok": True, "device": reader.device, "model": "LRS3_V_WER19.1"}

    @app.post("/transcribe")
    def transcribe_endpoint(file: UploadFile = File(...)):
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "clip.webm").suffix) as tmp:
            tmp.write(file.file.read())
            tmp.flush()
            try:
                return transcribe(tmp.name)
            except Exception as e:  # e.g. undecodable clip; live.py shows these as "(error: ...)"
                return {"raw": "", "error": str(e) or type(e).__name__}

    return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", help="run once on a video file and print the result")
    ap.add_argument("--port", type=int, default=8000)
    opts = ap.parse_args()

    if opts.test:
        print(transcribe(opts.test))
    else:
        import uvicorn

        uvicorn.run(make_app(), host="0.0.0.0", port=opts.port)
