import type { MissionInput } from "@/content/schema";

const F = "```";

const recordsJson = `[
  {
    "shipment_id": "LUM-3101",
    "carrier": { "name": "Northline Freight", "code": "NLF" },
    "consignee": { "name": "Harbour Tools Ltd", "address": { "city": "Leeds", "postcode": "LS1 4AP" } },
    "pieces": 3,
    "eta": "2026-11-05T14:00:00Z",
    "tags": ["fragile"]
  },
  {
    "shipment_id": "LUM-3102",
    "carrier": { "name": "Pennine Express", "code": "PEX" },
    "consignee": { "name": "Moor Bakery" },
    "pieces": 0,
    "tags": []
  },
  {
    "shipment_id": "LUM-3103",
    "carrier": null,
    "consignee": { "name": "Canal Street Pharmacy", "address": { "city": "Manchester" } }
  }
]
`;

const starter = `// Lumen Logistics — normalise carrier API records for the dispatch dashboard.
// Input: see data/carrier-records.json. Output shape:
//   { id, carrierName, city, pieces, eta, tags }
// Rules agreed with Marco:
//   carrierName: carrier.name, or "Unassigned" when there is no carrier
//   city:        consignee.address.city, or null when the address is missing
//   pieces:      as sent (0 is valid: pre-advised, nothing collected yet); 1 when missing
//   eta:         as sent, or null when missing
//   tags:        a new array (never the API's array), [] when missing

function normaliseShipment(raw) {
  return {
    id: raw.shipment_id,
    carrierName: raw.carrier.name,
    city: raw.consignee.address.city,
    pieces: raw.pieces || 1,
    eta: raw.eta || null,
    tags: raw.tags,
  };
}

// Return an updated copy of a normalised record. The original must not change
// (the undo button keeps it). The id can never be changed by a patch.
function applyUpdate(record, patch) {
  return Object.assign(record, patch);
}
`;

const solution = `// Lumen Logistics — normalise carrier API records for the dispatch dashboard.

function normaliseShipment(raw) {
  const { shipment_id: id, carrier, consignee, pieces, eta, tags } = raw;
  return {
    id,
    carrierName: carrier?.name ?? "Unassigned",
    city: consignee?.address?.city ?? null,
    pieces: pieces ?? 1,
    eta: eta ?? null,
    tags: [...(tags ?? [])],
  };
}

// Return an updated copy; the original is untouched and the id is preserved.
function applyUpdate(record, patch) {
  return { ...record, ...patch, id: record.id };
}
`;

const load = `const raw = JSON.parse(files["data/carrier-records.json"]);`;

export const jsNormaliseApiRecords: MissionInput = {
  slug: "js-normalise-api-records",
  version: 1,
  track: "javascript",
  tier: "beginner",
  order: 4,
  title: "Normalise carrier API records without crashing on gaps",
  summary:
    "One carrier record without an address blanks the whole dashboard. Reshape API records with destructuring, optional chaining and ??, and update them without mutation.",
  minutes: 25,
  assessmentTypes: ["repair-code", "interpret-output", "explain-root-cause"],
  skills: ["js.objects"],
  appliesSkills: ["js.functions", "js.types"],
  prerequisites: ["js-shipment-array-pipeline"],
  brief: {
    from: "Marco Bellini, backend engineer",
    channel: "#dispatch-dashboard",
    body: `Heads-up from the carrier integration side: since 09:40 the dashboard shows an empty table and the console has \`TypeError: Cannot read properties of undefined (reading 'city')\`. Pennine Express started sending pre-advice records with no consignee address and \`pieces: 0\`, and some manual bookings arrive with \`carrier: null\`.

Three sample records are in \`data/carrier-records.json\`, and the agreed output rules are at the top of \`normalise.js\`. Two more problems Aiko found: pre-advised shipments show **1 piece** instead of 0, and the "Undo" button no longer restores the old status because \`applyUpdate\` changes the original record. Can you make the normaliser tolerate gaps and make updates return copies?`,
  },
  objectives: [
    "Read nested properties safely with optional chaining (?.)",
    "Choose ?? over || when 0 or \"\" are valid values",
    "Use destructuring to pull fields out of an object and rename them",
    "Create updated copies of objects and arrays with spread instead of mutating them",
  ],
  concept: {
    title: "Objects are references; missing data is undefined",
    body: `Reading a property that does not exist gives \`undefined\`. Reading a property **of** \`undefined\` or \`null\` throws: \`raw.consignee.address.city\` crashes as soon as \`address\` is missing. **Optional chaining** stops early instead: \`raw.consignee?.address?.city\` evaluates to \`undefined\` if any link is null or undefined.

To supply a fallback, choose the operator carefully:

${F}js
0 || 1        // 1  — || replaces any falsy value: 0, "", false, null, undefined, NaN
0 ?? 1        // 0  — ?? replaces only null and undefined
null ?? "n/a" // "n/a"
${F}

**Destructuring** pulls fields into variables and can rename them: \`const { shipment_id: id, eta } = raw;\`. (Destructuring defaults, like \`{ eta = null }\`, also apply only to \`undefined\`, not \`null\`.)

Objects and arrays are passed **by reference**. \`Object.assign(record, patch)\` writes into \`record\` itself, and returning \`raw.tags\` hands out the API's own array. **Spread** creates a new, shallow copy: \`{ ...record, ...patch }\` (later keys win) and \`[...tags]\`. "Shallow" means nested objects are still shared, so copy each level you intend to change.`,
  },
  workedExample: {
    title: "Worked example: normalising driver profiles",
    body: `The HR API sends \`{ staff_no: "D-17", vehicle: { reg: "LM26 ABC" }, overtime: 0 }\` — but \`vehicle\` can be \`null\` and \`overtime\` can be missing.

**Step 1 — destructure and rename.**

${F}js
const { staff_no: id, vehicle, overtime } = raw;
${F}

**Step 2 — guard nested reads and pick the right fallback.**

${F}js
const profile = {
  id,
  reg: vehicle?.reg ?? "No vehicle",   // vehicle null -> "No vehicle"
  overtime: overtime ?? 0,             // 0 stays 0; missing becomes 0
};
${F}

Had we written \`overtime || 0\` it would also work here, but \`hours || 8\` would turn a real 0 into 8 — always ask "is 0 (or empty string) a legitimate value?" and use \`??\` when it is.

**Step 3 — update without mutation.**

${F}js
const promoted = { ...profile, grade: "senior" };
profile.grade;  // undefined — the original is unchanged
${F}

Order matters in spread: keys written later override earlier ones, which you can use to *protect* a field: \`{ ...profile, ...changes, id: profile.id }\`.`,
  },
  workspace: {
    kind: "javascript",
    entry: "normalise.js",
    exports: ["normaliseShipment", "applyUpdate"],
    files: [
      { path: "normalise.js", content: starter, editable: true },
      { path: "data/carrier-records.json", content: recordsJson, editable: false },
    ],
    tests: [
      {
        id: "complete-record",
        name: "A complete record is normalised to the agreed shape",
        code: `${load}
assertDeepEqual(module.normaliseShipment(raw[0]), {
  id: "LUM-3101", carrierName: "Northline Freight", city: "Leeds", pieces: 3, eta: "2026-11-05T14:00:00Z", tags: ["fragile"],
});`,
        feedback: {
          what: "The normalised version of a complete record did not match { id, carrierName, city, pieces, eta, tags }.",
          why: "The dashboard table reads exactly these fields; renamed or missing keys show as blank cells.",
          next: "Map shipment_id to id, carrier.name to carrierName and consignee.address.city to city.",
        },
      },
      {
        id: "missing-address",
        name: "A pre-advice record without an address keeps pieces: 0",
        code: `${load}
let got;
try { got = module.normaliseShipment(raw[1]); } catch (e) { throw new Error("normaliseShipment threw for LUM-3102: " + e.message); }
assertEqual(got.city, null, "city should be null when the address is missing, got " + JSON.stringify(got.city));
assertEqual(got.pieces, 0, "pieces: 0 must stay 0, got " + JSON.stringify(got.pieces));
assertEqual(got.eta, null, "eta should be null when missing, got " + JSON.stringify(got.eta));`,
        feedback: {
          what: "LUM-3102 (no address, pieces: 0, no eta) threw, or produced the wrong city, pieces or eta.",
          why: "Reading .city of undefined throws and takes down the whole table; || also replaces a legitimate 0.",
          next: "Use consignee?.address?.city ?? null, and pieces ?? 1 instead of pieces || 1.",
        },
      },
      {
        id: "null-carrier",
        name: "A manual booking with carrier: null is marked Unassigned",
        code: `${load}
const got = module.normaliseShipment(raw[2]);
assertDeepEqual(got, { id: "LUM-3103", carrierName: "Unassigned", city: "Manchester", pieces: 1, eta: null, tags: [] });`,
        feedback: {
          what: "LUM-3103 (carrier: null, no pieces, no tags) was not normalised as agreed.",
          why: "Optional chaining treats null like undefined, so carrier?.name is safe; missing pieces mean one parcel.",
          next: "Use carrier?.name ?? \"Unassigned\" and default tags to an empty array.",
        },
      },
      {
        id: "tags-are-copied",
        name: "Normalised tags are a new array",
        hidden: true,
        code: `${load}
const got = module.normaliseShipment(raw[0]);
assert(got.tags !== raw[0].tags, "tags should be a new array, not the API's array");
got.tags.push("checked");
assertDeepEqual(raw[0].tags, ["fragile"], "adding a tag to the normalised record changed the API data");`,
        feedback: {
          what: "The normalised record shares its tags array with the raw API record.",
          why: "Arrays are references: adding a tag in the UI would silently edit the cached API response.",
          next: "Copy the array: [...(tags ?? [])].",
        },
      },
      {
        id: "update-is-a-copy",
        name: "applyUpdate returns a copy and leaves the original unchanged",
        code: `const original = { id: "LUM-3101", status: "in_transit", pieces: 3 };
const updated = module.applyUpdate(original, { status: "held" });
assertEqual(updated.status, "held", "the returned record should have the new status");
assertEqual(updated.pieces, 3, "fields not in the patch should be kept");
assertEqual(original.status, "in_transit", "the original record was modified, so Undo cannot restore it");
assert(updated !== original, "applyUpdate should return a new object");`,
        feedback: {
          what: "applyUpdate changed the original record or returned the same object.",
          why: "Object.assign(record, patch) writes into record itself; the Undo button keeps a reference to the original.",
          next: "Build a new object with spread: { ...record, ...patch }.",
        },
      },
      {
        id: "update-keeps-id",
        name: "applyUpdate never changes the id",
        hidden: true,
        code: `const original = { id: "LUM-3101", status: "in_transit" };
const updated = module.applyUpdate(original, { id: "LUM-9999", status: "held" });
assertEqual(updated.id, "LUM-3101", "a patch must not change the record id");
assertEqual(updated.status, "held", "other fields in the patch should still apply");`,
        feedback: {
          what: "A patch containing an id changed the record's id.",
          why: "The id links the record to the carrier's system; changing it would orphan the shipment.",
          next: "In spread, later keys win. Put id: record.id after ...patch.",
        },
      },
    ],
    solution: { "normalise.js": solution },
    wrongSolutions: [
      {
        label: "optional chaining, but || for fallbacks",
        files: {
          "normalise.js": `function normaliseShipment(raw) {
  return {
    id: raw.shipment_id,
    carrierName: raw.carrier?.name || "Unassigned",
    city: raw.consignee?.address?.city || null,
    pieces: raw.pieces || 1,
    eta: raw.eta || null,
    tags: [...(raw.tags || [])],
  };
}
function applyUpdate(record, patch) {
  return { ...record, ...patch, id: record.id };
}
`,
        },
      },
      {
        label: "Object.assign onto the original record",
        files: {
          "normalise.js": `function normaliseShipment(raw) {
  return {
    id: raw.shipment_id,
    carrierName: raw.carrier?.name ?? "Unassigned",
    city: raw.consignee?.address?.city ?? null,
    pieces: raw.pieces ?? 1,
    eta: raw.eta ?? null,
    tags: [...(raw.tags ?? [])],
  };
}
function applyUpdate(record, patch) {
  const copy = record;
  Object.assign(copy, patch, { id: record.id });
  return copy;
}
`,
        },
      },
      {
        label: "spread with the patch last, so id can be overwritten",
        files: {
          "normalise.js": `function normaliseShipment(raw) {
  return {
    id: raw.shipment_id,
    carrierName: raw.carrier?.name ?? "Unassigned",
    city: raw.consignee?.address?.city ?? null,
    pieces: raw.pieces ?? 1,
    eta: raw.eta ?? null,
    tags: [...(raw.tags ?? [])],
  };
}
function applyUpdate(record, patch) {
  return { ...record, ...patch };
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "normaliseShipment never throws on missing carrier, consignee address, pieces, eta or tags",
    "pieces: 0 stays 0, and missing values get the agreed fallbacks",
    "Normalised tags are a new array",
    "applyUpdate returns a new object, leaves the original unchanged and preserves the id",
  ],
  hints: [
    "Run normaliseShipment on each record in data/carrier-records.json in your head: which property access hits undefined or null first?",
    "`a.b.c` throws when `a.b` is undefined. `a.b?.c` does not. For fallbacks, check which values || treats as missing.",
    "pieces: 0 is valid data. `??` only falls back for null and undefined. For applyUpdate, `Object.assign(target, …)` modifies target.",
    "Use `carrier?.name ?? \"Unassigned\"`, `consignee?.address?.city ?? null`, `pieces ?? 1`, `[...(tags ?? [])]`, and `return { ...record, ...patch, id: record.id }`.",
  ],
  questions: [
    {
      id: "predict-or-vs-nullish",
      kind: "mcq",
      prompt: "A record has `pieces: 0`. What do these two lines produce?",
      code: `const a = record.pieces || 1;
const b = record.pieces ?? 1;`,
      codeLanguage: "javascript",
      options: ["a = 0, b = 0", "a = 1, b = 0", "a = 1, b = 1", "a = 0, b = 1"],
      answer: 1,
      explanation: "|| falls back on any falsy value, including 0. ?? falls back only on null or undefined, so 0 is kept.",
    },
    {
      id: "explain-address-crash",
      kind: "explain",
      prompt: "Explain why one Pennine Express record emptied the whole dashboard table, and how the fix prevents it.",
      concepts: [
        { label: "address was missing, so it was undefined", anyOf: ["undefined", "missing", "no address", "absent", "does not exist", "doesn't exist"] },
        { label: "reading a property of undefined throws a TypeError", anyOf: ["typeerror", "throws", "throw", "exception", "error", "crash"] },
        { label: "optional chaining short-circuits safely", anyOf: ["optional chaining", "?.", "short-circuit", "short circuit", "safely", "fallback", "??"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "The LUM-3102 record had no consignee address, so raw.consignee.address was undefined and reading .city of undefined throws a TypeError. The exception escaped normaliseShipment while the table was being built, so no rows rendered. Optional chaining (consignee?.address?.city) short-circuits to undefined instead of throwing, and ?? null supplies the agreed fallback.",
      explanation: "One unguarded nested read turns a single bad record into a page-wide failure.",
    },
  ],
  debrief: {
    solution: `- Destructuring (\`const { shipment_id: id, carrier, consignee, pieces, eta, tags } = raw\`) names each input once.
- \`carrier?.name ?? "Unassigned"\` and \`consignee?.address?.city ?? null\` survive \`null\` and missing links.
- \`pieces ?? 1\` keeps the legitimate 0 that \`||\` was discarding.
- \`[...(tags ?? [])]\` hands the dashboard its own array.
- \`{ ...record, ...patch, id: record.id }\` builds a new object; listing \`id\` last means a patch cannot change it.`,
    commonMistakes: [
      "Using || for every fallback, which turns valid 0, \"\" and false into the default.",
      "Writing raw.consignee?.address.city — the chain still throws when address is undefined; each possibly-missing link needs ?.",
      "Assuming const copy = record makes a copy; it is a second name for the same object.",
      "Expecting spread to deep-copy; nested objects and arrays are still shared unless copied explicitly.",
    ],
    realWorld:
      "Normalising external data at the edge (an \"adapter\" or \"mapper\" layer) is standard practice: the rest of the app gets one predictable shape. Immutable updates with spread are how Redux, React state and most undo/redo features work — they rely on the old object being untouched.",
  },
  review: [
    {
      id: "js-optional-chaining",
      skill: "js.objects",
      variants: [
        {
          id: "js-optional-chaining-a",
          kind: "mcq",
          prompt: "`order = { customer: null }`. What does `order.customer?.email` evaluate to?",
          options: ["null", "undefined", "It throws a TypeError", "\"\""],
          answer: 1,
          explanation: "When the value before ?. is null or undefined, the whole chain short-circuits to undefined.",
        },
        {
          id: "js-optional-chaining-b",
          kind: "mcq",
          prompt: "`van = {}`. What does `van.driver?.phone` evaluate to?",
          options: ["It throws a TypeError", "null", "undefined", "{}"],
          answer: 2,
          explanation: "van.driver is undefined, so ?. stops and returns undefined instead of reading .phone.",
        },
      ],
    },
    {
      id: "js-nullish-coalescing",
      skill: "js.objects",
      variants: [
        {
          id: "js-nullish-coalescing-a",
          kind: "short",
          prompt: "What does `0 ?? 5` evaluate to?",
          accept: ["0"],
          explanation: "?? only replaces null and undefined; 0 is kept.",
        },
        {
          id: "js-nullish-coalescing-b",
          kind: "short",
          prompt: "What does `\"\" ?? \"none\"` evaluate to? (Write `empty` for an empty string.)",
          accept: ["empty", "\"\"", "empty string", "''"],
          explanation: "The empty string is not null or undefined, so ?? keeps it. `\"\" || \"none\"` would give \"none\".",
        },
        {
          id: "js-nullish-coalescing-c",
          kind: "short",
          prompt: "What does `null ?? 3` evaluate to?",
          accept: ["3"],
          explanation: "null is one of the two values ?? replaces.",
        },
      ],
    },
    {
      id: "js-spread-copy",
      skill: "js.objects",
      variants: [
        {
          id: "js-spread-copy-a",
          kind: "mcq",
          prompt: "What does `a.status` hold after this runs?",
          code: `const a = { status: "open" };
const b = a;
b.status = "closed";`,
          codeLanguage: "javascript",
          options: ["\"open\"", "\"closed\"", "undefined", "It throws because a is const"],
          answer: 1,
          explanation: "b and a refer to the same object. const prevents reassigning a, not changing its properties.",
        },
        {
          id: "js-spread-copy-b",
          kind: "mcq",
          prompt: "What does `a.status` hold after this runs?",
          code: `const a = { status: "open" };
const b = { ...a, status: "closed" };`,
          codeLanguage: "javascript",
          options: ["\"open\"", "\"closed\"", "undefined", "It throws"],
          answer: 0,
          explanation: "Spread creates a new object; a is untouched.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "The depot settings page loads `{ depot: \"LDS\", alerts: { email: true, sms: false } }`. Aiko writes `const draft = { ...settings }; draft.alerts.sms = true;` so users can cancel edits — but cancelling no longer restores sms: false.",
    question: {
      id: "transfer-shallow-copy",
      kind: "mcq",
      prompt: "Why, and what is the fix?",
      options: [
        "Spread is shallow: draft.alerts is the same object as settings.alerts. Copy the nested level too: { ...settings, alerts: { ...settings.alerts, sms: true } }",
        "Spread doesn't work on objects with booleans; use Object.assign",
        "const makes draft read-only; use let",
        "Spread copies by reference; use JSON.stringify(settings) instead",
      ],
      answer: 0,
      explanation:
        "Spread copies one level. Nested objects are shared references, so each level you change must be copied. (structuredClone is another option for a full deep copy.)",
    },
  },
  refresher: {
    body: `Reading \`obj.missing\` gives \`undefined\`, but reading \`undefined.anything\` throws. Put \`?.\` before each link that might be missing: \`a?.b?.c\`. For defaults, \`??\` replaces only \`null\`/\`undefined\`, while \`||\` replaces every falsy value including \`0\` and \`""\`. Objects are shared by reference, so \`const b = a\` is not a copy; \`{ ...a }\` and \`[...arr]\` create new top-level copies you can change safely.`,
    practice: {
      id: "refresher-nullish",
      kind: "mcq",
      prompt: "`stock = 0`. Which expression shows 0 rather than the fallback?",
      options: ["stock || \"n/a\"", "stock ?? \"n/a\"", "stock && \"n/a\"", "!stock"],
      answer: 1,
      explanation: "?? keeps 0 because it is not null or undefined.",
    },
  },
};
