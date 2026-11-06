import type { MissionInput } from "@/content/schema";

const F = "```";

const starter = `// Lumen Logistics — depot status board and end-of-shift report.
//
// getStatus(depotId) returns a promise for { depot, trucksOut, delayed }, or rejects
// with an Error (e.g. "MAN depot API timeout") when that depot's API is down.
// Each call takes about 2 s over the depot VPN, so depots must be queried at the same
// time, not one after another.

// Live board: one row per depot, in the same order as depotIds.
//   success: { id, ok: true, status }
//   failure: { id, ok: false, error: "<the error's message>" }
// It must never reject just because some depots are down.
async function loadDepotBoard(depotIds, getStatus) {
  const statuses = await Promise.all(depotIds.map((id) => getStatus(id)));
  return statuses.map((status, i) => ({ id: depotIds[i], ok: true, status }));
}

// End-of-shift report: all-or-nothing. Resolve with the array of statuses in depot
// order if every depot answered; otherwise reject, so a report with gaps is never filed.
async function loadShiftReport(depotIds, getStatus) {
  const results = [];
  for (const id of depotIds) {
    try {
      results.push(await getStatus(id));
    } catch (err) {
      results.push(null);
    }
  }
  return results;
}
`;

const solution = `// Lumen Logistics — depot status board and end-of-shift report.

// Live board: wait for every depot, keep each outcome, never reject.
async function loadDepotBoard(depotIds, getStatus) {
  const outcomes = await Promise.allSettled(depotIds.map((id) => getStatus(id)));
  return outcomes.map((outcome, i) =>
    outcome.status === "fulfilled"
      ? { id: depotIds[i], ok: true, status: outcome.value }
      : { id: depotIds[i], ok: false, error: outcome.reason?.message ?? String(outcome.reason) },
  );
}

// End-of-shift report: all-or-nothing, so Promise.all's fail-fast behaviour is exactly right.
function loadShiftReport(depotIds, getStatus) {
  return Promise.all(depotIds.map((id) => getStatus(id)));
}
`;

const fakes = `const data = {
  LDS: { depot: "LDS", trucksOut: 12, delayed: 1 },
  MAN: { depot: "MAN", trucksOut: 9, delayed: 0 },
  BHM: { depot: "BHM", trucksOut: 7, delayed: 3 },
};
const allUp = (id) => Promise.resolve(data[id]);
const manDown = (id) => (id === "MAN" ? Promise.reject(new Error("MAN depot API timeout")) : Promise.resolve(data[id]));`;

const deferred = `const calls = [];
const pending = {};
const slow = (id) => new Promise((resolve) => { calls.push(id); pending[id] = resolve; });`;

export const jsDepotStatusAllsettled: MissionInput = {
  slug: "js-depot-status-allsettled",
  version: 1,
  track: "javascript",
  tier: "intermediate",
  order: 4,
  title: "Keep the depot board alive when one depot is down",
  summary:
    "One depot's API timeout blanks the whole status board, while the shift report files with gaps. Choose Promise.allSettled or Promise.all for each, and query depots concurrently.",
  minutes: 30,
  assessmentTypes: ["repair-code", "write-code", "explain-root-cause"],
  skills: ["js.promises"],
  appliesSkills: ["js.async", "js.arrays"],
  prerequisites: ["js-event-loop-order"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `INC-2291: the Manchester depot API timed out for 40 minutes this morning, and the **entire depot status board went blank** — dispatchers lost visibility of Leeds and Birmingham as well, although both were fine.

Meanwhile the end-of-shift report that Sam sends to operations was **filed with an empty row for MAN**, and nobody noticed until the client asked. That report must never go out incomplete; it should fail loudly so someone reruns it.

Both functions are in \`depot-board.js\`. The board should show every depot that answered and mark the ones that did not. And please keep the requests concurrent — each depot takes about 2 seconds over the VPN, and there are nine depots.`,
  },
  objectives: [
    "Start independent async operations together and await them as a group",
    "Explain Promise.all's fail-fast behaviour and when it is the right choice",
    "Use Promise.allSettled to keep partial results and map each outcome",
    "Preserve input order in combined results regardless of completion order",
  ],
  concept: {
    title: "Promise combinators: start everything, then decide how to wait",
    body: `Calling an async function **starts** the work and returns a promise immediately. \`ids.map((id) => getStatus(id))\` therefore starts every request at once; awaiting each inside a \`for\` loop starts the next only after the previous finishes (9 × 2 s instead of ~2 s).

Two ways to wait for an array of promises:

${F}js
await Promise.all(promises);
// → [v1, v2, v3] if all fulfil
// → rejects with the FIRST rejection as soon as it happens (fail fast)

await Promise.allSettled(promises);
// → never rejects; waits for all and describes each outcome:
// [{ status: "fulfilled", value: v1 },
//  { status: "rejected",  reason: Error("MAN depot API timeout") }, …]
${F}

Both keep results **in input order**, not completion order, so index \`i\` always lines up with \`ids[i]\`.

Choose by asking what a single failure should mean:

- **All-or-nothing** (a report, a transaction, data that is useless if incomplete): \`Promise.all\`. Its rejection is the signal to retry or alert.
- **Best effort** (dashboards, widgets, notifications): \`Promise.allSettled\`, then map fulfilled and rejected outcomes into something the UI can show.

Note: \`Promise.all\` does not *cancel* the other requests on failure; they keep running, their results are just ignored.`,
  },
  workedExample: {
    title: "Worked example: loading driver avatars",
    body: `The roster page shows avatars for each driver. One missing image must not hide the roster, so this is best-effort.

**Step 1 — start all requests together.**

${F}js
const requests = drivers.map((d) => loadAvatar(d.id));   // all in flight now
${F}

**Step 2 — wait for every outcome.**

${F}js
const outcomes = await Promise.allSettled(requests);
${F}

**Step 3 — map outcomes back to inputs by index.**

${F}js
return outcomes.map((o, i) => ({
  driver: drivers[i].id,
  src: o.status === "fulfilled" ? o.value : "/img/placeholder.svg",
}));
${F}

Contrast with **payroll export**: every driver's hours must be present or the export is wrong, so \`return Promise.all(drivers.map((d) => loadHours(d.id)))\` — and let the rejection propagate to the caller, which shows "Export failed, retry".

Same data, different requirement, different combinator.`,
  },
  workspace: {
    kind: "javascript",
    entry: "depot-board.js",
    exports: ["loadDepotBoard", "loadShiftReport"],
    files: [{ path: "depot-board.js", content: starter, editable: true }],
    tests: [
      {
        id: "board-all-up",
        name: "Board shows every depot when all answer",
        code: `${fakes}
const board = await module.loadDepotBoard(["LDS", "MAN", "BHM"], allUp);
assertDeepEqual(board, [
  { id: "LDS", ok: true, status: data.LDS },
  { id: "MAN", ok: true, status: data.MAN },
  { id: "BHM", ok: true, status: data.BHM },
]);`,
        feedback: {
          what: "With all depots healthy, the board rows did not match { id, ok: true, status } in depot order.",
          why: "Dispatchers scan the board in a fixed depot order; rows must line up with depotIds.",
          next: "Map each result back to depotIds[i] by index.",
        },
      },
      {
        id: "board-partial-failure",
        name: "Board keeps healthy depots when one depot is down",
        code: `${fakes}
let board;
try {
  board = await module.loadDepotBoard(["LDS", "MAN", "BHM"], manDown);
} catch (e) {
  throw new Error("loadDepotBoard rejected (" + e.message + ") — one depot being down must not blank the board");
}
assertDeepEqual(board, [
  { id: "LDS", ok: true, status: data.LDS },
  { id: "MAN", ok: false, error: "MAN depot API timeout" },
  { id: "BHM", ok: true, status: data.BHM },
]);`,
        feedback: {
          what: "When MAN rejected, the board rejected entirely or did not produce { id: \"MAN\", ok: false, error: \"MAN depot API timeout\" }.",
          why: "Promise.all rejects as soon as one promise rejects, discarding the healthy depots' results — that is INC-2291.",
          next: "Use Promise.allSettled, then map each outcome: fulfilled → { ok: true, status: value }, rejected → { ok: false, error: reason.message }.",
        },
      },
      {
        id: "board-concurrent",
        name: "Board queries all depots at once and keeps depot order",
        code: `${deferred}
const result = module.loadDepotBoard(["LDS", "MAN", "BHM"], slow);
await flush();
assertDeepEqual(calls, ["LDS", "MAN", "BHM"], "all three depots should be queried before any answers; only " + JSON.stringify(calls) + " were");
pending.BHM({ depot: "BHM" });
pending.LDS({ depot: "LDS" });
pending.MAN({ depot: "MAN" });
const board = await result;
assertDeepEqual(board.map((r) => r.id), ["LDS", "MAN", "BHM"], "rows must follow depotIds order, not the order answers arrived");`,
        feedback: {
          what: "The board waited for one depot before asking the next, or rows came out in completion order.",
          why: "Sequential awaits turn nine 2-second calls into 18 seconds; dispatchers need the board in ~2 s.",
          next: "Create all the promises first with depotIds.map(...), then await them together.",
        },
      },
      {
        id: "report-all-up",
        name: "Shift report resolves with every status in order",
        code: `${fakes}
const report = await module.loadShiftReport(["BHM", "LDS", "MAN"], allUp);
assertDeepEqual(report, [data.BHM, data.LDS, data.MAN]);`,
        feedback: {
          what: "With every depot healthy, the report was not the array of statuses in depot order.",
          why: "Operations reconcile the report row by row against the depot list.",
          next: "Resolve with the plain statuses, one per depot, in depotIds order.",
        },
      },
      {
        id: "report-rejects-on-gap",
        name: "Shift report rejects when any depot fails",
        code: `${fakes}
let error = null;
try {
  const report = await module.loadShiftReport(["LDS", "MAN", "BHM"], manDown);
  error = { unexpected: report };
} catch (e) {
  error = e;
}
assert(!(error && error.unexpected), "loadShiftReport resolved with " + JSON.stringify(error && error.unexpected) + " — a report with a gap must reject instead");
assert(error instanceof Error && error.message.includes("MAN"), "the rejection should carry the depot's error, got " + String(error));`,
        feedback: {
          what: "With MAN down, the report still resolved (with a gap) or rejected without the depot's error.",
          why: "Swallowing the error is how an incomplete report reached the client. A rejection makes the failure visible so the report is rerun.",
          next: "Return Promise.all(depotIds.map(...)) and let its rejection propagate — do not catch it here.",
        },
      },
      {
        id: "report-concurrent",
        name: "Shift report also queries all depots at once",
        hidden: true,
        code: `${deferred}
const result = module.loadShiftReport(["LDS", "MAN", "BHM"], slow);
await flush();
assertEqual(calls.length, 3, "all three depots should be queried before any answers; only " + JSON.stringify(calls) + " were");
pending.MAN("m"); pending.BHM("b"); pending.LDS("l");
assertDeepEqual(await result, ["l", "m", "b"], "results must follow depotIds order");`,
        feedback: {
          what: "The report queried depots one at a time.",
          why: "The report runs at shift change when every depot is busy; sequential calls regularly hit the 15 s job timeout.",
          next: "Start every getStatus call before awaiting any of them.",
        },
      },
    ],
    solution: { "depot-board.js": solution },
    wrongSolutions: [
      {
        label: "allSettled, but stores the Error object instead of its message",
        files: {
          "depot-board.js": `async function loadDepotBoard(depotIds, getStatus) {
  const outcomes = await Promise.allSettled(depotIds.map((id) => getStatus(id)));
  return outcomes.map((o, i) => (o.status === "fulfilled" ? { id: depotIds[i], ok: true, status: o.value } : { id: depotIds[i], ok: false, error: o.reason }));
}
function loadShiftReport(depotIds, getStatus) {
  return Promise.all(depotIds.map((id) => getStatus(id)));
}
`,
        },
      },
      {
        label: "board awaits depots one at a time inside try/catch",
        files: {
          "depot-board.js": `async function loadDepotBoard(depotIds, getStatus) {
  const rows = [];
  for (const id of depotIds) {
    try {
      rows.push({ id, ok: true, status: await getStatus(id) });
    } catch (e) {
      rows.push({ id, ok: false, error: e.message });
    }
  }
  return rows;
}
function loadShiftReport(depotIds, getStatus) {
  return Promise.all(depotIds.map((id) => getStatus(id)));
}
`,
        },
      },
      {
        label: "report catches each failure, so it never rejects",
        files: {
          "depot-board.js": `async function loadDepotBoard(depotIds, getStatus) {
  const outcomes = await Promise.allSettled(depotIds.map((id) => getStatus(id)));
  return outcomes.map((o, i) => (o.status === "fulfilled" ? { id: depotIds[i], ok: true, status: o.value } : { id: depotIds[i], ok: false, error: o.reason.message }));
}
function loadShiftReport(depotIds, getStatus) {
  return Promise.all(depotIds.map((id) => getStatus(id).catch(() => null)));
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "The board resolves with one row per depot in order, marking failed depots with their error message",
    "The shift report resolves only when every depot answers and rejects otherwise",
    "Both functions start every depot request before waiting for any of them",
  ],
  hints: [
    "For each function, decide what one failed depot should mean: show the rest, or stop everything?",
    "Promise.all rejects as soon as any promise rejects. Promise.allSettled always resolves with one { status, value | reason } object per promise.",
    "To run requests concurrently, create the promises first (`depotIds.map((id) => getStatus(id))`) and only then await the combined promise.",
    "Board: `const outcomes = await Promise.allSettled(promises)`, then map each outcome to `{ id: depotIds[i], ok: true, status: o.value }` or `{ id: depotIds[i], ok: false, error: o.reason.message }`. Report: `return Promise.all(promises)`.",
  ],
  questions: [
    {
      id: "predict-all-reject",
      kind: "mcq",
      prompt: "Three requests are combined with `await Promise.all([a, b, c])`. b rejects after 1 s; a and c would fulfil after 2 s. What happens?",
      options: [
        "The await throws after about 1 s with b's error",
        "The await resolves after 2 s with [a, undefined, c]",
        "The await resolves with [a, c]",
        "The await throws after 2 s with all errors",
      ],
      answer: 0,
      explanation: "Promise.all is fail-fast: it rejects with the first rejection immediately. a and c still finish, but their results are ignored.",
    },
    {
      id: "predict-sequential-time",
      kind: "short",
      prompt: "Each getStatus call takes 2 seconds. Roughly how many seconds does this take for 3 depots?",
      code: `for (const id of ["LDS", "MAN", "BHM"]) {
  rows.push(await getStatus(id));
}`,
      codeLanguage: "javascript",
      accept: ["6", "6 seconds", "6s", "about 6", "~6"],
      acceptPatterns: ["^~?\\s*6\\s*(s|sec|secs|seconds)?$"],
      explanation: "Each await waits for the previous call before starting the next: 3 × 2 s. With map + Promise.all it is about 2 s.",
    },
    {
      id: "explain-choose-combinator",
      kind: "explain",
      prompt: "Explain why the live board should use Promise.allSettled while the shift report should use Promise.all.",
      concepts: [
        { label: "Promise.all rejects as soon as any promise fails", anyOf: ["fail fast", "fails fast", "fail-fast", "rejects as soon", "any rejects", "one rejects", "one fails", "any fails", "all-or-nothing", "all or nothing", "first rejection"] },
        { label: "allSettled waits for every outcome and reports each one", anyOf: ["allsettled", "every outcome", "each outcome", "every result", "fulfilled", "status of each", "never rejects"] },
        { label: "the board needs partial results; the report must not have gaps", anyOf: ["gaps", "gap", "incomplete", "partial", "missing data", "show the rest", "other depots", "healthy depots"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "Promise.all is all-or-nothing: it rejects as soon as any depot fails, which blanks the board even though the other depots answered. Promise.allSettled never rejects; it waits for every outcome and reports each as fulfilled or rejected, so the board can show the healthy depots and mark the failed one. The shift report must not be filed with gaps, so there Promise.all's rejection is exactly the signal we want.",
      explanation: "The combinator encodes the business rule for partial failure.",
    },
  ],
  debrief: {
    solution: `- **Board:** \`Promise.allSettled(depotIds.map(getStatus))\` starts every request at once and waits for all outcomes. Each outcome is mapped by index to \`{ id, ok: true, status }\` or \`{ id, ok: false, error: reason.message }\`. It never rejects.
- **Report:** \`return Promise.all(depotIds.map(getStatus))\`. If any depot fails, the returned promise rejects with that depot's error and the caller can alert or retry. No try/catch inside — catching here is what hid the gap.

Both preserve input order because combinators place results by index, not by arrival time.`,
    commonMistakes: [
      "Awaiting inside a for loop, which serialises independent requests.",
      "Adding .catch(() => null) to every promise inside Promise.all, which turns all-or-nothing into silent gaps.",
      "Putting the Error object (rather than its message) in UI data; it serialises to {} and shows as blank.",
      "Assuming Promise.all cancels the other requests when one fails — they keep running.",
    ],
    realWorld:
      "Status pages, dashboards and \"fan-out\" API gateways use allSettled-style aggregation so one dependency cannot take down the whole view. Batch jobs, payments and reports usually need all-or-nothing semantics plus retries. Promise.any and Promise.race cover the remaining cases (first success, first to finish — often used for timeouts).",
  },
  review: [
    {
      id: "js-all-vs-allsettled",
      skill: "js.promises",
      variants: [
        {
          id: "js-all-vs-allsettled-a",
          kind: "mcq",
          prompt: "A homepage loads weather, news and stock widgets. If one fails the others should still appear. Which combinator fits?",
          options: ["Promise.all", "Promise.allSettled", "Promise.race", "A for loop with await"],
          answer: 1,
          explanation: "allSettled gives every outcome, so successful widgets render and failed ones show an error.",
        },
        {
          id: "js-all-vs-allsettled-b",
          kind: "mcq",
          prompt: "An invoice needs line items, tax rates and the customer record; any missing piece makes it wrong. Which combinator fits?",
          options: ["Promise.allSettled", "Promise.any", "Promise.all", "Promise.race"],
          answer: 2,
          explanation: "All-or-nothing data should fail fast with Promise.all so the caller can retry rather than produce a wrong invoice.",
        },
      ],
    },
    {
      id: "js-concurrent-start",
      skill: "js.promises",
      variants: [
        {
          id: "js-concurrent-start-a",
          kind: "mcq",
          prompt: "Which version fetches all routes concurrently?",
          options: [
            "for (const id of ids) results.push(await getRoute(id));",
            "const results = await Promise.all(ids.map((id) => getRoute(id)));",
            "ids.forEach(async (id) => results.push(await getRoute(id))); return results;",
            "const results = ids.map(async (id) => await getRoute(id));",
          ],
          answer: 1,
          explanation: "map starts every request, Promise.all waits for them together. The forEach version returns before anything finishes; the last returns an array of pending promises.",
        },
        {
          id: "js-concurrent-start-b",
          kind: "short",
          prompt: "Four calls each take 3 s and are started with `ids.map(load)` and awaited with `Promise.all`. Roughly how many seconds until the await finishes?",
          accept: ["3", "3 seconds", "3s", "about 3", "~3"],
          acceptPatterns: ["^~?\\s*3\\s*(s|sec|secs|seconds)?$"],
          explanation: "They run concurrently, so the total is about the slowest single call: ~3 s.",
        },
      ],
    },
    {
      id: "js-allsettled-shape",
      skill: "js.promises",
      variants: [
        {
          id: "js-allsettled-shape-a",
          kind: "short",
          prompt: "In a Promise.allSettled result, what is the `status` of an outcome whose promise rejected?",
          accept: ["rejected", "\"rejected\""],
          explanation: "Each outcome is { status: \"fulfilled\", value } or { status: \"rejected\", reason }.",
        },
        {
          id: "js-allsettled-shape-b",
          kind: "short",
          prompt: "In a Promise.allSettled result, which property holds the error of a rejected outcome?",
          accept: ["reason", "outcome.reason", ".reason"],
          explanation: "Rejected outcomes carry the rejection value in reason; fulfilled ones carry value.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev's office network checker pings five branch gateways and must report \"all branches reachable\" only if every ping succeeds — otherwise it pages on-call with the failing branch. Each ping is a promise that rejects with an Error naming the branch.",
    question: {
      id: "transfer-branch-pings",
      kind: "mcq",
      prompt: "Which implementation matches the requirement most directly?",
      options: [
        "try { await Promise.all(branches.map(ping)); report(\"all branches reachable\"); } catch (e) { page(e.message); }",
        "const r = await Promise.allSettled(branches.map(ping)); report(\"all branches reachable\");",
        "for (const b of branches) { try { await ping(b); } catch {} } report(\"all branches reachable\");",
        "await Promise.race(branches.map(ping)); report(\"all branches reachable\");",
      ],
      answer: 0,
      explanation:
        "The success message requires every ping to succeed, and the first failure should page — Promise.all's fail-fast rejection gives exactly that. The others report success even when pings fail.",
    },
  },
  refresher: {
    body: `Calling an async function starts its work straight away and gives you a promise. To run several at once, create all the promises first (\`ids.map(fn)\`), then wait for the group. \`Promise.all\` gives you all the values — or rejects the moment one fails. \`Promise.allSettled\` waits for every promise and tells you, for each, whether it was \`"fulfilled"\` (with \`value\`) or \`"rejected"\` (with \`reason\`). Pick \`all\` when partial data is useless, \`allSettled\` when partial data is still worth showing.`,
    practice: {
      id: "refresher-allsettled",
      kind: "mcq",
      prompt: "Does `await Promise.allSettled([Promise.reject(new Error(\"x\"))])` throw?",
      options: ["No, it resolves with [{ status: \"rejected\", reason: Error(\"x\") }]", "Yes, it throws Error(\"x\")", "It never settles", "It resolves with []"],
      answer: 0,
      explanation: "allSettled never rejects; it describes each outcome instead.",
    },
  },
};
