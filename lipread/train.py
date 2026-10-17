"""Train YOLOv8 on the facial-feature dataset. Run: python lipread/train.py [epochs]"""
import sys
from pathlib import Path

import torch
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 50
device = "mps" if torch.backends.mps.is_available() else "cpu"

model = YOLO("yolov8n.pt")
model.train(
    data=str(ROOT / "data.yaml"),
    epochs=epochs,
    imgsz=640,
    batch=16,
    device=device,
    project=str(ROOT / "runs"),
    name="facial",
    exist_ok=True,
)
