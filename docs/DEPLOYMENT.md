# Deploying StackQuest

StackQuest is one Node.js web service plus one PostgreSQL database. Learners only
need a browser and the HTTPS URL.

**Needs:** a host that runs long-lived Node processes (Server-Sent Events keep a
connection open per active learner), PostgreSQL 14+, and HTTPS. Serverless
platforms with short request limits are a poor fit for the realtime stream.

## Option A — Render (Blueprint, recommended)

`render.yaml` defines a Docker web service and a managed Postgres database.

1. Push this repository to GitHub or GitLab.
2. In Render: **New → Blueprint**, pick the repository, and apply. This creates
   `stackquest` (web) and `stackquest-db` (Postgres) and wires `DATABASE_URL`.
3. Invite links use Render's `RENDER_EXTERNAL_URL` automatically. If you add a
   custom domain, set `APP_URL` to it in the service's Environment tab.
4. Wait for the deploy. Migrations run automatically on first start.
   `GET /api/health` should return `{"ok":true,...}`.
5. Open the URL, create your account, create the team, and invite people
   (Team admin → Create invitation link).

HTTPS is automatic on `*.onrender.com` and on custom domains you add in Render.

**Costs (check current prices at render.com/pricing before you commit):** the
Blueprint uses the *Starter* web plan and the smallest paid Postgres plan. When this
was written that was roughly US$7/month for the web service plus a few dollars a
month for the database. Render's free tiers exist, but free web services sleep when
idle (which drops realtime connections) and free databases are time-limited, so
they're only suitable for a trial.

## Option B — any container host

```bash
docker build -t stackquest .
```

```bash
docker run -p 3000:3000 -e DATABASE_URL=postgres://... -e APP_URL=https://learn.example.com stackquest
```

Put it behind a TLS-terminating proxy or load balancer (Fly.io, Railway, AWS
ECS/App Runner, a VM with Caddy or nginx, and so on). For PostgreSQL you can use Neon,
Supabase (as plain Postgres), RDS, Cloud SQL, or self-hosted.

If you run more than one instance, keep sticky sessions **off**: realtime events go
through Postgres `LISTEN/NOTIFY`, so any instance can serve any client. Your Postgres
must allow `LISTEN` (session pooling). Transaction-mode poolers such as PgBouncer in
transaction mode break `LISTEN`, so give the app a direct connection string.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Without it, the app falls back to local PGlite, which isn't for production. |
| `APP_URL` | yes, except on Render | Used to build invitation links. On Render it defaults to `RENDER_EXTERNAL_URL`; set it for a custom domain. |
| `DATABASE_SSL` | no | Defaults to TLS for remote hosts. Set `false` only on a private network. |
| `DATABASE_SSL_STRICT` | no | `true` verifies the server certificate (recommended where supported). |
| `AUTO_MIGRATE` | no | Set `false` and run `npm run db:migrate` as a release step if you prefer. |
| `DEMO_MODE` | no | Keep `false` in production. |

## Operational notes

- **Backups:** use your Postgres provider's backups; all state is in Postgres.
- **Outbound network:** the server needs none. Browsers fetch Pyodide from
  `cdn.jsdelivr.net` for Python missions. To self-host Pyodide, change
  `PYODIDE_URL` in `scripts/build-sandbox.mjs` and the `connect-src` and `script-src`
  entries for the sandbox in `next.config.ts`.
- **Headers:** a strict CSP is set in `next.config.ts`. If a proxy strips the
  `Content-Security-Policy: sandbox` header from `/sandbox.html`, the frame detects
  it isn't isolated and refuses to run code (fail closed).
- **Updating content:** deploy new code. Bump a mission's `version` when grading
  changes; history keeps the version each attempt used.

## Deployment status

The deployment artefacts (`Dockerfile`, `render.yaml`, health check) are included and
were smoke-tested locally: the production standalone server started, ran migrations,
and served `/api/health` and the CSP headers. **No public deployment was made from
this workspace**: that needs your Render (or other host) account. Follow Option A to
get a live HTTPS URL.
