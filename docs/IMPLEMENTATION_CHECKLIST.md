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

- [x] Scaffold, config, CSP
- [x] Content schema + validation suite
- [x] Python/JS runtimes (Node-verified)
- [ ] Linux/network simulator (agent)
- [ ] Python / JavaScript / Linux / Networking content (agents)
- [ ] Capstones
- [ ] DB schema + migrations
- [ ] Auth, sessions, rate limits
- [ ] Teams, invites, roles
- [ ] Attempts, grading, mastery, reviews, XP, achievements
- [ ] Realtime + chat
- [ ] Sandbox frame + client
- [ ] Screens (11)
- [ ] Demo mode seed
- [ ] Tests (server), e2e
- [ ] Docs: README, deployment, limitations
