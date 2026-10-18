#!/usr/bin/env bash
# Voicebank server (voicebank/server.py) on :8003. The first run makes voicebank/.venv and installs
# its deps; XTTS-v2 comes from the same model cache as voice/, so it's only downloaded once.
# Pass --test to run the unit tests instead.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  UV=$(command -v uv || ls ~/Library/Python/3.*/bin/uv ~/.local/bin/uv 2>/dev/null | head -1 || true)
  if [ -n "$UV" ]; then
    "$UV" venv --python 3.11 .venv
    "$UV" pip install --python .venv/bin/python -r requirements.txt
  else
    # coqui-tts needs Python 3.10–3.12
    PY=$(command -v python3.11 || command -v python3.12 || ls ~/.local/share/uv/python/cpython-3.11*/bin/python3.11 2>/dev/null | head -1)
    [ -n "$PY" ] || { echo "Need Python 3.11 or 3.12 (or uv) to set up voicebank" >&2; exit 1; }
    "$PY" -m venv .venv
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -r requirements.txt
  fi
fi

command -v ffmpeg >/dev/null || { echo "voicebank needs ffmpeg (brew install ffmpeg)" >&2; exit 1; }
export PYTORCH_ENABLE_MPS_FALLBACK=1  # Demucs uses a few ops Apple GPUs don't have; run those on CPU

if [ "${1:-}" = "--test" ]; then
  exec .venv/bin/python -m pytest -q tests
fi
exec .venv/bin/python server.py "$@"
