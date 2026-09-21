#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
mkdir -p backups
DB_PATH=${QND_DB_PATH:-data/qnd-health.db}

if [ ! -f "$DB_PATH" ]; then
  echo "No SQLite database found at $DB_PATH; nothing to back up."
  exit 0
fi

STAMP=$(date '+%Y-%m-%d_%H-%M-%S')
TARGET="backups/qnd-health_$STAMP.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$TARGET'"
else
  echo "sqlite3 CLI not found; briefly stopping QND Health for a consistent file copy."
  ./scripts/synology-stop.sh || true
  cp "$DB_PATH" "$TARGET"
  ./scripts/synology-start.sh || true
fi

find backups -type f -name 'qnd-health_*.db' -mtime +30 -delete 2>/dev/null || true
echo "Backup created: $TARGET"
