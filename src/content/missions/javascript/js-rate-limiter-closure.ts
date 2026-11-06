import type { MissionInput } from "@/content/schema";

const F = "```";

const starter = `// Lumen Logistics — client-side guards for the dispatch dashboard.

let used = 0;
let windowStart = 0;

// createRateLimiter(limit, windowMs, now) returns a function tryRequest().
// tryRequest() returns true if a request may be sent now, false if the caller must wait.
// - At most \`limit\` requests are allowed per window of \`windowMs\` milliseconds.
// - A window starts at the first request; once windowMs has passed since it started,
//   the next request starts a new window with a fresh allowance.
// - Each limiter is independent: the tracking panel and the map panel get their own.
// - \`now\` returns the current time in ms. Tests pass a fake clock; default Date.now.
function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  return function tryRequest() {
    if (used < limit) {
      used++;
      return true;
    }
    return false;
  };
}

// One "Retry" handler per depot panel: handlers[i]() returns "Retrying <depot name>".
function buildRetryHandlers(depots) {
  var handlers = [];
  for (var i = 0; i < depots.length; i++) {
    handlers.push(function () {
      return "Retrying " + depots[i];
    });
  }
  return handlers;
}
`;

const solution = `// Lumen Logistics — client-side guards for the dispatch dashboard.

function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  // These live in the factory's scope: every call to createRateLimiter gets its own pair,
  // and only the returned function can see them.
  let used = 0;
  let windowStart = null;

  return function tryRequest() {
    const t = now();
    if (windowStart === null || t - windowStart >= windowMs) {
      windowStart = t;
      used = 0;
    }
    if (used < limit) {
      used++;
      return true;
    }
    return false;
  };
}

function buildRetryHandlers(depots) {
  const handlers = [];
  for (let i = 0; i < depots.length; i++) {
    handlers.push(() => "Retrying " + depots[i]);
  }
  return handlers;
}
`;

const clock = `let t = 0;
const clock = () => t;`;

export const jsRateLimiterClosure: MissionInput = {
  slug: "js-rate-limiter-closure",
  version: 1,
  track: "javascript",
  tier: "intermediate",
  order: 1,
  title: "Build a per-panel rate limiter with closures",
  summary:
    "The map panel's polling starves the tracking panel, and every Retry button retries \"undefined\". Use closures for private per-limiter state and fix the var-in-a-loop bug.",
  minutes: 30,
  assessmentTypes: ["write-code", "repair-code", "explain-root-cause"],
  skills: ["js.scope"],
  appliesSkills: ["js.functions", "js.variables"],
  prerequisites: ["js-normalise-api-records"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `api-01 rate-limits each browser, so last week Aiko added a client-side limiter: each dashboard panel may send **at most N requests per window**. Two problems since:

1. When the map panel polls hard, the **tracking panel stops loading entirely** — its limiter says no even though it has sent nothing. It looks like all panels share one allowance, and it never refills.
2. The depot status strip has a Retry button per depot. Every button's handler returns **"Retrying undefined"**.

Both live in \`limits.js\`. The behaviour we want is in the comments. Tests use a fake clock, so please read time through the \`now\` parameter rather than calling \`Date.now()\` directly.`,
  },
  objectives: [
    "Explain the difference between module scope, function scope and block scope",
    "Use a closure to give each object created by a factory its own private state",
    "Explain and fix the var-in-a-loop capture bug",
    "Inject a clock so time-based logic is testable",
  ],
  concept: {
    title: "Scope decides which variables a function can see — and closures keep them alive",
    body: `**Scope** is where a name is visible. \`let\`/\`const\` are **block-scoped** (visible inside the nearest \`{ }\`); \`var\` is **function-scoped**; anything at the top of a file is shared by every function in it.

A function defined inside another function can use the outer function's variables. It keeps access to them even after the outer function has returned — that combination is a **closure**. Each *call* of the outer function creates fresh variables, so a factory gives every product its own private state:

${F}js
function makeCounter() {
  let n = 0;                 // a new n per makeCounter() call
  return () => ++n;
}
const a = makeCounter(), b = makeCounter();
a(); a(); b();               // a is at 2, b at 1 — independent
${F}

Move \`n\` to the top of the file and every counter shares one value.

Closures capture **variables, not values**. In \`for (var i …)\` there is a single \`i\` for the whole function; every callback created in the loop sees that one variable, which equals \`length\` once the loop ends. \`for (let i …)\` creates a **new binding per iteration**, so each callback captures its own \`i\`.`,
  },
  workedExample: {
    title: "Worked example: incident ticket numbers per team",
    body: `Goal: \`createTicketSequence("NET")\` returns a function that produces \`"NET-1"\`, \`"NET-2"\`, …, and the SRE team's sequence must not affect networking's.

**Broken:** a module-level counter.

${F}js
let next = 1;
function createTicketSequence(prefix) {
  return () => prefix + "-" + next++;
}
// NET-1, then SRE-2 — the teams share 'next'
${F}

**Fixed:** move the state into the factory so each call has its own.

${F}js
function createTicketSequence(prefix) {
  let next = 1;
  return () => prefix + "-" + next++;
}
${F}

**The loop trap, with timers:**

${F}js
for (var k = 1; k <= 3; k++) setTimeout(() => console.log(k), 0); // 4 4 4
for (let k = 1; k <= 3; k++) setTimeout(() => console.log(k), 0); // 1 2 3
${F}

The callbacks run after the loop. With \`var\` they all read the single \`k\`, which is now 4. With \`let\` each iteration's callback closed over its own \`k\`.`,
  },
  workspace: {
    kind: "javascript",
    entry: "limits.js",
    exports: ["createRateLimiter", "buildRetryHandlers"],
    files: [{ path: "limits.js", content: starter, editable: true }],
    tests: [
      {
        id: "limiter-allows-limit",
        name: "A limiter allows `limit` requests in a window, then refuses",
        code: `${clock}
const tryRequest = module.createRateLimiter(3, 1000, clock);
const got = [tryRequest(), tryRequest(), tryRequest(), tryRequest(), tryRequest()];
assertDeepEqual(got, [true, true, true, false, false], "with limit 3 the first three calls should be allowed");`,
        feedback: {
          what: "Within one window, the limiter did not allow exactly `limit` requests.",
          why: "Too many requests trip api-01's limit for the whole browser; too few starve the panel.",
          next: "Count requests in the current window and return false once the count reaches limit.",
        },
      },
      {
        id: "limiters-independent",
        name: "Two limiters do not share an allowance",
        code: `${clock}
const map = module.createRateLimiter(2, 1000, clock);
const tracking = module.createRateLimiter(2, 1000, clock);
assertDeepEqual([map(), map(), map()], [true, true, false], "the map limiter should allow 2 then refuse");
assertEqual(tracking(), true, "the tracking limiter has sent nothing yet, so its first request must be allowed");`,
        feedback: {
          what: "After the map panel used its allowance, the tracking panel's limiter refused its first request.",
          why: "The counter lives at the top of the file, so every limiter reads and writes the same variable.",
          next: "Declare the counter inside createRateLimiter so each call creates its own, captured by the returned function.",
        },
      },
      {
        id: "window-resets",
        name: "A new window starts once windowMs has passed",
        code: `${clock}
const tryRequest = module.createRateLimiter(2, 1000, clock);
assertDeepEqual([tryRequest(), tryRequest(), tryRequest()], [true, true, false], "first window: 2 allowed");
t = 999;
assertEqual(tryRequest(), false, "at 999 ms the first window has not ended");
t = 1000;
assertDeepEqual([tryRequest(), tryRequest(), tryRequest()], [true, true, false], "at 1000 ms a new window should allow 2 again");`,
        feedback: {
          what: "The limiter never refilled, or refilled too early.",
          why: "Without a window reset a panel is blocked forever after its first burst — the tracking-panel outage.",
          next: "Remember when the current window started (via now()). If now() - windowStart >= windowMs, start a new window and reset the count.",
        },
      },
      {
        id: "windows-independent",
        name: "Each limiter tracks its own window start",
        hidden: true,
        code: `${clock}
const a = module.createRateLimiter(2, 1000, clock);
const b = module.createRateLimiter(2, 1000, clock);
a(); a();
t = 900;
assertDeepEqual([b(), b(), b()], [true, true, false], "limiter b's first request at 900 ms starts its own window: 2 allowed");
t = 1000;
assertEqual(b(), false, "limiter b's window started at 900 ms, so at 1000 ms it is still full");
assertEqual(a(), true, "limiter a's window started at 0 ms, so at 1000 ms it should refill");`,
        feedback: {
          what: "One limiter's window timing affected another limiter.",
          why: "Both the count and the window start are per-limiter state; sharing either couples the panels.",
          next: "Keep every piece of mutable limiter state (count and window start) inside the factory.",
        },
      },
      {
        id: "retry-handlers",
        name: "Each Retry handler names its own depot",
        code: `const handlers = module.buildRetryHandlers(["LDS", "MAN", "BHM"]);
assertEqual(handlers.length, 3, "there should be one handler per depot");
assertDeepEqual(handlers.map((h) => h()), ["Retrying LDS", "Retrying MAN", "Retrying BHM"]);`,
        feedback: {
          what: "The Retry handlers did not return \"Retrying <depot>\" for their own depot.",
          why: "With var there is one i for the whole function; when a handler runs, the loop has finished and i equals depots.length, so depots[i] is undefined.",
          next: "Declare the loop variable with let (or use depots.map) so each handler captures its own value.",
        },
      },
    ],
    solution: { "limits.js": solution },
    wrongSolutions: [
      {
        label: "fixes the loop with let but keeps module-level limiter state",
        files: {
          "limits.js": `let used = 0;
let windowStart = null;
function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  return function tryRequest() {
    const t = now();
    if (windowStart === null || t - windowStart >= windowMs) { windowStart = t; used = 0; }
    if (used < limit) { used++; return true; }
    return false;
  };
}
function buildRetryHandlers(depots) {
  const handlers = [];
  for (let i = 0; i < depots.length; i++) handlers.push(() => "Retrying " + depots[i]);
  return handlers;
}
`,
        },
      },
      {
        label: "per-limiter counter that never resets",
        files: {
          "limits.js": `function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  let used = 0;
  return function tryRequest() {
    if (used < limit) { used++; return true; }
    return false;
  };
}
function buildRetryHandlers(depots) {
  return depots.map((d) => () => "Retrying " + d);
}
`,
        },
      },
      {
        label: "per-limiter count but a shared window start",
        files: {
          "limits.js": `let windowStart = null;
function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  let used = 0;
  return function tryRequest() {
    const t = now();
    if (windowStart === null || t - windowStart >= windowMs) { windowStart = t; used = 0; }
    if (used < limit) { used++; return true; }
    return false;
  };
}
function buildRetryHandlers(depots) {
  return depots.map((d) => () => "Retrying " + d);
}
`,
        },
      },
      {
        label: "rate limiter fixed, retry loop still uses var",
        files: {
          "limits.js": `function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  let used = 0;
  let windowStart = null;
  return function tryRequest() {
    const t = now();
    if (windowStart === null || t - windowStart >= windowMs) { windowStart = t; used = 0; }
    if (used < limit) { used++; return true; }
    return false;
  };
}
function buildRetryHandlers(depots) {
  var handlers = [];
  for (var i = 0; i < depots.length; i++) handlers.push(function () { return "Retrying " + depots[i]; });
  return handlers;
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "A limiter allows exactly `limit` requests per window and refills once windowMs has passed",
    "Limiters created separately never affect each other's count or window",
    "Each Retry handler returns the name of its own depot",
  ],
  hints: [
    "Ask of every variable in limits.js: who can see it, and how many copies of it exist?",
    "`used` and `windowStart` are declared once for the whole file. Variables declared inside `createRateLimiter` are created afresh on each call and stay reachable from the returned function.",
    "For the reset: on each call read `const t = now()`. If there is no window yet, or `t - windowStart >= windowMs`, start a new window at t with the count back at 0.",
    "In buildRetryHandlers, `var i` is one variable shared by all handlers. Change it to `let i` (or build the array with `depots.map((d) => () => \"Retrying \" + d)`).",
  ],
  questions: [
    {
      id: "predict-var-timeout",
      kind: "mcq",
      prompt: "What does this log?",
      code: `for (var n = 0; n < 3; n++) {
  setTimeout(() => console.log(n), 0);
}`,
      codeLanguage: "javascript",
      options: ["0 1 2", "3 3 3", "2 2 2", "undefined undefined undefined"],
      answer: 1,
      explanation: "There is a single function-scoped n. The callbacks run after the loop, when n is 3.",
    },
    {
      id: "explain-retry-undefined",
      kind: "explain",
      prompt: "Explain why every Retry handler returned \"Retrying undefined\", and why changing `var` to `let` fixes it.",
      concepts: [
        { label: "var creates one function-scoped variable shared by all handlers", anyOf: ["function-scoped", "function scoped", "one variable", "single variable", "shared", "same variable", "one i", "same i", "only one"] },
        { label: "handlers run after the loop, when i equals the array length", anyOf: ["after the loop", "loop finished", "loop has finished", "loop ended", "end of the loop", "equals the length", "is 3", "out of range", "past the end", "later"] },
        { label: "let gives each iteration its own binding", anyOf: ["re:\\blet\\b", "per iteration", "each iteration", "new binding", "block-scoped", "block scoped", "fresh", "own copy"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "With var there is only one function-scoped i shared by all three handlers. The handlers do not run until a button is clicked, which is after the loop finished, when i equals depots.length (3), so depots[3] is undefined. With let, each iteration gets its own block-scoped binding of i, so each handler closes over the value from its own iteration.",
      explanation: "Closures capture variables, not snapshots. The fix is to make sure there is a separate variable per handler.",
    },
  ],
  debrief: {
    solution: `**Rate limiter.** Moving \`used\` and \`windowStart\` inside \`createRateLimiter\` means each call creates a new pair. The returned \`tryRequest\` closes over that pair — nothing else can read or change it, which is exactly the isolation between panels we wanted. On each call it reads the injected clock, starts a new window when \`t - windowStart >= windowMs\`, and then applies the limit.

**Retry handlers.** \`for (let i …)\` creates a fresh \`i\` per iteration; \`depots.map((d) => () => "Retrying " + d)\` is an equally good alternative because each callback invocation of map has its own parameter \`d\`.`,
    commonMistakes: [
      "Resetting the count in a setInterval instead of comparing timestamps — it keeps running after the panel is gone and is hard to test.",
      "Making only the counter per-limiter while the window start stays shared at module level.",
      "Calling Date.now() directly instead of the injected now(), which makes the behaviour depend on real time and impossible to test deterministically.",
      "Fixing the var bug with an extra variable declared with var inside the loop — it is still a single function-scoped variable.",
    ],
    realWorld:
      "Factories with closures are how many libraries keep private state: debounce/throttle helpers, memoisation caches, and API clients that hold a token. Injecting a clock (or timer) is standard practice for testing anything time-based; test frameworks provide fake timers for the same reason.",
  },
  review: [
    {
      id: "js-closure-private-state",
      skill: "js.scope",
      variants: [
        {
          id: "js-closure-private-state-a",
          kind: "short",
          prompt: "What does the last line return?",
          code: `function makeCounter() {
  let n = 0;
  return () => ++n;
}
const a = makeCounter();
const b = makeCounter();
a(); a();
b();`,
          codeLanguage: "javascript",
          accept: ["1"],
          explanation: "Each makeCounter() call creates its own n. b has been called once, so it returns 1.",
        },
        {
          id: "js-closure-private-state-b",
          kind: "short",
          prompt: "What does the last line return?",
          code: `let n = 0;
function makeCounter() {
  return () => ++n;
}
const a = makeCounter();
const b = makeCounter();
a(); a();
b();`,
          codeLanguage: "javascript",
          accept: ["3"],
          explanation: "n is declared once at the top of the file, so a and b share it: 1, 2, then 3.",
        },
      ],
    },
    {
      id: "js-var-loop-capture",
      skill: "js.scope",
      variants: [
        {
          id: "js-var-loop-capture-a",
          kind: "mcq",
          prompt: "What does `fns[0]()` return?",
          code: `var fns = [];
for (var i = 0; i < 2; i++) fns.push(() => i);`,
          codeLanguage: "javascript",
          options: ["0", "1", "2", "undefined"],
          answer: 2,
          explanation: "All functions share the single var i, which is 2 after the loop.",
        },
        {
          id: "js-var-loop-capture-b",
          kind: "mcq",
          prompt: "What does `fns[0]()` return?",
          code: `const fns = [];
for (let i = 0; i < 2; i++) fns.push(() => i);`,
          codeLanguage: "javascript",
          options: ["0", "1", "2", "undefined"],
          answer: 0,
          explanation: "let creates a new i for each iteration, so the first function captured i = 0.",
        },
      ],
    },
    {
      id: "js-block-scope",
      skill: "js.scope",
      variants: [
        {
          id: "js-block-scope-a",
          kind: "mcq",
          prompt: "What happens on the last line?",
          code: `if (true) {
  let depot = "LDS";
}
console.log(depot);`,
          codeLanguage: "javascript",
          options: ["Logs \"LDS\"", "Logs undefined", "ReferenceError: depot is not defined", "Logs null"],
          answer: 2,
          explanation: "let is block-scoped: depot exists only inside the if block.",
        },
        {
          id: "js-block-scope-b",
          kind: "mcq",
          prompt: "What happens on the last line?",
          code: `if (true) {
  var depot = "LDS";
}
console.log(depot);`,
          codeLanguage: "javascript",
          options: ["Logs \"LDS\"", "Logs undefined", "ReferenceError: depot is not defined", "SyntaxError"],
          answer: 0,
          explanation: "var ignores blocks; it is scoped to the enclosing function (or file), so depot is visible after the if.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Aiko writes a memoised geocoder: `const cache = {}; function makeGeocoder(region) { return (postcode) => cache[postcode] ??= lookup(region, postcode); }`. The UK and Ireland geocoders now return each other's coordinates for postcodes that look alike.",
    question: {
      id: "transfer-shared-cache",
      kind: "mcq",
      prompt: "What is the fix?",
      options: [
        "Move `const cache = {}` inside makeGeocoder so each geocoder closes over its own cache",
        "Change const cache to let cache",
        "Clear the cache before every lookup",
        "Use var for the cache so it is function-scoped",
      ],
      answer: 0,
      explanation:
        "The cache is module-level, so all geocoders share it. Declaring it inside the factory gives each returned function private state, just like the rate limiter.",
    },
  },
  refresher: {
    body: `Every variable lives in a scope. Top-of-file variables are shared by everything in the file. Variables declared inside a function are created **each time the function runs**. If that function returns an inner function, the inner one keeps access to those variables — a closure — so each call of the outer "factory" produces something with its own private state. \`let\` and \`const\` also create a separate variable per loop iteration; \`var\` makes just one for the whole function.`,
    practice: {
      id: "refresher-closure",
      kind: "mcq",
      prompt: "Where should `count` be declared so that each `createTally()` result counts independently?",
      options: ["At the top of the file", "Inside createTally, before the returned function", "Inside the returned function", "As a global on window"],
      answer: 1,
      explanation: "Inside the factory, it is created once per createTally() call and shared only with that call's returned function. Inside the returned function it would reset on every call.",
    },
  },
};
