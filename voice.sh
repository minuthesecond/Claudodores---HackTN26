#!/usr/bin/env bash
# Voice server (voice/voice_server.py, XTTS-v2) on :8001. The first run makes voice/.venv and
# installs its deps; XTTS downloads its ~1.8 GB model on first start and pre-speaks the ICU phrases.
set -euo pipefail
cd "$(dirname "$0")/voice"

if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null; then
    uv venv --python 3.11 .venv
    uv pip install --python .venv/bin/python -r requirements.txt
  else
    # coqui-tts needs Python 3.10–3.12
    PY=$(command -v python3.11 || command -v python3.12 || ls ~/.local/share/uv/python/cpython-3.11*/bin/python3.11 2>/dev/null | head -1)
    [ -n "$PY" ] || { echo "Need Python 3.11 or 3.12 (or uv) to set up the voice server" >&2; exit 1; }
    "$PY" -m venv .venv
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -r requirements.txt
  fi
fi
exec .venv/bin/python voice_server.py "$@"
