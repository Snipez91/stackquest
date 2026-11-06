# Security model

## Learner code never runs on the server

| Track | Where it runs | Isolation |
| --- | --- | --- |
| Python | Pyodide (CPython in WebAssembly) in a Web Worker | See *sandbox frame* |
| JavaScript | Web Worker, with `fetch`/`postMessage`/`self` shadowed and a simulated DOM | See *sandbox frame* |
| Linux / networking | Pure TypeScript simulator, in the browser and replayed on the server | Executes no host commands; only interprets a fictional state model |

**Sandbox frame (`/sandbox.html`).** It is served with
`Content-Security-Policy: sandbox allow-scripts; default-src 'none'; connect-src https://cdn.jsdelivr.net; …`,
so:

- it runs in an **opaque origin**: no cookies, `localStorage` or IndexedDB, and no
  same-origin access to the app;
- it can only fetch the Pyodide CDN; requests to the app's API and anywhere else fail
  (verified in a real browser);
- it accepts work only from its parent window, and the app accepts results only from
  that frame;
- if the CSP header is ever stripped, the frame detects that its origin isn't opaque
  and refuses to run code.

**Limits.** Each run has a hard time limit (default 5 s) enforced by terminating the
Worker. That's the only reliable way to stop infinite loops and is covered by tests.
Output is capped at 20,000 characters. **Reset** discards the Python interpreter and
workspace state. The shell simulator caps scripts at 10,000 statements and output at
20,000 characters.

## Authentication and sessions

- scrypt (N=2¹⁵, r=8, p=1) password hashing; minimum 10 characters.
- 256-bit random session tokens; only their SHA-256 is stored. 30-day sliding expiry.
  Changing your password revokes all sessions.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure`, `__Host-` prefix in production.
- Rate limits (Postgres-backed, so they hold across instances): sign-in per IP and per
  email, sign-up per IP, invite creation, invite acceptance, chat bursts and hourly
  volume, submissions, answers and reviews.
- CSRF: server actions use Next.js's built-in origin check. JSON APIs reject writes
  whose `Origin`/`Referer` doesn't match the host.

## Authorisation and team isolation

- All team data access goes through `requireMembership` / `requireAdmin`, keyed by
  the **session** user. A team id from the client is only ever a request.
- Attempts, drafts, answers and review state are readable only by their owner.
  Teammates see aggregates and public activity only.
- Realtime: the SSE stream is bound to the caller's active team after a membership
  check. It is re-verified on every heartbeat and on membership changes, so a
  removed member's stream closes. Each event carries its team id and is delivered
  only to that team's subscribers.
- Tests: `tests/server/teams.test.ts`, `chat.test.ts` (including realtime isolation)
  and `learning.test.ts` (attempt privacy, leaderboard isolation).

Postgres row-level security policies are **not** used. The app connects as a single
database role and enforces isolation in its data-access layer. See
KNOWN_LIMITATIONS.md.

## Invitations

256-bit random tokens, stored as SHA-256 only. They expire (1 hour to 30 days), have
a use limit, can be revoked, and are consumed atomically (a conditional `UPDATE`).
Concurrent acceptance can't exceed the limit, and this is tested.

## Content rendering

- Chat is parsed into React text nodes and a few known elements (code, bold,
  spoilers, mentions, `rel="noopener"` links). User text is never inserted as HTML.
- Curriculum Markdown is trusted repository content. Raw HTML in it is escaped, and
  only `http(s)`, relative or anchor links are kept.

## Grading integrity

Server-authoritative: questions, reviews, transfer challenges, Linux/networking
practical checks (replayed from the event log), and all XP and mastery
calculations, which are idempotent.

Client-reported: Python/JavaScript test results. The server validates their shape
and test ids but can't prove the code ran honestly. This is documented in-app.
