import type { MissionInput } from "@/content/schema";

const F = "```";

const starter = `// Lumen Logistics — manifest weight helpers used by the depot load planner.
// Weights arrive from the scanner CSV as strings, e.g. "12.5", " 7 ", "" or "n/a".

// Convert a raw weight to a number of kilograms, or null if it is missing or unreadable.
function parseWeight(raw) {
  return Number(raw);
}

// Total kilograms for rows like { id: "LUM-1001", weightKg: "12.5" }.
// Rows whose weight cannot be read are skipped.
function totalWeight(rows) {
  const total = 0;
  for (const row of rows) {
    total += row.weightKg;
  }
  return total;
}

// Depot codes come from the API as numbers (7) and from the search box as strings ("7", "07").
// Return true when both refer to the same depot. Blank or unreadable input never matches.
function sameDepot(a, b) {
  return a === b;
}
`;

const solution = `// Lumen Logistics — manifest weight helpers used by the depot load planner.
// Weights arrive from the scanner CSV as strings, e.g. "12.5", " 7 ", "" or "n/a".

// Shared conversion: a finite number, or null for blank / unreadable input.
function toNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}

// Convert a raw weight to a number of kilograms, or null if it is missing or unreadable.
function parseWeight(raw) {
  return toNumber(raw);
}

// Total kilograms for rows like { id: "LUM-1001", weightKg: "12.5" }.
// Rows whose weight cannot be read are skipped.
function totalWeight(rows) {
  let total = 0;
  for (const row of rows) {
    const kg = parseWeight(row.weightKg);
    if (kg !== null) total += kg;
  }
  return total;
}

// Depot codes come from the API as numbers (7) and from the search box as strings ("7", "07").
// Return true when both refer to the same depot. Blank or unreadable input never matches.
function sameDepot(a, b) {
  const x = toNumber(a);
  const y = toNumber(b);
  return x !== null && x === y;
}
`;

const scannerCsv = `id,depot,weightKg
LUM-1001,7,12.5
LUM-1002,7, 7
LUM-1003,12,
LUM-1004,12,n/a
LUM-1005,7,0.5
`;

export const jsWeightStringCoercion: MissionInput = {
  slug: "js-weight-string-coercion",
  version: 1,
  track: "javascript",
  tier: "beginner",
  order: 1,
  title: "Fix shipment weight totals that glue strings together",
  summary:
    "The depot load planner reports a trailer weight of \"012.570.5\" kg. Repair the weight helpers by converting values explicitly and comparing with strict equality.",
  minutes: 20,
  assessmentTypes: ["repair-code", "interpret-output", "explain-root-cause"],
  skills: ["js.variables", "js.types"],
  appliesSkills: [],
  prerequisites: [],
  brief: {
    from: "Aiko Tanaka, frontend engineer",
    channel: "#dispatch-dashboard",
    body: `The load planner broke after we switched to the new scanner export. Depot 7's trailer panel first crashed with \`TypeError: Assignment to constant variable\`, and when Marco patched that locally it showed **"012.570.5 kg"** instead of 20 kg. Separately, typing \`7\` in the depot search box finds nothing, even though depot 7 has three shipments.

The scanner sends every weight as a string (see \`data/scanner-export.csv\`), sometimes blank or \`n/a\`. Please fix \`weights.js\` so totals are real numbers, unreadable weights are skipped rather than counted as 0, and the depot search matches \`"7"\` and \`"07"\` against depot \`7\` — without ever matching a blank search box. Loaders use this number to decide whether a trailer is overweight, so it has to be right.`,
  },
  objectives: [
    "Choose let instead of const for a value that is reassigned, and explain the TypeError const produces",
    "Predict the result of + when one operand is a string",
    "Convert strings to numbers explicitly and treat blank or NaN results as missing",
    "Compare values with === after explicit conversion, and explain why == is unsafe here",
  ],
  concept: {
    title: "Values have types, and JavaScript converts them quietly",
    body: `A variable is a name bound to a value. \`const\` means the *binding* can never be reassigned, so \`total += x\` on a const throws \`TypeError: Assignment to constant variable\`. Use \`let\` for accumulators and \`const\` for everything else.

Every value has a type: \`typeof "12.5"\` is \`"string"\`, \`typeof 12.5\` is \`"number"\`. Data from forms, CSV files and URLs is almost always a string. When types differ, JavaScript **coerces** (converts) silently:

${F}js
"12.5" + 7      // "12.57"  — + with any string means concatenation
"12.5" - 7      // 5.5      — - only works on numbers, so it converts
Number("")      // 0        — blank becomes zero, not "missing"
Number("n/a")   // NaN      — "not a number", and NaN !== NaN
"" == 0         // true     — == coerces before comparing
"7" === 7       // false    — === never converts; types must match
${F}

The reliable pattern is: **convert explicitly at the boundary, validate, then compare strictly.** Trim the string, treat empty as missing, call \`Number()\`, and check \`Number.isNaN\`. After that, \`===\` compares like with like and cannot surprise you.`,
  },
  workedExample: {
    title: "Worked example: pallet counts from a URL query string",
    body: `A warehouse page reads \`?pallets=4\` and adds 2 spare pallets. The first version printed \`"42"\`.

${F}js
const params = new URLSearchParams("pallets=4");
let pallets = params.get("pallets");   // "4" — a string
console.log(pallets + 2);              // "42" — concatenation
${F}

**Step 1 — find the type.** \`typeof pallets\` is \`"string"\`; query strings are always text.

**Step 2 — convert at the boundary and validate.**

${F}js
function readCount(raw) {
  if (raw === null) return null;          // parameter missing
  const text = raw.trim();
  if (text === "") return null;           // "?pallets=" — blank is not zero
  const n = Number(text);
  return Number.isNaN(n) ? null : n;      // "?pallets=lots" -> null
}
${F}

**Step 3 — compare strictly.** \`readCount("4") === 4\` is \`true\`; \`readCount("") === 0\` is \`false\`, which is what we want — an empty field must not look like zero pallets.

Notice the decision about **blank** is a business rule, not a language rule: \`Number("")\` returns 0, so you must handle it yourself.`,
  },
  workspace: {
    kind: "javascript",
    entry: "weights.js",
    exports: ["parseWeight", "totalWeight", "sameDepot"],
    files: [
      { path: "weights.js", content: starter, editable: true },
      { path: "data/scanner-export.csv", content: scannerCsv, editable: false },
    ],
    tests: [
      {
        id: "parse-valid",
        name: "parseWeight converts readable weights to numbers",
        code: `assertEqual(module.parseWeight("12.5"), 12.5, 'parseWeight("12.5") should be the number 12.5');
assertEqual(module.parseWeight(" 7 "), 7, 'parseWeight(" 7 ") should ignore surrounding spaces and return 7');
assertEqual(module.parseWeight(3), 3, "parseWeight(3) should accept a value that is already a number");`,
        feedback: {
          what: "A readable weight string did not come back as the expected number.",
          why: "Every later calculation depends on weights being numbers, not strings.",
          next: "Trim the input with String(raw).trim() and convert with Number().",
        },
      },
      {
        id: "parse-missing",
        name: "parseWeight returns null for blank or unreadable weights",
        code: `for (const raw of ["", "   ", null, undefined, "n/a"]) {
  const got = module.parseWeight(raw);
  assertEqual(got, null, "parseWeight(" + JSON.stringify(raw) + ") should be null but was " + String(got));
}`,
        feedback: {
          what: "A blank, missing or unreadable weight produced a number (0 or NaN) instead of null.",
          why: "Number(\"\") is 0, so a missing weight silently becomes a real-looking 0 kg; NaN then poisons every sum it touches.",
          next: "Before converting, return null for null/undefined and for strings that are empty after trimming. After converting, return null if Number.isNaN(result).",
        },
      },
      {
        id: "total-numbers",
        name: "totalWeight adds weights as numbers",
        code: `const rows = [{ id: "A", weightKg: "12.5" }, { id: "B", weightKg: "7" }, { id: "C", weightKg: "0.5" }];
const total = module.totalWeight(rows);
assertEqual(typeof total, "number", "totalWeight should return a number, got " + typeof total + " (" + JSON.stringify(total) + ")");
assertEqual(total, 20, "12.5 + 7 + 0.5 should be 20, got " + JSON.stringify(total));`,
        feedback: {
          what: "totalWeight threw an error or returned something other than the number 20.",
          why: "A const accumulator cannot be reassigned, and adding a string with + concatenates instead of adding.",
          next: "Declare the accumulator with let, and add parseWeight(row.weightKg) rather than the raw string.",
        },
      },
      {
        id: "total-skips-unreadable",
        name: "totalWeight skips unreadable rows and handles an empty list",
        hidden: true,
        code: `const rows = [{ weightKg: "" }, { weightKg: "n/a" }, { weightKg: null }, { weightKg: "4" }];
assertEqual(module.totalWeight(rows), 4, "only the readable weight 4 should be counted, got " + JSON.stringify(module.totalWeight(rows)));
assertEqual(module.totalWeight([]), 0, "an empty manifest should weigh 0");`,
        feedback: {
          what: "Unreadable rows changed the total (NaN, a string, or a wrong number), or an empty list did not return 0.",
          why: "One bad scanner row must not corrupt the trailer total that loaders rely on.",
          next: "Use parseWeight for each row and only add the result when it is not null.",
        },
      },
      {
        id: "same-depot-mixed-types",
        name: "sameDepot matches a typed code against a numeric depot",
        code: `assertEqual(module.sameDepot("7", 7), true, 'sameDepot("7", 7) should be true');
assertEqual(module.sameDepot("07", 7), true, 'sameDepot("07", 7) should be true (same depot number)');
assertEqual(module.sameDepot(" 12", 12), true, 'sameDepot(" 12", 12) should be true');
assertEqual(module.sameDepot(7, 7), true, "sameDepot(7, 7) should be true");
assertEqual(module.sameDepot("7", 8), false, 'sameDepot("7", 8) should be false');`,
        feedback: {
          what: "A depot code typed as text did not match the numeric depot from the API (or a different depot matched).",
          why: "=== never converts types, so \"7\" === 7 is false; comparing strings fails for \"07\".",
          next: "Convert both sides to numbers first (reuse your parsing logic), then compare with ===.",
        },
      },
      {
        id: "same-depot-blank",
        name: "sameDepot never matches blank or unreadable input",
        hidden: true,
        code: `assertEqual(module.sameDepot("", 0), false, 'sameDepot("", 0) should be false — a blank search box is not depot 0');
assertEqual(module.sameDepot(null, 0), false, "sameDepot(null, 0) should be false");
assertEqual(module.sameDepot("abc", "abc"), false, 'sameDepot("abc", "abc") should be false — neither is a depot number');`,
        feedback: {
          what: "Blank or non-numeric input was treated as a matching depot.",
          why: "With ==, \"\" == 0 is true, so an empty search would show depot 0's shipments; two unreadable values must not count as equal.",
          next: "After converting, return false if either side is null (missing or unreadable) before comparing.",
        },
      },
    ],
    solution: { "weights.js": solution },
    wrongSolutions: [
      {
        label: "let plus loose equality (==) instead of explicit conversion",
        files: {
          "weights.js": `function parseWeight(raw) {
  return Number(raw);
}
function totalWeight(rows) {
  let total = 0;
  for (const row of rows) total += Number(row.weightKg) || 0;
  return total;
}
function sameDepot(a, b) {
  return a == b;
}
`,
        },
      },
      {
        label: "parseFloat everywhere, blank becomes NaN instead of null",
        files: {
          "weights.js": `function parseWeight(raw) {
  return parseFloat(raw);
}
function totalWeight(rows) {
  let total = 0;
  for (const row of rows) total += parseFloat(row.weightKg) || 0;
  return total;
}
function sameDepot(a, b) {
  return parseFloat(a) === parseFloat(b);
}
`,
        },
      },
      {
        label: "compares depot codes as trimmed strings",
        files: {
          "weights.js": `function parseWeight(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}
function totalWeight(rows) {
  let total = 0;
  for (const row of rows) {
    const kg = parseWeight(row.weightKg);
    if (kg !== null) total += kg;
  }
  return total;
}
function sameDepot(a, b) {
  return String(a).trim() !== "" && String(a).trim() === String(b).trim();
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "parseWeight returns numbers for readable weights and null for blank, missing or unreadable ones",
    "totalWeight returns a number and skips rows it cannot read",
    "sameDepot matches \"7\" and \"07\" to depot 7 but never matches blank or non-numeric input",
  ],
  hints: [
    "Run the file and read the first error: it names the problem with the accumulator's declaration. Then look at what type `row.weightKg` has.",
    "`const` bindings cannot be reassigned. After switching to `let`, check what `0 + \"12.5\"` produces in the console.",
    "Number(\"\") is 0 and Number(\"n/a\") is NaN. Decide what parseWeight should return for each before converting — the brief says missing weights are skipped, not zero.",
    "Write one helper that trims, returns null for empty, converts with Number(), and returns null for NaN. Use it in parseWeight, in totalWeight (skip nulls), and on both sides of sameDepot before comparing with === (and return false if either is null).",
  ],
  questions: [
    {
      id: "predict-concat",
      kind: "mcq",
      prompt: "Before you fixed it, what did this expression evaluate to?",
      code: `const first = "12.5";   // from the scanner
const second = 7;       // already a number
first + second`,
      codeLanguage: "javascript",
      options: ["19.5", "\"12.57\"", "NaN", "TypeError"],
      answer: 1,
      explanation:
        "When either operand of + is a string, + concatenates: 7 is converted to \"7\" and appended, giving \"12.57\". Only - * / force numeric conversion.",
    },
    {
      id: "predict-const-error",
      kind: "short",
      prompt: "What type of error does this throw? (Just the error name.)",
      code: `const total = 0;
total += 5;`,
      codeLanguage: "javascript",
      accept: ["TypeError", "TypeError: Assignment to constant variable", "TypeError: Assignment to constant variable."],
      acceptPatterns: ["^typeerror\\b"],
      placeholder: "e.g. RangeError",
      explanation: "Reassigning a const binding throws TypeError: Assignment to constant variable. Use let for values that change.",
    },
    {
      id: "explain-loose-equality",
      kind: "explain",
      prompt:
        "A teammate suggests fixing `sameDepot` by switching `===` to `==`, because `\"7\" == 7` is true. Explain why that would introduce a new bug, and what the safer approach is.",
      concepts: [
        { label: "== coerces (converts) types before comparing", anyOf: ["coerc", "implicit", "converts", "conversion", "type juggling", "casts"] },
        { label: "a blank string converts to 0, so it would match depot 0", anyOf: ["empty string", "blank", "empty input", "becomes 0", "becomes zero", "to zero", "to 0", "depot 0"] },
        { label: "convert explicitly and validate, then compare strictly", anyOf: ["explicit", "strict", "validate", "parse", "convert both"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "== coerces both values to a common type before comparing, so an empty search box (\"\") converts to 0 and would match depot 0, and null or other odd inputs get converted in surprising ways. The safer approach is to convert explicitly with Number() at the boundary, validate the result (treat blank and NaN as missing), and then compare with strict === so no hidden conversion happens.",
      explanation: "Loose equality hides type mismatches instead of fixing them. Explicit conversion makes the rule (blank is not zero) visible in code.",
    },
  ],
  debrief: {
    solution: `There were three separate type problems:

1. **const accumulator.** \`const total = 0; total += …\` throws, because const forbids reassignment. \`let total = 0\` fixes it.
2. **String concatenation.** The scanner sends \`"12.5"\`, and \`0 + "12.5"\` is \`"012.5"\`. Each weight must be converted before adding.
3. **Strict comparison across types.** \`"7" === 7\` is false. Converting both sides to numbers first makes \`===\` meaningful.

A single \`toNumber\` helper (trim → blank is null → \`Number()\` → NaN is null) is reused by all three functions, so the rule "blank is missing, not zero" lives in one place.`,
    commonMistakes: [
      "Switching to == to make \"7\" match 7 — it also makes \"\" match 0 and hides type bugs elsewhere.",
      "Using Number(raw) without handling blank input, so missing weights silently count as 0 kg.",
      "Using parseFloat and leaving NaN in the data; parseFloat(\"12kg\") is also 12, which may accept garbage.",
      "Comparing depot codes as strings, which fails for \"07\" versus 7.",
    ],
    realWorld:
      "Anything from a form field, CSV, query string or localStorage is a string. Production code converts and validates at that boundary (often with a schema library such as zod) so the rest of the program can assume real numbers. Lint rules like `eqeqeq` ban == for the same reason this mission did.",
  },
  review: [
    {
      id: "js-const-reassignment",
      skill: "js.variables",
      variants: [
        {
          id: "js-const-reassignment-a",
          kind: "mcq",
          prompt: "What happens when this runs?",
          code: `const attempts = 1;
attempts = attempts + 1;`,
          codeLanguage: "javascript",
          options: ["attempts becomes 2", "TypeError: Assignment to constant variable", "attempts stays 1 silently", "SyntaxError before anything runs"],
          answer: 1,
          explanation: "A const binding cannot be reassigned at runtime; the assignment throws a TypeError. Declare it with let if it must change.",
        },
        {
          id: "js-const-reassignment-b",
          kind: "mcq",
          prompt: "Which change lets this loop run without an error?",
          code: `const sum = 0;
for (const n of [1, 2, 3]) sum += n;`,
          codeLanguage: "javascript",
          options: ["Change `const sum` to `let sum`", "Change `const n` to `var n`", "Wrap the loop in try/catch", "Change `+=` to `=+`"],
          answer: 0,
          explanation: "sum is reassigned on every iteration, so it needs let. n is a fresh binding per iteration, so const n is fine.",
        },
        {
          id: "js-const-reassignment-c",
          kind: "short",
          prompt: "Which keyword should declare a running total that is updated inside a loop?",
          accept: ["let"],
          explanation: "let allows reassignment; const does not. Prefer const for values that never change.",
        },
      ],
    },
    {
      id: "js-plus-string-coercion",
      skill: "js.types",
      variants: [
        {
          id: "js-plus-string-coercion-a",
          kind: "short",
          prompt: "What does this evaluate to? Write the value exactly.",
          code: `"40" + 2`,
          codeLanguage: "javascript",
          accept: ["\"402\"", "402", "'402'"],
          explanation: "+ with a string operand concatenates, so 2 becomes \"2\" and the result is the string \"402\".",
        },
        {
          id: "js-plus-string-coercion-b",
          kind: "short",
          prompt: "What does this evaluate to? Write the value exactly.",
          code: `"7.5" + 1`,
          codeLanguage: "javascript",
          accept: ["\"7.51\"", "7.51", "'7.51'"],
          explanation: "One string operand is enough: + concatenates and the result is the string \"7.51\".",
        },
        {
          id: "js-plus-string-coercion-c",
          kind: "short",
          prompt: "A form field holds `\"3\"`. What does `field + 3` produce?",
          accept: ["\"33\"", "33", "'33'"],
          explanation: "Input values are strings, so + concatenates to \"33\". Convert with Number(field) first.",
        },
      ],
    },
    {
      id: "js-loose-vs-strict",
      skill: "js.types",
      variants: [
        {
          id: "js-loose-vs-strict-a",
          kind: "mcq",
          prompt: "Which of these is `true`?",
          options: ["\"\" === 0", "\"\" == 0", "null === 0", "NaN == NaN"],
          answer: 1,
          explanation: "== converts \"\" to 0 before comparing. === never converts, and NaN is not equal to anything, including itself.",
        },
        {
          id: "js-loose-vs-strict-b",
          kind: "mcq",
          prompt: "Which of these is `true`?",
          options: ["\"0\" === false", "\"0\" == false", "undefined === null", "\"1\" === 1"],
          answer: 1,
          explanation: "With ==, both \"0\" and false convert to the number 0, so they compare equal. All the === comparisons have different types.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On the returns form, Aiko finds: `const qty = input.value; if (qty === 0) showError(\"Quantity required\");`. Testers report the error never appears when the field is left empty.",
    question: {
      id: "transfer-empty-quantity",
      kind: "mcq",
      prompt: "What is the most accurate diagnosis and fix?",
      options: [
        "input.value is a string (\"\"), so qty === 0 is never true; trim the value, treat \"\" as missing, then convert with Number() and validate",
        "Replace === with == so \"\" matches 0",
        "Change const to let so qty can be updated",
        "Use parseInt(qty) === 0, which handles blanks",
      ],
      answer: 0,
      explanation:
        "The value is the string \"\", never the number 0. == would 'work' by accident and also accept other odd values; parseInt(\"\") is NaN. Handle blank explicitly, then convert and validate.",
    },
  },
  refresher: {
    body: `Values in JavaScript have types; the two that matter here are **string** and **number**. Data from forms, files and URLs arrives as strings. The \`+\` operator concatenates if either side is a string (\`"5" + 1\` is \`"51"\`), and \`Number("")\` is 0, not "missing". \`===\` compares without converting, so \`"7" === 7\` is false — that is a feature: convert first, then compare. Use \`let\` for a variable you reassign and \`const\` for one you do not.`,
    practice: {
      id: "refresher-typeof",
      kind: "short",
      prompt: "What does `typeof \"12.5\"` return?",
      accept: ["string", "\"string\""],
      explanation: "Quotes make it a string literal, so typeof reports \"string\" even though it looks like a number.",
    },
  },
};
