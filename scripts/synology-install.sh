#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
mkdir -p data logs backups

if [ ! -f .env ]; then
  cp .env.synology.example .env
  echo "Created .env from .env.synology.example. Edit TOKEN_PEPPER before starting the app."
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM=pnpm
elif command -v corepack >/dev/null 2>&1; then
  PNPM="corepack pnpm"
else
  echo "pnpm/corepack not found. Install pnpm 10.17.1 first: npm install -g pnpm@10.17.1" >&2
  exit 1
fi

$PNPM install --frozen-lockfile=false
$PNPM --filter @qnd-health/api prisma:generate
$PNPM build
$PNPM --filter @qnd-health/api prisma:push

echo "QND Health is built and the SQLite schema is ready."
echo "Next: ./scripts/synology-start.sh"
