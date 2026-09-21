# QND Health

Private, self-hosted activity, nutrition and recovery planner with Garmin integration, Hermes API and an AI Coach layer.

The current production target is a **Debian 13 LXC** running one Node.js process and one SQLite database. Synology DSM remains the reverse proxy in front of the application.

## Runtime layout

```text
fit.qqnd.fyi
    |
Synology / reverse proxy
    |
Debian LXC :3001
    |
QND Health / Node.js
  |- React frontend
  |- Fastify API + Hermes API
  |- Garmin / DeepSeek integrations
  `- data/qnd-health.db (SQLite)
```

## Debian LXC prerequisites

- Debian 13
- Node.js 22
- Git
- pnpm 10.17.1 (or Corepack)
- systemd
- optional: curl for the post-update health check

Production checkout used by the current deployment:

```bash
/opt/qnd-health
```

The service name defaults to:

```text
qnd-health
```

The app must use `HOST=0.0.0.0` inside the LXC when the reverse proxy connects to the LXC address.

## First install

```bash
cd /opt
git clone https://github.com/quendae/qnd-health.git
cd qnd-health
git checkout feat/today-hub-mvp
cp .env.example .env
pnpm install
pnpm --filter @qnd-health/api prisma:generate
pnpm --filter @qnd-health/api prisma:push
pnpm build
```

Keep `TOKEN_PEPPER` stable after tokens have been issued.

## One-command update

### Directly on the Debian LXC

```bash
cd /opt/qnd-health
bash update.sh
```

`update.sh` performs the complete production update sequence:

1. verifies that tracked files have no local edits,
2. `git pull --ff-only`,
3. installs dependencies,
4. generates Prisma Client,
5. builds the frontend and backend before downtime,
6. backs up `data/qnd-health.db` into `backups/`,
7. stops `qnd-health`,
8. runs `prisma:push`,
9. restarts the systemd service,
10. checks `http://127.0.0.1:3001/api/v1/health` when `curl` is available.

Environment overrides are available when necessary:

```text
QND_HEALTH_SERVICE
QND_HEALTH_DB_FILE
QND_HEALTH_BACKUP_DIR
QND_HEALTH_HEALTH_URL
```

### From a Windows PC

The repository also contains `update.bat`. It connects to the LXC over Windows OpenSSH, pulls the newest repository version and runs the Linux updater remotely.

One-time setup example:

```bat
setx QND_HEALTH_HOST root@192.168.1.50
```

Open a new terminal after `setx`, then future updates are simply:

```bat
update.bat
```

You can also pass the target explicitly:

```bat
update.bat root@192.168.1.50
update.bat root@192.168.1.50 /opt/qnd-health
```

SSH key authentication is recommended so `update.bat` can run without asking for the remote password each time.

## Create API tokens

The raw token is displayed only once. Only its SHA-256-derived hash is stored in SQLite.

Browser token:

```bash
pnpm token:create -- --name web --scopes today:read,plans:read,plans:write,activities:read,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,progress:read
```

Hermes / Home Assistant bridge token:

```bash
pnpm token:create -- --name hermes-ha --scopes today:read,plans:read,plans:write,activities:read,activities:write,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,health:write,progress:read,coach:read,coach:write
```

Hermes can discover the API contract at:

```text
https://fit.qqnd.fyi/api/openapi.json
```

## systemd

The production service is expected to run from `/opt/qnd-health` and load the repository `.env` file. A typical unit uses:

```text
WorkingDirectory=/opt/qnd-health
EnvironmentFile=/opt/qnd-health/.env
ExecStart=/usr/bin/pnpm start
```

After changing a unit file:

```bash
systemctl daemon-reload
systemctl enable --now qnd-health
```

## Reverse proxy

Expose HTTPS at `fit.qqnd.fyi` through Synology/Caddy/reverse proxy and forward internally to the Debian LXC on port 3001. Port 3001 does not need to be exposed publicly.

## Backup

`update.sh` automatically takes a database snapshot before `prisma:push`. For independent scheduled backups, copy `data/qnd-health.db` and keep `.env` / `TOKEN_PEPPER` protected separately.

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

Docker is not required. A single-container `docker-compose.yml` remains available as a fallback and uses the same SQLite database under `./data/`.

## Legacy Synology runtime

Scripts under `scripts/synology-*.sh` remain for the earlier DSM-native deployment. Prisma CLI was unreliable on the target DSM runtime, so Debian LXC is the supported production path going forward.

## Security notes

- Keep `.env`, `TOKEN_PEPPER`, Garmin credentials and DeepSeek credentials private.
- Use separate browser and Hermes API tokens so either can be revoked independently.
- The public site and Hermes API share the same origin (`fit.qqnd.fyi`) but authorization scopes are enforced by the API.
- Prefer SSH keys for `update.bat`; do not hard-code an SSH password in the batch file.
