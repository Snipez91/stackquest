# Known limitations

These are deliberate trade-offs or not-yet-built features, stated plainly.

## Learning and content

- **Launch curriculum, not complete mastery.** 48 track missions and 4 capstones
  cover the fundamentals listed on each track page. Each page also lists "future
  coverage" (for example packaging and asyncio, containers, IPv6, frameworks).
- **Simulated Linux and networking.** The lab is a consistent model, not a real
  kernel. Unsupported commands and flags say so plainly; supported commands are
  listed by `help` in the terminal. Notable gaps: no job control, aliases, arrays,
  `tail -f`, editors (vi/nano: use the file editor tab), `iptables` (use `ufw`),
  IPv6, packet capture, or firewalls on forwarding hops. Live TLS handshakes are not
  simulated; TLS missions use realistic captured evidence instead.
- **Simulated DOM.** JavaScript DOM missions use a small DOM implementation
  (elements, attributes, classList, dataset, events with bubbling, simple
  selectors). There is no layout, CSS or browser APIs beyond `fetch` (mocked).
- **Python packages.** Only the Pyodide standard library is available; Python
  missions don't need third-party packages.
- **Explain questions** are graded by keyword-based concept coverage, which is a
  heuristic. The UI says so and always shows a model answer to compare with.
- **Mastery is an estimate** from a transparent points model (docs/MASTERY_MODEL.md),
  not a validated psychometric measure.

## Integrity

- Python/JavaScript check results are reported by the learner's browser and can be
  forged by a determined learner. Linux/networking checks are replayed on the
  server. Questions, reviews, XP and mastery are server-side. This is not a
  proctored assessment platform.

## Product

- **No email.** Invitations are links an admin copies and shares. There is no
  password-reset email: a learner who forgets their password needs a new account
  (an admin can remove the old membership). Changing a password while signed in
  works.
- **No notification inbox.** Mentions show as chat badges; achievements show on the
  debrief, the profile and the team feed. Notification rows are stored, ready for an
  inbox UI.
- **No message threading inside channels.** Each mission has its own discussion
  channel ("mission threads"), plus team and track channels. Message reactions,
  attachments and search are not implemented.
- **Presence** is approximate: "online" means a live connection or a heartbeat in
  the last 75 seconds.
- **Optional AI assistance** is not included. Nothing in StackQuest calls an AI
  service.
- **Accessibility:** built toward WCAG 2.2 AA (keyboard operation, visible focus,
  labelled controls, contrast-checked tokens, reduced motion, status text alongside
  colour, a plain-text alternative to the code editor, button-based ordering instead
  of drag-and-drop). It has **not** had a formal audit or full screen-reader testing.

## Security and operations

- Isolation between teams is enforced in the application's data-access layer and
  covered by tests. Postgres row-level security is not used, because the app
  connects as a single database role.
- Pyodide is loaded from jsDelivr. Self-host it if your policy forbids third-party
  CDNs (see docs/DEPLOYMENT.md).
- Realtime uses Server-Sent Events. It needs a host that allows long-lived HTTP
  connections, and Postgres `LISTEN/NOTIFY` (not a transaction-mode pooler) when
  you run several instances.
- Rate limits are per fixed window. Behind a proxy, client IPs come from
  `X-Forwarded-For`; make sure your proxy sets it.
