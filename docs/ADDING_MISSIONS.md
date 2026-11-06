# Adding missions

Missions are data. A mission is a TypeScript object that satisfies `MissionSchema`
in `src/content/schema.ts`. Add it to the track's array in
`src/content/missions/<track>/index.ts` (one file per mission is the convention:
`src/content/missions/<track>/<slug>.ts` exporting a `MissionInput`), then run:

```bash
CONTENT_TRACK=python npx vitest run tests/content
```

No component changes are needed — the map, workspace, results, review queue and
leaderboards all read the registry in `src/content/index.ts`.

## Setting

Every mission takes place at **Lumen Logistics**, a fictional freight-tracking
company. Recurring characters (use them in briefs):

| Name | Role |
| --- | --- |
| Priya Raman | SRE lead — incidents, Linux, on-call |
| Marco Bellini | Backend engineer — Python services, data pipelines |
| Aiko Tanaka | Frontend engineer — dispatch dashboard (JavaScript) |
| Dev Okafor | Network engineer — offices, lab networks, DNS |
| Sam Ortiz | Engineering manager — asks for explanations and write-ups |

Hosts are fictional and private: `web-01`, `api-01`, `db-01`, `dns-01`,
`gw-01`, `ops-ws` on `10.20.0.0/16` and `192.168.50.0/24` lab segments, domains
under `lumen.internal` / `lumen.test`. Never reference real public systems.

## Quality bar (every mission)

- **Brief**: a realistic workplace message (from, channel, body) with a concrete
  symptom and stakes. 60–150 words.
- **Objectives**: 2–5 specific, observable learning objectives.
- **Concept**: a short explanation of the *underlying model* (why it works),
  100–250 words, Markdown with fenced code where helpful.
- **Worked example**: required for beginner missions and whenever a mission
  introduces a new concept. Shows a *different* but analogous problem being
  solved step by step — never the mission's own answer.
- **Workspace**: real files/code/logs. Practical work first; questions second.
- **Success criteria**: plain-language statements matching the checks.
- **Checks**: test behaviour, not text, so legitimate alternative solutions
  pass. Each check has feedback `{what, why, next}`: what failed (observable),
  why it matters, what to try next. Never "Wrong!".
- **Hints**: 3–5, progressively more specific. Hint 1 = where to look / which
  concept. Hint 2 = narrower. Last hint = nearly the answer (but still requires
  doing the work).
- **Questions** (1–4): at least one prediction / interpretation / explanation
  question. `explain` questions are graded by concept keywords — give several
  synonyms in `anyOf`, and make sure `modelAnswer` satisfies its own rubric.
- **Debrief**: a clear solution walkthrough, ≥2 common mistakes, and a
  "real world" note on how this transfers to real systems.
- **Review items** (≥2): each targets one skill and has ≥2 *equivalent
  variants* (different numbers, names, or framings that need the same
  reasoning) so spaced repetition tests recall, not memorised answers.
- **Transfer**: a new context that applies the same skill, asked later.
- **Refresher**: a 60–150 word re-explanation plus one simpler practice
  question, offered when the learner struggles.

## Code workspaces

Python (`kind: "python"`): tests are Python snippets run after the learner's
entry module is imported as `main` (e.g. `assert main.parse("a") == 1, "parse('a') should be 1"`).
`capture_output(fn, *args)` returns `(result, printed_text)`. Give assertion
messages that describe expected vs actual. `input()` is disabled.

JavaScript (`kind: "javascript"`): list the top-level names to expose in
`exports`. Tests are async function bodies with `module`, `assert`,
`assertEqual`, `assertDeepEqual`, `captureLogs(fn)`, `dom` (`dom.click(sel)`,
`dom.type(sel, v)`, `dom.text(sel)`, `dom.$(sel)`), `document`, `mockFetch(routes)`
and `flush()` in scope. `mockFetch({"GET /api/x": {status: 500, json: {...}}})`
replaces `fetch` for the learner code; an array value returns successive
responses; `{networkError: true}` rejects like a real network failure. Each
test gets a fresh copy of the module and DOM.

Both: `solution` must pass every test; every `wrongSolutions` entry must fail at
least one; the starter must fail at least one. The validation suite enforces this.

## Shell workspaces (Linux and networking)

`kind: "shell"` with a `scenario` (see `src/sim/schema.ts`) and declarative
`checks` (assertions about final state, e.g. `access` — can user X read path
Y — rather than "did they type chmod 644"). `solution` is the list of commands
(and `{write, content}` editor saves) that fixes it. The server replays the
learner's event log through the same simulator to grade.

Tell learners what is simulated via `simulationNote`.

## Versioning

Bump `version` whenever a change could alter grading. Attempts store the
version they were graded against, so history stays meaningful.
