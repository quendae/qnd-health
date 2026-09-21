#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${QND_HEALTH_SERVICE:-qnd-health}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="${QND_HEALTH_DB_FILE:-$REPO_DIR/data/qnd-health.db}"
BACKUP_DIR="${QND_HEALTH_BACKUP_DIR:-$REPO_DIR/backups}"
HEALTH_URL="${QND_HEALTH_HEALTH_URL:-http://127.0.0.1:3001/api/v1/health}"

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  SYSTEMCTL=(systemctl)
else
  SYSTEMCTL=(sudo systemctl)
fi

cd "$REPO_DIR"

for command in git pnpm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $command" >&2
    exit 1
  fi
done

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: tracked files have local changes. Commit or revert them before updating." >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Installing dependencies"
pnpm install --frozen-lockfile=false

echo "==> Generating Prisma client"
pnpm --filter @qnd-health/api prisma:generate

echo "==> Building application"
pnpm build

mkdir -p "$BACKUP_DIR"
BACKUP_FILE=""
if [[ -f "$DB_FILE" ]]; then
  BACKUP_FILE="$BACKUP_DIR/qnd-health-$(date +%Y%m%d-%H%M%S).db"
  echo "==> Backing up SQLite database to $BACKUP_FILE"
  cp -a "$DB_FILE" "$BACKUP_FILE"
fi

echo "==> Stopping $SERVICE_NAME"
"${SYSTEMCTL[@]}" stop "$SERVICE_NAME"

echo "==> Applying Prisma schema"
if ! pnpm --filter @qnd-health/api prisma:push; then
  echo "ERROR: Prisma schema update failed. Service remains stopped." >&2
  if [[ -n "$BACKUP_FILE" ]]; then
    echo "Database backup: $BACKUP_FILE" >&2
  fi
  exit 1
fi

echo "==> Backfilling versioned profile goals"
if ! pnpm --filter @qnd-health/api goals:backfill; then
  echo "ERROR: profile goal backfill failed. Service remains stopped." >&2
  if [[ -n "$BACKUP_FILE" ]]; then
    echo "Database backup: $BACKUP_FILE" >&2
  fi
  exit 1
fi

echo "==> Starting $SERVICE_NAME"
"${SYSTEMCTL[@]}" restart "$SERVICE_NAME"

if command -v curl >/dev/null 2>&1; then
  echo "==> Waiting for health check"
  for _ in $(seq 1 15); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      echo "==> QND Health is healthy"
      "${SYSTEMCTL[@]}" status "$SERVICE_NAME" --no-pager --lines=8 || true
      exit 0
    fi
    sleep 1
  done

  echo "ERROR: service restarted, but health check did not become ready: $HEALTH_URL" >&2
  "${SYSTEMCTL[@]}" status "$SERVICE_NAME" --no-pager --lines=20 || true
  exit 1
fi

echo "==> Update complete (curl unavailable, health check skipped)"
"${SYSTEMCTL[@]}" status "$SERVICE_NAME" --no-pager --lines=8 || true
