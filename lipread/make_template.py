"""Turn a video into a mouth-motion template. Run: python lipread/make_template.py VIDEO NAME"""
import sys
from pathlib import Path

import numpy as np

from mouth import smooth, trim_to_speech, video_features

video, name = sys.argv[1], sys.argv[2]
feats = smooth(video_features(video))
tpl = trim_to_speech(feats)

out = Path(__file__).resolve().parent / "templates"
out.mkdir(exist_ok=True)
np.save(out / f"{name}.npy", tpl)
print(f"{name}: {len(feats)} frames, kept {len(tpl)}; jawOpen range {tpl[:, 0].min():.2f}-{tpl[:, 0].max():.2f}")
