# QND Health

Private, self-hosted activity, nutrition and recovery planner with Garmin integration, Hermes API and an AI Coach layer.

The primary deployment target is **Synology DSM without Docker**: one Node.js process, one SQLite database file and one HTTP port. The built React frontend is served directly by Fastify.

## Runtime layout

```text
fit.qqnd.fyi
    |
DSM Reverse Proxy
    |
127.0.0.1:3001
    |
QND Health / Node.js
  |- React frontend
  |- Fastify API + Hermes API
  |- Garmin / DeepSeek integrations
  `- data/qnd-health.db (SQLite)
```

## Synology prerequisites

- Node.js 22 installed in DSM
- SSH access
- Git
- pnpm 10.17.1 (or Corepack)
- optional but recommended: PM2

Check the actual executable paths before creating a DSM boot task:

```bash
which node
which npm
which pnpm
which pm2
```

## First install on Synology

Example location:

```bash
mkdir -p /volume1/apps
cd /volume1/apps
git clone https://github.com/quendae/qnd-health.git
cd qnd-health
git checkout feat/today-hub-mvp
cp .env.synology.example .env
```

Edit `.env` and replace `TOKEN_PEPPER` with a long random secret. Keep this value stable after tokens have been issued.

Then run:

```bash
./scripts/synology-install.sh
```

The script creates `data/`, `logs/` and `backups/`, installs dependencies, builds both frontend and backend, and initializes `data/qnd-health.db`.

### Start

PM2 is recommended:

```bash
npm install -g pm2
./scripts/synology-start.sh
```

Without PM2 the same script falls back to a background Node process and PID file.

The application listens only on:

```text
http://127.0.0.1:3001
```

### DSM Reverse Proxy

In DSM configure a reverse proxy:

```text
Source:      https://fit.qqnd.fyi:443
Destination: http://127.0.0.1:3001
```

TLS can remain managed by DSM.

## Create API tokens

The raw token is displayed only once. Only its SHA-256-derived hash is stored in SQLite.

Browser token:

```bash
pnpm token:create -- --name web --scopes today:read,plans:read,plans:write,activities:read,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,progress:read
```

Hermes token:

```bash
pnpm token:create -- --name hermes --scopes today:read,plans:read,plans:write,activities:read,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,progress:read,coach:read,coach:write
```

Hermes can discover the API contract at:

```text
https://fit.qqnd.fyi/api/openapi.json
```

## DSM autostart

After starting with PM2, run:

```bash
pm2 save
```

Then create a DSM **Control Panel -> Task Scheduler -> Triggered Task -> Boot-up** task. Use the executable paths returned by `which` on your NAS. Example:

```bash
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
cd /volume1/apps/qnd-health
pm2 resurrect
```

If DSM's scheduled-task PATH does not include Node/PM2, use their absolute paths.

## Update

```bash
cd /volume1/apps/qnd-health
./scripts/synology-update.sh
```

This creates a backup, performs `git pull --ff-only`, installs dependencies, rebuilds, updates the SQLite schema and restarts the service.

## Backup

Manual backup:

```bash
./scripts/synology-backup.sh
```

Backups are written to `backups/` and files older than 30 days are removed. If the `sqlite3` CLI is available the online backup command is used. Otherwise QND Health is stopped briefly for a consistent file copy.

For automatic backups create a daily DSM scheduled task invoking this script. Back up both the repository `.env` file separately and the `backups/` directory with Hyper Backup if desired.

## Native development / smoke test

```bash
cp .env.example .env
pnpm install
pnpm --filter @qnd-health/api prisma:generate
pnpm build
pnpm smoke:native
```

The native smoke test creates a temporary SQLite database, starts the compiled Node server, verifies the health API, verifies the React page and checks OpenAPI.

## Optional Docker fallback

Docker is no longer required. A single-container `docker-compose.yml` remains available as a fallback and uses the same SQLite database under `./data/`.

## Security notes

- QND Health binds to loopback by default. Expose it through DSM Reverse Proxy rather than opening port 3001 to the internet.
- Keep `.env`, `TOKEN_PEPPER`, Garmin credentials and DeepSeek credentials private.
- Use separate browser and Hermes API tokens so either can be revoked independently.
- The public site and Hermes API share the same origin (`fit.qqnd.fyi`) but authorization scopes are enforced by the API.
