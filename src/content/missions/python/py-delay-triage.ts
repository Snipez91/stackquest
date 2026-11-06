import type { MissionInput } from "@/content/schema";

const starter = String.raw`# triage.py - decides how late a shipment is and whether on-call gets paged.
# minutes: how many minutes past the promised delivery time (negative = early),
#          or None when the carrier has not sent a scan yet.


def classify_delay(minutes):
    if minutes > 15:
        return "minor"
    elif minutes > 60:
        return "major"
    elif minutes > 240:
        return "critical"
    else:
        return "on-time"


def needs_escalation(minutes, priority):
    # TODO: priority shipments page on "major" or "critical";
    # other shipments page only on "critical".
    # Shipments with no data ("unknown") page only if they are priority.
    return False
`;

const solution = String.raw`# triage.py - decides how late a shipment is and whether on-call gets paged.
# minutes: how many minutes past the promised delivery time (negative = early),
#          or None when the carrier has not sent a scan yet.


def classify_delay(minutes):
    if minutes is None:
        return "unknown"
    if minutes < 0:
        return "early"
    if minutes <= 15:
        return "on-time"
    if minutes <= 60:
        return "minor"
    if minutes <= 240:
        return "major"
    return "critical"


def needs_escalation(minutes, priority):
    status = classify_delay(minutes)
    if status == "critical":
        return True
    if priority and status in ("major", "unknown"):
        return True
    return False
`;

const strictBoundaries = String.raw`def classify_delay(minutes):
    if minutes is None:
        return "unknown"
    if minutes < 0:
        return "early"
    if minutes < 15:
        return "on-time"
    if minutes < 60:
        return "minor"
    if minutes < 240:
        return "major"
    return "critical"


def needs_escalation(minutes, priority):
    status = classify_delay(minutes)
    if status == "critical":
        return True
    return priority and status in ("major", "unknown")
`;

const falsyCheck = String.raw`def classify_delay(minutes):
    if not minutes:
        return "unknown"
    if minutes < 0:
        return "early"
    if minutes <= 15:
        return "on-time"
    if minutes <= 60:
        return "minor"
    if minutes <= 240:
        return "major"
    return "critical"


def needs_escalation(minutes, priority):
    status = classify_delay(minutes)
    if status == "critical":
        return True
    return priority and status in ("major", "unknown")
`;

const priorityAlwaysPages = String.raw`def classify_delay(minutes):
    if minutes is None:
        return "unknown"
    if minutes < 0:
        return "early"
    if minutes <= 15:
        return "on-time"
    if minutes <= 60:
        return "minor"
    if minutes <= 240:
        return "major"
    return "critical"


def needs_escalation(minutes, priority):
    return priority or classify_delay(minutes) == "critical"
`;

export const mission: MissionInput = {
  slug: "py-delay-triage",
  version: 1,
  track: "python",
  tier: "beginner",
  order: 2,
  title: "Why the six-hour delay never paged anyone",
  summary:
    "A shipment six hours late was labelled \"minor\" and on-call was never paged. Repair the branch order and boundaries in the delay triage rules.",
  minutes: 20,
  assessmentTypes: ["repair-code", "interpret-output"],
  skills: ["py.control-flow"],
  appliesSkills: ["py.types"],
  prerequisites: ["py-manifest-weights"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `Post-incident follow-up from last night: shipment LMN30044120 (priority, medical supplies) arrived **6 hours late** and nobody was paged. The dispatch board showed it as \`minor\`.

I traced it to \`triage.py\`. The rules we agreed with operations are:

| Minutes late | Status |
| --- | --- |
| no scan yet (\`None\`) | \`unknown\` |
| below 0 | \`early\` |
| 0 – 15 | \`on-time\` |
| over 15, up to 60 | \`minor\` |
| over 60, up to 240 | \`major\` |
| over 240 | \`critical\` |

Paging: \`critical\` always pages. Priority shipments also page on \`major\` and \`unknown\`. Please fix \`classify_delay\` and finish \`needs_escalation\` so the boundaries match the table exactly.`,
  },
  objectives: [
    "Predict which branch of an if/elif chain runs for a given input",
    "Order conditions so that each range is reachable and boundaries fall on the correct side",
    "Distinguish `is None` checks from falsy checks that also catch 0",
    "Combine conditions with and/or to express an escalation policy",
  ],
  concept: {
    title: "An if/elif chain stops at the first true condition",
    body: `Python evaluates an \`if / elif / elif / else\` chain **top to bottom and runs only the first branch whose condition is true**. Every later branch is skipped, even if its condition is also true.

\`\`\`python
if minutes > 15:      # 300 > 15 is True -> "minor", done
    ...
elif minutes > 240:   # never reached for 300
    ...
\`\`\`

So the order of conditions *is* the logic. With "greater than" tests, check the **largest** threshold first; with "less than or equal" tests, check the **smallest** first. Either way, each branch then only needs one comparison, because earlier branches have already ruled out the other ranges.

Boundaries need deliberate operators: "0 to 15 is on-time" means \`minutes <= 15\`, not \`< 15\`. Test the exact boundary values (15, 16, 60, 61...) because that is where off-by-one bugs live.

Finally, **truthiness**: \`if not minutes:\` is true for \`None\` *and* for \`0\`, \`0.0\` and \`""\`. When "no data" and "zero" mean different things, test \`minutes is None\` explicitly, and do it before any comparison — \`None < 0\` raises \`TypeError\`.`,
  },
  workedExample: {
    title: "Worked example: grading forklift battery levels",
    body: `Warehouse forklifts report battery percentage, or \`None\` if the telemetry unit is offline. Rules: offline → \`"offline"\`, 0–20 → \`"charge now"\`, over 20 up to 50 → \`"low"\`, over 50 → \`"ok"\`.

**Step 1 — handle the special value first.** \`None\` cannot be compared with numbers, and \`0\` is a real (urgent) reading, so use \`is None\`:

\`\`\`python
def battery_status(percent):
    if percent is None:
        return "offline"
\`\`\`

**Step 2 — walk the ranges from the smallest up** using \`<=\`, so each check only needs one comparison:

\`\`\`python
    if percent <= 20:
        return "charge now"
    if percent <= 50:
        return "low"
    return "ok"
\`\`\`

**Step 3 — test the edges by hand:** \`0 → "charge now"\` (not "offline"), \`20 → "charge now"\`, \`20.5 → "low"\`, \`50 → "low"\`, \`51 → "ok"\`.

**Step 4 — combine with a policy.** "Page maintenance for 'charge now', or for 'low' on night shift":

\`\`\`python
def page_maintenance(percent, night_shift):
    status = battery_status(percent)
    return status == "charge now" or (night_shift and status == "low")
\`\`\`

Storing the status in a variable keeps the policy readable and reuses the tested classification.`,
  },
  workspace: {
    kind: "python",
    entry: "triage.py",
    files: [
      { path: "triage.py", content: starter, editable: true },
      {
        path: "incident_notes.txt",
        content: `INC-1187  2026-11-04  Missed page for LMN30044120
02:10Z  carrier scan: promised 19:30Z, delivered 01:30Z (+360 min)
02:10Z  triage.classify_delay(360) -> "minor"
02:10Z  triage.needs_escalation(360, priority=True) -> False
02:11Z  dispatch board: LMN30044120 status=minor  page=none
`,
        editable: false,
      },
    ],
    tests: [
      {
        id: "long-delays-critical",
        name: "Delays over 240 minutes are critical",
        code: String.raw`for m in (241, 360, 1000):
    r = main.classify_delay(m)
    assert r == "critical", f"classify_delay({m}) should be 'critical', got {r!r}"`,
        feedback: {
          what: "A delay of more than 240 minutes was not classified as \"critical\".",
          why: "This is the incident: an earlier, broader condition (minutes > 15) matched first, so the critical branch could never run.",
          next: "Reorder the checks so the narrowest range for large values is tested before the broad ones — or walk upwards from the smallest range with <=.",
        },
      },
      {
        id: "boundaries",
        name: "Boundary values land in the right status",
        code: String.raw`cases = {0: "on-time", 15: "on-time", 16: "minor", 60: "minor", 61: "major", 240: "major"}
for m, want in cases.items():
    r = main.classify_delay(m)
    assert r == want, f"classify_delay({m}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "One of the exact boundary values (15, 16, 60, 61, 240) landed in the neighbouring status.",
          why: "The table says \"0 – 15\" is on-time, so 15 itself must be on-time. Off-by-one boundaries produce disputes with operations about SLA breaches.",
          next: "Compare < with <=. For \"up to 15\" you want minutes <= 15.",
        },
      },
      {
        id: "early-and-fractional",
        name: "Early arrivals and fractional minutes",
        hidden: true,
        code: String.raw`cases = {-5: "early", -0.5: "early", 15.5: "minor", 60.25: "major", 240.1: "critical"}
for m, want in cases.items():
    r = main.classify_delay(m)
    assert r == want, f"classify_delay({m}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "A negative or fractional delay was classified incorrectly.",
          why: "Carrier timestamps include seconds, so 15.5 minutes is real data. \"Over 15\" must include 15.5.",
          next: "Use threshold comparisons (<=) instead of checking for exact whole numbers, and handle minutes < 0 before the on-time range.",
        },
      },
      {
        id: "missing-data",
        name: "No scan (None) is 'unknown', but 0 minutes is on-time",
        hidden: true,
        code: String.raw`r = main.classify_delay(None)
assert r == "unknown", f"classify_delay(None) should be 'unknown', got {r!r}"
r = main.classify_delay(0)
assert r == "on-time", f"classify_delay(0) should be 'on-time' (exactly on time), got {r!r}"`,
        feedback: {
          what: "None was not reported as \"unknown\", or a delay of exactly 0 was mistaken for missing data.",
          why: "`if not minutes` is true for both None and 0. A shipment delivered exactly on time is not a shipment with no data.",
          next: "Test `minutes is None` first, before any < or > comparison.",
        },
      },
      {
        id: "escalation-policy",
        name: "needs_escalation follows the paging policy",
        code: String.raw`cases = [
    ((300, False), True), ((300, True), True),
    ((90, True), True), ((90, False), False),
    ((10, True), False), ((30, True), False),
    ((None, True), True), ((None, False), False),
    ((-20, True), False),
]
for (m, p), want in cases:
    r = main.needs_escalation(m, p)
    assert bool(r) == want and isinstance(r, bool), f"needs_escalation({m}, priority={p}) should be {want}, got {r!r}"`,
        feedback: {
          what: "needs_escalation paged (or stayed quiet) for a case where the policy says the opposite.",
          why: "Paging for every priority shipment causes alert fatigue; missing a critical one is the incident we are fixing. Both directions matter.",
          next: "Get the status from classify_delay first. Critical always pages; otherwise page only when priority is True AND the status is major or unknown. Return a real bool.",
        },
      },
    ],
    solution: { "triage.py": solution },
    wrongSolutions: [
      { label: "Uses < so boundary values fall into the next status", files: { "triage.py": strictBoundaries } },
      { label: "Uses `if not minutes` so 0 counts as missing data", files: { "triage.py": falsyCheck } },
      { label: "Pages every priority shipment regardless of status", files: { "triage.py": priorityAlwaysPages } },
    ],
  },
  successCriteria: [
    "Delays over 240 minutes are critical, and 15, 60 and 240 stay in the lower status",
    "Negative delays are early and None is unknown, while 0 is on-time",
    "Critical always pages; priority shipments also page on major and unknown; nothing else pages",
  ],
  hints: [
    "Read `incident_notes.txt`, then trace `classify_delay(360)` through the starter by hand. Which condition is the first one that is true?",
    "Only the first true branch in an if/elif chain runs. If the first test is `minutes > 15`, which later branches can ever run?",
    "Handle the special values first: `None` (use `is None`, not `not minutes`, because 0 is falsy) and negative numbers. Then walk the ranges from smallest to largest with `<=`.",
    "Structure: `if minutes is None: return \"unknown\"`, `if minutes < 0: return \"early\"`, `if minutes <= 15: ...`, `if minutes <= 60: ...`, `if minutes <= 240: ...`, then return \"critical\". For escalation: `status = classify_delay(minutes)`; return True for critical, or for priority with status in (\"major\", \"unknown\").",
  ],
  questions: [
    {
      id: "predict-starter-branch",
      kind: "mcq",
      prompt: "In the original starter code, what does `classify_delay(300)` return?",
      code: `def classify_delay(minutes):
    if minutes > 15:
        return "minor"
    elif minutes > 60:
        return "major"
    elif minutes > 240:
        return "critical"
    else:
        return "on-time"`,
      codeLanguage: "python",
      options: ['"critical"', '"major"', '"minor"', '"on-time"'],
      answer: 2,
      explanation:
        "300 > 15 is True, so the first branch runs and returns \"minor\". The later elif conditions are never evaluated, which is why the critical branch was unreachable for every delay over 15.",
    },
    {
      id: "predict-truthiness",
      kind: "short",
      prompt: "What does this print?",
      code: `delay = 0
if not delay:
    print("no data")
elif delay <= 15:
    print("on-time")`,
      codeLanguage: "python",
      accept: ["no data"],
      explanation:
        "0 is falsy, so `not delay` is True and the first branch runs. That is why missing-data checks should use `delay is None`.",
    },
  ],
  debrief: {
    solution: `Handle special values first, then walk the ranges from smallest to largest so each check needs only one comparison:

\`\`\`python
def classify_delay(minutes):
    if minutes is None:
        return "unknown"
    if minutes < 0:
        return "early"
    if minutes <= 15:
        return "on-time"
    if minutes <= 60:
        return "minor"
    if minutes <= 240:
        return "major"
    return "critical"

def needs_escalation(minutes, priority):
    status = classify_delay(minutes)
    if status == "critical":
        return True
    return priority and status in ("major", "unknown")
\`\`\`

(The last line returns a bool because \`priority\` is a bool; \`bool(...)\` around it is a fine defensive choice.) Every branch \`return\`s, so plain \`if\` statements behave like an \`elif\` chain here.`,
    commonMistakes: [
      "Testing the broadest condition first (minutes > 15), which makes every later range unreachable.",
      "Using < where the rule says \"up to and including\", so 15 or 60 drift into the next status.",
      "Writing `if not minutes:` for missing data, which also catches a delay of exactly 0.",
      "Writing `priority or status == \"critical\"`, which pages for every priority shipment, even early ones.",
    ],
    realWorld:
      "Alerting rules, pricing tiers, rate limits and SLA classifications are all ordered range checks. Production incidents often trace back to an unreachable branch or a boundary on the wrong side. Write the rule as a table first, then add a test for every boundary value in the table — exactly what the hidden checks here did.",
  },
  review: [
    {
      id: "py-branch-order",
      skill: "py.control-flow",
      variants: [
        {
          id: "py-branch-order-a",
          kind: "mcq",
          prompt: "What does `tier(120)` return?",
          code: `def tier(kg):
    if kg > 10:
        return "parcel"
    elif kg > 100:
        return "freight"
    return "letter"`,
          codeLanguage: "python",
          options: ['"letter"', '"parcel"', '"freight"', "None"],
          answer: 1,
          explanation: "120 > 10 is True, so the first branch returns \"parcel\". The freight branch is unreachable because it is checked after a broader condition.",
        },
        {
          id: "py-branch-order-b",
          kind: "mcq",
          prompt: "What does `speed_band(95)` return?",
          code: `def speed_band(kmh):
    if kmh >= 50:
        return "urban"
    elif kmh >= 90:
        return "highway"
    return "slow"`,
          codeLanguage: "python",
          options: ['"highway"', '"slow"', '"urban"', "None"],
          answer: 2,
          explanation: "95 >= 50 is True first, so \"urban\" is returned and the highway check never runs. Check the larger threshold first, or use <= from the smallest.",
        },
      ],
    },
    {
      id: "py-none-vs-zero",
      skill: "py.control-flow",
      variants: [
        {
          id: "py-none-vs-zero-a",
          kind: "mcq",
          prompt: "A sensor returns `None` when offline and `0` when the bay is empty. Which condition detects ONLY the offline case?",
          options: ["if not reading:", "if reading == 0:", "if reading is None:", "if reading < 0:"],
          answer: 2,
          explanation: "`is None` matches only None. `not reading` is also true for 0, and `None < 0` raises TypeError.",
        },
        {
          id: "py-none-vs-zero-b",
          kind: "short",
          prompt: "What does this print?",
          code: `stock = 0
if stock:
    print("in stock")
elif stock is None:
    print("unknown")
else:
    print("empty")`,
          codeLanguage: "python",
          accept: ["empty"],
          explanation: "0 is falsy, so the first branch is skipped; 0 is not None, so the second is skipped; the else branch prints \"empty\".",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev Okafor's lab monitor grades ping latency from `gw-01`: up to 50 ms is \"ok\", over 50 up to 200 ms is \"degraded\", over 200 ms is \"bad\", and `None` (no reply) is \"down\". His code is:\n\n```python\ndef grade(ms):\n    if ms is None:\n        return \"down\"\n    if ms > 50:\n        return \"degraded\"\n    if ms > 200:\n        return \"bad\"\n    return \"ok\"\n```",
    question: {
      id: "transfer-latency-grade",
      kind: "mcq",
      prompt: "What does `grade(800)` return, and why?",
      options: [
        '"bad", because 800 > 200',
        '"degraded", because the > 50 check matches first and returns',
        '"down", because 800 ms is effectively no reply',
        '"ok", because none of the branches match',
      ],
      answer: 1,
      explanation:
        "The first true condition wins. 800 > 50 is true, so \"degraded\" is returned and the > 200 branch is unreachable. Swap the two checks (largest threshold first).",
    },
  },
  refresher: {
    body: `In an \`if / elif / else\` chain Python checks each condition from the top and runs **only the first one that is true**. So \`if x > 10\` placed before \`if x > 100\` means the second check never matters for big numbers.

Two habits prevent most bugs: put special cases (like \`None\`) first, then order ranges so each one is reachable — smallest first with \`<=\`, or largest first with \`>\`. And check the exact boundary numbers by hand.`,
    practice: {
      id: "refresher-first-true",
      kind: "mcq",
      prompt: "What does `label(5)` return?",
      code: `def label(n):
    if n > 0:
        return "positive"
    elif n > 3:
        return "big"
    return "other"`,
      codeLanguage: "python",
      options: ['"big"', '"positive"', '"other"', "both \"positive\" and \"big\""],
      answer: 1,
      explanation: "5 > 0 is true first, so only \"positive\" is returned.",
    },
  },
};
