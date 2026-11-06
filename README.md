# StackQuest

Team learning for **Python, Linux, JavaScript and networking** through realistic
missions at a fictional company (Lumen Logistics). Learners investigate incidents,
fix services, write automation and explain root causes. They compete on
leaderboards that reward demonstrated learning, see teammates' progress, and talk in
built-in chat.

The core loop: **learn → practise → solve a mission → get specific feedback →
review it later (spaced) → apply it in a new context (transfer)**.

- 4 tracks × 12 missions (beginner / intermediate / advanced) + 4 cross-track capstones
- Python runs in the browser (Pyodide/WebAssembly); JavaScript in a Web Worker;
  Linux and networking in a deterministic simulated lab that the **server replays to
  grade**
- Spaced review (1, 3, 7, 14, 30, 60 days) with equivalent variants, interleaving,
  transfer challenges and a transparent mastery estimate
- Invite-only teams, admin/member roles, expiring single-use invite links
- Real-time chat (team, track and mission channels), mentions, unread, presence,
  spoilers, moderation
- No paid AI or third-party API is needed for anything

> **Scope, honestly:** this is a launch curriculum — a solid foundation, not
> complete professional mastery. Each track page lists what is covered and what is
> future work. Mastery numbers are learning *estimates*, not certifications.

## Self-hosting

To run it on your own server with Docker, see [SELF_HOSTING.md](SELF_HOSTING.md)
(`./start.sh`: app + Postgres + nightly backups, optional Cloudflare Tunnel).

## Quick start (local, no Docker)

Requirements: Node.js 20.9+ (tested on Node 24/26), npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, the app uses **PGlite** — real
PostgreSQL compiled to WebAssembly — stored in `.data/pglite`. Migrations run
automatically on first request.

To explore with a fictional team, set `DEMO_MODE=true` in `.env.local` and click
**Explore the demo team** on the sign-in page. Demo data is labelled "Demo data —
fictional" everywhere it appears. Never enable demo mode on a deployment your team
uses for real.

Python missions download Pyodide (~10 MB, cached) from `cdn.jsdelivr.net` the first
time a learner runs Python.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (also rebuilds `public/sandbox.html`) |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | All unit, server and content tests (Vitest) |
| `npm run test:content` | Curriculum validation only |
| `CONTENT_TRACK=linux npm run test:content` | Validate one track |
| `npm run test:e2e` | Playwright two-session browser test (needs `npx playwright install chromium`) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (the app also does this on start unless `AUTO_MIGRATE=false`) |

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | production | Postgres connection string. Unset = local PGlite. |
| `APP_URL` | production | Public base URL for invitation links, e.g. `https://stackquest.example.com` |
| `DATABASE_SSL`, `DATABASE_SSL_STRICT` | no | TLS to Postgres (on by default for remote hosts) |
| `DATABASE_POOL_MAX` | no | Pool size (default 10) |
| `AUTO_MIGRATE` | no | `false` to run migrations as a separate release step |
| `DEMO_MODE` | no | `true` seeds a fictional demo team |
| `PGLITE_DIR` | no | Local PGlite location (`memory` for ephemeral) |
| `TEAM_CREATION` | no | `first-only`: after the first team, accounts join by invite only. Default `open`. |

## Architecture

```
src/
  app/                Next.js App Router pages, server actions, JSON + SSE routes
  components/         UI (workspace, chat, review, shell, team)
  content/            Curriculum data + zod schema (missions, skills, tracks, diagnostic)
  lib/                Pure logic: grading, scoring/mastery/review rules, time zones
  sandbox/            Browser code execution: runtimes, frame, worker watchdog
  server/             Data access + domain services (auth, teams, learning, chat, realtime)
  sim/                Deterministic Linux + networking simulator (runs in browser and server)
drizzle/              SQL migrations
tests/                unit, server (in-memory Postgres), content, sim, e2e
docs/                 Guides and the implementation checklist
```

- **Stack:** Next.js 16 (App Router, Node runtime), React 19, TypeScript, Tailwind 4,
  Drizzle ORM, PostgreSQL (node-postgres in production, PGlite locally/tests).
- **Auth:** email + password (scrypt), database sessions (only a SHA-256 of the token
  is stored), `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` cookie in production.
  Rate limits for sign-in, sign-up, invites, chat and submissions are stored in Postgres.
- **Authorisation:** every team-scoped read and write goes through
  `requireMembership` / `requireAdmin` in `src/server/teams.ts`, using the session
  user. Attempts are private to their owner. Tests cover cross-team access.
- **Realtime:** Server-Sent Events (`/api/realtime`). Membership is checked on
  connect, on every 25 s heartbeat and on membership changes. With `DATABASE_URL`,
  events fan out across instances via Postgres `LISTEN/NOTIFY`.
- **Grading:** questions are graded on the server (answers never reach the browser
  before an attempt). Shell missions: the browser sends the learner's event log and
  the server replays it in a fresh simulator. Code missions run in the browser
  sandbox and report results (see *Integrity limits*).
- **Scoring:** append-only `xp_events` with unique idempotency keys; leaderboards are
  aggregations. Mission XP is awarded once; replays are practice.
- **Content versioning:** each mission has a `version`; attempts store it, and
  `mission_versions` records a hash of every version served.

More: [docs/SECURITY.md](docs/SECURITY.md), [docs/MASTERY_MODEL.md](docs/MASTERY_MODEL.md),
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/TEAM_GUIDE.md](docs/TEAM_GUIDE.md),
[docs/ADDING_MISSIONS.md](docs/ADDING_MISSIONS.md),
[docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md),
[docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md).

## Integrity limits

Python and JavaScript checks run in the learner's browser, so a determined learner
can fake those results. Linux/networking work and all questions are graded on the
server. StackQuest is built for honest team learning, not proctored exams; the
in-app "How scoring works" page says the same.

## Verification status

Last full run (2026-11-06):

- `npm test`: **502 tests passed** (12 files). Covers curriculum integrity for all 52
  missions (reference solutions pass, starters and wrong solutions fail), the
  simulator, auth, invitations, roles and team isolation, mission completion and
  idempotency, score-farming prevention, hint and mastery effects, review scheduling,
  leaderboards (ties, time zones, per-track), chat persistence, authorisation, dedupe
  and reconnect gaps, realtime isolation, execution timeouts and workspace reset.
- `npm run typecheck`: 0 errors. `npm run lint`: clean. `npm run build`: succeeds.
- `npm run test:e2e`: two separate browser sessions. Invite and join, a used-up invite
  is rejected, live chat in both directions, an offline send then retry arrives
  exactly once, both members show on the leaderboard.
- Manual browser checks: sandbox isolation (opaque origin; app API, network and
  storage blocked; a 1 s timeout stops an infinite loop), a Python mission end to end,
  Linux and networking labs graded by server replay, mobile review, light mode.

- Docker Compose self-hosting (from a clean `git archive` extract): `./start.sh` builds and
  starts app + Postgres 17 + backups; `/api/health` is healthy on real Postgres; the
  two-session e2e passes against the container; backup and `./restore.sh` round-trip;
  `TEAM_CREATION=first-only` refuses a second team.

Not verified: a formal accessibility audit, screen-reader testing, load testing, and
a real hosted deployment.
