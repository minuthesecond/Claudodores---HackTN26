#!/usr/bin/env bash
# End-to-end goals for a running voicebank server (start it first with ./run.sh). See smoke.py.
set -euo pipefail
cd "$(dirname "$0")/.."
exec .venv/bin/python tests/smoke.py "$@"
