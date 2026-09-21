# QND Health deployment

Target public URL: **https://fit.qqnd.fyi**

The current stack exposes only the API on `127.0.0.1:3001`. The React Today Hub will later become the public frontend and proxy `/api` to this service. PostgreSQL is never published on a host port.

## 1. Clone and configure

```bash
git clone https://github.com/quendae/qnd-health.git
cd qnd-health
git checkout feat/today-hub-mvp
cp .env.example .env
```

Edit `.env` before the first start. At minimum replace `POSTGRES_PASSWORD` and `TOKEN_PEPPER` with long random values. Do not change `TOKEN_PEPPER` after issuing API tokens unless you intend to invalidate all of them.

## 2. Start database and API

```bash
docker compose up -d --build
```

The API container runs `prisma db push` against the private PostgreSQL service before starting Fastify.

Check it locally on the server:

```bash
curl http://127.0.0.1:3001/api/v1/health
```

Expected response:

```json
{"status":"ok"}
```

OpenAPI is available at `http://127.0.0.1:3001/api/openapi.json`.

## 3. Create a Hermes token

The command prints the raw token exactly once. Only its hash is stored in PostgreSQL.

```bash
docker compose exec api pnpm --filter @qnd-health/api token:create -- \
  --name hermes \
  --scopes today:read,plans:read,plans:write,activities:read,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,progress:read,coach:read,coach:write
```

Store the resulting `qndh_...` token in Hermes, not in this repository or in a browser bundle.

## 4. Reverse proxy

Until the web frontend lands, proxying the root domain to port 3001 will expose only API paths. The service is intentionally bound to loopback on the Docker host.

Example upstream:

```text
http://127.0.0.1:3001
```

When the React frontend is added, `fit.qqnd.fyi` will point to the frontend/gateway container instead; `/api/*` will continue to reach this API privately.

## Operations

```bash
# Logs
docker compose logs -f api

# Status
docker compose ps

# Pull code updates and rebuild
git pull
docker compose up -d --build

# Stop without deleting the database
docker compose down
```

The named volume `qnd-health-postgres` contains persistent health data. Do not use `docker compose down -v` unless you intentionally want to delete it.
