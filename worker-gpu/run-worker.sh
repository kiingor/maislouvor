#!/bin/bash
# Launcher for the +Louvor stem worker on macOS (Apple Silicon).
# Mirrors run-worker.ps1 on Windows: puts ffmpeg/node on PATH, then runs the
# worker from its venv and relaunches it if it ever dies. Started at login by the LaunchAgent
# com.maislouvor.worker.plist (which also restarts this script itself).
set -u

cd "$(dirname "$0")" || exit 1

# launchd hands jobs a bare PATH — add Homebrew (ffmpeg, node) explicitly.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

# Any op Metal doesn't implement falls back to the CPU instead of crashing.
export PYTORCH_ENABLE_MPS_FALLBACK=1

LOG="worker.log"

PY="./.venv/bin/python"
echo "=== launcher started $(date -Iseconds) ===" >"$LOG"
while true; do
  "$PY" worker.py >>"$LOG" 2>&1
  echo "--- worker exited, relaunching in 5s ($(date -Iseconds)) ---" >>"$LOG"
  sleep 5
done
