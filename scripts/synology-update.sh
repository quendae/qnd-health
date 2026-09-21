#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

./scripts/synology-backup.sh

git pull --ff-only

if command -v pnpm >/dev/null 2>&1; then
  PNPM=pnpm
elif command -v corepack >/dev/null 2>&1; then
  PNPM="corepack pnpm"
else
  echo "pnpm/corepack not found" >&2
  exit 1
fi

$PNPM install --frozen-lockfile=false
$PNPM --filter @qnd-health/api prisma:generate
$PNPM build
$PNPM --filter @qnd-health/api prisma:push
./scripts/synology-start.sh
