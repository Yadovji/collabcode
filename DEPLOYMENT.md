# Deployment notes

## Docker stack

`docker-compose.production.yml` runs PostgreSQL, the API, and the static web app. Nginx proxies API requests and Socket.IO through the same origin, which keeps browser session cookies and live collaboration on one address. For a local check, copy `.env.production.example` to `.env.production`, replace `POSTGRES_PASSWORD`, and run:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

Open `http://localhost:8080`. The stack can also run on a cloud Linux server with a DNS domain pointed at it. Set `PUBLIC_DOMAIN` and `PUBLIC_ORIGIN=https://<your-domain>`, allow inbound TCP 80 and 443, and start with `--profile internet`; Caddy handles HTTPS certificates. The web container is bound only to loopback and the API/database are internal to the Docker network.

## Render environment variables

| Service | Key | Value |
| --- | --- | --- |
| API Web Service | `NODE_ENV` | `production` (enables Secure session cookies) |
| API Web Service | `TRUST_PROXY` | `1` (Render's trusted reverse-proxy hop; required for per-client IP rate limits) |
| API Web Service | `WEB_ORIGIN` | Exact public origin of the static site, such as `https://your-site.onrender.com` |
| API Web Service | `DATABASE_URL` | PostgreSQL connection string for a persistent hosted database |
| API Web Service | `PORT` | Leave unset; Render supplies it |
| Static Site | `VITE_API_URL` | API public URL, without a trailing slash |

The frontend value is read during `vite build`; trigger a new static-site deployment after changing it. The API CORS and Socket.IO configuration both use `WEB_ORIGIN`.

## Commands

API build:

```sh
npm install && npm run build --workspace @collab/shared && npm run build --workspace @collab/api
```

API start:

```sh
npm run db:migrate:deploy && npm run start --workspace @collab/api
```

Static frontend build:

```sh
npm install && npm run build --workspace @collab/shared && npm run build --workspace @collab/web
```

Static publish directory: `apps/web/dist`.

Add the SPA rewrite `/*` to `/index.html` with status `200` in the static-site configuration. This allows `/room/<id>` links to load directly.

## PostgreSQL setup

Set `DATABASE_URL` on the API service before starting it. Run the Prisma migration during deployment with `npm run db:migrate:deploy` after building the API and before starting the service. PostgreSQL is required for accounts, sessions, workspace membership, and workspace snapshots.

## Before production use

The API supports email/password accounts, PostgreSQL sessions, workspace ownership, server-checked membership, per-IP limits on registration/login/invites, and owner-only member removal that disconnects active room sockets. Set `NODE_ENV=production` so session cookies are marked Secure, and set `TRUST_PROXY=1` only while the service is behind the single trusted reverse proxy described above. These rate limits use in-process memory and reset on restart; keep one API instance until a shared rate-limit store and shared collaboration state are configured. Teammates must register before an owner can invite them. Email verification, password reset/recovery, and request/update quotas are not implemented. The current website preview runs in a browser sandbox and does not execute code on the API. Add an isolated server-side execution service before hosting untrusted projects. This remains a private demo, not a public production service.
