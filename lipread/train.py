"""Train YOLOv8 on the facial-feature dataset. Run: python lipread/train.py [epochs]"""
import sys
from pathlib import Path

import torch
import yaml
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 50
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

# data.yaml's dataset path is relative to data.yaml so it works on any machine, but ultralytics
# would look for relative paths in its own datasets folder: hand it a copy with the full path.
data = yaml.safe_load((ROOT / "data.yaml").read_text())
data["path"] = str((ROOT / data["path"]).resolve())
data_file = ROOT / "runs" / "data.yaml"
data_file.parent.mkdir(exist_ok=True)
data_file.write_text(yaml.safe_dump(data))

weights = ROOT.parent / "yolov8n.pt"  # committed at the repo root; ultralytics downloads it if missing
model = YOLO(str(weights) if weights.exists() else "yolov8n.pt")
model.train(
    data=str(data_file),
    epochs=epochs,
    imgsz=640,
    batch=16,
    device=device,
    project=str(ROOT / "runs"),
    name="facial",
    exist_ok=True,
)
