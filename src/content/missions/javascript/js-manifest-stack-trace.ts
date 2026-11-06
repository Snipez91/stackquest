import type { MissionInput } from "@/content/schema";

const F = "```";

const starter = `// Lumen Logistics — driver run sheet: one-line summary printed at the top of each sheet.
// Called by run-sheet.js as: header.textContent = renderManifest(manifest)
// Expected format: "ANA COSTA: 3 stops, 7 parcels". Fixtures: fixtures/manifests.json

function summariseManifest(manifest) {
  const stops = manifest.stops;
  let parcels = 0;
  for (let i = 0; i <= stops.length; i++) {
    parcels += stops[i].parcels.length;
  }
  return {
    driver: manifest.driver.name.toUpperCase(),
    stops: stops.length,
    parcels,
  };
}

function renderManifest(manifest) {
  const s = summariseManifest(manifest);
  return s.driver + ": " + s.stops + " stops, " + s.parcels + " parcels";
}
`;

const consoleLog = `# Browser console export — run sheet printer page, depot LDS, 5 Nov 2026 (exported by Aiko)
[06:02:14.511] GET /api/manifests/M-2207 200 (44 ms)
[06:02:14.517] Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'parcels')
    at summariseManifest (manifest.js:9:25)
    at renderManifest (manifest.js:19:13)
    at showManifest (run-sheet.js:22:31)
    at async printQueue (run-sheet.js:48:7)
[06:02:31.090] [debug] M-2207 stops.length = 3; loop reached i = 3
[06:05:47.203] GET /api/manifests/M-2210 200 (39 ms)
[06:05:47.206] Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'length')
    at summariseManifest (manifest.js:8:29)
    at renderManifest (manifest.js:19:13)
    at showManifest (run-sheet.js:22:31)
    at async printQueue (run-sheet.js:48:7)
[06:05:47.207] [debug] M-2210 status = "draft"; keys = id, status, driver (no "stops")
[06:09:02.664] GET /api/manifests/M-2214 200 (41 ms)
[06:09:02.668] Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'parcels')
    at summariseManifest (manifest.js:9:25)
    at renderManifest (manifest.js:19:13)
    at showManifest (run-sheet.js:22:31)
    at async printQueue (run-sheet.js:48:7)
[06:09:02.669] [debug] M-2214 status = "unassigned"
`;

const manifestsJson = `{
  "M-2207": {
    "id": "M-2207",
    "status": "ready",
    "driver": { "name": "Ana Costa" },
    "stops": [
      { "id": "S1", "parcels": ["P-101", "P-102"] },
      { "id": "S2", "parcels": ["P-103"] },
      { "id": "S3", "parcels": ["P-104", "P-105", "P-106", "P-107"] }
    ]
  },
  "M-2210": {
    "id": "M-2210",
    "status": "draft",
    "driver": { "name": "Ben Okoro" }
  },
  "M-2214": {
    "id": "M-2214",
    "status": "unassigned",
    "driver": null,
    "stops": [
      { "id": "S1", "parcels": ["P-201"] },
      { "id": "S2", "parcels": [] }
    ]
  }
}
`;

const solution = `// Lumen Logistics — driver run sheet: one-line summary printed at the top of each sheet.
// Called by run-sheet.js as: header.textContent = renderManifest(manifest)

function summariseManifest(manifest) {
  const stops = manifest.stops ?? []; // drafts have no stops yet
  let parcels = 0;
  for (let i = 0; i < stops.length; i++) { // valid indexes are 0 .. length - 1
    parcels += stops[i].parcels.length;
  }
  return {
    driver: manifest.driver?.name.toUpperCase() ?? "UNASSIGNED", // unassigned manifests have driver: null
    stops: stops.length,
    parcels,
  };
}

function renderManifest(manifest) {
  const s = summariseManifest(manifest);
  return s.driver + ": " + s.stops + " stops, " + s.parcels + " parcels";
}
`;

const load = `const fixtures = JSON.parse(files["fixtures/manifests.json"]);`;

export const jsManifestStackTrace: MissionInput = {
  slug: "js-manifest-stack-trace",
  version: 1,
  track: "javascript",
  tier: "advanced",
  order: 4,
  title: "Debug the run sheet from a stack trace",
  summary:
    "Run sheets stopped printing at 06:02. Use the exported console log and stack traces to locate the failing lines, reproduce with fixtures, and fix the root causes without hiding errors.",
  minutes: 35,
  assessmentTypes: ["investigate-logs", "repair-code", "explain-root-cause", "order-steps"],
  skills: ["js.debugging"],
  appliesSkills: ["js.arrays", "js.objects", "js.error-handling"],
  prerequisites: ["js-dispatch-error-states"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `INC-2317, sev 2: no run sheets have printed at the Leeds depot since 06:02. Drivers are leaving with hand-written lists. The change that went out last night refactored \`manifest.js\`.

Aiko exported the printer page's console (\`logs/run-sheet-console.log\`) and saved the three manifests involved in \`fixtures/manifests.json\`. Ops also tell me two manifests are special cases: **drafts** have no stops yet and should print \`0 stops, 0 parcels\`, and **unassigned** manifests have \`driver: null\` and should print \`UNASSIGNED\` as the driver name.

Please find the root cause from the traces and fix \`manifest.js\`. Do not just wrap it in try/catch — a sheet that prints "unavailable" is as useless to a driver as no sheet.`,
  },
  objectives: [
    "Read a stack trace: error type, message, top frame (file:line:column) and the call path",
    "Use the error message to identify which value was undefined and why",
    "Reproduce each failure with the saved fixture before changing code",
    "Fix root causes (an off-by-one bound and missing-data cases) instead of suppressing the error",
    "Re-test against all fixtures, since fixing one failure can reveal the next",
  ],
  concept: {
    title: "A stack trace is a map: what failed, where, and how you got there",
    body: `A stack trace has three parts:

${F}text
TypeError: Cannot read properties of undefined (reading 'parcels')   <- what
    at summariseManifest (manifest.js:9:25)                          <- where it threw
    at renderManifest (manifest.js:19:13)                            <- who called it
    at showManifest (run-sheet.js:22:31)                             <- …and so on, outward
${F}

**What:** \`Cannot read properties of undefined (reading 'parcels')\` means the expression *before* \`.parcels\` evaluated to \`undefined\`. The message names the property you tried to read, not the variable that was undefined — so on line 9, look at what precedes \`.parcels\`.

**Where:** the **top frame** is where the exception was thrown (\`file:line:column\`). Lower frames are callers; they tell you which input reached the failing line.

**Then reason:** why would that value be undefined *for this input*? Common causes: an index past the end of an array (arrays run from \`0\` to \`length - 1\`), a field that the API omits for some records, or \`null\` used to mean "none".

A disciplined loop: **read the trace → reproduce with the failing input → form a hypothesis → fix the cause → re-run every known case.** Wrapping the call in \`try/catch\` and returning a placeholder makes the trace disappear but leaves the bug — and the business impact — in place.`,
  },
  workedExample: {
    title: "Worked example: a crashing invoice footer",
    body: `Trace from the billing page:

${F}text
TypeError: Cannot read properties of null (reading 'toFixed')
    at formatTotal (invoice.js:14:22)
    at renderFooter (invoice.js:31:10)
${F}

**1. What and where.** Line 14 of invoice.js is \`return "£" + invoice.discount.toFixed(2);\`. The value before \`.toFixed\` — \`invoice.discount\` — was \`null\` (the message says *null*, not undefined).

**2. Reproduce.** The failing invoice in the API response has \`"discount": null\`; most invoices have \`"discount": 0\`. Calling \`formatTotal\` with that record reproduces the error locally.

**3. Hypothesis.** The API uses \`null\` for "no discount". Confirm with the API docs or the backend team — it is a data contract question, not a guess.

**4. Fix the cause.**

${F}js
const discount = invoice.discount ?? 0;
return "£" + discount.toFixed(2);
${F}

**5. Re-run all cases:** discount 0, a real discount, and null. A try/catch returning \`"£—"\` would have hidden the crash and printed wrong invoices.`,
  },
  workspace: {
    kind: "javascript",
    entry: "manifest.js",
    exports: ["renderManifest", "summariseManifest"],
    files: [
      { path: "manifest.js", content: starter, editable: true },
      { path: "logs/run-sheet-console.log", content: consoleLog, editable: false },
      { path: "fixtures/manifests.json", content: manifestsJson, editable: false },
    ],
    tests: [
      {
        id: "ready-manifest",
        name: "A normal manifest (M-2207) renders its summary",
        code: `${load}
let got;
try { got = module.renderManifest(fixtures["M-2207"]); } catch (e) { throw new Error("renderManifest(M-2207) still throws " + e.name + ": " + e.message); }
assertEqual(got, "ANA COSTA: 3 stops, 7 parcels");`,
        feedback: {
          what: "M-2207 still throws, or its summary is not \"ANA COSTA: 3 stops, 7 parcels\".",
          why: "The trace shows stops[i] was undefined on line 9, and the debug line shows the loop reached i = 3 for 3 stops.",
          next: "Look at the loop condition on line 8: the last valid index of an array is length - 1.",
        },
      },
      {
        id: "last-stop-counted",
        name: "Parcels on the last stop are counted",
        code: `const manifest = { id: "M-T1", status: "ready", driver: { name: "Chen Wu" }, stops: [{ id: "S1", parcels: ["A"] }, { id: "S2", parcels: ["B", "C", "D"] }] };
assertEqual(module.renderManifest(manifest), "CHEN WU: 2 stops, 4 parcels", "all parcels, including the last stop's, should be counted");`,
        feedback: {
          what: "The parcel count is too low: the last stop's parcels were not counted.",
          why: "Changing the bound to length - 1 with < skips the final stop — a quieter off-by-one that loads vans with uncounted parcels.",
          next: "Use i < stops.length (or for...of / reduce over stops).",
        },
      },
      {
        id: "draft-manifest",
        name: "A draft manifest with no stops (M-2210) renders 0 stops, 0 parcels",
        code: `${load}
let got;
try { got = module.renderManifest(fixtures["M-2210"]); } catch (e) { throw new Error("renderManifest(M-2210) throws " + e.name + ": " + e.message); }
assertEqual(got, "BEN OKORO: 0 stops, 0 parcels");`,
        feedback: {
          what: "The draft manifest still throws (reading 'length') or renders the wrong summary.",
          why: "The second trace points at line 8: manifest.stops is undefined because drafts have no stops key.",
          next: "Default missing stops to an empty array (manifest.stops ?? []) before the loop.",
        },
      },
      {
        id: "unassigned-manifest",
        name: "An unassigned manifest (M-2214) shows UNASSIGNED",
        hidden: true,
        code: `${load}
let got;
try { got = module.renderManifest(fixtures["M-2214"]); } catch (e) { throw new Error("renderManifest(M-2214) throws " + e.name + ": " + e.message); }
assertEqual(got, "UNASSIGNED: 2 stops, 1 parcels");`,
        feedback: {
          what: "M-2214 throws (reading 'name') or does not show UNASSIGNED.",
          why: "Once the loop is fixed, the next line to run reads manifest.driver.name — and driver is null for unassigned manifests. Fixing one bug revealed the next.",
          next: "Re-run every fixture after each fix. Use manifest.driver?.name and fall back to \"UNASSIGNED\".",
        },
      },
    ],
    solution: { "manifest.js": solution },
    wrongSolutions: [
      {
        label: "wraps the work in try/catch and returns a placeholder",
        files: {
          "manifest.js": `function summariseManifest(manifest) {
  const stops = manifest.stops;
  let parcels = 0;
  for (let i = 0; i <= stops.length; i++) parcels += stops[i].parcels.length;
  return { driver: manifest.driver.name.toUpperCase(), stops: stops.length, parcels };
}
function renderManifest(manifest) {
  try {
    const s = summariseManifest(manifest);
    return s.driver + ": " + s.stops + " stops, " + s.parcels + " parcels";
  } catch (e) {
    return "Manifest unavailable";
  }
}
`,
        },
      },
      {
        label: "changes the bound to i < stops.length - 1",
        files: {
          "manifest.js": `function summariseManifest(manifest) {
  const stops = manifest.stops ?? [];
  let parcels = 0;
  for (let i = 0; i < stops.length - 1; i++) parcels += stops[i].parcels.length;
  return { driver: manifest.driver?.name.toUpperCase() ?? "UNASSIGNED", stops: stops.length, parcels };
}
function renderManifest(manifest) {
  const s = summariseManifest(manifest);
  return s.driver + ": " + s.stops + " stops, " + s.parcels + " parcels";
}
`,
        },
      },
      {
        label: "fixes the loop and drafts, but not the unassigned driver",
        files: {
          "manifest.js": `function summariseManifest(manifest) {
  const stops = manifest.stops ?? [];
  let parcels = 0;
  for (const stop of stops) parcels += stop.parcels.length;
  return { driver: manifest.driver.name.toUpperCase(), stops: stops.length, parcels };
}
function renderManifest(manifest) {
  const s = summariseManifest(manifest);
  return s.driver + ": " + s.stops + " stops, " + s.parcels + " parcels";
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "M-2207 renders \"ANA COSTA: 3 stops, 7 parcels\" and every stop's parcels are counted",
    "Draft manifests without stops render 0 stops, 0 parcels",
    "Unassigned manifests (driver: null) render UNASSIGNED as the driver",
    "Errors are fixed at their cause, not hidden behind a placeholder",
  ],
  hints: [
    "Open logs/run-sheet-console.log. For each trace, note the message and the top frame's line number, then find that line in manifest.js.",
    "\"reading 'parcels'\" on line 9 means stops[i] was undefined. The debug line says the loop reached i = 3 when there are 3 stops. Which indexes does a 3-element array have?",
    "The second trace fails on line 8 reading 'length': for drafts, manifest.stops itself is undefined. After fixing both, run M-2214 too — a new line will fail.",
    "Change the loop to `i < stops.length`, default `const stops = manifest.stops ?? []`, and use `manifest.driver?.name.toUpperCase() ?? \"UNASSIGNED\"`.",
  ],
  questions: [
    {
      id: "read-top-frame",
      kind: "mcq",
      prompt: "For the M-2207 trace, which statement is correct?",
      options: [
        "The error was thrown on line 9 of manifest.js because the value before .parcels (stops[i]) was undefined",
        "The error was thrown in run-sheet.js line 22, which passed an undefined manifest",
        "The parcels property of a stop was undefined",
        "The fetch for M-2207 failed",
      ],
      answer: 0,
      explanation:
        "The top frame is where it threw. \"reading 'parcels'\" names the property being read, so the undefined value was the expression before it. The GET line shows the fetch succeeded with 200.",
    },
    {
      id: "read-caller",
      kind: "short",
      prompt: "In the M-2207 trace, which function called summariseManifest? (Function name only.)",
      accept: ["renderManifest", "renderManifest()"],
      explanation: "The frame directly below the top one is the caller: renderManifest (manifest.js:19).",
    },
    {
      id: "order-debugging",
      kind: "order",
      prompt: "Put these debugging steps in a sensible order.",
      items: [
        "Read the error message and the top stack frame",
        "Open the file at that line and identify which value was undefined",
        "Reproduce the failure with the saved fixture",
        "Fix the root cause in the code",
        "Re-run every fixture, including drafts and unassigned manifests",
      ],
      explanation: "Locate, understand, reproduce, fix, then re-test everything — fixes often expose the next failure.",
    },
    {
      id: "explain-off-by-one",
      kind: "explain",
      prompt: "Explain to Sam why M-2207, a perfectly normal manifest, crashed the run sheet.",
      concepts: [
        { label: "the loop ran one step too far (off-by-one)", anyOf: ["off-by-one", "off by one", "one too many", "one extra", "too far", "less than or equal", "loop condition", "loop bound"] },
        { label: "array indexes stop at length - 1, so index 3 does not exist", anyOf: ["zero-indexed", "zero indexed", "index 3", "last index", "length - 1", "length-1", "past the end", "out of range", "does not exist", "doesn't exist"] },
        { label: "stops[3] is undefined, and reading .parcels of undefined throws", anyOf: ["undefined", "typeerror", "throws", "threw"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "The refactor changed the loop condition to i <= stops.length, an off-by-one: with 3 stops the loop also ran with i = 3. Array indexes are zero-indexed and stop at length - 1, so index 3 does not exist and stops[3] is undefined. Reading .parcels of undefined throws a TypeError, which stopped the whole print queue. The fix is i < stops.length.",
      explanation: "Off-by-one bounds are among the most common loop bugs; the debug line i = 3 with length 3 is the giveaway.",
    },
  ],
  debrief: {
    solution: `Three separate causes, found in order:

1. **Off-by-one (M-2207, line 9).** \`i <= stops.length\` reads \`stops[stops.length]\`, which is undefined. Fixed with \`i < stops.length\` (a \`for...of\` loop avoids the index entirely).
2. **Missing data (M-2210, line 8).** Drafts have no \`stops\` key, so \`stops.length\` throws. \`manifest.stops ?? []\` gives an empty list.
3. **Null as "none" (M-2214, line 12).** Hidden until (1) was fixed: \`manifest.driver.name\` throws when driver is null. \`manifest.driver?.name.toUpperCase() ?? "UNASSIGNED"\` handles it.

The traces told us the line and the property; the fixtures let us reproduce each one; re-running all fixtures exposed the third bug before drivers did.`,
    commonMistakes: [
      "Assuming the undefined thing is the property named in the message — \"reading 'parcels'\" means the value before .parcels was undefined.",
      "Changing the bound to i < stops.length - 1, which stops the crash but silently skips the last stop's parcels.",
      "Wrapping everything in try/catch, which hides the trace and still produces a useless sheet.",
      "Stopping after the first fix without re-running the other fixtures.",
    ],
    realWorld:
      "Production traces usually come from error monitoring (Sentry and similar) with source maps translating minified line numbers back to your code. The workflow is the same: top frame, message, failing input, minimal reproduction, root-cause fix, and a regression test — here, the fixtures become permanent test cases.",
  },
  review: [
    {
      id: "js-read-stack-trace",
      skill: "js.debugging",
      variants: [
        {
          id: "js-read-stack-trace-a",
          kind: "mcq",
          prompt: "Which frame shows where this error was thrown?",
          code: `TypeError: Cannot read properties of undefined (reading 'eta')
    at formatRow (table.js:41:30)
    at renderTable (table.js:12:9)
    at refresh (dashboard.js:88:5)`,
          codeLanguage: "text",
          options: ["formatRow (table.js:41:30)", "renderTable (table.js:12:9)", "refresh (dashboard.js:88:5)", "It cannot be determined from a trace"],
          answer: 0,
          explanation: "The first frame under the message is where the exception was thrown; the rest are its callers.",
        },
        {
          id: "js-read-stack-trace-b",
          kind: "mcq",
          prompt: "Which frame shows where this error was thrown?",
          code: `TypeError: Cannot read properties of null (reading 'id')
    at depotLabel (labels.js:7:18)
    at printBatch (printer.js:55:21)
    at onClick (printer.js:90:3)`,
          codeLanguage: "text",
          options: ["onClick (printer.js:90:3)", "printBatch (printer.js:55:21)", "depotLabel (labels.js:7:18)", "The last frame is always the origin"],
          answer: 2,
          explanation: "The top frame, depotLabel at labels.js line 7, is where the null value was read.",
        },
      ],
    },
    {
      id: "js-undefined-before-property",
      skill: "js.debugging",
      variants: [
        {
          id: "js-undefined-before-property-a",
          kind: "mcq",
          prompt: "Line 20 is `return order.customer.address.city;` and it throws \"Cannot read properties of undefined (reading 'city')\". What was undefined?",
          options: ["city", "order.customer.address", "order", "order.customer.address.city"],
          answer: 1,
          explanation: "The message names the property being read (city); the value it was read from — order.customer.address — was undefined.",
        },
        {
          id: "js-undefined-before-property-b",
          kind: "mcq",
          prompt: "Line 5 is `total += items[i].qty;` and it throws \"Cannot read properties of undefined (reading 'qty')\". What is the most likely cause?",
          options: [
            "qty is missing from an item",
            "items[i] is undefined, often because i went past the last index",
            "total is not a number",
            "items is a string",
          ],
          answer: 1,
          explanation: "The undefined value is items[i]. An index equal to items.length is the classic cause.",
        },
      ],
    },
    {
      id: "js-fix-not-suppress",
      skill: "js.debugging",
      variants: [
        {
          id: "js-fix-not-suppress-a",
          kind: "mcq",
          prompt: "A label printer crashes on one manifest. Which response is best?",
          options: [
            "Wrap the printing code in try/catch and print \"N/A\" on failure",
            "Reproduce with that manifest, find which value is missing and why, fix the handling, and add the manifest as a test case",
            "Restart the printer service",
            "Delete the manifest",
          ],
          answer: 1,
          explanation: "Suppressing the error leaves wrong output and hides the cause; reproduce, fix, and lock it in with a test.",
        },
        {
          id: "js-fix-not-suppress-b",
          kind: "mcq",
          prompt: "After fixing a crash, what should you do before closing the incident?",
          options: [
            "Nothing — the stack trace is gone",
            "Re-run all known failing and normal inputs, since another bug may have been hidden behind the first",
            "Lower the log level so similar errors are quieter",
            "Ask users to reload",
          ],
          answer: 1,
          explanation: "One exception stops execution, so later bugs on the same path stay invisible until the first is fixed.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev's DNS report script on ops-ws fails with: `TypeError: Cannot read properties of undefined (reading 'ttl')` at `formatRecord (report.js:27:40)` ← `buildReport (report.js:61:18)`. Line 27 is `return name + \" \" + records[n].ttl;`, inside `for (let n = 1; n <= records.length; n++)`.",
    question: {
      id: "transfer-dns-off-by-one",
      kind: "mcq",
      prompt: "What is the root cause and the fix?",
      options: [
        "The loop is off by one in both directions (starts at 1, ends at length); use for (let n = 0; n < records.length; n++)",
        "Some records have no ttl field; default it to 3600",
        "buildReport passes the wrong argument; the bug is on line 61",
        "Wrap line 27 in try/catch",
      ],
      answer: 0,
      explanation:
        "records[records.length] is undefined, so reading .ttl throws; starting at 1 also silently skips the first record. Zero-based indexes run from 0 to length - 1.",
    },
  },
  refresher: {
    body: `A stack trace starts with the error type and message, then lists frames from where it was **thrown** (top) outward to the callers. \`Cannot read properties of undefined (reading 'x')\` means the value *before* \`.x\` was undefined. Go to the top frame's line, work out which expression that is and why it could be undefined for the failing input — a missing field, a \`null\`, or an array index past \`length - 1\` — fix that cause, and re-run every known input.`,
    practice: {
      id: "refresher-last-index",
      kind: "short",
      prompt: "An array has 5 elements. What is the index of the last one?",
      accept: ["4"],
      explanation: "Indexes start at 0, so the last valid index is length - 1 = 4. Index 5 is undefined.",
    },
  },
};
