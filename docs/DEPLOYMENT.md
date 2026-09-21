# QND Health deployment

Target URL: `https://fit.qqnd.fyi`

## 1. Clone and configure

```bash
git clone https://github.com/quendae/qnd-health.git
cd qnd-health
git checkout feat/today-hub-mvp
cp .env.example .env
```

Edit `.env` and replace at minimum:

- `POSTGRES_PASSWORD` with a long random value,
- `TOKEN_PEPPER` with a different long random secret.

The defaults bind the web app to `127.0.0.1:8080` and the API to `127.0.0.1:3001`, so neither service is directly exposed to the internet unless your reverse proxy publishes it.

## 2. Start the stack

```bash
docker compose up -d --build
```

Check health:

```bash
docker compose ps
curl http://127.0.0.1:8080/
curl http://127.0.0.1:3001/api/v1/health
```

## 3. Create the browser token

The Today UI reads the API directly through the same-origin nginx proxy. Create a scoped web token:

```bash
docker compose exec api pnpm --filter @qnd-health/api token:create -- \
  --name web \
  --scopes today:read,plans:read,plans:write,activities:read,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,progress:read
```

Copy the `qndh_...` token shown once by the command. Open QND Health and paste it into the initial token screen. The current MVP stores it only in browser `sessionStorage`; use **Sign out** to remove it immediately.

Create a separate Hermes token instead of reusing the browser token:

```bash
docker compose exec api pnpm --filter @qnd-health/api token:create -- \
  --name hermes \
  --scopes today:read,plans:read,plans:write,activities:read,nutrition:read,nutrition:write,measurements:read,measurements:write,health:read,progress:read,coach:read,coach:write
```

## 4. Reverse proxy

Point `fit.qqnd.fyi` to `http://127.0.0.1:8080` and terminate TLS at your existing reverse proxy. The web nginx container proxies `/api/*` internally to the API container.

Example nginx location inside an existing TLS vhost:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 5. Update

```bash
git pull
docker compose up -d --build
```

PostgreSQL data lives in the named `qnd-health-postgres` volume and survives container rebuilds.
