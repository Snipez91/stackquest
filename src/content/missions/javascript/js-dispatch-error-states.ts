import type { MissionInput } from "@/content/schema";

const F = "```";

const html = `<section id="routes-panel">
  <header>
    <h2>Today's routes</h2>
    <button id="refresh" type="button">Refresh</button>
  </header>
  <p id="spinner" hidden>Loading routes…</p>
  <div id="error" class="alert" hidden>
    <p id="error-message"></p>
  </div>
  <ul id="routes"></ul>
  <p id="updated"></p>
</section>`;

const starter = `// Lumen Logistics — "Today's routes" panel on the dispatch dashboard (see index.html).
// main.js calls loadRoutes() on start-up and every 5 minutes; the Refresh button calls it too.
//
// Required behaviour (see the brief):
//   - fetchRoutes() resolves to the routes array, or rejects with an ApiError carrying
//     the HTTP status for non-2xx responses (network failures reject as they are).
//   - loadRoutes() never rejects. On failure it shows #error with a message (include the
//     HTTP status when there is one), keeps the last routes on screen, and always hides
//     the spinner and re-enables the Refresh button.

const refreshButton = document.getElementById("refresh");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const list = document.getElementById("routes");
const updated = document.getElementById("updated");

function renderRoutes(routes) {
  list.replaceChildren();
  for (const route of routes) {
    const li = document.createElement("li");
    li.dataset.route = route.id;
    li.textContent = route.id + " — " + route.driver + " (" + route.stops + " stops)";
    list.append(li);
  }
}

async function fetchRoutes() {
  const response = await fetch("/api/routes?date=today");
  const data = await response.json();
  return data.routes;
}

async function loadRoutes() {
  refreshButton.disabled = true;
  spinner.hidden = false;
  errorBox.hidden = true;

  const routes = await fetchRoutes();
  renderRoutes(routes);
  updated.textContent = "Updated " + new Date().toLocaleTimeString();

  spinner.hidden = true;
  refreshButton.disabled = false;
}

refreshButton.addEventListener("click", () => loadRoutes());
`;

const consoleLog = `# Browser console export — dispatch dashboard, workstation DISP-03 (Leeds), 5 Nov 2026
[07:58:02.114] GET /api/routes?date=today 200 (184 ms)
[08:03:02.120] GET /api/routes?date=today 200 (171 ms)
[08:08:02.131] GET /api/routes?date=today 200 (190 ms)
[08:13:02.140] GET /api/routes?date=today 200 (176 ms)
[08:14:40.902] GET /api/routes?date=today 503 (31 ms)
[08:14:40.905] Uncaught (in promise) SyntaxError: Unexpected token 'S', "Service Unavailable" is not valid JSON
    at JSON.parse (<anonymous>)
    at async fetchRoutes (routes-panel.js:30:16)
    at async loadRoutes (routes-panel.js:39:18)
[08:15:12.330] [ui] click #refresh ignored: element is disabled
[08:16:55.018] [ui] click #refresh ignored: element is disabled
[08:18:02.150] GET /api/routes?date=today 200 (402 ms)
[08:21:07.611] GET /api/routes?date=today net::ERR_CONNECTION_RESET
[08:21:07.612] Uncaught (in promise) TypeError: Failed to fetch
    at fetchRoutes (routes-panel.js:29:26)
    at loadRoutes (routes-panel.js:39:24)
[08:23:30.744] [ui] click #refresh ignored: element is disabled
`;

const solution = `// Lumen Logistics — "Today's routes" panel on the dispatch dashboard (see index.html).

const refreshButton = document.getElementById("refresh");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const list = document.getElementById("routes");
const updated = document.getElementById("updated");

// A failed HTTP response: the server answered, but not with 2xx.
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function renderRoutes(routes) {
  list.replaceChildren();
  for (const route of routes) {
    const li = document.createElement("li");
    li.dataset.route = route.id;
    li.textContent = route.id + " — " + route.driver + " (" + route.stops + " stops)";
    list.append(li);
  }
}

async function fetchRoutes() {
  const response = await fetch("/api/routes?date=today"); // rejects (TypeError) on network failure
  if (!response.ok) {
    throw new ApiError(response.status, "Routes request failed: HTTP " + response.status);
  }
  const data = await response.json();
  return data.routes;
}

function describeFailure(err) {
  if (err instanceof ApiError) {
    return "Could not load routes (HTTP " + err.status + "). Showing the last update — try again.";
  }
  if (err instanceof TypeError) {
    return "Cannot reach the dispatch server. Check your connection and try again.";
  }
  return "Something went wrong loading routes. Try again.";
}

async function loadRoutes() {
  refreshButton.disabled = true;
  spinner.hidden = false;
  errorBox.hidden = true;
  try {
    const routes = await fetchRoutes();
    renderRoutes(routes);
    updated.textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (err) {
    console.error("loadRoutes failed:", err);
    errorMessage.textContent = describeFailure(err); // last good routes stay on screen
    errorBox.hidden = false;
  } finally {
    spinner.hidden = true;
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => loadRoutes());
`;

const routes = `const ROUTES = [
  { id: "R-LDS-04", driver: "Ana Costa", stops: 14 },
  { id: "R-LDS-07", driver: "Ben Okoro", stops: 11 },
  { id: "R-LDS-12", driver: "Chen Wu", stops: 9 },
];
const ok = { status: 200, json: { routes: ROUTES } };
async function settle(p) { try { await p; return null; } catch (e) { return e; } }
const $ = (id) => document.getElementById(id);
function assertIdle(label) {
  assert($("spinner").hidden, label + ": the spinner is still visible");
  assert(!$("refresh").disabled, label + ": the Refresh button is still disabled, so the dispatcher cannot retry");
}`;

export const jsDispatchErrorStates: MissionInput = {
  slug: "js-dispatch-error-states",
  version: 1,
  track: "javascript",
  tier: "advanced",
  order: 2,
  title: "Repair a JavaScript interface that mishandles failed API requests",
  summary:
    "When the routes API fails, the dispatch panel spins forever and locks the Refresh button. Add response.ok checks, a custom ApiError, try/catch/finally and a visible error state.",
  minutes: 40,
  assessmentTypes: ["repair-code", "investigate-logs", "explain-root-cause"],
  skills: ["js.error-handling"],
  appliesSkills: ["js.fetch", "js.dom-events", "js.async"],
  prerequisites: ["js-fetch-tracking-json"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `INC-2304 post-mortem action for the frontend. At 08:14 the routing engine on api-01 restarted and returned **503** for about 90 seconds. Every dispatcher's "Today's routes" panel then showed **"Loading routes…" indefinitely**, and the **Refresh button stayed greyed out** — the only fix was reloading the whole dashboard, which lost unsent assignments. At 08:21 a VPN reset (a genuine network failure) did the same again.

Aiko exported the console from DISP-03: \`logs/browser-console.log\`. The panel code is \`routes-panel.js\`.

Required: failures must show a clear message in \`#error\` (with the HTTP status when there is one), keep the last routes on screen, and **always** clear the spinner and re-enable Refresh so dispatchers can retry. \`loadRoutes()\` must never reject — main.js calls it on a timer.`,
  },
  objectives: [
    "Trace an unhandled rejection through a stack trace to the line that threw",
    "Distinguish HTTP failures (response.ok is false) from network failures (fetch rejects)",
    "Define a custom Error subclass that carries the HTTP status",
    "Use try/catch/finally so UI state is restored on every path",
    "Show an actionable error state without discarding the last good data",
  ],
  concept: {
    title: "Errors unwind the stack — finally is how state gets restored",
    body: `When code throws (or an awaited promise rejects), JavaScript abandons the rest of the current function and unwinds to the nearest enclosing \`catch\`. Every line after the failure — including "hide the spinner" and "enable the button" — is skipped. In an \`async\` function called without \`await\` or \`.catch\`, the rejection becomes an **unhandled rejection**: logged to the console, invisible to the user.

${F}js
try {
  await risky();      // may throw
  render();           // skipped if risky throws
} catch (err) {
  showError(err);     // runs only on failure
} finally {
  cleanUp();          // runs on success, failure, and even after return
}
${F}

Put **state restoration** (spinners, disabled buttons, locks) in \`finally\` so no path can skip it.

Two failure kinds reach \`catch\` here. A **network failure** rejects \`fetch\` itself with a \`TypeError\`. An **HTTP failure** resolves \`fetch\` with \`response.ok === false\` — nothing throws unless you check. A **custom error class** makes the second kind explicit and carries context:

${F}js
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
${F}

\`catch\` can then branch with \`err instanceof ApiError\` to produce the right message. Catch where you can **do something useful** (here: the UI layer), and let lower layers throw.`,
  },
  workedExample: {
    title: "Worked example: a label printer that jams",
    body: `The depot label printer client prints one batch at a time and greys out the Print button while busy.

${F}js
async function printBatch(batch) {
  printButton.disabled = true;
  status.textContent = "Printing…";
  await printer.send(batch);      // rejects if the printer jams or is offline
  status.textContent = "Done";
  printButton.disabled = false;   // never reached after a jam
}
${F}

**Step 1 — classify failures with a custom error.** The printer driver resolves with \`{ ok: false, code: "JAM" }\` on a jam, so turn that into an error:

${F}js
class PrinterError extends Error {
  constructor(code) { super("Printer reported " + code); this.name = "PrinterError"; this.code = code; }
}
${F}

**Step 2 — catch at the UI layer, restore in finally.**

${F}js
async function printBatch(batch) {
  printButton.disabled = true;
  status.textContent = "Printing…";
  try {
    const result = await printer.send(batch);
    if (!result.ok) throw new PrinterError(result.code);
    status.textContent = "Done";
  } catch (err) {
    status.textContent = err instanceof PrinterError
      ? "Printer " + err.code + " — clear it and press Print again."
      : "Printer offline. Check the cable and try again.";
  } finally {
    printButton.disabled = false;
  }
}
${F}

Every path ends with the button enabled, and the operator always knows what to do next.`,
  },
  simulationNote:
    "fetch is replaced by a simulated api-01 that can return any status, a plain-text body, or a network failure (fetch rejects with TypeError: Failed to fetch). The DOM is the same simulated subset as earlier missions; `hidden` and `disabled` behave like the real properties.",
  workspace: {
    kind: "javascript",
    entry: "routes-panel.js",
    exports: ["loadRoutes", "fetchRoutes"],
    html,
    files: [
      { path: "routes-panel.js", content: starter, editable: true },
      { path: "logs/browser-console.log", content: consoleLog, editable: false },
      { path: "index.html", content: html, editable: false },
    ],
    tests: [
      {
        id: "success-renders",
        name: "A successful load renders routes and returns the panel to idle",
        code: `${routes}
mockFetch({ "GET /api/routes?date=today": { ...ok, delayMs: 5 } });
const pending = module.loadRoutes();
assert(!$("spinner").hidden, "while loading, the spinner should be visible");
assert($("refresh").disabled, "while loading, Refresh should be disabled to avoid duplicate requests");
const err = await settle(pending);
assert(!err, "loadRoutes rejected on a successful response: " + err);
assertEqual(document.querySelectorAll("#routes li").length, 3, "three routes should be rendered");
assert($("error").hidden, "the error panel should be hidden after a successful load");
assertIdle("after success");`,
        feedback: {
          what: "The happy path no longer renders three routes, or the loading state was not shown and cleared correctly.",
          why: "Error handling must not break the normal case dispatchers see every five minutes.",
          next: "Keep rendering inside the try block; set the loading state before it and clear it in finally.",
        },
      },
      {
        id: "http-error-state",
        name: "An HTTP 503 shows an error with the status and frees the panel",
        code: `${routes}
mockFetch({ "GET /api/routes?date=today": { status: 503, json: { error: "routing engine restarting" } } });
const err = await settle(module.loadRoutes());
assert(!err, "loadRoutes must not reject (main.js calls it on a timer), but it rejected with " + err);
assert(!$("error").hidden, "#error should be visible after a 503");
const msg = $("error-message").textContent;
assert(msg.includes("503"), "the error message should mention HTTP 503, got: " + JSON.stringify(msg));
assertIdle("after a 503");`,
        feedback: {
          what: "After a 503, the error panel was hidden or did not mention 503, the spinner stayed, the button stayed disabled, or loadRoutes rejected.",
          why: "fetch resolves for a 503, so without an ok check the code carries on with an error body; any exception then skips the cleanup lines — INC-2304.",
          next: "In fetchRoutes, throw an ApiError with response.status when !response.ok. In loadRoutes, catch it, write the message into #error-message, un-hide #error, and move cleanup into finally.",
        },
      },
      {
        id: "network-error-state",
        name: "A network failure shows an error and frees the panel",
        code: `${routes}
mockFetch({ "GET /api/routes?date=today": { networkError: true } });
const err = await settle(module.loadRoutes());
assert(!err, "loadRoutes must not reject on a network failure, but it rejected with " + err);
assert(!$("error").hidden, "#error should be visible after a network failure");
const msg = $("error-message").textContent.trim();
assert(msg.length > 0 && !msg.includes("undefined"), "the network error message should be a readable sentence, got: " + JSON.stringify(msg));
assertIdle("after a network failure");`,
        feedback: {
          what: "When fetch itself rejected (network failure), the panel did not show a readable error, stayed busy, or loadRoutes rejected.",
          why: "Network failures throw from the fetch line, skipping everything after it unless something catches them.",
          next: "Wrap the await in try/catch; for non-ApiError failures show a message such as \"Cannot reach the dispatch server\". Keep cleanup in finally.",
        },
      },
      {
        id: "fetch-routes-api-error",
        name: "fetchRoutes rejects with the HTTP status instead of a JSON parse error",
        code: `mockFetch({ "GET /api/routes?date=today": { status: 500, text: "Internal Server Error" } });
let err = null;
try { await module.fetchRoutes(); } catch (e) { err = e; }
assert(err, "fetchRoutes should reject for HTTP 500");
assert(err instanceof Error, "fetchRoutes should reject with an Error (or subclass), got " + String(err));
assertEqual(err.status, 500, "the error should carry status 500 (got " + err.name + ": " + err.message + ")");`,
        feedback: {
          what: "For a 500 with a plain-text body, fetchRoutes did not reject with an Error carrying status 500 (often a SyntaxError from response.json()).",
          why: "A SyntaxError hides the real cause and cannot be told apart from a code bug; the UI needs the status to explain the outage.",
          next: "Define class ApiError extends Error with a status property, and throw it before calling response.json().",
        },
      },
      {
        id: "retry-recovers",
        name: "After a failure, Refresh retries and recovers",
        hidden: true,
        code: `${routes}
mockFetch({ "GET /api/routes?date=today": [{ status: 502, text: "Bad Gateway" }, ok] });
await settle(module.loadRoutes());
assert(!$("error").hidden, "setup: the first (502) load should show the error panel");
dom.click("#refresh");
await flush();
assertEqual(document.querySelectorAll("#routes li").length, 3, "clicking Refresh after the failure should load the routes");
assert($("error").hidden, "the error panel should be hidden once a retry succeeds");
assertIdle("after a successful retry");`,
        feedback: {
          what: "After a failed load, clicking Refresh did not load the routes and clear the error.",
          why: "Retrying is the dispatcher's only recovery path that does not lose unsent work.",
          next: "Make sure the button is re-enabled in finally and that a successful load hides #error.",
        },
      },
      {
        id: "keeps-last-good-routes",
        name: "A failure keeps the last routes on screen",
        hidden: true,
        code: `${routes}
mockFetch({ "GET /api/routes?date=today": [ok, { status: 500, json: { error: "db-01 timeout" } }] });
await settle(module.loadRoutes());
await settle(module.loadRoutes());
assertEqual(document.querySelectorAll("#routes li").length, 3, "the routes from the last successful load should stay visible");
assert(!$("error").hidden, "the error panel should explain that the latest refresh failed");`,
        feedback: {
          what: "When a refresh failed, the previously loaded routes disappeared.",
          why: "During a short outage, slightly stale routes are far more useful to a dispatcher than an empty panel.",
          next: "Only replace the list after a successful fetch; do not clear it in the catch block.",
        },
      },
    ],
    solution: { "routes-panel.js": solution },
    wrongSolutions: [
      {
        label: "try/catch added, but cleanup only on the success path",
        files: {
          "routes-panel.js": `const refreshButton = document.getElementById("refresh");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const list = document.getElementById("routes");
class ApiError extends Error {
  constructor(status, message) { super(message); this.name = "ApiError"; this.status = status; }
}
function renderRoutes(routes) {
  list.replaceChildren();
  for (const r of routes) { const li = document.createElement("li"); li.textContent = r.id; list.append(li); }
}
async function fetchRoutes() {
  const response = await fetch("/api/routes?date=today");
  if (!response.ok) throw new ApiError(response.status, "HTTP " + response.status);
  return (await response.json()).routes;
}
async function loadRoutes() {
  refreshButton.disabled = true;
  spinner.hidden = false;
  errorBox.hidden = true;
  try {
    renderRoutes(await fetchRoutes());
    spinner.hidden = true;
    refreshButton.disabled = false;
  } catch (err) {
    errorMessage.textContent = err instanceof ApiError ? "Could not load routes (HTTP " + err.status + ")" : "Cannot reach the server";
    errorBox.hidden = false;
  }
}
refreshButton.addEventListener("click", () => loadRoutes());
`,
        },
      },
      {
        label: "catches network errors but never checks response.ok",
        files: {
          "routes-panel.js": `const refreshButton = document.getElementById("refresh");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const list = document.getElementById("routes");
function renderRoutes(routes) {
  list.replaceChildren();
  for (const r of routes) { const li = document.createElement("li"); li.textContent = r.id; list.append(li); }
}
async function fetchRoutes() {
  const response = await fetch("/api/routes?date=today");
  const data = await response.json();
  return data.routes;
}
async function loadRoutes() {
  refreshButton.disabled = true;
  spinner.hidden = false;
  errorBox.hidden = true;
  try {
    renderRoutes(await fetchRoutes());
  } catch (err) {
    errorMessage.textContent = "Could not load routes: " + err.message;
    errorBox.hidden = false;
  } finally {
    spinner.hidden = true;
    refreshButton.disabled = false;
  }
}
refreshButton.addEventListener("click", () => loadRoutes());
`,
        },
      },
      {
        label: "clears the routes list when a refresh fails",
        files: {
          "routes-panel.js": `const refreshButton = document.getElementById("refresh");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const list = document.getElementById("routes");
class ApiError extends Error {
  constructor(status, message) { super(message); this.name = "ApiError"; this.status = status; }
}
function renderRoutes(routes) {
  list.replaceChildren();
  for (const r of routes) { const li = document.createElement("li"); li.textContent = r.id; list.append(li); }
}
async function fetchRoutes() {
  const response = await fetch("/api/routes?date=today");
  if (!response.ok) throw new ApiError(response.status, "HTTP " + response.status);
  return (await response.json()).routes;
}
async function loadRoutes() {
  refreshButton.disabled = true;
  spinner.hidden = false;
  errorBox.hidden = true;
  try {
    renderRoutes(await fetchRoutes());
  } catch (err) {
    list.replaceChildren();
    errorMessage.textContent = err instanceof ApiError ? "Could not load routes (HTTP " + err.status + ")" : "Cannot reach the server";
    errorBox.hidden = false;
  } finally {
    spinner.hidden = true;
    refreshButton.disabled = false;
  }
}
refreshButton.addEventListener("click", () => loadRoutes());
`,
        },
      },
    ],
  },
  successCriteria: [
    "HTTP failures and network failures both show a visible, readable message in #error; HTTP failures mention the status",
    "After any outcome the spinner is hidden and Refresh is enabled",
    "loadRoutes never rejects; fetchRoutes rejects with an Error carrying the HTTP status for non-2xx responses",
    "A failed refresh keeps the last successfully loaded routes on screen, and a successful retry clears the error",
  ],
  hints: [
    "Start with logs/browser-console.log: for each incident, which function and line threw, and what kind of error was it?",
    "At 08:14 the server answered (503) and the code still called response.json() on a plain-text body. At 08:21 fetch itself rejected. In both cases every line after the failure in loadRoutes was skipped.",
    "Split the responsibilities: fetchRoutes should throw a meaningful error (a custom ApiError with the status) for !response.ok; loadRoutes should catch, show the message, and restore the UI.",
    "Structure loadRoutes as: set loading state → `try { renderRoutes(await fetchRoutes()) } catch (err) { errorMessage.textContent = …; errorBox.hidden = false } finally { spinner.hidden = true; refreshButton.disabled = false }`. Branch on `err instanceof ApiError` to include err.status.",
  ],
  questions: [
    {
      id: "investigate-first-failure",
      kind: "mcq",
      prompt: "In logs/browser-console.log, what actually threw at 08:14:40?",
      options: [
        "response.json() inside fetchRoutes, because the 503 body was plain text",
        "fetch() inside fetchRoutes, because the request never reached api-01",
        "renderRoutes, because routes was undefined",
        "The click handler for #refresh",
      ],
      answer: 0,
      explanation:
        "The trace starts at JSON.parse ← fetchRoutes line 30 (`await response.json()`), and the 503 line just before shows the server did answer. The 08:21 incident is the one where fetch itself rejected.",
    },
    {
      id: "predict-finally",
      kind: "mcq",
      prompt: "What does this log?",
      code: `async function load() {
  try {
    console.log("try");
    throw new Error("503");
    console.log("after throw");
  } catch (e) {
    console.log("catch " + e.message);
  } finally {
    console.log("finally");
  }
}
load();`,
      codeLanguage: "javascript",
      options: ["try, catch 503, finally", "try, after throw, catch 503, finally", "try, finally", "try, catch 503"],
      answer: 0,
      explanation: "throw skips the rest of the try block; catch runs; finally runs last on every path.",
    },
    {
      id: "explain-stuck-spinner",
      kind: "explain",
      prompt: "Explain to Sam why the spinner stayed on and Refresh stayed disabled during both incidents, and how the fix guarantees it cannot happen again.",
      concepts: [
        { label: "the failure threw/rejected and skipped the remaining lines", anyOf: ["skipped", "never ran", "never reached", "jumped", "exception", "rejected", "rejection", "threw", "throws"] },
        { label: "HTTP errors do not reject fetch, so response.ok must be checked", anyOf: ["response.ok", "ok check", "check ok", "status", "http error", "503", "not ok"] },
        { label: "finally restores the UI on every path", anyOf: ["finally", "every path", "both paths", "always runs", "regardless"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "In both incidents an awaited call threw: at 08:14 response.json() failed on the plain-text 503 body because the code never checked response.ok or the status, and at 08:21 fetch itself rejected on the network failure. The exception skipped the remaining lines of loadRoutes, including hiding the spinner and re-enabling the button, and became an unhandled rejection. The fix throws an ApiError for non-ok responses, catches failures in loadRoutes to show an error message, and restores the spinner and button in a finally block, which always runs on every path.",
      explanation: "Restoration code belongs in finally; classification belongs in a custom error; display belongs in catch at the UI layer.",
    },
  ],
  debrief: {
    solution: `**Diagnosis from the log.** 08:14 — the 503 body was text, so \`response.json()\` (fetchRoutes:30) threw a SyntaxError. 08:21 — \`fetch\` rejected with \`TypeError: Failed to fetch\` (fetchRoutes:29). Both escaped \`loadRoutes\` as unhandled rejections, skipping the two cleanup lines; every later click hit a disabled button.

**Fix.**

1. \`class ApiError extends Error\` with a \`status\`; \`fetchRoutes\` throws it for \`!response.ok\` *before* parsing.
2. \`loadRoutes\` wraps the work in \`try\`: render on success; in \`catch\`, choose a message by error type (\`ApiError\` → include the status, \`TypeError\` → connection message) and show \`#error\`; leave the old list alone.
3. \`finally\` hides the spinner and enables Refresh on every path, so \`loadRoutes\` always settles and never rejects.`,
    commonMistakes: [
      "Putting cleanup at the end of the try block, which a throw skips.",
      "Catching errors but never checking response.ok, so HTTP failures surface as confusing TypeErrors or SyntaxErrors.",
      "Swallowing errors with an empty catch, which leaves the user with stale data and no explanation.",
      "Clearing the list on failure, turning a 90-second blip into an empty screen.",
      "Re-throwing from loadRoutes after showing the error, which brings the unhandled rejection back for the timer caller.",
    ],
    realWorld:
      "Every async UI action has three states — loading, success, error — and production bugs cluster in the error state because it is rarely exercised. Teams test it deliberately (as these checks do), use finally or framework equivalents for cleanup, and report unexpected errors to monitoring while showing users a recoverable message. Custom error classes are how API clients pass status codes and request IDs to the UI.",
  },
  review: [
    {
      id: "js-finally-cleanup",
      skill: "js.error-handling",
      variants: [
        {
          id: "js-finally-cleanup-a",
          kind: "mcq",
          prompt: "Where should `saveButton.disabled = false` go so it runs whether the save succeeds or fails?",
          code: `saveButton.disabled = true;
try {
  await save();       // (1)
} catch (e) {
  showError(e);       // (2)
} finally {
  // (3)
}`,
          codeLanguage: "javascript",
          options: ["After (1)", "After (2)", "At (3)", "Before the try"],
          answer: 2,
          explanation: "finally runs after both the success and failure paths.",
        },
        {
          id: "js-finally-cleanup-b",
          kind: "mcq",
          prompt: "A function returns inside its try block. Does its finally block still run?",
          options: ["Yes, finally runs before the function actually returns", "No, return skips finally", "Only if an error was thrown", "Only in async functions"],
          answer: 0,
          explanation: "finally runs on every exit path: normal completion, return, or throw.",
        },
      ],
    },
    {
      id: "js-custom-error-class",
      skill: "js.error-handling",
      variants: [
        {
          id: "js-custom-error-class-a",
          kind: "mcq",
          prompt: "Which definition lets a catch block use `err instanceof QuotaError` and read `err.limit`?",
          options: [
            "class QuotaError extends Error { constructor(limit) { super(\"Quota exceeded\"); this.name = \"QuotaError\"; this.limit = limit; } }",
            "function QuotaError(limit) { return { message: \"Quota exceeded\", limit }; }",
            "const QuotaError = new Error(\"Quota exceeded\");",
            "class QuotaError { constructor(limit) { this.limit = limit; } } // thrown with throw new QuotaError(5)",
          ],
          answer: 0,
          explanation: "Extending Error keeps the message and stack trace, instanceof works, and extra properties carry context. A plain class or object loses the stack and is not an Error.",
        },
        {
          id: "js-custom-error-class-b",
          kind: "short",
          prompt: "In a custom error's constructor, which call must come before you can use `this`?",
          accept: ["super()", "super", "super(message)", "super(msg)"],
          acceptPatterns: ["^super\\s*\\("],
          explanation: "A subclass constructor must call super(...) (here Error's constructor, usually with the message) before touching this.",
        },
      ],
    },
    {
      id: "js-http-vs-network-failure",
      skill: "js.fetch",
      variants: [
        {
          id: "js-http-vs-network-failure-a",
          kind: "mcq",
          prompt: "Code only has `try { const r = await fetch(url); render(await r.json()); } catch { showOffline(); }`. The server returns 503 with JSON `{ \"error\": \"busy\" }`. What happens?",
          options: [
            "showOffline() runs",
            "render() is called with { error: \"busy\" }",
            "fetch rejects with a 503 error",
            "Nothing is rendered and no error is shown",
          ],
          answer: 1,
          explanation: "fetch resolves for 503 and the JSON parses fine, so the error body is rendered as data. Only an ok check prevents that.",
        },
        {
          id: "js-http-vs-network-failure-b",
          kind: "mcq",
          prompt: "Which failure makes `await fetch(url)` itself throw?",
          options: ["HTTP 500", "HTTP 404", "The connection is reset before any response", "A response body that is not JSON"],
          answer: 2,
          explanation: "Only network-level failures reject fetch. Status errors resolve; bad JSON fails later in response.json().",
        },
      ],
    },
  ],
  transfer: {
    context:
      "The driver mobile app has `async function syncScans() { syncIcon.classList.add(\"spinning\"); const res = await fetch(\"/api/scans\", { method: \"POST\", body }); await res.json(); syncIcon.classList.remove(\"spinning\"); }`. Drivers in rural areas report the sync icon spinning forever.",
    question: {
      id: "transfer-sync-icon",
      kind: "mcq",
      prompt: "What is the most complete fix?",
      options: [
        "Check res.ok and throw a custom error, catch failures to show \"Sync failed — will retry\", and remove the spinning class in finally",
        "Add a setTimeout that removes the spinning class after 30 seconds",
        "Wrap only res.json() in try/catch",
        "Catch errors and ignore them so the app does not crash",
      ],
      answer: 0,
      explanation:
        "Weak signal causes network rejections, and server errors resolve with ok false. Classify both, tell the driver, and restore the icon in finally. A timer only hides the symptom.",
    },
  },
  refresher: {
    body: `When an awaited call throws, the rest of the function is skipped. \`try { … } catch (err) { … } finally { … }\` lets you respond: \`catch\` runs only on failure (show a message), \`finally\` runs on every path (hide spinners, re-enable buttons). \`fetch\` throws only when there is no response; for HTTP errors check \`response.ok\` and throw your own error — a class that \`extends Error\` and stores the status — so the catch block can explain what went wrong.`,
    practice: {
      id: "refresher-finally",
      kind: "mcq",
      prompt: "Which block runs whether or not an error was thrown?",
      options: ["try", "catch", "finally", "else"],
      answer: 2,
      explanation: "finally always runs after try (and catch, if it ran).",
    },
  },
};
