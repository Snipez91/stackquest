import type { MissionInput } from "@/content/schema";

const F = "```";

const starter = `// Lumen Logistics — quote widget on the customer booking page.
// Rates (from pricing, Nov 2026):
//   price = 4.50 + 0.40 per kg + 0.12 per km
//   express service multiplies the whole price by 1.5
//   round to the nearest penny (2 decimal places), return a number
// ETA:
//   hours = distanceKm / speedKmh + 0.5 handling, rounded UP to the next quarter hour
//   speedKmh defaults to 55 when not given
//   formatEta(2.25) -> "2h 15m", formatEta(0.75) -> "0h 45m", formatEta(3) -> "3h 00m"

let fuelSurcharge = 0;

function quotePrice(weightKg, distanceKm, options) {
  fuelSurcharge = fuelSurcharge + 0.25; // temporary fuel adjustment
  let price = 4.5 + 0.4 * weightKg + 0.12 * distanceKm + fuelSurcharge;
  if (options.express) price = price * 1.5;
  console.log("Quote: £" + price.toFixed(2));
}

function estimateHours(distanceKm, speedKmh) {
  return Math.ceil((distanceKm / speedKmh + 0.5) * 4) / 4;
}

function formatEta(hours) {
  // TODO
  return hours + "h";
}
`;

const solution = `// Lumen Logistics — quote widget on the customer booking page.
// See the rate card in the comments of the original file.

const BASE = 4.5;
const PER_KG = 0.4;
const PER_KM = 0.12;
const EXPRESS_MULTIPLIER = 1.5;

function roundToPenny(amount) {
  return Math.round(amount * 100) / 100;
}

function quotePrice(weightKg, distanceKm, options = {}) {
  let price = BASE + PER_KG * weightKg + PER_KM * distanceKm;
  if (options.express) price = price * EXPRESS_MULTIPLIER;
  return roundToPenny(price);
}

function estimateHours(distanceKm, speedKmh = 55) {
  const hours = distanceKm / speedKmh + 0.5;
  return Math.ceil(hours * 4) / 4;
}

function formatEta(hours) {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return whole + "h " + String(minutes).padStart(2, "0") + "m";
}
`;

export const jsEtaPureFunctions: MissionInput = {
  slug: "js-eta-pure-functions",
  version: 1,
  track: "javascript",
  tier: "beginner",
  order: 2,
  title: "Build a pure price and ETA calculator",
  summary:
    "The booking widget shows \"undefined\" and quotes creep up on every click. Rewrite the calculator as pure functions that take parameters, use defaults, and return values.",
  minutes: 25,
  assessmentTypes: ["write-code", "repair-code", "explain-root-cause"],
  skills: ["js.functions"],
  appliesSkills: ["js.types", "js.variables"],
  prerequisites: ["js-weight-string-coercion"],
  brief: {
    from: "Aiko Tanaka, frontend engineer",
    channel: "#dispatch-dashboard",
    body: `Customer support has two tickets on the booking page quote widget:

1. The price box says **"£undefined"**, although the browser console shows a quote.
2. A customer who clicked *Quote* five times for the same parcel got five different prices, each 25p higher.

The widget calls \`quotePrice(weightKg, distanceKm, options)\`, \`estimateHours(distanceKm, speedKmh)\` and \`formatEta(hours)\` and displays whatever they **return**. The rate card is in the comments of \`quote.js\`. The widget often calls \`quotePrice(10, 100)\` with no options and \`estimateHours(110)\` with no speed. Please make all three functions return the documented values, give the same answer every time for the same inputs, and finish \`formatEta\` — the ETA badge currently says "2.25h".`,
  },
  objectives: [
    "Return a value from a function instead of only logging it",
    "Use default parameters so optional arguments are safe to omit",
    "Remove hidden state so a function is pure: same inputs, same output, no outside changes",
    "Compose small functions (a rounding helper, a formatter) into a calculator",
  ],
  concept: {
    title: "Functions as input-to-output machines",
    body: `A function receives **parameters**, computes, and hands a result back with \`return\`. If there is no \`return\`, the caller gets \`undefined\` — no matter what was printed with \`console.log\`. Logging is for humans; returning is for code.

Missing arguments are \`undefined\`. A **default parameter** supplies a value when an argument is omitted (or passed as \`undefined\`):

${F}js
function estimate(distanceKm, speedKmh = 55) { … }
estimate(110);          // speedKmh is 55
estimate(110, 80);      // speedKmh is 80
${F}

A **pure function** depends only on its parameters and changes nothing outside itself. Given the same inputs it always returns the same output. That makes it predictable, easy to test (no setup, no reset), and safe to call as often as a UI likes. Impurity sneaks in through module-level variables that a function updates (\`total += …\`), reading the clock, randomness, or mutating an argument.

Keep the pure calculation separate from effects (logging, DOM updates, network). The widget can then do \`priceBox.textContent = "£" + quotePrice(w, d).toFixed(2)\`, and the calculation stays trivial to verify.`,
  },
  workedExample: {
    title: "Worked example: a pure fuel-cost function",
    body: `A depot script estimated fuel cost like this:

${F}js
let litresUsed = 0;
function fuelCost(km) {
  litresUsed += km * 0.09;            // shared state — grows every call
  console.log(litresUsed * 1.62);     // printed, not returned
}
${F}

**Step 1 — return the result.** The caller needs a number: \`return …\` instead of \`console.log(…)\`.

**Step 2 — remove outside state.** The cost of a trip depends only on that trip's distance, so compute locals inside the function:

${F}js
function fuelCost(km, pricePerLitre = 1.62, litresPerKm = 0.09) {
  const litres = km * litresPerKm;
  return Math.round(litres * pricePerLitre * 100) / 100;
}
${F}

**Step 3 — check purity.** \`fuelCost(100)\` returns 14.58 on the first call and on the hundredth. Optional values became default parameters, so a caller can override the price without editing the function.

If you genuinely need a running total, keep it in the caller — \`total += fuelCost(km)\` — where the state is visible.`,
  },
  workspace: {
    kind: "javascript",
    entry: "quote.js",
    exports: ["quotePrice", "estimateHours", "formatEta"],
    files: [{ path: "quote.js", content: starter, editable: true }],
    tests: [
      {
        id: "quote-returns-number",
        name: "quotePrice returns the price when called without options",
        code: `const price = module.quotePrice(10, 100);
assertEqual(typeof price, "number", "quotePrice(10, 100) should return a number, got " + typeof price);
assertEqual(price, 20.5, "quotePrice(10, 100) should be 4.50 + 4.00 + 12.00 = 20.5, got " + price);`,
        feedback: {
          what: "quotePrice(10, 100) did not return the number 20.5 (it returned undefined, a string, a different number, or threw).",
          why: "The widget displays the return value; a logged value never reaches it, and an options argument may be omitted.",
          next: "Give options a default value of {} and end the function with return. Return a number, not a toFixed string.",
        },
      },
      {
        id: "quote-express-rounding",
        name: "quotePrice applies express pricing and rounds to the penny",
        code: `assertEqual(module.quotePrice(2.5, 37), 9.94, "quotePrice(2.5, 37) should be 9.94");
assertEqual(module.quotePrice(10, 100, { express: true }), 30.75, "express quotePrice(10, 100) should be 20.5 x 1.5 = 30.75");
assertEqual(module.quotePrice(2.5, 37, { express: true }), 14.91, "express quotePrice(2.5, 37) should be 14.91");`,
        feedback: {
          what: "An express or fractional quote was wrong or not rounded to 2 decimal places.",
          why: "0.12 * 37 is 4.4399999… in floating point; customers must see exact pennies.",
          next: "Multiply by 1.5 when options.express is true, then round with Math.round(price * 100) / 100.",
        },
      },
      {
        id: "quote-is-pure",
        name: "quotePrice gives the same answer every time and does not modify its arguments",
        code: `const opts = Object.freeze({ express: true });
const first = module.quotePrice(4, 50, opts);
for (let i = 0; i < 4; i++) {
  const again = module.quotePrice(4, 50, opts);
  assertEqual(again, first, "call " + (i + 2) + " returned " + again + " but the first call returned " + first);
}`,
        feedback: {
          what: "Calling quotePrice repeatedly with identical arguments gave different results, or it tried to modify the options object.",
          why: "A pricing function that drifts on every click overcharges customers and cannot be tested reliably.",
          next: "Remove the module-level fuelSurcharge variable; compute everything from the parameters inside the function.",
        },
      },
      {
        id: "eta-default-speed",
        name: "estimateHours uses a default speed of 55 km/h and rounds up to quarter hours",
        code: `assertEqual(module.estimateHours(110), 2.5, "estimateHours(110) should be 110/55 + 0.5 = 2.5");
assertEqual(module.estimateHours(100), 2.5, "estimateHours(100) is 2.32 h, which rounds up to 2.5");
assertEqual(module.estimateHours(30, 60), 1, "estimateHours(30, 60) should be 0.5 + 0.5 = 1");`,
        feedback: {
          what: "estimateHours returned NaN or a wrong value, usually when speedKmh was omitted.",
          why: "An omitted argument is undefined, and 110 / undefined is NaN, which then shows up as \"NaNh\" on the badge.",
          next: "Give speedKmh a default parameter value of 55.",
        },
      },
      {
        id: "format-eta",
        name: "formatEta renders hours and two-digit minutes",
        code: `const cases = [[2.25, "2h 15m"], [0.75, "0h 45m"], [3, "3h 00m"], [12.5, "12h 30m"]];
for (const [h, want] of cases) {
  const got = module.formatEta(h);
  assertEqual(got, want, "formatEta(" + h + ") should be " + JSON.stringify(want) + ", got " + JSON.stringify(got));
}`,
        feedback: {
          what: "formatEta did not produce the \"Hh MMm\" format for one of the inputs.",
          why: "Drivers read the badge at a glance; \"3h 0m\" and \"2.25h\" were both reported as confusing.",
          next: "Split the hours into Math.floor(hours) and the remaining fraction × 60, and pad the minutes with String(m).padStart(2, \"0\").",
        },
      },
      {
        id: "zero-distance",
        name: "Zero-distance (same-depot) jobs",
        hidden: true,
        code: `assertEqual(module.quotePrice(0, 0), 4.5, "quotePrice(0, 0) should be the base price 4.5");
assertEqual(module.estimateHours(0), 0.5, "estimateHours(0) should be the 0.5 h handling time");
assertEqual(module.formatEta(module.estimateHours(0)), "0h 30m", "formatEta(estimateHours(0)) should be \\"0h 30m\\"");`,
        feedback: {
          what: "A same-depot job (0 kg or 0 km) produced an unexpected price or ETA.",
          why: "Collections from the depot counter are quoted at 0 km; the base price and handling time still apply.",
          next: "Check that nothing in your calculation treats 0 as missing (for example `distanceKm || something`).",
        },
      },
    ],
    solution: { "quote.js": solution },
    wrongSolutions: [
      {
        label: "returns the price but keeps the running surcharge",
        files: {
          "quote.js": `let fuelSurcharge = 0;
function quotePrice(weightKg, distanceKm, options = {}) {
  fuelSurcharge = fuelSurcharge + 0.25;
  let price = 4.5 + 0.4 * weightKg + 0.12 * distanceKm + fuelSurcharge;
  if (options.express) price = price * 1.5;
  return Math.round(price * 100) / 100;
}
function estimateHours(distanceKm, speedKmh = 55) {
  return Math.ceil((distanceKm / speedKmh + 0.5) * 4) / 4;
}
function formatEta(hours) {
  const h = Math.floor(hours);
  return h + "h " + String(Math.round((hours - h) * 60)).padStart(2, "0") + "m";
}
`,
        },
      },
      {
        label: "rounds with toFixed, so the price is a string",
        files: {
          "quote.js": `function quotePrice(weightKg, distanceKm, options = {}) {
  let price = 4.5 + 0.4 * weightKg + 0.12 * distanceKm;
  if (options.express) price = price * 1.5;
  return price.toFixed(2);
}
function estimateHours(distanceKm, speedKmh = 55) {
  return Math.ceil((distanceKm / speedKmh + 0.5) * 4) / 4;
}
function formatEta(hours) {
  const h = Math.floor(hours);
  return h + "h " + String(Math.round((hours - h) * 60)).padStart(2, "0") + "m";
}
`,
        },
      },
      {
        label: "no default for options, unpadded minutes",
        files: {
          "quote.js": `function quotePrice(weightKg, distanceKm, options) {
  let price = 4.5 + 0.4 * weightKg + 0.12 * distanceKm;
  if (options.express) price = price * 1.5;
  return Math.round(price * 100) / 100;
}
function estimateHours(distanceKm, speedKmh = 55) {
  return Math.ceil((distanceKm / speedKmh + 0.5) * 4) / 4;
}
function formatEta(hours) {
  const h = Math.floor(hours);
  return h + "h " + Math.round((hours - h) * 60) + "m";
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "quotePrice returns a number rounded to the penny, with or without an options argument",
    "Repeated calls with the same arguments return the same price",
    "estimateHours works when the speed is omitted and rounds up to the next quarter hour",
    "formatEta returns strings like \"2h 15m\" and \"3h 00m\"",
  ],
  hints: [
    "Read the brief's two symptoms against the code: what does quotePrice hand back to its caller, and what does it change outside itself?",
    "A function without `return` gives the caller undefined. A variable declared outside the function and updated inside it makes results depend on how many times it has been called.",
    "Parameters can have defaults: `function f(a, b = 55)`. An empty object is a sensible default for an options parameter.",
    "quotePrice: compute `4.5 + 0.4 * weightKg + 0.12 * distanceKm`, multiply by 1.5 if `options.express`, then `return Math.round(price * 100) / 100`. formatEta: `const h = Math.floor(hours)`, minutes are `Math.round((hours - h) * 60)`, padded with `padStart(2, \"0\")`.",
  ],
  questions: [
    {
      id: "predict-log-no-return",
      kind: "mcq",
      prompt: "What does the last line show?",
      code: `function label(id) {
  console.log("Shipment " + id);
}
const text = label("LUM-7");
console.log(text);`,
      codeLanguage: "javascript",
      options: ["Shipment LUM-7", "undefined", "null", "An empty line"],
      answer: 1,
      explanation:
        "label prints \"Shipment LUM-7\" but returns nothing, so text is undefined and the second log prints undefined. This is exactly why the widget showed £undefined.",
    },
    {
      id: "explain-impure-quote",
      kind: "explain",
      prompt: "Explain why the original quotePrice gave a different price on every click, and why a pure function avoids that class of bug.",
      concepts: [
        { label: "it changed shared state outside the function", anyOf: ["global", "outside", "external", "shared", "module-level", "module level", "fuelsurcharge", "side effect", "side-effect", "state"] },
        { label: "same input produced a different output", anyOf: ["different result", "different output", "different price", "same input", "same arguments", "each call", "every call", "each click", "every click"] },
        { label: "pure functions are predictable and easy to test", anyOf: ["test", "predict", "reproduc", "reliabl", "cache", "memo"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "quotePrice added 0.25 to a module-level fuelSurcharge variable on each call, so it changed shared state outside the function and the same input gave a different output on every click. A pure function computes only from its parameters and changes nothing outside itself, so the same arguments always return the same price, which makes it predictable and easy to test.",
      explanation: "Hidden state turns a calculation into a history-dependent one. Keep state in the caller, where it is visible.",
    },
  ],
  debrief: {
    solution: `The reference solution splits the work into small pure pieces:

- \`quotePrice(weightKg, distanceKm, options = {})\` computes from its parameters only and **returns** \`roundToPenny(price)\`. The default \`{}\` means \`options.express\` is simply \`undefined\` when no options are passed.
- \`estimateHours(distanceKm, speedKmh = 55)\` relies on a default parameter instead of the caller remembering the speed.
- \`formatEta\` splits whole hours from the fraction, converts the fraction to minutes, and pads to two digits.

The module-level \`fuelSurcharge\` is gone: if pricing ever needs a surcharge, it becomes a parameter, so callers control it explicitly.`,
    commonMistakes: [
      "Keeping console.log and adding return in the wrong place, so the function still returns undefined on some path.",
      "Rounding with toFixed(2), which returns a string; later arithmetic like price + 1 then concatenates.",
      "Fixing the symptom by resetting fuelSurcharge = 0 at the top of the function — the state is still shared and the function is still impure.",
      "Using `speedKmh || 55`, which works here but also replaces a legitimate 0 with 55 in other contexts; a default parameter only applies to undefined.",
    ],
    realWorld:
      "Pricing, tax, and ETA logic in real products is kept in pure modules precisely so it can be unit-tested exhaustively and shared between the browser and the server. UI code calls these functions and deals with effects (DOM, network, analytics) separately.",
  },
  review: [
    {
      id: "js-return-vs-log",
      skill: "js.functions",
      variants: [
        {
          id: "js-return-vs-log-a",
          kind: "mcq",
          prompt: "What is `total` after this runs?",
          code: `function add(a, b) {
  console.log(a + b);
}
const total = add(2, 3);`,
          codeLanguage: "javascript",
          options: ["5", "undefined", "\"5\"", "It throws a ReferenceError"],
          answer: 1,
          explanation: "add logs 5 but has no return statement, so it returns undefined.",
        },
        {
          id: "js-return-vs-log-b",
          kind: "mcq",
          prompt: "What is `badge` after this runs?",
          code: `function etaLabel(hours) {
  console.log(hours + "h");
}
const badge = etaLabel(3);`,
          codeLanguage: "javascript",
          options: ["\"3h\"", "3", "undefined", "null"],
          answer: 2,
          explanation: "Printing is not returning. Without return, every function call evaluates to undefined.",
        },
      ],
    },
    {
      id: "js-default-parameters",
      skill: "js.functions",
      variants: [
        {
          id: "js-default-parameters-a",
          kind: "short",
          prompt: "What does `cost(5)` return?",
          code: `function cost(km, ratePerKm = 2) {
  return km * ratePerKm;
}`,
          codeLanguage: "javascript",
          accept: ["10"],
          explanation: "ratePerKm is omitted, so its default 2 applies: 5 × 2 = 10.",
        },
        {
          id: "js-default-parameters-b",
          kind: "short",
          prompt: "What does `pallets(3)` return?",
          code: `function pallets(trucks, perTruck = 4) {
  return trucks * perTruck;
}`,
          codeLanguage: "javascript",
          accept: ["12"],
          explanation: "perTruck defaults to 4 when not passed: 3 × 4 = 12.",
        },
      ],
    },
    {
      id: "js-pure-function",
      skill: "js.functions",
      variants: [
        {
          id: "js-pure-function-a",
          kind: "mcq",
          prompt: "Which function is pure?",
          options: [
            "function next() { counter += 1; return counter; }",
            "function vat(price) { return Math.round(price * 1.2 * 100) / 100; }",
            "function stamp(s) { s.updatedAt = Date.now(); return s; }",
            "function roll() { return Math.random() * 6; }",
          ],
          answer: 1,
          explanation: "vat depends only on its argument and changes nothing else. The others update outer state, mutate an argument and read the clock, or use randomness.",
        },
        {
          id: "js-pure-function-b",
          kind: "mcq",
          prompt: "Which function is pure?",
          options: [
            "function log(msg) { history.push(msg); }",
            "function today() { return new Date().toISOString(); }",
            "function kmToMiles(km) { return km * 0.621371; }",
            "function bump(order) { order.qty++; return order; }",
          ],
          answer: 2,
          explanation: "kmToMiles returns a value computed only from its input with no side effects.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Marco's invoice module has `function formatTotal(amount) { return amount.toLocaleString(currentLocale) }`, where `currentLocale` is a module variable the settings page changes. Tests pass or fail depending on which test ran first.",
    question: {
      id: "transfer-hidden-locale",
      kind: "mcq",
      prompt: "Which change makes formatTotal deterministic and testable?",
      options: [
        "Add a parameter: formatTotal(amount, locale = \"en-GB\") and have callers pass the current locale",
        "Reset currentLocale at the start of every test",
        "Cache the first result so later calls return the same string",
        "Wrap the call in try/catch",
      ],
      answer: 0,
      explanation:
        "Passing the locale in makes the function depend only on its arguments. Resetting in tests treats the symptom; the function still reads hidden state.",
    },
  },
  refresher: {
    body: `A function is a reusable input-to-output rule. **Parameters** are the inputs, \`return\` hands back the output. If a function only calls \`console.log\`, its caller receives \`undefined\`. A **default parameter** (\`function f(x, rate = 2)\`) fills in a value when the argument is left out. A **pure** function uses only its parameters and changes nothing outside itself, so calling it twice with the same inputs always gives the same answer — which is exactly what you want from a price calculator.`,
    practice: {
      id: "refresher-return",
      kind: "mcq",
      prompt: "`function double(n) { n * 2; }` — what does `double(4)` return?",
      options: ["8", "undefined", "4", "NaN"],
      answer: 1,
      explanation: "The multiplication happens but its result is discarded: without return, the call evaluates to undefined.",
    },
  },
};
