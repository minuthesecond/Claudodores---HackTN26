#!/usr/bin/env bash
# Start the lip-reading server on :8000 (pass --test clip.mp4 to run once on a file).
set -euo pipefail
cd "$(dirname "$0")/auto_avsr"
PYTHONPATH=. exec ../.venv/bin/python ../avsr_server.py "$@"
