#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
mkdir -p data logs

export NODE_ENV=production
export HOST=127.0.0.1
export PORT=3099
export DATABASE_URL=file:./data/native-smoke.db
export TOKEN_PEPPER=native-smoke-test-pepper
export WEB_DIST_PATH=apps/web/dist

rm -f data/native-smoke.db data/native-smoke.db-wal data/native-smoke.db-shm
pnpm --filter @qnd-health/api prisma:push >/dev/null

TOKEN_OUTPUT=$(pnpm --filter @qnd-health/api token:create -- --name native-smoke --scopes today:read)
TOKEN=$(printf '%s\n' "$TOKEN_OUTPUT" | grep '^qndh_' | tail -n 1)
if [ -z "$TOKEN" ]; then
  printf '%s\n' "$TOKEN_OUTPUT" >&2
  echo "Native smoke could not create an API token" >&2
  exit 1
fi

if [ ! -f data/native-smoke.db ]; then
  echo "Expected SQLite database was not created at data/native-smoke.db" >&2
  exit 1
fi

node apps/api/dist/src/server.js > logs/native-smoke.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true; rm -f data/native-smoke.db data/native-smoke.db-wal data/native-smoke.db-shm' EXIT INT TERM

READY=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.25
done

if [ "$READY" -ne 1 ]; then
  cat logs/native-smoke.log >&2 || true
  echo "Native server failed to become ready" >&2
  exit 1
fi

curl -fsS "http://127.0.0.1:$PORT/" | grep -q 'QND Health'
curl -fsS "http://127.0.0.1:$PORT/api/openapi.json" | grep -q 'fit.qqnd.fyi'
curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/api/v1/today?date=2026-09-21" | grep -q '"date":"2026-09-21"'

echo "native SQLite + authenticated Fastify API + React smoke ok"
