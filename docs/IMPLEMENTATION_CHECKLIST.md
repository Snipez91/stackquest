# StackQuest implementation checklist

Durable progress record so work can resume across sessions. Update as items land.

## Architecture (decided)

- Next.js 16 App Router (Node runtime, `output: standalone`), React 19, TypeScript, Tailwind 4.
- PostgreSQL via Drizzle ORM. `DATABASE_URL` → node-postgres. Unset → embedded
  PGlite (real Postgres compiled to WASM) at `.data/pglite` for local dev; tests use
  in-memory PGlite. Same SQL migrations everywhere (`drizzle/`).
- Auth: email + password (scrypt), DB-backed sessions (SHA-256 token hash),
  httpOnly SameSite=Lax cookie, Secure in production. Rate limits in Postgres.
- Teams: invite-only; admin/member roles; invites are random 256-bit tokens stored
  hashed, expiring, use-limited, revocable. All team data access goes through
  `src/server/authz.ts` (`requireMembership`) — team id never trusted from client.
- Realtime: Server-Sent Events (`/api/realtime`), authorised per connection and per
  event. Fan-out by in-process bus + Postgres `LISTEN/NOTIFY` when on node-postgres
  so multiple instances stay consistent.
- Learner code: Pyodide / JS in Web Workers inside `/sandbox.html`, served with CSP
  `sandbox allow-scripts` (opaque origin, no cookies, network limited to the Pyodide
  CDN), hard timeouts by `worker.terminate()`. Never executed on the server.
- Linux/networking: deterministic TypeScript simulator (`src/sim`); the server
  replays the learner's event log to grade (server-authoritative).
- Questions graded on the server; answers never sent to the browser before submit.
- Scoring: `xp_events` with unique idempotency keys; leaderboards are aggregations.

## Status

- [x] Scaffold, config, CSP (app + sandbox), standalone build
- [x] Content schema + validation suite (`tests/content`)
- [x] Python/JS runtimes (Node-verified) + sandbox frame + watchdog (browser-verified isolation)
- [x] Linux/network simulator (`src/sim`, 47 tests)
- [x] Python track (12) · JavaScript track (12)
- [ ] Linux track (12) · Networking track (12) · Capstones (4) — in progress
- [x] DB schema + migrations (`drizzle/0000_init.sql`)
- [x] Auth, sessions, rate limits
- [x] Teams, invites, roles, moderation
- [x] Attempts, grading, mastery, reviews, XP, achievements, races, goals
- [x] Realtime (SSE + LISTEN/NOTIFY) + chat
- [x] Screens: sign-in/up, invite, welcome, onboarding diagnostic, dashboard, paths, track map,
      workspace, debrief, review, team/leaderboards, chat, profile, settings, admin, scoring
- [x] Demo mode seed (fictional, labelled)
- [x] Tests: unit, server (in-memory Postgres), content, sim, Playwright two-session e2e
- [x] Docs: README, deployment, team guide, mastery model, security, limitations
- [ ] Final full-suite run and browser pass after all content lands

## Resume notes

- Dev: `npm run dev` (PGlite in `.data/pglite`; delete it to reset local data).
- Validate a track: `CONTENT_TRACK=<track> npx vitest run tests/content`.
- Remaining follow-ups worth doing: password reset (needs email), notification inbox UI,
  Postgres RLS as defence in depth, formal accessibility audit.
