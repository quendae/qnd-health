#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if command -v pm2 >/dev/null 2>&1 && pm2 describe qnd-health >/dev/null 2>&1; then
  pm2 stop qnd-health
  exit 0
fi

PID_FILE=data/qnd-health.pid
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
  fi
  rm -f "$PID_FILE"
fi
