import type { MissionInput } from "@/content/schema";

const starter = String.raw`# routes.py - summaries of hub scan events for the ops report.
# Each scan is a dict like:
#   {"shipment": "LMN30060001", "hub": "ATL", "ts": "2026-11-05T06:10Z"}
# Scans are always given in chronological order. Try: from sample_data import SCANS


def latest_scan(scans):
    # Used by the dashboard header to show the most recent scan.
    return scans.pop()


def hub_counts(scans):
    # TODO: return a dict mapping each hub code to its number of scans.
    return {}


def unique_hubs(scans):
    # TODO: return a sorted list of the distinct hub codes.
    return []


def route_for(scans, shipment_id):
    # TODO: return a tuple of hubs this shipment passed through, in order,
    # collapsing back-to-back repeat scans at the same hub.
    return ()
`;

const sampleData = String.raw`# sample_data.py - a slice of yesterday's scan feed (read-only).
SCANS = [
    {"shipment": "LMN30060001", "hub": "ATL", "ts": "2026-11-04T06:10Z"},
    {"shipment": "LMN30060002", "hub": "ATL", "ts": "2026-11-04T06:12Z"},
    {"shipment": "LMN30060001", "hub": "ATL", "ts": "2026-11-04T06:40Z"},
    {"shipment": "LMN30060001", "hub": "ORD", "ts": "2026-11-04T11:05Z"},
    {"shipment": "LMN30060002", "hub": "DFW", "ts": "2026-11-04T12:30Z"},
    {"shipment": "LMN30060001", "hub": "DEN", "ts": "2026-11-04T17:45Z"},
    {"shipment": "LMN30060003", "hub": "ORD", "ts": "2026-11-04T18:02Z"},
]
`;

const solution = String.raw`# routes.py - summaries of hub scan events for the ops report.


def latest_scan(scans):
    if not scans:
        return None
    return scans[-1]


def hub_counts(scans):
    counts = {}
    for scan in scans:
        hub = scan["hub"]
        counts[hub] = counts.get(hub, 0) + 1
    return counts


def unique_hubs(scans):
    return sorted({scan["hub"] for scan in scans})


def route_for(scans, shipment_id):
    route = []
    for scan in scans:
        if scan["shipment"] != shipment_id:
            continue
        if not route or route[-1] != scan["hub"]:
            route.append(scan["hub"])
    return tuple(route)
`;

const popsInput = String.raw`def latest_scan(scans):
    return scans.pop() if scans else None


def hub_counts(scans):
    counts = {}
    for scan in scans:
        counts[scan["hub"]] = counts.get(scan["hub"], 0) + 1
    return counts


def unique_hubs(scans):
    return sorted(set(s["hub"] for s in scans))


def route_for(scans, shipment_id):
    route = []
    for scan in scans:
        if scan["shipment"] == shipment_id and (not route or route[-1] != scan["hub"]):
            route.append(scan["hub"])
    return tuple(route)
`;

const routeAsSet = String.raw`def latest_scan(scans):
    return scans[-1] if scans else None


def hub_counts(scans):
    counts = {}
    for scan in scans:
        counts[scan["hub"]] = counts.get(scan["hub"], 0) + 1
    return counts


def unique_hubs(scans):
    return sorted(set(s["hub"] for s in scans))


def route_for(scans, shipment_id):
    hubs = set()
    for scan in scans:
        if scan["shipment"] == shipment_id:
            hubs.add(scan["hub"])
    return tuple(sorted(hubs))
`;

const noCollapse = String.raw`def latest_scan(scans):
    return scans[-1] if scans else None


def hub_counts(scans):
    counts = {}
    for scan in scans:
        counts[scan["hub"]] = counts.get(scan["hub"], 0) + 1
    return counts


def unique_hubs(scans):
    return sorted(set(s["hub"] for s in scans))


def route_for(scans, shipment_id):
    return tuple(s["hub"] for s in scans if s["shipment"] == shipment_id)
`;

const sortsInPlace = String.raw`def latest_scan(scans):
    return scans[-1] if scans else None


def hub_counts(scans):
    counts = {}
    for scan in scans:
        counts[scan["hub"]] = counts.get(scan["hub"], 0) + 1
    return counts


def unique_hubs(scans):
    scans.sort(key=lambda s: s["hub"])
    hubs = []
    for s in scans:
        if not hubs or hubs[-1] != s["hub"]:
            hubs.append(s["hub"])
    return hubs


def route_for(scans, shipment_id):
    route = []
    for scan in scans:
        if scan["shipment"] == shipment_id and (not route or route[-1] != scan["hub"]):
            route.append(scan["hub"])
    return tuple(route)
`;

const testData = String.raw`SCANS = [
    {"shipment": "S1", "hub": "ATL", "ts": "t1"},
    {"shipment": "S2", "hub": "ATL", "ts": "t2"},
    {"shipment": "S1", "hub": "ATL", "ts": "t3"},
    {"shipment": "S1", "hub": "ORD", "ts": "t4"},
    {"shipment": "S2", "hub": "DFW", "ts": "t5"},
    {"shipment": "S1", "hub": "ATL", "ts": "t6"},
    {"shipment": "S1", "hub": "DEN", "ts": "t7"},
]
`;

export const mission: MissionInput = {
  slug: "py-route-collections",
  version: 1,
  track: "python",
  tier: "beginner",
  order: 4,
  title: "The scan that vanished from the dashboard",
  summary:
    "Every time the ops report runs, the newest scan disappears from the dashboard. Summarise scan events with lists, dicts, sets and tuples — without mutating the caller's data.",
  minutes: 30,
  assessmentTypes: ["write-code", "interpret-output"],
  skills: ["py.collections"],
  appliesSkills: ["py.functions", "py.control-flow"],
  prerequisites: ["py-eta-functions"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#ops-report",
    body: `Odd one: whenever the 07:00 ops report runs, the **most recent hub scan disappears** from the dispatch dashboard until the next feed refresh. Both read the same in-memory \`scans\` list, so I suspect \`routes.py\` is changing it.

While you're in there, the report needs three summaries that are still TODO:

- \`hub_counts(scans)\` — how many scans each hub handled.
- \`unique_hubs(scans)\` — the distinct hubs, sorted.
- \`route_for(scans, shipment_id)\` — the hubs one shipment passed through, in order. Handheld scanners often double-scan, so back-to-back repeats at the same hub count once, but a genuine return to a hub later (ATL → ORD → ATL) must stay.

None of these may modify the list they are given. \`sample_data.py\` has a slice of real feed data to try things on.`,
  },
  objectives: [
    "Choose a list, dict, set or tuple based on what the data needs (order, lookup, uniqueness, immutability)",
    "Count occurrences with a dict and collect distinct values with a set",
    "Explain why two names can refer to the same list and how mutation affects both",
    "Read from a collection without modifying the caller's data",
  ],
  concept: {
    title: "Four collections, four jobs — and shared references",
    body: `| Type | Ordered | Duplicates | Mutable | Use it for |
| --- | --- | --- | --- | --- |
| \`list\` | yes | yes | yes | a sequence you build up |
| \`tuple\` | yes | yes | no | a fixed record or result |
| \`dict\` | insertion order | unique keys | yes | lookup / counting by key |
| \`set\` | no | no | yes | membership and uniqueness |

A set discards order, so it is perfect for "which hubs appeared?" and wrong for "which route did it take?".

The subtle part is **references**. Assignment never copies a list; it binds another name to the *same* object:

\`\`\`python
feed = ["ATL", "ORD"]
report = feed          # same list, two names
report.pop()           # mutates the one list
print(feed)            # ['ATL']
\`\`\`

Passing a list to a function works the same way: the parameter is another name for the caller's list. Methods like \`.pop()\`, \`.sort()\`, \`.append()\` and \`.remove()\` change it **in place**, so the caller sees the change. Reading (\`scans[-1]\`), \`sorted(scans)\` and building a new list leave the original alone. A function that only needs to *look* at data should never mutate it.`,
  },
  workedExample: {
    title: "Worked example: summarising dock door usage",
    body: `Events look like \`{"truck": "TRK-7", "door": 3}\`, in time order. We want counts per door, the distinct trucks, and the sequence of doors one truck used — without touching \`events\`.

**Count with a dict.** \`.get(key, 0)\` supplies a starting value for keys we have not seen:

\`\`\`python
def door_counts(events):
    counts = {}
    for e in events:
        counts[e["door"]] = counts.get(e["door"], 0) + 1
    return counts
\`\`\`

**Distinct values with a set**, then \`sorted()\` — which returns a *new* list:

\`\`\`python
def trucks(events):
    seen = set()
    for e in events:
        seen.add(e["truck"])
    return sorted(seen)
\`\`\`

**Ordered history as a tuple.** Build a list, compare with its last element (\`doors[-1]\`) to skip back-to-back repeats, and return an immutable tuple:

\`\`\`python
def doors_for(events, truck):
    doors = []
    for e in events:
        if e["truck"] == truck and (not doors or doors[-1] != e["door"]):
            doors.append(e["door"])
    return tuple(doors)
\`\`\`

Note what is *not* here: no \`events.sort()\`, no \`events.pop()\`. Every function builds its own new collection.`,
  },
  workspace: {
    kind: "python",
    entry: "routes.py",
    files: [
      { path: "routes.py", content: starter, editable: true },
      { path: "sample_data.py", content: sampleData, editable: false },
    ],
    tests: [
      {
        id: "latest-no-mutation",
        name: "latest_scan returns the newest scan without removing it",
        code: testData + String.raw`
before = len(SCANS)
r = main.latest_scan(SCANS)
assert r == {"shipment": "S1", "hub": "DEN", "ts": "t7"}, f"latest_scan should return the last scan, got {r!r}"
assert len(SCANS) == before, f"latest_scan changed the list: it had {before} scans, now {len(SCANS)}"
assert main.latest_scan([]) is None, "latest_scan([]) should return None"`,
        feedback: {
          what: "latest_scan removed the scan from the list it was given (or failed on an empty list).",
          why: "The dashboard and the report share one list object. .pop() mutates that object, which is exactly why the newest scan vanished.",
          next: "Read the last element with indexing (scans[-1]) instead of removing it, and handle an empty list.",
        },
      },
      {
        id: "hub-counts",
        name: "hub_counts counts scans per hub",
        code: testData + String.raw`
r = main.hub_counts(SCANS)
want = {"ATL": 4, "ORD": 1, "DFW": 1, "DEN": 1}
assert isinstance(r, dict), f"hub_counts should return a dict, got {type(r).__name__}"
assert r == want, f"hub_counts should be {want}, got {r}"
assert main.hub_counts([]) == {}, "hub_counts([]) should be {}"`,
        feedback: {
          what: "hub_counts returned the wrong counts.",
          why: "A dict keyed by hub is the natural structure for counting; the report reads one number per hub.",
          next: "Loop over the scans and do counts[hub] = counts.get(hub, 0) + 1.",
        },
      },
      {
        id: "unique-hubs",
        name: "unique_hubs returns the distinct hubs, sorted",
        code: testData + String.raw`
r = main.unique_hubs(SCANS)
assert r == ["ATL", "DEN", "DFW", "ORD"], f"unique_hubs should be ['ATL', 'DEN', 'DFW', 'ORD'], got {r!r}"
assert main.unique_hubs([]) == [], "unique_hubs([]) should be []"`,
        feedback: {
          what: "unique_hubs did not return each hub exactly once in alphabetical order.",
          why: "A set removes duplicates; sorted() turns it into a predictable list for the report.",
          next: "Collect the hubs into a set, then return sorted(...) of it.",
        },
      },
      {
        id: "route-order",
        name: "route_for keeps order, collapses back-to-back repeats, keeps revisits",
        code: testData + String.raw`
r = main.route_for(SCANS, "S1")
assert isinstance(r, tuple), f"route_for should return a tuple, got {type(r).__name__}"
assert r == ("ATL", "ORD", "ATL", "DEN"), f"route for S1 should be ('ATL', 'ORD', 'ATL', 'DEN'), got {r!r}"
r = main.route_for(SCANS, "S2")
assert r == ("ATL", "DFW"), f"route for S2 should be ('ATL', 'DFW'), got {r!r}"
r = main.route_for(SCANS, "NOPE")
assert r == (), f"route for an unknown shipment should be (), got {r!r}"`,
        feedback: {
          what: "route_for lost the order, dropped a genuine revisit, kept a double-scan, or did not return a tuple.",
          why: "A route is an ordered history. A set forgets order and revisits; a raw list keeps scanner double-scans.",
          next: "Build a list in scan order and append a hub only when it differs from route[-1]; return tuple(route).",
        },
      },
      {
        id: "no-mutation-anywhere",
        name: "No function modifies the scans it is given",
        hidden: true,
        code: testData + String.raw`
import copy
snapshot = copy.deepcopy(SCANS)
main.latest_scan(SCANS)
main.hub_counts(SCANS)
main.unique_hubs(SCANS)
main.route_for(SCANS, "S1")
main.route_for(SCANS, "S2")
assert SCANS == snapshot, "One of the functions changed the scans list (order or contents). Build new collections instead of sorting, popping or removing in place."`,
        feedback: {
          what: "After calling the functions, the caller's scans list was in a different order or had different contents.",
          why: "Other parts of the system hold a reference to the same list. In-place .sort(), .pop() or .remove() changes their data too.",
          next: "Use sorted(...) instead of .sort(), indexing instead of .pop(), and build fresh lists, sets and dicts.",
        },
      },
    ],
    solution: { "routes.py": solution },
    wrongSolutions: [
      { label: "Pops the newest scan off the shared list", files: { "routes.py": popsInput } },
      { label: "Uses a set for the route, losing order and revisits", files: { "routes.py": routeAsSet } },
      { label: "Keeps scanner double-scans in the route", files: { "routes.py": noCollapse } },
      { label: "Sorts the caller's list in place", files: { "routes.py": sortsInPlace } },
    ],
  },
  successCriteria: [
    "latest_scan returns the newest scan and the list keeps the same length",
    "hub_counts returns a dict of scans per hub; unique_hubs returns a sorted list of distinct hubs",
    "route_for returns a tuple in scan order, with back-to-back repeats collapsed and later revisits kept",
    "None of the functions change the caller's list",
  ],
  hints: [
    "Start with the vanishing scan: which line in the starter changes the list it was given? Which list methods modify in place?",
    "Match each summary to a collection: counting → dict, distinct values → set, ordered history → list built up then turned into a tuple.",
    "For `route_for`, compare each matching scan's hub with the last hub you appended (`route[-1]`). A set cannot do this because it has no order.",
    "`latest_scan`: `return scans[-1] if scans else None`. `hub_counts`: `counts[hub] = counts.get(hub, 0) + 1`. `unique_hubs`: `sorted({s[\"hub\"] for s in scans})` or a loop with a set. `route_for`: append when `not route or route[-1] != hub`, then `return tuple(route)`.",
  ],
  questions: [
    {
      id: "predict-alias",
      kind: "mcq",
      prompt: "What does this print?",
      code: `feed = ["ATL", "ORD"]
report = feed
report.append("DFW")
print(len(feed))`,
      codeLanguage: "python",
      options: ["2", "3", "1", "TypeError"],
      answer: 1,
      explanation:
        "`report = feed` does not copy; both names refer to one list. Appending through `report` changes that list, so `feed` has 3 items.",
    },
    {
      id: "choose-collection",
      kind: "mcq",
      prompt: "The intake service must check, millions of times a day, whether a tracking ID has already been processed. Which structure fits best?",
      options: ["A list, checked with `in`", "A set, checked with `in`", "A tuple, checked with `.index()`", "A string of IDs joined by commas"],
      answer: 1,
      explanation:
        "A set is built for membership tests: `id in seen` takes roughly constant time, while a list or tuple has to scan every element.",
    },
  ],
  debrief: {
    solution: `Read, don't mutate, and let each collection do its job:

\`\`\`python
def latest_scan(scans):
    return scans[-1] if scans else None          # index, don't pop

def hub_counts(scans):
    counts = {}
    for scan in scans:
        counts[scan["hub"]] = counts.get(scan["hub"], 0) + 1
    return counts

def unique_hubs(scans):
    return sorted({scan["hub"] for scan in scans})  # set -> new sorted list

def route_for(scans, shipment_id):
    route = []
    for scan in scans:
        if scan["shipment"] == shipment_id and (not route or route[-1] != scan["hub"]):
            route.append(scan["hub"])
    return tuple(route)
\`\`\`

The vanishing scan was \`scans.pop()\`: the report and the dashboard held the same list object, so removing the last element removed it for both.`,
    commonMistakes: [
      "Using .pop() or .sort() on a parameter, which silently changes the caller's data.",
      "Using a set for an ordered route, which forgets order and collapses legitimate revisits.",
      "Collapsing duplicates with `if hub not in route`, which also drops a genuine return to a hub later.",
      "Returning a list where a fixed result (tuple) is expected, inviting callers to modify shared results.",
    ],
    realWorld:
      "Shared-reference bugs are a classic source of \"spooky\" production issues: a cache, a config dict or a request object gets modified by one consumer and every other consumer sees it. Teams defend against this by treating inputs as read-only, returning new objects, and using immutable types (tuples, frozensets, frozen dataclasses) for shared data.",
  },
  review: [
    {
      id: "py-list-aliasing",
      skill: "py.collections",
      variants: [
        {
          id: "py-list-aliasing-a",
          kind: "short",
          prompt: "What does this print?",
          code: `def drop_first(items):
    items.pop(0)
    return len(items)

trucks = ["T1", "T2", "T3"]
drop_first(trucks)
print(len(trucks))`,
          codeLanguage: "python",
          accept: ["2"],
          explanation: "The parameter `items` is another name for the caller's list, so pop(0) removes T1 from `trucks` too.",
        },
        {
          id: "py-list-aliasing-b",
          kind: "short",
          prompt: "What does this print?",
          code: `def top(items):
    return sorted(items)[0]

hubs = ["ORD", "ATL", "DFW"]
top(hubs)
print(hubs[0])`,
          codeLanguage: "python",
          accept: ["ORD"],
          explanation: "sorted() builds a new list and leaves `hubs` unchanged, so hubs[0] is still ORD. (hubs.sort() would have changed it.)",
        },
        {
          id: "py-list-aliasing-c",
          kind: "mcq",
          prompt: "Which line reads the last scan WITHOUT changing the list `scans`?",
          options: ["scans.pop()", "scans[-1]", "scans.remove(scans[-1])", "del scans[-1]"],
          answer: 1,
          explanation: "Indexing only reads. pop, remove and del all modify the list in place.",
        },
      ],
    },
    {
      id: "py-choose-collection",
      skill: "py.collections",
      variants: [
        {
          id: "py-choose-collection-a",
          kind: "mcq",
          prompt: "You need the number of failed deliveries per driver name. Which structure?",
          options: ["list", "set", "dict", "tuple"],
          answer: 2,
          explanation: "Counting by key is a dict: driver name → count.",
        },
        {
          id: "py-choose-collection-b",
          kind: "mcq",
          prompt: "You need the ordered sequence of warehouses a pallet visited, including going back to the same one later. Which structure?",
          options: ["set", "dict", "list (or tuple)", "frozenset"],
          answer: 2,
          explanation: "Only sequences keep order and repeated values. Sets discard both.",
        },
        {
          id: "py-choose-collection-c",
          kind: "mcq",
          prompt: "You need the distinct carrier codes that appeared in today's invoices. Which structure?",
          options: ["set", "list", "tuple", "str"],
          answer: 0,
          explanation: "A set keeps each value once; wrap it in sorted() if you need a stable order for display.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Priya's on-call bot builds tonight's rota:\n\n```python\nDEFAULT_ROTA = [\"priya\", \"marco\", \"dev\"]\n\ndef rota_without(person):\n    rota = DEFAULT_ROTA\n    rota.remove(person)\n    return rota\n```\n\nOn Monday it runs `rota_without(\"dev\")`; on Tuesday (same process) it runs `rota_without(\"marco\")`.",
    question: {
      id: "transfer-rota-alias",
      kind: "mcq",
      prompt: "What does Tuesday's call return?",
      options: [
        '["priya", "dev"]',
        '["priya"]',
        '["priya", "marco", "dev"]',
        "It raises ValueError",
      ],
      answer: 1,
      explanation:
        "`rota = DEFAULT_ROTA` is not a copy, so Monday's remove() deleted \"dev\" from the shared default. Tuesday starts from [\"priya\", \"marco\"] and removes marco. Use `rota = list(DEFAULT_ROTA)` (or a comprehension) to work on a copy.",
    },
  },
  refresher: {
    body: `Pick the collection by the question you are asking: **list** for an ordered sequence, **tuple** for a fixed ordered result, **dict** to look something up or count by key, **set** for "is it there?" and "which distinct values?".

Assignment and function calls never copy a list — they create another name for the same one. So \`items.pop()\` or \`items.sort()\` inside a function changes the caller's list. To read without changing, use indexing (\`items[-1]\`) or functions that build something new, like \`sorted(items)\`.`,
    practice: {
      id: "refresher-copy",
      kind: "mcq",
      prompt: "After `a = [1, 2]` and `b = a` and `b.append(3)`, what is `a`?",
      options: ["[1, 2]", "[1, 2, 3]", "[3]", "an error"],
      answer: 1,
      explanation: "a and b are the same list, so the append is visible through both names.",
    },
  },
};
