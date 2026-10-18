#!/usr/bin/env bash
# Lip-reading server for the web frontend, on :8000 (pass --test clip.mp4 to run once on a file).
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python lipread/server.py "$@"
