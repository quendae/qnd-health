#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
mkdir -p data logs

if [ ! -f .env ]; then
  echo ".env is missing. Run ./scripts/synology-install.sh first." >&2
  exit 1
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save
  exit 0
fi

PID_FILE=data/qnd-health.pid
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "QND Health is already running (PID $(cat "$PID_FILE"))."
  exit 0
fi

nohup node apps/api/dist/src/server.js >> logs/qnd-health.log 2>&1 &
echo $! > "$PID_FILE"
echo "QND Health started without PM2 (PID $!). Install PM2 for automatic recovery after crashes/reboots."
