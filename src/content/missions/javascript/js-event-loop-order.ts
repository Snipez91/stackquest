import type { MissionInput } from "@/content/schema";

const F = "```";

const snippet = `// Simplified from dashboard/boot.js — what runs when the dispatch dashboard starts.
console.log("A: read config");

setTimeout(() => console.log("B: start polling timer"), 0);

Promise.resolve().then(() => console.log("C: apply cached settings"));

async function connect() {
  console.log("D: open socket");
  await null;
  console.log("E: socket ready");
}
connect();

console.log("F: first paint");
`;

const starter = `// Lumen Logistics — dashboard boot investigation.

// Part 1 — predict.
// Without running it, list the letters that snippets/boot-sequence.js logs, in order.
// Example format: ["A", "B", "C", "D", "E", "F"]
const predictedOrder = [];

// Part 2 — repair.
// The notice banner shows "Loading…" forever. getNotice() returns a promise for
// { text: "..." }. loadBanner(getNotice) must return a promise that resolves to the
// notice text, so the caller can do: loadBanner(api.getNotice).then(show)
let bannerText = "Loading…";

function loadBanner(getNotice) {
  getNotice().then((notice) => {
    bannerText = notice.text;
  });
  return bannerText;
}
`;

const solution = `// Lumen Logistics — dashboard boot investigation.

// Sync code first (A, D, F); then microtasks in the order they were queued:
// C (queued by .then before connect ran), then E (queued by await); then the timer B.
const predictedOrder = ["A", "D", "F", "C", "E", "B"];

async function loadBanner(getNotice) {
  const notice = await getNotice();
  return notice.text;
}
`;

const runSnippet = `const seen = [];
new Function("console", files["snippets/boot-sequence.js"])({ log: (...a) => seen.push(a.join(" ")) });
await new Promise((r) => setTimeout(r, 20));
const actual = seen.map((line) => line.charAt(0));
const predicted = Array.isArray(module.predictedOrder) ? module.predictedOrder.map((x) => String(x).trim().charAt(0).toUpperCase()) : [];`;

export const jsEventLoopOrder: MissionInput = {
  slug: "js-event-loop-order",
  version: 1,
  track: "javascript",
  tier: "intermediate",
  order: 3,
  title: "Predict the event loop and fix a banner stuck on Loading",
  summary:
    "Boot logs appear in a surprising order and the notice banner never updates. Predict sync, microtask and timer ordering, then return a promise instead of reading a value too early.",
  minutes: 30,
  assessmentTypes: ["interpret-output", "order-steps", "repair-code"],
  skills: ["js.async"],
  appliesSkills: ["js.functions", "js.scope"],
  prerequisites: ["js-dispatch-form-events"],
  brief: {
    from: "Aiko Tanaka, frontend engineer",
    channel: "#dispatch-dashboard",
    body: `Two related mysteries from the dashboard boot sequence.

First, Sam asked in the architecture review why "first paint" is logged **before** "apply cached settings", even though the settings line comes first in the file. I need to explain the order confidently — please predict exactly what \`snippets/boot-sequence.js\` logs and put the letters in \`predictedOrder\` in \`banner.js\`. Work it out before running anything.

Second, the depot notice banner at the top of the dashboard shows **"Loading…" forever**, even though the network tab shows the notice arriving. \`loadBanner\` is in the same file. The caller does \`loadBanner(api.getNotice).then(show)\`, so it needs to get a promise of the text back.`,
  },
  objectives: [
    "Predict the order of synchronous code, promise callbacks and timer callbacks",
    "Explain why code after await runs later, as a microtask",
    "Recognise reading an asynchronous result too early, and fix it by returning a promise",
  ],
  concept: {
    title: "One thread, a call stack, and two queues",
    body: `JavaScript runs your code on **one thread**. A script runs **to completion** — nothing else interrupts it. Work that should happen later is queued:

- **Microtasks**: promise reactions (\`.then\` callbacks) and the code after \`await\`. They run as soon as the current code finishes, **all of them**, in the order they were queued — including any queued while draining.
- **Macrotasks (tasks)**: timers (\`setTimeout\`), events, network callbacks. The loop takes **one** task, runs it, then drains microtasks again.

So the order is always: current synchronous code → every microtask → next timer.

${F}js
setTimeout(() => console.log("timer"), 0);
Promise.resolve().then(() => console.log("micro"));
console.log("sync");
// sync, micro, timer — a 0 ms timer still waits for the queue
${F}

An \`async\` function runs **synchronously until its first \`await\`**. At \`await\`, it pauses and the rest of the function is queued as a microtask once the awaited value is ready; control returns to the caller immediately.

That pause is why reading a variable assigned in a \`.then\` callback, right after starting the request, gives the old value: the callback has not run yet. The fix is not a delay — it is to **return the promise** (or make the function \`async\` and \`return\` after \`await\`) so callers wait for the real value.`,
  },
  workedExample: {
    title: "Worked example: tracing a toast notification",
    body: `${F}js
console.log("1 click");
setTimeout(() => console.log("2 hide toast"), 0);
fetchStub().then(() => console.log("3 saved"));   // fetchStub returns Promise.resolve()
(async () => {
  console.log("4 show spinner");
  await fetchStub();
  console.log("5 spinner off");
})();
console.log("6 handler done");
${F}

**Pass 1 — synchronous code, top to bottom.** Log 1. Queue the timer (task). \`fetchStub()\` returns a resolved promise; \`.then\` queues "3" (microtask #1). The async arrow runs immediately: log 4, then \`await\` pauses it and queues the rest (microtask #2). Log 6.

**Pass 2 — drain microtasks in queue order.** "3 saved", then "5 spinner off".

**Pass 3 — next task.** "2 hide toast".

Result: **1, 4, 6, 3, 5, 2**. The rule that settles ties: microtasks run in the order they were *queued*, which follows the order the synchronous code reached them.`,
  },
  workspace: {
    kind: "javascript",
    entry: "banner.js",
    exports: ["predictedOrder", "loadBanner"],
    files: [
      { path: "banner.js", content: starter, editable: true },
      { path: "snippets/boot-sequence.js", content: snippet, editable: false },
    ],
    tests: [
      {
        id: "prediction-shape",
        name: "predictedOrder lists each of the six letters once",
        code: `const p = module.predictedOrder;
assert(Array.isArray(p), "predictedOrder should be an array");
const letters = p.map((x) => String(x).trim().charAt(0).toUpperCase());
assertEqual(letters.length, 6, "the snippet logs 6 lines; predictedOrder has " + letters.length + " entries");
assertDeepEqual([...letters].sort(), ["A", "B", "C", "D", "E", "F"], "use each letter A–F exactly once");`,
        feedback: {
          what: "predictedOrder is not a list of the six letters A–F, each used once.",
          why: "Every console.log in the snippet runs exactly once; the question is only when.",
          next: "Fill the array with the letters in the order you predict, for example [\"A\", …].",
        },
      },
      {
        id: "prediction-correct",
        name: "predictedOrder matches what the snippet actually logs",
        code: `${runSnippet}
assertDeepEqual(predicted, actual, "your prediction " + JSON.stringify(predicted) + " differs from the real order");`,
        feedback: {
          what: "Your predicted order differs from the order the snippet really logs.",
          why: "Microtasks (then callbacks and code after await) always run before the next timer, and in the order they were queued.",
          next: "Do three passes: the synchronous lines in order (remember connect() runs until its await), then microtasks in the order they were queued, then the timer.",
        },
      },
      {
        id: "banner-resolves-text",
        name: "loadBanner returns a promise of the notice text",
        code: `const result = module.loadBanner(() => Promise.resolve({ text: "Depot 4 closes at 18:00 today" }));
assert(result && typeof result.then === "function", "loadBanner should return a promise, got " + JSON.stringify(result));
assertEqual(await result, "Depot 4 closes at 18:00 today", "the promise should resolve to the notice text");`,
        feedback: {
          what: "loadBanner returned a plain value (\"Loading…\") or a promise that did not resolve to the notice text.",
          why: "The return statement runs before the then callback, so the function hands back the old value; callers need something they can wait on.",
          next: "Make loadBanner async, await getNotice(), and return notice.text — or return getNotice().then((n) => n.text).",
        },
      },
      {
        id: "banner-slow-notice",
        name: "loadBanner waits for a slow notice",
        hidden: true,
        code: `const slow = () => new Promise((resolve) => setTimeout(() => resolve({ text: "Snow plan active in MAN" }), 15));
assertEqual(await module.loadBanner(slow), "Snow plan active in MAN", "loadBanner should resolve only once the slow notice arrives");`,
        feedback: {
          what: "With a notice that arrives after a delay, loadBanner resolved to the wrong text.",
          why: "Real network responses arrive after timers and other events; the promise must follow the actual response.",
          next: "Do not read a shared variable — return the value derived from the awaited notice itself.",
        },
      },
    ],
    solution: { "banner.js": solution },
    wrongSolutions: [
      {
        label: "predicts all synchronous lines, then callbacks in source order",
        files: {
          "banner.js": `const predictedOrder = ["A", "D", "F", "B", "C", "E"];
async function loadBanner(getNotice) {
  const notice = await getNotice();
  return notice.text;
}
`,
        },
      },
      {
        label: "predicts the await continuation before the earlier then callback",
        files: {
          "banner.js": `const predictedOrder = ["A", "D", "F", "E", "C", "B"];
async function loadBanner(getNotice) {
  const notice = await getNotice();
  return notice.text;
}
`,
        },
      },
      {
        label: "marks loadBanner async but still returns the shared variable",
        files: {
          "banner.js": `const predictedOrder = ["A", "D", "F", "C", "E", "B"];
let bannerText = "Loading…";
async function loadBanner(getNotice) {
  getNotice().then((notice) => { bannerText = notice.text; });
  return bannerText;
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "predictedOrder matches the real log order of the boot snippet",
    "loadBanner returns a promise that resolves to the notice text, however long the notice takes",
  ],
  hints: [
    "Sort every line of the snippet into one of three groups: runs now, runs as a microtask, runs as a timer task.",
    "connect() is called synchronously, and an async function runs normally until its first await. Microtasks run in the order they were queued.",
    "C is queued when the .then line runs; E is queued when connect() reaches await — which happens later in the script. All microtasks run before any timer.",
    "For the banner: `async function loadBanner(getNotice) { const notice = await getNotice(); return notice.text; }` — the async function's return value becomes the promise's resolved value.",
  ],
  questions: [
    {
      id: "order-event-loop",
      kind: "order",
      prompt: "Order what the JavaScript engine does after a script that schedules a setTimeout(…, 0) and a Promise.then.",
      items: [
        "Run the rest of the script's synchronous code to completion",
        "Run every queued microtask, including the then callback",
        "Take the next macrotask: the timer callback",
        "Run any microtasks the timer callback queued",
      ],
      explanation: "The loop alternates: one task, then drain all microtasks. The script itself is the first task.",
    },
    {
      id: "predict-await-order",
      kind: "mcq",
      prompt: "What does this log?",
      code: `async function save() {
  console.log("1");
  await null;
  console.log("2");
}
save();
console.log("3");`,
      codeLanguage: "javascript",
      options: ["1 2 3", "1 3 2", "3 1 2", "2 1 3"],
      answer: 1,
      explanation: "save runs synchronously until await (logs 1), returns to the caller (logs 3), and the continuation (2) runs as a microtask.",
    },
    {
      id: "explain-banner-loading",
      kind: "explain",
      prompt: "Explain why the original loadBanner always returned \"Loading…\", and why returning a promise fixes it.",
      concepts: [
        { label: "the then callback runs later, asynchronously", anyOf: ["later", "asynchronous", "asynchronously", "microtask", "callback runs after", "not yet", "has not run", "hasn't run"] },
        { label: "the function returned before the notice arrived", anyOf: ["before", "returned immediately", "returns immediately", "synchronously", "already returned"] },
        { label: "returning a promise / awaiting lets the caller wait for the real value", anyOf: ["await", "return the promise", "returns a promise", "return a promise", "promise of", "resolves to", "wait"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "getNotice() returns a promise, and the then callback that sets bannerText runs later as a microtask, after the current function has finished. The return statement runs synchronously, before the notice arrived, so it always returned the old value \"Loading…\". Making loadBanner async and returning notice.text after await means it returns a promise that resolves to the real text, so the caller can wait for it with then or await.",
      explanation: "You cannot pull an asynchronous value out early; you pass the promise along until something can wait for it.",
    },
  ],
  debrief: {
    solution: `**Prediction: A, D, F, C, E, B.**

1. Synchronous pass: A logs; the timer (B) is queued as a task; \`.then\` queues C as microtask #1; \`connect()\` runs, logs D, and at \`await null\` queues its continuation (E) as microtask #2 and returns; F logs.
2. Microtasks, in queue order: C, then E.
3. Next task: the timer, B.

**Banner.** \`return bannerText\` ran before the \`then\` callback could, every time. The fix returns a promise of the text:

${F}js
async function loadBanner(getNotice) {
  const notice = await getNotice();
  return notice.text;
}
${F}

No shared variable is needed, so concurrent calls cannot overwrite each other either.`,
    commonMistakes: [
      "Assuming setTimeout(fn, 0) runs \"immediately\" — it always waits for the current code and all microtasks.",
      "Thinking an async function runs entirely in the background; it runs synchronously up to the first await.",
      "Adding async to a function but still returning a variable set inside a then callback.",
      "\"Fixing\" a read-too-early bug with a setTimeout delay, which only hides the race until the network is slower.",
    ],
    realWorld:
      "Ordering bugs like the banner are common in UI code: state read before a fetch completes, analytics fired before a save. Knowing that microtasks drain before timers also explains why UI updates batched in promises appear together, and why a long synchronous loop freezes the page — nothing else can run until it finishes.",
  },
  review: [
    {
      id: "js-microtask-before-timer",
      skill: "js.async",
      variants: [
        {
          id: "js-microtask-before-timer-a",
          kind: "mcq",
          prompt: "What does this log?",
          code: `setTimeout(() => console.log("T"), 0);
Promise.resolve().then(() => console.log("P"));
console.log("S");`,
          codeLanguage: "javascript",
          options: ["T P S", "S T P", "S P T", "P S T"],
          answer: 2,
          explanation: "Synchronous code first, then microtasks (P), then the timer (T).",
        },
        {
          id: "js-microtask-before-timer-b",
          kind: "mcq",
          prompt: "What does this log?",
          code: `console.log("x");
Promise.resolve().then(() => console.log("y"));
setTimeout(() => console.log("z"), 0);`,
          codeLanguage: "javascript",
          options: ["x y z", "x z y", "y x z", "z y x"],
          answer: 0,
          explanation: "x is synchronous; y is a microtask and runs before the timer z regardless of the order they were written.",
        },
      ],
    },
    {
      id: "js-await-continuation",
      skill: "js.async",
      variants: [
        {
          id: "js-await-continuation-a",
          kind: "mcq",
          prompt: "What does this log?",
          code: `async function load() {
  console.log("a");
  await null;
  console.log("b");
}
load();
console.log("c");`,
          codeLanguage: "javascript",
          options: ["a b c", "a c b", "c a b", "b a c"],
          answer: 1,
          explanation: "The async function runs until await, returns to the caller, and resumes as a microtask.",
        },
        {
          id: "js-await-continuation-b",
          kind: "mcq",
          prompt: "What does this log?",
          code: `async function sync() {
  console.log("start");
  await Promise.resolve();
  console.log("end");
}
console.log("before");
sync();
console.log("after");`,
          codeLanguage: "javascript",
          options: ["before start end after", "before start after end", "start before after end", "before after start end"],
          answer: 1,
          explanation: "\"start\" logs as soon as sync() is called; the continuation \"end\" waits until the synchronous \"after\" has run.",
        },
      ],
    },
    {
      id: "js-return-the-promise",
      skill: "js.async",
      variants: [
        {
          id: "js-return-the-promise-a",
          kind: "mcq",
          prompt: "`function getEta() { let eta; api.eta().then((v) => { eta = v; }); return eta; }` — what does `getEta()` return?",
          options: ["The ETA", "undefined", "A promise of the ETA", "null"],
          answer: 1,
          explanation: "return runs before the then callback, so eta is still undefined.",
        },
        {
          id: "js-return-the-promise-b",
          kind: "mcq",
          prompt: "Which version lets callers get the driver's name with `await getDriverName()`?",
          options: [
            "function getDriverName() { let n; api.driver().then((d) => (n = d.name)); return n; }",
            "async function getDriverName() { const d = await api.driver(); return d.name; }",
            "function getDriverName() { setTimeout(() => api.driver(), 0); }",
            "async function getDriverName() { api.driver(); return \"\"; }",
          ],
          answer: 1,
          explanation: "The async function returns a promise that resolves to d.name once the driver data has arrived.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "In the parcel scanner app, Dev sees `scanned` logged as 0 even though three scans were saved: `let scanned = 0; for (const code of codes) saveScan(code).then(() => scanned++); console.log(\"scanned\", scanned);`. saveScan returns a promise.",
    question: {
      id: "transfer-count-too-early",
      kind: "mcq",
      prompt: "Why is 0 logged, and what is a correct fix?",
      options: [
        "The then callbacks run after the synchronous log; collect the promises and log after `await Promise.all(codes.map(saveScan))`",
        "scanned is block-scoped to the loop; declare it with var",
        "The promises are rejected silently; add setTimeout(…, 0) before logging",
        "++ does not work inside arrow functions; use scanned = scanned + 1",
      ],
      answer: 0,
      explanation:
        "The log runs in the synchronous pass, before any then callback. Waiting for all the promises (covered in depth in the next mission) gives the real count.",
    },
  },
  refresher: {
    body: `JavaScript does one thing at a time. First it finishes the code that is running now. Then it runs every **microtask** — promise \`.then\` callbacks and code after \`await\` — in the order they were queued. Only then does it take the next **task**, such as a \`setTimeout\` callback, even one with a 0 ms delay. So any value set inside a \`.then\` is not ready on the next line; return the promise (or \`await\` it inside an async function) instead.`,
    practice: {
      id: "refresher-zero-timeout",
      kind: "mcq",
      prompt: "`setTimeout(() => console.log(\"later\"), 0); console.log(\"now\");` — what is logged first?",
      options: ["now", "later", "It depends on the browser", "Both at the same time"],
      answer: 0,
      explanation: "Timers wait for the current synchronous code to finish, so \"now\" always logs first.",
    },
  },
};
