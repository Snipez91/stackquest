import type { MissionInput } from "@/content/schema";

const F = "```";

const shipmentsJson = `[
  { "id": "LUM-2001", "depot": "LDS", "status": "in_transit", "weightKg": 120.5 },
  { "id": "LUM-2002", "depot": "MAN", "status": "delayed", "weightKg": 340 },
  { "id": "LUM-2003", "depot": "LDS", "status": "delivered", "weightKg": 75 },
  { "id": "LUM-2004", "depot": "BHM", "status": "delayed", "weightKg": 18.25 },
  { "id": "LUM-2005", "depot": "MAN", "status": "in_transit", "weightKg": 610 },
  { "id": "LUM-2006", "depot": "LDS", "status": "delayed", "weightKg": 42 },
  { "id": "LUM-2007", "depot": "BHM", "status": "in_transit", "weightKg": 260.75 },
  { "id": "LUM-2008", "depot": "MAN", "status": "delivered", "weightKg": 95 }
]
`;

const starter = `// Lumen Logistics — summary panel helpers for the dispatch dashboard.
// Each shipment looks like:
//   { id: "LUM-2001", depot: "LDS", status: "in_transit", weightKg: 120.5 }
// See data/shipments.json for this morning's feed.

// IDs of shipments whose status is "delayed", in feed order.
function delayedIds(shipments) {
  return shipments.map((s) => {
    if (s.status === "delayed") return s.id;
  });
}

// Total weight per depot, e.g. { LDS: 237.5, MAN: 1045, BHM: 279 }.
function weightByDepot(shipments) {
  return shipments.reduce((totals, s) => {
    totals[s.depot] = (totals[s.depot] || 0) + s.weightKg;
    return totals;
  });
}

// The n heaviest shipments, heaviest first. The feed order must not change:
// the main table renders the same array right after this is called.
function heaviest(shipments, n) {
  return shipments.sort((a, b) => b.weightKg - a.weightKg).slice(0, n);
}
`;

const solution = `// Lumen Logistics — summary panel helpers for the dispatch dashboard.

// IDs of shipments whose status is "delayed", in feed order.
function delayedIds(shipments) {
  return shipments.filter((s) => s.status === "delayed").map((s) => s.id);
}

// Total weight per depot, e.g. { LDS: 237.5, MAN: 1045, BHM: 279 }.
function weightByDepot(shipments) {
  return shipments.reduce((totals, s) => {
    totals[s.depot] = (totals[s.depot] ?? 0) + s.weightKg;
    return totals;
  }, {});
}

// The n heaviest shipments, heaviest first, without reordering the input.
function heaviest(shipments, n) {
  return [...shipments].sort((a, b) => b.weightKg - a.weightKg).slice(0, n);
}
`;

const load = `const feed = JSON.parse(files["data/shipments.json"]);`;

export const jsShipmentArrayPipeline: MissionInput = {
  slug: "js-shipment-array-pipeline",
  version: 1,
  track: "javascript",
  tier: "beginner",
  order: 3,
  title: "Summarise the shipment feed with filter, map and reduce",
  summary:
    "The dashboard summary panel lists blank delays, nonsense depot totals and reorders the main table. Rebuild it with filter, map and reduce without mutating the feed.",
  minutes: 25,
  assessmentTypes: ["repair-code", "write-code", "order-steps"],
  skills: ["js.arrays"],
  appliesSkills: ["js.functions"],
  prerequisites: ["js-eta-pure-functions"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#dispatch-dashboard",
    body: `During this morning's stand-up the dispatch dashboard summary panel was useless:

- "Delayed" listed **8 entries**, five of them blank — there are 3 delayed shipments.
- "Weight by depot" showed an object with an \`id\` field and a \`status\` of \`in_transit\`, and on the quiet Sunday feed (no shipments) the whole panel crashed.
- After the panel loaded, the main shipment table was suddenly sorted by weight, so dispatchers lost their place.

The helpers are in \`summary.js\` and the feed is in \`data/shipments.json\`. Please fix all three so the panel is correct and leaves the feed array exactly as it was. Aiko will wire them up after lunch.`,
  },
  objectives: [
    "Choose filter to select items and map to transform each item",
    "Use reduce with an explicit initial value to build an object",
    "Avoid mutating an input array by copying before sort",
    "Chain array methods into a readable pipeline",
  ],
  concept: {
    title: "Arrays in, arrays (or values) out",
    body: `Most list work is one of three shapes:

| Method | Callback returns | Result |
| --- | --- | --- |
| \`filter\` | true / false | a new array with **some** items |
| \`map\` | a new value | a new array with the **same length** |
| \`reduce\` | the next accumulator | **one** value (number, object…) |

\`map\` always keeps the length: if the callback returns nothing for some items, those slots are \`undefined\`. To select *and* transform, chain: \`filter(…).map(…)\`.

\`reduce(callback, initial)\` walks the array carrying an accumulator. **Always pass the initial value.** Without it, the first element becomes the accumulator (so your "totals object" is really a shipment), and an empty array throws \`TypeError: Reduce of empty array with no initial value\`.

${F}js
[5, 10, 20].reduce((sum, n) => sum + n, 0); // 0 → 5 → 15 → 35
${F}

Some methods **mutate** the array they are called on: \`sort\`, \`reverse\`, \`push\`, \`splice\`. Arrays are passed by reference, so sorting a parameter reorders the caller's data too. Copy first — \`[...items].sort(…)\` — or use the non-mutating \`toSorted\` where available.`,
  },
  workedExample: {
    title: "Worked example: summarising driver shifts",
    body: `Input: \`[{ driver: "Ana", hours: 7 }, { driver: "Ben", hours: 11 }, { driver: "Ana", hours: 4 }]\`.

**Names of drivers over 6 hours** — select, then transform:

${F}js
shifts.filter((s) => s.hours > 6).map((s) => s.driver); // ["Ana", "Ben"]
${F}

**Hours per driver** — reduce into an object, starting from \`{}\`:

${F}js
shifts.reduce((acc, s) => {
  acc[s.driver] = (acc[s.driver] ?? 0) + s.hours;
  return acc;               // forgetting this makes acc undefined next time
}, {});                     // { Ana: 11, Ben: 11 }
${F}

**Longest two shifts, without touching \`shifts\`:**

${F}js
[...shifts].sort((a, b) => b.hours - a.hours).slice(0, 2);
${F}

The comparator returns a negative number when \`a\` should come first. \`b.hours - a.hours\` sorts descending. Because we sorted a copy, \`shifts\` is still in its original order.`,
  },
  workspace: {
    kind: "javascript",
    entry: "summary.js",
    exports: ["delayedIds", "weightByDepot", "heaviest"],
    files: [
      { path: "summary.js", content: starter, editable: true },
      { path: "data/shipments.json", content: shipmentsJson, editable: false },
    ],
    tests: [
      {
        id: "delayed-ids",
        name: "delayedIds lists only delayed shipment IDs",
        code: `${load}
assertDeepEqual(module.delayedIds(feed), ["LUM-2002", "LUM-2004", "LUM-2006"]);`,
        feedback: {
          what: "delayedIds returned the wrong items — extra undefined entries, whole shipment objects, or missing IDs.",
          why: "map always returns an array of the same length; it cannot drop items.",
          next: "Select with filter first, then map each remaining shipment to its id.",
        },
      },
      {
        id: "delayed-none",
        name: "delayedIds returns an empty list when nothing is delayed",
        hidden: true,
        code: `const calm = [{ id: "A", depot: "LDS", status: "delivered", weightKg: 1 }, { id: "B", depot: "LDS", status: "in_transit", weightKg: 2 }];
assertDeepEqual(module.delayedIds(calm), [], "no delayed shipments should give []");`,
        feedback: {
          what: "With no delayed shipments, delayedIds did not return an empty array.",
          why: "The panel shows a count; any placeholder entries would show phantom delays.",
          next: "filter returns [] when nothing matches; make sure nothing is added for non-delayed items.",
        },
      },
      {
        id: "weight-by-depot",
        name: "weightByDepot totals weight per depot",
        code: `${load}
assertDeepEqual(module.weightByDepot(feed), { LDS: 237.5, MAN: 1045, BHM: 279 });`,
        feedback: {
          what: "The per-depot totals object was wrong (it contained shipment fields, or totals were off).",
          why: "Without an initial value, reduce uses the first shipment as the accumulator, so totals are written onto a shipment object.",
          next: "Pass {} as the second argument to reduce, and return the accumulator from the callback.",
        },
      },
      {
        id: "weight-empty",
        name: "weightByDepot handles an empty feed",
        hidden: true,
        code: `let result;
try { result = module.weightByDepot([]); } catch (e) { throw new Error("weightByDepot([]) threw " + e.name + ": " + e.message); }
assertDeepEqual(result, {}, "an empty feed should give {}");`,
        feedback: {
          what: "weightByDepot threw or returned something other than {} for an empty feed.",
          why: "reduce on an empty array with no initial value throws a TypeError — that is the Sunday crash.",
          next: "Give reduce an initial value of {}.",
        },
      },
      {
        id: "heaviest-order",
        name: "heaviest returns the n heaviest, heaviest first",
        code: `${load}
assertDeepEqual(module.heaviest(feed, 3).map((s) => s.id), ["LUM-2005", "LUM-2002", "LUM-2007"]);
assertEqual(module.heaviest(feed, 20).length, 8, "asking for more than exist should return all 8");`,
        feedback: {
          what: "heaviest returned the wrong shipments or the wrong order.",
          why: "The comparator decides direction: b.weightKg - a.weightKg sorts heaviest first.",
          next: "Sort a copy by weight descending, then slice(0, n).",
        },
      },
      {
        id: "heaviest-no-mutation",
        name: "heaviest leaves the feed in its original order",
        code: `${load}
const before = feed.map((s) => s.id);
module.heaviest(feed, 3);
assertDeepEqual(feed.map((s) => s.id), before, "the feed array was reordered by heaviest()");`,
        feedback: {
          what: "After calling heaviest, the caller's feed array was in a different order.",
          why: "sort sorts in place and arrays are shared by reference, so the main table was re-sorted too.",
          next: "Copy the array before sorting: [...shipments].sort(…) or shipments.slice().sort(…).",
        },
      },
    ],
    solution: { "summary.js": solution },
    wrongSolutions: [
      {
        label: "filter without map returns whole shipment objects",
        files: {
          "summary.js": `function delayedIds(shipments) {
  return shipments.filter((s) => s.status === "delayed");
}
function weightByDepot(shipments) {
  return shipments.reduce((t, s) => { t[s.depot] = (t[s.depot] || 0) + s.weightKg; return t; }, {});
}
function heaviest(shipments, n) {
  return [...shipments].sort((a, b) => b.weightKg - a.weightKg).slice(0, n);
}
`,
        },
      },
      {
        label: "sorts the caller's array in place",
        files: {
          "summary.js": `function delayedIds(shipments) {
  return shipments.filter((s) => s.status === "delayed").map((s) => s.id);
}
function weightByDepot(shipments) {
  return shipments.reduce((t, s) => { t[s.depot] = (t[s.depot] || 0) + s.weightKg; return t; }, {});
}
function heaviest(shipments, n) {
  shipments.sort((a, b) => b.weightKg - a.weightKg);
  return shipments.slice(0, n);
}
`,
        },
      },
      {
        label: "reduce starts from an array instead of an object",
        files: {
          "summary.js": `function delayedIds(shipments) {
  return shipments.filter((s) => s.status === "delayed").map((s) => s.id);
}
function weightByDepot(shipments) {
  return shipments.reduce((t, s) => { t[s.depot] = (t[s.depot] || 0) + s.weightKg; return t; }, []);
}
function heaviest(shipments, n) {
  return [...shipments].sort((a, b) => b.weightKg - a.weightKg).slice(0, n);
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "delayedIds returns exactly the IDs of delayed shipments, in feed order",
    "weightByDepot returns an object of totals and returns {} for an empty feed",
    "heaviest returns the top n by weight and does not reorder the feed",
  ],
  hints: [
    "Compare each function with the table in the concept: which method keeps the length, which drops items, which produces one value?",
    "delayedIds needs two steps. weightByDepot is missing one argument to reduce. heaviest calls a method that changes the array it is called on.",
    "reduce's second argument is the starting accumulator. For a totals object that is {}.",
    "delayedIds: `shipments.filter((s) => s.status === \"delayed\").map((s) => s.id)`. heaviest: sort a copy — `[...shipments].sort((a, b) => b.weightKg - a.weightKg)` — then `.slice(0, n)`.",
  ],
  questions: [
    {
      id: "predict-map-if",
      kind: "mcq",
      prompt: "What does this return?",
      code: `["ok", "late", "ok"].map((s) => {
  if (s === "late") return s.toUpperCase();
});`,
      codeLanguage: "javascript",
      options: ["[\"LATE\"]", "[undefined, \"LATE\", undefined]", "[\"ok\", \"LATE\", \"ok\"]", "[]"],
      answer: 1,
      explanation: "map produces one output per input. Callbacks that return nothing produce undefined in those slots.",
    },
    {
      id: "order-reduce-steps",
      kind: "order",
      prompt: "Put the steps of `[5, 10, 20].reduce((sum, n) => sum + n, 0)` in the order they happen.",
      items: [
        "sum starts as the initial value 0",
        "the callback receives (0, 5) and returns 5",
        "the callback receives (5, 10) and returns 15",
        "the callback receives (15, 20) and returns 35",
        "reduce returns 35",
      ],
      explanation: "The accumulator is threaded through each call: whatever the callback returns becomes the next sum.",
    },
    {
      id: "predict-sort-mutates",
      kind: "mcq",
      prompt: "What is logged?",
      code: `const ids = [30, 10, 20];
const sorted = ids.sort((a, b) => a - b);
console.log(ids);`,
      codeLanguage: "javascript",
      options: ["[30, 10, 20]", "[10, 20, 30]", "undefined", "[20, 10, 30]"],
      answer: 1,
      explanation: "sort reorders the array in place and returns the same array, so ids and sorted are one array.",
    },
  ],
  debrief: {
    solution: `- **delayedIds**: \`filter\` keeps the delayed shipments, then \`map\` turns each into its id. A single \`map\` can't drop items.
- **weightByDepot**: \`reduce(…, {})\`. The initial \`{}\` is the accumulator on the first call, and it makes the empty-feed case return \`{}\` instead of throwing.
- **heaviest**: \`[...shipments].sort(byWeightDesc).slice(0, n)\` sorts a shallow copy, so the caller's array keeps its order.

Each function returns a new value and leaves its input untouched — the same purity rule as the previous mission, applied to arrays.`,
    commonMistakes: [
      "Using map with an if inside to select items — it leaves undefined holes.",
      "Omitting reduce's initial value, which uses the first element as the accumulator and throws on empty arrays.",
      "Forgetting to return the accumulator from the reduce callback, so it becomes undefined on the next step.",
      "Sorting the input directly; sort mutates and returns the same array, not a copy.",
    ],
    realWorld:
      "Dashboard data usually lives in shared state (a store, a React prop, a cache). Mutating it in a helper causes bugs far from the helper — exactly the re-sorted table. Teams prefer non-mutating pipelines (filter/map/reduce, spread copies, toSorted) and frameworks such as React rely on new arrays to detect changes.",
  },
  review: [
    {
      id: "js-filter-then-map",
      skill: "js.arrays",
      variants: [
        {
          id: "js-filter-then-map-a",
          kind: "mcq",
          prompt: "You need the IDs of orders with `total > 100`. Which expression is correct?",
          options: [
            "orders.filter((o) => o.total > 100).map((o) => o.id)",
            "orders.map((o) => o.total > 100 && o.id)",
            "orders.map((o) => { if (o.total > 100) return o.id; })",
            "orders.reduce((o) => o.id)",
          ],
          answer: 0,
          explanation: "filter selects, map transforms. map on its own keeps every slot, producing false or undefined for rejected items.",
        },
        {
          id: "js-filter-then-map-b",
          kind: "mcq",
          prompt: "You need the names of drivers who are `onShift`. Which expression is correct?",
          options: [
            "drivers.map((d) => d.onShift ? d.name : undefined)",
            "drivers.filter((d) => d.onShift).map((d) => d.name)",
            "drivers.filter((d) => d.name)",
            "drivers.map((d) => d.onShift).filter((d) => d.name)",
          ],
          answer: 1,
          explanation: "Select the on-shift drivers first, then map each to its name.",
        },
      ],
    },
    {
      id: "js-reduce-initial-value",
      skill: "js.arrays",
      variants: [
        {
          id: "js-reduce-initial-value-a",
          kind: "mcq",
          prompt: "What happens?",
          code: `[].reduce((sum, n) => sum + n);`,
          codeLanguage: "javascript",
          options: ["Returns 0", "Returns undefined", "Throws TypeError: Reduce of empty array with no initial value", "Returns []"],
          answer: 2,
          explanation: "With no initial value, reduce needs at least one element to start from. Pass 0 as the second argument.",
        },
        {
          id: "js-reduce-initial-value-b",
          kind: "short",
          prompt: "What does this return?",
          code: `[].reduce((sum, n) => sum + n, 0);`,
          codeLanguage: "javascript",
          accept: ["0"],
          explanation: "The initial value is returned unchanged when the array is empty.",
        },
      ],
    },
    {
      id: "js-sort-copy",
      skill: "js.arrays",
      variants: [
        {
          id: "js-sort-copy-a",
          kind: "mcq",
          prompt: "Which returns the routes sorted by distance without changing `routes`?",
          options: [
            "routes.sort((a, b) => a.km - b.km)",
            "[...routes].sort((a, b) => a.km - b.km)",
            "routes.sort().slice()",
            "routes.reverse()",
          ],
          answer: 1,
          explanation: "Spreading into a new array gives sort a copy to reorder. sort and reverse mutate the array they are called on.",
        },
        {
          id: "js-sort-copy-b",
          kind: "mcq",
          prompt: "Which of these array methods changes the original array?",
          options: ["map", "filter", "slice", "sort"],
          answer: 3,
          explanation: "sort (like reverse, push and splice) mutates in place. map, filter and slice return new arrays.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "The fleet page shows vans as `[{ reg: \"LM26 ABC\", mileage: 48210 }, …]`. Sam wants the total mileage of vans over 40,000 miles as a single number.",
    question: {
      id: "transfer-mileage",
      kind: "mcq",
      prompt: "Which expression gives that total, including 0 when no van qualifies?",
      options: [
        "vans.filter((v) => v.mileage > 40000).reduce((sum, v) => sum + v.mileage, 0)",
        "vans.map((v) => v.mileage > 40000).reduce((sum, v) => sum + v)",
        "vans.filter((v) => v.mileage > 40000).reduce((sum, v) => sum + v.mileage)",
        "vans.sort((a, b) => b.mileage - a.mileage)[0].mileage",
      ],
      answer: 0,
      explanation:
        "Filter to the qualifying vans, then reduce with an initial 0. Without the initial value the empty case throws, and the first van object would be used as the accumulator.",
    },
  },
  refresher: {
    body: `Think of array methods by the shape of what they return. **filter** keeps the items whose callback returns true — the result can be shorter. **map** replaces each item with whatever the callback returns — the result always has the same length. **reduce** folds everything into one value, starting from the initial value you pass as its second argument. **sort** is different: it rearranges the original array instead of making a new one, so copy first with \`[...arr]\`.`,
    practice: {
      id: "refresher-filter-length",
      kind: "short",
      prompt: "How many items are in `[4, 9, 2, 12].filter((n) => n > 5)`?",
      accept: ["2", "two"],
      explanation: "Only 9 and 12 pass the test, so the result is [9, 12].",
    },
  },
};
