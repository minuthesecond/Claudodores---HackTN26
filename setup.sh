#!/usr/bin/env bash
# One-time setup for lipread/ (live.py + server.py): model code, Python 3.11 venv, deps, weights (~1.1 GB).
set -euo pipefail
cd "$(dirname "$0")"

VSR=third_party/auto_avsr
[ -d "$VSR" ] || git clone https://github.com/mpc001/Visual_Speech_Recognition_for_Multiple_Languages "$VSR"

# mediapipe==0.10.14 needs Python 3.10–3.12; uv fetches 3.11 if it isn't installed.
command -v uv >/dev/null || pip3 install --user uv
[ -d .venv ] || uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r lipread/requirements.txt

fetch() {  # google drive id, zip contents dir, destination
  [ -s "$3/$2/model.pth" ] && return
  curl -L -o /tmp/$2.zip "https://drive.usercontent.google.com/download?id=$1&export=download&confirm=t"
  mkdir -p "$3" && unzip -q -o /tmp/$2.zip -d "$3" && rm /tmp/$2.zip
}
fetch 1t8RHhzDTTvOQkLQhmK1LZGnXRRXOXGi6 LRS3_V_WER19.1 "$VSR/benchmarks/LRS3/models"
fetch 1g31HGxJnnOwYl17b70ObFQZ1TSnPvRQv lm_en_subword "$VSR/benchmarks/LRS3/language_models"

echo "Done. Start the server with ./run.sh, then: cd frontend && npm install && npm run dev"
