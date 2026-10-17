#!/usr/bin/env bash
# One-time backend setup: Auto-AVSR code, Python 3.11 venv, deps, model checkpoint.
set -euo pipefail
cd "$(dirname "$0")"

[ -d auto_avsr ] || git clone https://github.com/mpc001/auto_avsr

# mediapipe==0.10.14 needs Python 3.10–3.12; uv fetches 3.11 if it isn't installed.
command -v uv >/dev/null || pip3 install --user uv
[ -d .venv ] || uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt

CKPT=auto_avsr/vsr_trlrs3_base.pth
[ -s "$CKPT" ] || curl -L -o "$CKPT" \
  "https://drive.usercontent.google.com/download?id=12PNM5szUsk_CuaV1yB9dL_YWvSM1zvAd&export=download&confirm=t"

echo "Done. Start the server with ./run.sh"
