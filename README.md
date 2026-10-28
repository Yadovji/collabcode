# CollabCode — Phase 4

CollabCode is a browser-based shared coding workspace. Phase 4 includes account registration and login, PostgreSQL-backed sessions, workspace ownership and membership, real-time editing with Monaco and Yjs/Socket.IO, plus a sandboxed preview for simple multi-file websites.

## Run locally

### Requirements

- Node.js 22 LTS (Node.js 20.19 or newer is supported)
- npm, included with Node.js
- A modern browser
- VS Code is recommended for editing the project
- Docker Desktop is needed to start the included PostgreSQL service for accounts and workspace storage

### Start the app

In Windows PowerShell, run these commands from this folder:

```powershell
npm.cmd install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run dev
```

Using `npm.cmd` avoids PowerShell's script-execution restriction on `npm.ps1`. In Command Prompt, Git Bash, or Linux/macOS terminals, use `npm install` and `npm run dev`.

PostgreSQL is required for account sessions, workspace ownership, invitations, and saved files. The commands above start PostgreSQL and apply the database migrations. The API health check should report `persistence: "postgresql"`. Stop the local database with `npm.cmd run db:down`; its Docker volume keeps the saved data.

- Web app: <http://localhost:5174>
- API health check: <http://localhost:4000/health>

Create an account or sign in first. New workspaces belong to their creator. To let a teammate in, the owner uses **Invite by email** in the room; the teammate must have an account before they can be added. Sharing the room URL alone does not grant access. Existing Phase 2 workspaces without an owner are claimed by the first signed-in user who opens them. You can change your display name from the bottom of the file sidebar.

For live collaboration, sign in as the owner in one browser profile and as an invited member in a separate browser profile. The same browser's regular and private windows have separate sessions.

## Run a multi-file website

In a room, choose **Run preview**. The app uses `index.html` (or `src/index.html`) as the entry file, then resolves its linked workspace CSS, classic JavaScript, and text assets such as SVG files. If the room does not have an HTML entry file yet, choose **Create a sample website** to add `index.html`, `styles.css`, and `script.js` together. Those files are shared and edited just like the existing TypeScript files; each collaborator can run the current shared version in their own preview.

The preview runs inside a browser iframe with scripts enabled but same-origin access disabled. The API server never executes the preview code. This first version is for plain HTML, CSS, and JavaScript; it does not install packages or build React/Vite, resolve JavaScript module imports, run TypeScript, or execute Python/Java. Those need a separate build pipeline or restricted execution service.

### Verify account access

1. Create an account for Alice and create a workspace.
2. In a private browser window, create an account for Bob. As Alice, invite Bob by his account email, then copy the room link.
3. Sign in as Bob and open the link; he should join and see the shared files.
4. Sign in as an unrelated account and open the same link; access should be rejected with an authorization message.
5. Restart the API and reload as Alice or Bob to confirm the authenticated workspace data still loads.

To create a production frontend bundle and compile the API, run `npm run build`.

## Local database containers

The API stores accounts, sessions, workspace membership, and each workspace's Yjs document snapshot in PostgreSQL through Prisma. Snapshot writes are debounced while people edit and flushed during a normal server shutdown. PostgreSQL is local-only in Docker Compose; for deployment, configure `DATABASE_URL` with a hosted PostgreSQL connection string and run `npm run db:migrate:deploy` before starting the API.

To start only the PostgreSQL container:

```powershell
docker compose up -d postgres
```

Redis is optional and is not used yet. To start it for later development, use `docker compose --profile optional up -d redis`.

## Run the complete app with Docker

The Docker stack runs PostgreSQL, the API, and the web app together. The web container proxies API and Socket.IO traffic through the same address, so login cookies and live editing work without separate browser origins.

For a local production-style check in Windows PowerShell:

```powershell
Copy-Item .env.production.example .env.production
notepad .env.production
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

In `.env.production`, replace `POSTGRES_PASSWORD` with a long password made of letters and numbers. Open <http://localhost:8080>; the health check is at <http://localhost:8080/health>. View service logs with:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api web
```

Stop the stack with `docker compose --env-file .env.production -f docker-compose.production.yml down`. The database volume is kept, so your accounts and workspaces remain. Do not add `-v` to `down` unless you intend to delete that database.

For an internet demo, run the same stack on a cloud Linux server with a domain name. Point the domain's DNS to that server, set `PUBLIC_DOMAIN` to the domain and `PUBLIC_ORIGIN` to `https://<your-domain>` in `.env.production`, allow inbound ports 80 and 443, then start with the `internet` profile:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml --profile internet up --build -d
```

Caddy obtains and renews the HTTPS certificate. Share `https://<your-domain>` with your teammate. The API and PostgreSQL ports are not published publicly; the web port is bound to the server's loopback address. Keep `.env.production` private. A domain and cloud server are still required; running Docker on your laptop alone does not make the app available from another city. Registration, login, and member changes have per-IP request limits, and owners can remove a member to revoke their active room connection. This is suitable for a private class demo with invited accounts, not a public production launch; email verification, recovery, a shared rate-limit store, request/update quotas, and isolated server-side execution are not implemented.

## Deploy to Render

Deployment is prepared for a GitHub repository, a hosted PostgreSQL database, and two Render services. You do not need Docker to deploy this phase.

1. Create a **private GitHub repository**, then from this project folder run `git init`, `git add .`, `git commit -m "Prepare CollabCode private demo"`, add your repository as `origin`, and push the `main` branch. Do not commit a real `.env` file.
2. In Render, create a **Web Service** from the repository:
   - Root directory: repository root
   - Build command: `npm install && npm run build --workspace @collab/shared && npm run build --workspace @collab/api`
   - Start command: `npm run db:migrate:deploy && npm run start --workspace @collab/api`
   - Add `NODE_ENV=production`, `TRUST_PROXY=1`, `WEB_ORIGIN` with the frontend's public URL after creating the static site, and `DATABASE_URL` with your hosted PostgreSQL connection string.
   - Render provides the `PORT` value automatically.
3. Create a **Static Site** from the same repository:
   - Root directory: repository root
   - Build command: `npm install && npm run build --workspace @collab/shared && npm run build --workspace @collab/web`
   - Publish directory: `apps/web/dist`
   - Build environment variable: `VITE_API_URL` set to the API service URL, without a trailing slash.
   - Add a rewrite rule `/*` → `/index.html` with status `200` so room links open directly.
4. Copy the static site's public URL into the API service's `WEB_ORIGIN` environment variable, then redeploy the API.
5. Open the static site, create a room, and test the same link in a second browser. Check the API's `/health` route and Render logs if the socket does not connect.

The frontend embeds `VITE_API_URL` at build time, so changing it requires a new static-site build. Keep `WEB_ORIGIN` equal to the exact deployed frontend origin.

## Current scope and limitations

- Accounts use email and password, with passwords stored as scrypt hashes and sessions in PostgreSQL. Workspace owners can add existing accounts as members; server-side room joins require ownership or membership.
- Invitations currently require the teammate to register first. Owners can remove invited members, which closes their active socket connection. Email verification, password reset, and account recovery are not implemented.
- Registration, login, invitations, and member removal are limited per client IP using in-memory counters. Keep one API instance; limits reset on restart and are not shared across instances.
- PostgreSQL persists workspace documents and membership, while active collaboration and presence are managed by one API process. Multiple API instances do not share room state yet.
- Redis is present in Compose as an optional service, but is not wired into the application yet.
- There is no AI provider integration, terminal, npm build pipeline, or general-purpose language runner. Website preview currently supports plain HTML, CSS, and classic JavaScript in an isolated browser frame.
- Do not use this prototype for confidential code or as a public production service. Add email verification, account recovery, a shared rate-limit store, request/update quotas, and an isolated execution service before opening it to untrusted users.

## Next phases

1. Workspace version history and multi-instance collaboration support.
2. AI change proposals with review/apply controls.
3. Isolated execution workers and restricted previews.
