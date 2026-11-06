import type { MissionInput } from "@/content/schema";

const F = "```";

const spec = `# Billable weight — pricing rule PR-14 (effective 1 Nov 2026)

billableWeight(actualKg, lengthCm, widthCm, heightCm) returns the weight we charge for, in kg.

1. Volumetric weight = lengthCm × widthCm × heightCm ÷ 5000.
2. Take the larger of the actual weight and the volumetric weight.
3. Round UP to the next 0.5 kg step. A value already on a 0.5 kg step is unchanged
   (3 stays 3, 3.5 stays 3.5).
4. The minimum billable weight is 1 kg.
5. If any argument is not a finite number greater than 0, throw a RangeError.

Example: billableWeight(2.1, 10, 10, 10) === 2.5
`;

const starter = `// Lumen Logistics — test cases for billableWeight(actualKg, lengthCm, widthCm, heightCm).
// The rule is in docs/billable-weight.md. Marco is rewriting the implementation and
// wants a test table that would catch any mistake in it.
//
// Each case is one of:
//   { name: "...", args: [actualKg, lengthCm, widthCm, heightCm], expected: <number> }
//   { name: "...", args: [actualKg, lengthCm, widthCm, heightCm], throws: "RangeError" }
//
// The checks run your cases against the correct implementation (every case must pass) and
// against several plausible broken implementations (each must be caught by at least one case).
// Work out every expected value from the spec by hand.

const cases = [
  { name: "small heavy parcel", args: [2, 10, 10, 10], expected: 2 },
];

// Optional helper for experimenting with your own implementation:
// returns the names of the cases that fail for fn.
function runCases(fn, list = cases) {
  const failing = [];
  for (const c of list) {
    try {
      const got = fn(...c.args);
      if (c.throws || !Object.is(got, c.expected)) failing.push(c.name);
    } catch (e) {
      if (!c.throws || e.name !== c.throws) failing.push(c.name);
    }
  }
  return failing;
}
`;

const solution = `// Lumen Logistics — test cases for billableWeight(actualKg, lengthCm, widthCm, heightCm).
// Every expected value is derived from docs/billable-weight.md, not from running code.

const cases = [
  // Rule 2: actual weight dominates
  { name: "small heavy parcel stays on its 0.5 step", args: [2, 10, 10, 10], expected: 2 },
  // Rule 3: round up, never to nearest; exact steps unchanged
  { name: "2.1 kg rounds up to 2.5", args: [2.1, 10, 10, 10], expected: 2.5 },
  { name: "3.2 kg rounds up to 3.5 (nearest would be 3)", args: [3.2, 10, 10, 10], expected: 3.5 },
  { name: "exactly 3 kg is unchanged", args: [3, 10, 10, 10], expected: 3 },
  // Rules 1 and 2: volumetric weight dominates (50 x 40 x 30 / 5000 = 12)
  { name: "large light box billed by volume", args: [1, 50, 40, 30], expected: 12 },
  // 30 x 30 x 30 / 5000 = 5.4 -> 5.5
  { name: "volumetric 5.4 rounds up to 5.5", args: [2, 30, 30, 30], expected: 5.5 },
  // Rule 4: minimum 1 kg
  { name: "tiny envelope is billed the 1 kg minimum", args: [0.2, 10, 10, 10], expected: 1 },
  // Rule 5: invalid input
  { name: "zero length is rejected", args: [2, 0, 10, 10], throws: "RangeError" },
  { name: "negative weight is rejected", args: [-1, 10, 10, 10], throws: "RangeError" },
  { name: "NaN height is rejected", args: [2, 10, 10, NaN], throws: "RangeError" },
];

function runCases(fn, list = cases) {
  const failing = [];
  for (const c of list) {
    try {
      const got = fn(...c.args);
      if (c.throws || !Object.is(got, c.expected)) failing.push(c.name);
    } catch (e) {
      if (!c.throws || e.name !== c.throws) failing.push(c.name);
    }
  }
  return failing;
}
`;

// Shared by every check: the correct implementation, the mutants, and a case runner.
const harness = `function validate(args) {
  for (const v of args) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw new RangeError("invalid argument " + v);
  }
}
const correct = (a, l, w, h) => { validate([a, l, w, h]); return Math.max(1, Math.ceil(Math.max(a, (l * w * h) / 5000) * 2) / 2); };
const mutants = {
  "rounds to the nearest 0.5 instead of up": (a, l, w, h) => { validate([a, l, w, h]); return Math.max(1, Math.round(Math.max(a, (l * w * h) / 5000) * 2) / 2); },
  "always adds 0.5, even on an exact step": (a, l, w, h) => { validate([a, l, w, h]); return Math.max(1, Math.floor(Math.max(a, (l * w * h) / 5000) * 2) / 2 + 0.5); },
  "ignores volumetric weight": (a, l, w, h) => { validate([a, l, w, h]); return Math.max(1, Math.ceil(a * 2) / 2); },
  "divides by 6000 instead of 5000": (a, l, w, h) => { validate([a, l, w, h]); return Math.max(1, Math.ceil(Math.max(a, (l * w * h) / 6000) * 2) / 2); },
  "has no 1 kg minimum": (a, l, w, h) => { validate([a, l, w, h]); return Math.ceil(Math.max(a, (l * w * h) / 5000) * 2) / 2; },
  "does not validate its input": (a, l, w, h) => Math.max(1, Math.ceil(Math.max(a, (l * w * h) / 5000) * 2) / 2),
};
function outcome(fn, c) {
  try {
    const got = fn(...c.args);
    if (c.throws) return "expected " + c.throws + " but it returned " + got;
    if (!Object.is(got, c.expected)) return "expected " + c.expected + " but it returned " + got;
    return null;
  } catch (e) {
    if (c.throws && e && e.name === c.throws) return null;
    return "it threw " + (e && e.name) + ": " + (e && e.message);
  }
}
const list = Array.isArray(module.cases) ? module.cases : [];
function assertCaught(mutantName) {
  const caught = list.some((c) => outcome(mutants[mutantName], c) !== null);
  assert(caught, "a broken implementation that " + mutantName + " passes every one of your cases");
}`;

export const jsBillableWeightTests: MissionInput = {
  slug: "js-billable-weight-tests",
  version: 1,
  track: "javascript",
  tier: "advanced",
  order: 3,
  title: "Write test cases that catch a broken pricing rule",
  summary:
    "Turn the billable-weight pricing rule into a test table with correct expectations, boundaries and error cases, so that each plausible broken implementation fails at least one case.",
  minutes: 35,
  assessmentTypes: ["write-code", "interpret-output", "explain-root-cause"],
  skills: ["js.testing"],
  appliesSkills: ["js.functions", "js.error-handling", "js.arrays"],
  prerequisites: ["js-fetch-tracking-json"],
  brief: {
    from: "Sam Ortiz, engineering manager",
    channel: "#eng-leads",
    body: `Finance found that October invoices undercharged bulky parcels by about £4,100: the billable-weight function rounded to the *nearest* half kilo instead of up, and nobody noticed because its only test used a 2 kg parcel.

Marco is rewriting \`billableWeight\` to the new rule (PR-14, in \`docs/billable-weight.md\`). Before he merges, I want a test table that would have caught October's bug **and** the other ways this could go wrong — volumetric weight, the 1 kg minimum, invalid dimensions.

Please fill in \`cases\` in \`billable-weight.cases.js\`. The checks run your table against a correct implementation and against several plausible broken ones. Every expected value should come from the spec, not from running code.`,
  },
  objectives: [
    "Derive expected values from a specification rather than from the implementation",
    "Choose cases on both sides of each rule's boundary, including exact boundary values",
    "Include error cases that assert the specified exception type",
    "Explain why a passing suite can still be inadequate, using broken implementations (mutants) as evidence",
  ],
  concept: {
    title: "A test is only as good as the bugs it can catch",
    body: `A test case is an input plus an **expected output taken from the specification**. If you compute "expected" by running the code under test, the test can only confirm the code agrees with itself — October's rounding bug would have been enshrined as correct.

Good cases target **rules and their boundaries**. For each rule, ask: what input would give a *different* answer if this rule were wrong or missing?

- Rounding up vs to nearest differ for 2.1 (2.5 vs 2) and 3.2 (3.5 vs 3).
- "Exact steps unchanged" needs an input that is already on a step (3 → 3).
- "Larger of actual and volumetric" needs a box where volume dominates *and* one where weight dominates.
- A minimum needs an input below it.
- Validation needs each kind of invalid input, asserting the specified error type.

One way to measure a suite is **mutation testing**: make small deliberate bugs ("mutants") in the implementation and check that at least one test fails for each. A mutant that survives points to a rule your suite never really checks.

${F}js
// passes with the correct code AND with Math.round instead of Math.ceil:
{ args: [2, 10, 10, 10], expected: 2 }   // weak: 2 is already on a step
{ args: [2.1, 10, 10, 10], expected: 2.5 } // strong: separates up from nearest
${F}`,
  },
  workedExample: {
    title: "Worked example: tests for a late-delivery refund rule",
    body: `Spec: *refundPercent(minutesLate)*: 0 if under 30 minutes, 10 from 30 up to (not including) 120, 25 from 120; negative or non-finite input throws RangeError.

**Step 1 — list each rule and its boundary.** Thresholds at 30 and 120; error for negatives.

**Step 2 — pick values on both sides of each boundary, and the boundary itself.**

${F}js
const cases = [
  { name: "on time",               args: [0],   expected: 0 },
  { name: "just under 30",         args: [29],  expected: 0 },
  { name: "exactly 30",            args: [30],  expected: 10 },  // catches > vs >=
  { name: "just under 120",        args: [119], expected: 10 },
  { name: "exactly 120",           args: [120], expected: 25 },
  { name: "negative is rejected",  args: [-5],  throws: "RangeError" },
  { name: "NaN is rejected",       args: [NaN], throws: "RangeError" },
];
${F}

**Step 3 — imagine mutants.** \`minutes > 30\` instead of \`>= 30\`: caught by "exactly 30". Forgetting the 25% tier: caught by "exactly 120". No validation: caught by both error cases.

**Step 4 — check expectations against the spec, not the code.** If a case fails against the real implementation, re-read the spec before "fixing" the expectation: either the test or the code is wrong, and the spec decides which.`,
  },
  workspace: {
    kind: "javascript",
    entry: "billable-weight.cases.js",
    exports: ["cases"],
    files: [
      { path: "billable-weight.cases.js", content: starter, editable: true },
      { path: "docs/billable-weight.md", content: spec, editable: false },
    ],
    tests: [
      {
        id: "cases-well-formed",
        name: "cases is a non-empty table of well-formed cases",
        code: `assert(Array.isArray(module.cases) && module.cases.length > 0, "cases should be a non-empty array");
for (const [i, c] of module.cases.entries()) {
  const label = "case " + i + " (" + (c && c.name) + ")";
  assert(c && Array.isArray(c.args) && c.args.length === 4, label + ": args should be [actualKg, lengthCm, widthCm, heightCm]");
  const hasExpected = typeof c.expected === "number";
  const hasThrows = typeof c.throws === "string";
  assert(hasExpected !== hasThrows, label + ": give exactly one of expected (a number) or throws (an error name)");
}`,
        feedback: {
          what: "cases is empty, or a case is missing args of length 4 or has neither (or both) expected and throws.",
          why: "The checks need an unambiguous expectation for every case.",
          next: "Use { name, args: [kg, l, w, h], expected: number } or { name, args, throws: \"RangeError\" }.",
        },
      },
      {
        id: "cases-match-spec",
        name: "Every case passes against the correct implementation",
        code: `${harness}
const wrong = list.map((c) => ({ c, why: outcome(correct, c) })).filter((x) => x.why !== null);
assert(wrong.length === 0, "these expectations disagree with the spec: " + wrong.map((x) => JSON.stringify(x.c.name) + " (" + x.why + ")").join("; "));`,
        feedback: {
          what: "At least one of your expected values does not follow docs/billable-weight.md.",
          why: "A test with a wrong expectation either fails on correct code or, worse, blesses a bug — that is how October's rounding was accepted.",
          next: "Recompute the failing case by hand: volumetric = l × w × h ÷ 5000, take the larger, round UP to 0.5, apply the 1 kg minimum.",
        },
      },
      {
        id: "catches-rounding-bugs",
        name: "Catches rounding mistakes (October's bug and its opposite)",
        code: `${harness}
assertCaught("rounds to the nearest 0.5 instead of up");
assertCaught("always adds 0.5, even on an exact step");`,
        feedback: {
          what: "A broken implementation with wrong rounding passes all your cases.",
          why: "Rounding to nearest only differs from rounding up when the fraction is below .25 above a step; always-add-0.5 only differs on an exact step.",
          next: "Add a case like 3.2 kg (up gives 3.5, nearest gives 3) and one already on a step, like exactly 3 kg.",
        },
      },
      {
        id: "catches-volumetric-bugs",
        name: "Catches volumetric weight mistakes",
        code: `${harness}
assertCaught("ignores volumetric weight");
assertCaught("divides by 6000 instead of 5000");`,
        feedback: {
          what: "A broken implementation that ignores volume, or uses the wrong divisor, passes all your cases.",
          why: "Bulky, light parcels are where the money was lost; none of your cases has volume as the deciding factor.",
          next: "Add a large light box, e.g. 1 kg at 50 × 40 × 30 cm (volumetric 12 kg).",
        },
      },
      {
        id: "catches-missing-minimum",
        name: "Catches a missing 1 kg minimum",
        hidden: true,
        code: `${harness}
assertCaught("has no 1 kg minimum");`,
        feedback: {
          what: "An implementation without the 1 kg minimum passes all your cases.",
          why: "Every case you wrote is already at or above 1 kg, so rule 4 is never exercised.",
          next: "Add a tiny, light parcel whose rounded weight is below 1 kg, e.g. 0.2 kg at 10 × 10 × 10 cm.",
        },
      },
      {
        id: "catches-missing-validation",
        name: "Catches missing input validation",
        hidden: true,
        code: `${harness}
assertCaught("does not validate its input");`,
        feedback: {
          what: "An implementation that never throws passes all your cases.",
          why: "Rule 5 is part of the contract: a zero dimension from a scanner fault must not silently bill the minimum.",
          next: "Add cases with a zero, negative or NaN argument and throws: \"RangeError\".",
        },
      },
    ],
    solution: { "billable-weight.cases.js": solution },
    wrongSolutions: [
      {
        label: "happy paths plus the spec's example only",
        files: {
          "billable-weight.cases.js": `const cases = [
  { name: "small heavy parcel", args: [2, 10, 10, 10], expected: 2 },
  { name: "spec example", args: [2.1, 10, 10, 10], expected: 2.5 },
  { name: "bulky box", args: [1, 50, 40, 30], expected: 12 },
];
`,
        },
      },
      {
        label: "expectations computed with round-to-nearest",
        files: {
          "billable-weight.cases.js": `const cases = [
  { name: "3.2 kg", args: [3.2, 10, 10, 10], expected: 3 },
  { name: "exactly 3 kg", args: [3, 10, 10, 10], expected: 3 },
  { name: "bulky box", args: [1, 50, 40, 30], expected: 12 },
  { name: "tiny", args: [0.2, 10, 10, 10], expected: 1 },
  { name: "zero length", args: [2, 0, 10, 10], throws: "RangeError" },
];
`,
        },
      },
      {
        label: "expects invalid input to return 0 instead of throwing",
        files: {
          "billable-weight.cases.js": `const cases = [
  { name: "3.2 kg", args: [3.2, 10, 10, 10], expected: 3.5 },
  { name: "exactly 3 kg", args: [3, 10, 10, 10], expected: 3 },
  { name: "bulky box", args: [1, 50, 40, 30], expected: 12 },
  { name: "tiny", args: [0.2, 10, 10, 10], expected: 1 },
  { name: "zero length", args: [2, 0, 10, 10], expected: 0 },
];
`,
        },
      },
    ],
  },
  successCriteria: [
    "Every case's expectation follows the PR-14 specification",
    "The table catches wrong rounding (to nearest, and bumping exact steps)",
    "The table catches ignoring volumetric weight or using the wrong divisor",
    "The table catches a missing 1 kg minimum and missing input validation",
  ],
  hints: [
    "Go through docs/billable-weight.md rule by rule. For each rule, write down an input whose answer would change if that rule were implemented wrongly.",
    "Your starter case (2 kg) is already on a 0.5 step, so it gives the same answer whether you round up, down or to nearest. Which weights separate \"up\" from \"nearest\"?",
    "You need cases where volume beats actual weight, where the result would fall below 1 kg, and where an argument is 0, negative or NaN (with throws: \"RangeError\").",
    "A table that catches everything: 3.2 kg → 3.5; exactly 3 kg → 3; 1 kg at 50 × 40 × 30 → 12; 0.2 kg at 10 × 10 × 10 → 1; and [2, 0, 10, 10] with throws: \"RangeError\". Check each value by hand against the spec.",
  ],
  questions: [
    {
      id: "compute-billable",
      kind: "short",
      prompt: "Using the spec, what is billableWeight(0.3, 20, 20, 20)? (Number of kg only.)",
      accept: ["2", "2.0", "2 kg"],
      explanation: "Volumetric = 8000 ÷ 5000 = 1.6 kg, larger than 0.3. Rounding up to the next 0.5 gives 2. That is above the 1 kg minimum.",
    },
    {
      id: "predict-weak-case",
      kind: "mcq",
      prompt: "Which single case would have caught October's bug (Math.round instead of Math.ceil on the half-kilo step)?",
      options: [
        "{ args: [2, 10, 10, 10], expected: 2 }",
        "{ args: [3.2, 10, 10, 10], expected: 3.5 }",
        "{ args: [3.5, 10, 10, 10], expected: 3.5 }",
        "{ args: [2.4, 10, 10, 10], expected: 2.5 }",
      ],
      answer: 1,
      explanation:
        "3.2 rounds up to 3.5 but to nearest gives 3. The 2 and 3.5 cases are already on a step; 2.4 rounds to 2.5 either way.",
    },
    {
      id: "explain-passing-not-enough",
      kind: "explain",
      prompt: "October's billableWeight had a passing test. Explain why that test gave false confidence and how checking your table against broken implementations exposes the problem.",
      concepts: [
        { label: "the test input did not exercise the rounding rule (2 kg is already on a step)", anyOf: ["already on a step", "exact step", "on a step", "did not exercise", "didn't exercise", "same answer", "same result", "either way", "boundary", "edge case"] },
        { label: "a broken implementation still passed (the bug survived)", anyOf: ["mutant", "broken implementation", "buggy implementation", "wrong implementation", "still pass", "survive", "not caught", "undetected", "passes anyway"] },
        { label: "expected values must come from the spec, with cases per rule", anyOf: ["spec", "specification", "each rule", "every rule", "by hand", "rule"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "The only test used a 2 kg parcel, which is already on a 0.5 kg step, so rounding up and rounding to nearest give the same answer and the rounding rule was never exercised. A broken implementation using Math.round still passed, so the bug survived undetected. Running the table against deliberate mutants shows which rules are untested; the fix is to derive expected values from the spec and include a boundary case for each rule, such as 3.2 kg expecting 3.5.",
      explanation: "Coverage of lines is not coverage of rules. Mutants make the gap measurable.",
    },
  ],
  debrief: {
    solution: `The reference table has one or more cases per rule, each chosen so that a specific mistake changes the answer:

| Rule | Case | Catches |
| --- | --- | --- |
| Round up | 2.1 → 2.5, 3.2 → 3.5 | round-to-nearest |
| Exact step unchanged | 3 → 3 | always adding 0.5 |
| Volumetric | 1 kg at 50×40×30 → 12; 2 kg at 30×30×30 → 5.5 | ignoring volume, wrong divisor |
| Minimum | 0.2 kg at 10×10×10 → 1 | missing minimum |
| Validation | 0, negative, NaN → RangeError | no validation |

Every expected value was computed from the spec by hand. The "small heavy parcel" case is still useful as a sanity check, but it cannot distinguish rounding strategies.`,
    commonMistakes: [
      "Computing expected values by running the implementation, which copies its bugs into the tests.",
      "Testing only round numbers that already sit on a 0.5 step, so rounding rules are never exercised.",
      "Testing only one side of a max(): if weight always dominates, volume is never checked.",
      "Writing error cases that expect a return value (0, null) instead of the specified exception type.",
    ],
    realWorld:
      "Table-driven tests (test.each in Vitest/Jest, parametrised tests in pytest) are the standard way to cover a rule like this. Mutation-testing tools such as Stryker automate what the checks did here: they mutate your code and report surviving mutants, which is a stronger signal than line coverage. Finance-affecting rules deserve exactly this rigour.",
  },
  review: [
    {
      id: "js-boundary-cases",
      skill: "js.testing",
      variants: [
        {
          id: "js-boundary-cases-a",
          kind: "mcq",
          prompt: "Spec: free delivery for orders of £50 or more. Which test input best catches a `>` vs `>=` mistake?",
          options: ["£10", "£49.99", "£50", "£500"],
          answer: 2,
          explanation: "Only the exact boundary value distinguishes > 50 from >= 50.",
        },
        {
          id: "js-boundary-cases-b",
          kind: "mcq",
          prompt: "Spec: a van is overloaded above 3500 kg. Which input best catches a `>=` vs `>` mistake?",
          options: ["1000 kg", "3500 kg", "3501 kg", "9000 kg"],
          answer: 1,
          explanation: "At exactly 3500 kg, \"above\" says not overloaded; >= would wrongly say overloaded.",
        },
      ],
    },
    {
      id: "js-expected-from-spec",
      skill: "js.testing",
      variants: [
        {
          id: "js-expected-from-spec-a",
          kind: "mcq",
          prompt: "A new test fails against the current implementation. What should you do first?",
          options: [
            "Change the expected value to what the implementation returns",
            "Re-check the expected value against the specification to decide whether the test or the code is wrong",
            "Delete the test",
            "Mark the test as skipped until later",
          ],
          answer: 1,
          explanation: "The spec is the referee. Updating expectations to match the code turns tests into a recording of current bugs.",
        },
        {
          id: "js-expected-from-spec-b",
          kind: "mcq",
          prompt: "Where should a test's expected value come from?",
          options: ["Running the function and copying its output", "The requirement or specification, worked out independently", "Whatever makes the test pass", "The previous version's output, always"],
          answer: 1,
          explanation: "Expected values must be independent of the code under test, or the test cannot find bugs in it.",
        },
      ],
    },
    {
      id: "js-surviving-mutant",
      skill: "js.testing",
      variants: [
        {
          id: "js-surviving-mutant-a",
          kind: "mcq",
          prompt: "You change `Math.ceil` to `Math.floor` in a function and every test still passes. What does that tell you?",
          options: [
            "The change is harmless",
            "No test exercises an input where ceil and floor differ; the suite is missing a case",
            "The tests are too strict",
            "Math.floor and Math.ceil are equivalent",
          ],
          answer: 1,
          explanation: "A surviving mutant means the suite cannot detect that behaviour changing.",
        },
        {
          id: "js-surviving-mutant-b",
          kind: "mcq",
          prompt: "You delete the input-validation line from a function and every test still passes. What is the best response?",
          options: [
            "Keep the deletion; the tests prove validation is unnecessary",
            "Add test cases with invalid input that expect the specified error",
            "Increase line coverage by calling the function more times",
            "Add a comment explaining validation",
          ],
          answer: 1,
          explanation: "The surviving mutant shows validation is untested; add cases that would fail without it.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev needs tests for `isLabAddress(ip)`: true for addresses in 192.168.50.0/24 (192.168.50.0 to 192.168.50.255), false otherwise; throws TypeError for strings that are not dotted-quad IPv4. He has written one case: `isLabAddress(\"192.168.50.10\") === true`.",
    question: {
      id: "transfer-ip-cases",
      kind: "mcq",
      prompt: "Which additional set of cases best pins down the rule?",
      options: [
        "\"192.168.50.0\" → true, \"192.168.50.255\" → true, \"192.168.51.0\" → false, \"192.168.49.255\" → false, \"10.20.0.5\" → false, \"not-an-ip\" → TypeError",
        "\"192.168.50.11\" → true, \"192.168.50.12\" → true, \"192.168.50.13\" → true",
        "Run isLabAddress on 100 random addresses and assert it returns a boolean",
        "\"192.168.50.10\" → true again, to make sure it is deterministic",
      ],
      answer: 0,
      explanation:
        "Both edges of the range, the first addresses just outside it, an unrelated network, and an invalid input — each catches a different plausible bug.",
    },
  },
  refresher: {
    body: `A test case pairs an input with the output the **specification** says it should produce. Work the expected value out by hand — never by running the code you are testing. Pick inputs that would give a *different* answer if a rule were wrong: values exactly on and just past each threshold, inputs where each part of a formula decides the result, and invalid inputs that should throw. If you can break the code and every test still passes, a case is missing.`,
    practice: {
      id: "refresher-boundary",
      kind: "mcq",
      prompt: "Spec: drivers may work at most 9 hours. Which single input is most useful for testing the limit?",
      options: ["4 hours", "9 hours", "12 hours", "0 hours"],
      answer: 1,
      explanation: "Exactly 9 hours separates \"at most\" (allowed) from an accidental \"less than\" (refused).",
    },
  },
};
