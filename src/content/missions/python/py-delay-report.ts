import type { MissionInput } from "@/content/schema";

const atlCsv = `shipment_id,carrier,promised_at,delivered_at,updated_at
LMN30120001,NLX,2026-11-04T09:00:00Z,2026-11-04T09:10:00Z,2026-11-04T09:12:00Z
LMN30120002,NLX,2026-11-04T10:00:00Z,2026-11-04T12:05:00Z,2026-11-04T12:06:00Z
LMN30120003,BRG,2026-11-04T11:00:00Z,,2026-11-04T08:00:00Z
LMN30120004,SKY,2026-11-04T08:30:00Z,2026-11-04T08:20:00Z,2026-11-04T08:25:00Z
LMN30120005,BRG,2026-11-04T14:00:00Z,2026-11-04T14:40:00Z,2026-11-04T14:41:00Z
LMN30120002,NLX,2026-11-04T10:00:00Z,2026-11-04T11:00:00Z,2026-11-04T11:01:00Z
`;

const ordCsv = `shipment_id,carrier,promised_at,delivered_at,updated_at
LMN30120003,BRG,2026-11-04T11:00:00Z,2026-11-04T13:30:00Z,2026-11-04T13:31:00Z
LMN30120006,SKY,2026-11-04T07:00:00Z,2026-11-04T07:16:00Z,2026-11-04T07:17:00Z
LMN30120007,NLX,2026-11-04T16:00:00Z,,2026-11-04T15:00:00Z
LMN30120008,BRG,2026-11-04T09:00:00Z,2026-11-04T09:15:00Z,2026-11-04T09:16:00Z
LMN30120005,BRG,2026-11-04T14:00:00Z,2026-11-04T14:40:00Z,2026-11-04T14:41:00Z
`;

const carriersJson = `{
  "NLX": "Northline Express",
  "BRG": "Bridgeway Freight",
  "SKY": "Skyhaul Air"
}
`;

const header = String.raw`# delay_report.py - daily carrier delay report built from the hub exports.
import csv
import json
from datetime import datetime

LATE_AFTER_MINUTES = 15
REPORT_FIELDS = ["carrier", "shipments", "late", "avg_delay_min", "worst_shipment"]


def parse_ts(text):
    """Parse an export timestamp such as '2026-11-04T09:00:00Z' into an aware datetime."""
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def load_records(paths):
    records = []
    for path in paths:
        with open(path, newline="") as f:
            records.extend(csv.DictReader(f))
    return records
`;

const starter =
  header +
  String.raw`

def dedupe_latest(records):
    # TODO: one record per shipment_id - the one with the latest updated_at.
    return records


def delay_minutes(record):
    # TODO: whole minutes from promised_at to delivered_at (negative = early),
    # or None if delivered_at is empty (still in transit).
    return None


def build_report(paths, carriers_path):
    # TODO: one row per carrier name - see the brief for the columns.
    return []


def write_report(rows, out_path):
    with open(out_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


if __name__ == "__main__":
    report = build_report(["exports/atl_shipments.csv", "exports/ord_shipments.csv"], "carriers.json")
    count = write_report(report, "delay_report.csv")
    print(f"wrote {count} carriers to delay_report.csv")
`;

const dedupeGood = String.raw`

def dedupe_latest(records):
    latest = {}
    for rec in records:
        sid = rec["shipment_id"]
        current = latest.get(sid)
        if current is None or parse_ts(rec["updated_at"]) > parse_ts(current["updated_at"]):
            latest[sid] = rec
    return list(latest.values())
`;

const dedupeLastSeen = String.raw`

def dedupe_latest(records):
    latest = {}
    for rec in records:
        latest[rec["shipment_id"]] = rec
    return list(latest.values())
`;

const dedupeNone = String.raw`

def dedupe_latest(records):
    return records
`;

const delayGood = String.raw`

def delay_minutes(record):
    if not record["delivered_at"]:
        return None
    delta = parse_ts(record["delivered_at"]) - parse_ts(record["promised_at"])
    return int(delta.total_seconds() // 60)
`;

const buildGood = (avgExpr: string) => String.raw`

def build_report(paths, carriers_path):
    with open(carriers_path) as f:
        names = json.load(f)
    stats = {}
    for rec in dedupe_latest(load_records(paths)):
        delay = delay_minutes(rec)
        if delay is None:
            continue
        name = names.get(rec["carrier"], rec["carrier"])
        s = stats.setdefault(name, {"shipments": 0, "late": [], "all": []})
        s["shipments"] += 1
        s["all"].append(delay)
        if delay > LATE_AFTER_MINUTES:
            s["late"].append((delay, rec["shipment_id"]))
    rows = []
    for name, s in stats.items():
        late = s["late"]
        rows.append({
            "carrier": name,
            "shipments": s["shipments"],
            "late": len(late),
            "avg_delay_min": ${avgExpr},
            "worst_shipment": max(late)[1] if late else None,
        })
    rows.sort(key=lambda r: (-r["late"], r["carrier"]))
    return rows
`;

const goodAvg = `round(sum(d for d, _ in late) / len(late), 1) if late else 0.0`;
const allAvg = `round(sum(s["all"]) / len(s["all"]), 1) if late else 0.0`;

const writeWith = (mode: string) => String.raw`

def write_report(rows, out_path):
    with open(out_path, "${mode}", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)
`;

const mainBlock = String.raw`

if __name__ == "__main__":
    report = build_report(["exports/atl_shipments.csv", "exports/ord_shipments.csv"], "carriers.json")
    count = write_report(report, "delay_report.csv")
    print(f"wrote {count} carriers to delay_report.csv")
`;

const solution = header + dedupeGood + delayGood + buildGood(goodAvg) + writeWith("w") + mainBlock;
const wrongLastSeen = header + dedupeLastSeen + delayGood + buildGood(goodAvg) + writeWith("w") + mainBlock;
const wrongNoDedupe = header + dedupeNone + delayGood + buildGood(goodAvg) + writeWith("w") + mainBlock;
const wrongAppend = header + dedupeGood + delayGood + buildGood(goodAvg) + writeWith("a") + mainBlock;
const wrongAvg = header + dedupeGood + delayGood + buildGood(allAvg) + writeWith("w") + mainBlock;

const paths = `["exports/atl_shipments.csv", "exports/ord_shipments.csv"]`;

export const mission: MissionInput = {
  slug: "py-delay-report",
  version: 1,
  track: "python",
  tier: "advanced",
  order: 4,
  title: "Automate the carrier delay report",
  summary:
    "Every morning someone merges two hub exports by hand to rank carriers by delays. Automate it: combine files, deduplicate by latest update, aggregate per carrier, and write a report that is safe to re-run.",
  minutes: 45,
  assessmentTypes: ["write-code", "order-steps", "interpret-output"],
  skills: ["py.automation"],
  appliesSkills: ["py.files", "py.iteration", "py.collections", "py.json-apis", "py.modules"],
  prerequisites: ["py-carrier-api", "py-shared-units-module"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#ops-review",
    body: `Every morning the ops desk spends 40 minutes merging the ATL and ORD exports in a spreadsheet to rank carriers by delays — and twice this month the numbers were wrong. Let's automate it in \`delay_report.py\`.

What tripped people up:

- the **same shipment appears more than once** (re-exports, cross-dock transfers). Only the row with the **latest \`updated_at\`** counts, and it isn't always the last row.
- in-transit shipments (empty \`delivered_at\`) aren't counted
- "late" means **more than 15 minutes** after \`promised_at\`

One row per carrier (name from \`carriers.json\`, or the code if missing): \`carrier\`, \`shipments\` (delivered), \`late\`, \`avg_delay_min\` (late ones only, 1 dp, 0.0 if none), \`worst_shipment\` (or None). Most late first, ties by name. Cron may run it twice a day, so the output file must come out identical.`,
  },
  objectives: [
    "Combine records from several input files into one pipeline",
    "Deduplicate by a key while keeping the most recent version of each record",
    "Aggregate per group (count, average, maximum) with dicts",
    "Write output idempotently so re-running a job gives the same result",
    "Break an automation task into small, separately testable steps",
  ],
  concept: {
    title: "Automation is a pipeline of small, repeatable steps",
    body: `A reliable report job is a chain of pure-ish steps, each easy to test on its own:

\`\`\`text
load all inputs -> dedupe -> derive (delay) -> filter -> aggregate -> sort -> write
\`\`\`

**Deduplicate by key, deliberately.** \`{rec["id"]: rec for rec in records}\` keeps the *last row seen*, which is only correct if input order is meaningful — across files and re-exports it usually isn't. Decide what "current" means (here: the greatest \`updated_at\`) and compare explicitly:

\`\`\`python
if current is None or parse_ts(rec["updated_at"]) > parse_ts(current["updated_at"]):
    latest[sid] = rec
\`\`\`

**Aggregate with a dict of accumulators.** \`stats.setdefault(name, {...})\` creates a group the first time it is seen. Collect what you need for each statistic — for an average of late delays, the late delays themselves, not every delay.

**Make it idempotent.** Running the job twice must give the same file. Open the output with \`"w"\` (truncate) rather than \`"a"\` (append), never accumulate state between runs, and derive everything from the inputs. Idempotent jobs can be retried safely after a failure — which is exactly what schedulers do.

Keep orchestration (\`if __name__ == "__main__":\`) thin, so tests can call each step directly.`,
  },
  workedExample: {
    title: "Worked example: a daily driver-mileage summary",
    body: `Two depot exports list trips (\`trip_id, driver, km, synced_at\`). The tablet app sometimes re-syncs a trip with a corrected km value, and it may land in either depot's export.

**Step 1 — load everything:**

\`\`\`python
def load(paths):
    rows = []
    for path in paths:
        with open(path, newline="") as f:
            rows.extend(csv.DictReader(f))
    return rows
\`\`\`

**Step 2 — keep the latest sync per trip,** comparing timestamps rather than trusting order:

\`\`\`python
def latest_per_trip(rows):
    best = {}
    for r in rows:
        cur = best.get(r["trip_id"])
        if cur is None or r["synced_at"] > cur["synced_at"]:   # same ISO format, same zone
            best[r["trip_id"]] = r
    return list(best.values())
\`\`\`

(Comparing ISO strings works only when every timestamp uses the identical format and zone; parsing to \`datetime\` is safer.)

**Step 3 — aggregate per driver:**

\`\`\`python
totals = {}
for r in latest_per_trip(load(paths)):
    t = totals.setdefault(r["driver"], {"trips": 0, "km": 0.0})
    t["trips"] += 1
    t["km"] += float(r["km"])
\`\`\`

**Step 4 — write with mode \`"w"\`** and a fixed header, so tomorrow's cron retry overwrites rather than appends. Run it twice and compare the files: they must be identical.`,
  },
  workspace: {
    kind: "python",
    entry: "delay_report.py",
    files: [
      { path: "delay_report.py", content: starter, editable: true },
      { path: "exports/atl_shipments.csv", content: atlCsv, editable: false },
      { path: "exports/ord_shipments.csv", content: ordCsv, editable: false },
      { path: "carriers.json", content: carriersJson, editable: false },
    ],
    tests: [
      {
        id: "dedupe-latest",
        name: "dedupe_latest keeps one record per shipment: the latest update",
        code: String.raw`recs = [
    {"shipment_id": "A", "updated_at": "2026-11-04T10:00:00Z", "v": "old"},
    {"shipment_id": "B", "updated_at": "2026-11-04T09:00:00Z", "v": "only"},
    {"shipment_id": "A", "updated_at": "2026-11-04T12:00:00Z", "v": "new"},
    {"shipment_id": "C", "updated_at": "2026-11-04T15:00:00Z", "v": "newest"},
    {"shipment_id": "C", "updated_at": "2026-11-04T08:00:00Z", "v": "stale, but listed last"},
]
out = main.dedupe_latest(recs)
by_id = {r["shipment_id"]: r["v"] for r in out}
assert len(out) == 3, f"expected 3 records (A, B, C), got {len(out)}"
assert by_id == {"A": "new", "B": "only", "C": "newest"}, f"expected the latest update per shipment, got {by_id}"`,
        feedback: {
          what: "dedupe_latest kept duplicates, or kept a row that is not the most recently updated one.",
          why: "Re-exports and cross-dock transfers duplicate shipments. Counting both, or the stale one, is how the hand-made report went wrong twice this month.",
          next: "Keep a dict keyed by shipment_id and replace the stored record only when the new one's updated_at is later (compare with parse_ts).",
        },
      },
      {
        id: "delay-minutes",
        name: "delay_minutes handles late, early and undelivered shipments",
        code: String.raw`base = {"promised_at": "2026-11-04T10:00:00Z"}
cases = [
    ("2026-11-04T12:05:00Z", 125),
    ("2026-11-04T09:50:00Z", -10),
    ("2026-11-05T00:30:00Z", 870),
    ("", None),
]
for delivered, want in cases:
    r = main.delay_minutes({**base, "delivered_at": delivered})
    assert r == want, f"delay_minutes with promised 10:00 and delivered {delivered or '(empty)'} should be {want}, got {r!r}"`,
        feedback: {
          what: "delay_minutes returned the wrong number of minutes, or did not return None for an undelivered shipment.",
          why: "Everything else is derived from this number; crossing midnight and early deliveries are both normal.",
          next: "Subtract the parsed datetimes and convert the timedelta with total_seconds() // 60. Return None when delivered_at is empty.",
        },
      },
      {
        id: "report-rows",
        name: "build_report produces the expected carrier rows",
        code: String.raw`rows = main.build_report(` + paths + String.raw`, "carriers.json")
want = [
    {"carrier": "Bridgeway Freight", "shipments": 3, "late": 2, "avg_delay_min": 95.0, "worst_shipment": "LMN30120003"},
    {"carrier": "Northline Express", "shipments": 2, "late": 1, "avg_delay_min": 125.0, "worst_shipment": "LMN30120002"},
    {"carrier": "Skyhaul Air", "shipments": 2, "late": 1, "avg_delay_min": 16.0, "worst_shipment": "LMN30120006"},
]
assert rows == want, "build_report did not match.\nexpected: " + repr(want) + "\ngot:      " + repr(rows)`,
        feedback: {
          what: "The carrier rows differ from the expected report (counts, averages, worst shipment or order).",
          why: "This is what goes on screen at the 09:00 ops call. Common causes: duplicates counted, in-transit shipments counted, 15 minutes treated as late, or the average taken over all shipments.",
          next: "Dedupe first, skip delay None, count delay > 15 as late, average only the late delays, then sort by (-late, carrier).",
        },
      },
      {
        id: "write-idempotent",
        name: "write_report writes a CSV that is identical when run twice",
        code: String.raw`import csv
rows = main.build_report(` + paths + String.raw`, "carriers.json")
n = main.write_report(rows, "out_report.csv")
with open("out_report.csv") as f:
    first = f.read()
main.write_report(rows, "out_report.csv")
with open("out_report.csv") as f:
    second = f.read()
assert n == 3, f"write_report should return the number of rows written (3), got {n!r}"
assert first == second, "running write_report twice changed the file - it should overwrite, not append"
with open("out_report.csv", newline="") as f:
    back = list(csv.DictReader(f))
assert [r["carrier"] for r in back] == ["Bridgeway Freight", "Northline Express", "Skyhaul Air"], f"unexpected rows in CSV: {back}"
assert back[0]["avg_delay_min"] == "95.0" and back[0]["late"] == "2", f"first CSV row should have late=2, avg_delay_min=95.0, got {back[0]}"`,
        feedback: {
          what: "Writing the report twice produced a different file (for example duplicated header and rows), or the CSV content was wrong.",
          why: "Cron retries and manual re-runs happen. A job that appends on every run produces a report with the data twice — and nobody notices until the numbers look odd.",
          next: "Open the output with mode \"w\" so each run replaces the file, and write the header plus rows with csv.DictWriter.",
        },
      },
      {
        id: "third-export",
        name: "Extra exports, stale cross-hub duplicates and unknown carriers",
        hidden: true,
        code: String.raw`with open("exports/sea_shipments.csv", "w", newline="") as f:
    f.write("shipment_id,carrier,promised_at,delivered_at,updated_at\n")
    f.write("LMN30120009,ZZQ,2026-11-04T10:00:00Z,2026-11-04T10:30:00Z,2026-11-04T10:31:00Z\n")
    f.write("LMN30120001,NLX,2026-11-04T09:00:00Z,2026-11-04T09:50:00Z,2026-11-04T08:00:00Z\n")
rows = main.build_report(["exports/atl_shipments.csv", "exports/ord_shipments.csv", "exports/sea_shipments.csv"], "carriers.json")
by_name = {r["carrier"]: r for r in rows}
assert "ZZQ" in by_name, f"a carrier code missing from carriers.json should appear under its code 'ZZQ'; got carriers {list(by_name)}"
assert by_name["ZZQ"] == {"carrier": "ZZQ", "shipments": 1, "late": 1, "avg_delay_min": 30.0, "worst_shipment": "LMN30120009"}, f"unexpected ZZQ row: {by_name['ZZQ']}"
assert by_name["Northline Express"]["late"] == 1, f"the SEA row for LMN30120001 is OLDER than the ATL one and must be ignored; Northline late = {by_name['Northline Express']['late']}"
assert [r["carrier"] for r in rows] == ["Bridgeway Freight", "Northline Express", "Skyhaul Air", "ZZQ"], f"rows should be sorted by late (desc), then name: {[r['carrier'] for r in rows]}"`,
        feedback: {
          what: "With a third export, an older duplicate replaced a newer record, an unknown carrier was dropped or crashed, or the order was wrong.",
          why: "New hubs come online and new carriers appear before carriers.json is updated. \"Last file wins\" is not the same as \"latest update wins\".",
          next: "Use paths exactly as given, compare updated_at when deduplicating, and use names.get(code, code) for carrier names.",
        },
      },
    ],
    solution: { "delay_report.py": solution },
    wrongSolutions: [
      { label: "Dedupes by keeping the last row seen", files: { "delay_report.py": wrongLastSeen } },
      { label: "Does not deduplicate", files: { "delay_report.py": wrongNoDedupe } },
      { label: "Appends to the output file on every run", files: { "delay_report.py": wrongAppend } },
      { label: "Averages delay over all shipments instead of late ones", files: { "delay_report.py": wrongAvg } },
    ],
  },
  successCriteria: [
    "dedupe_latest keeps exactly one record per shipment, choosing the latest updated_at regardless of row order",
    "delay_minutes returns whole minutes (negative when early) and None for undelivered shipments",
    "build_report returns one row per carrier with delivered count, late count (> 15 min), late-only average, worst shipment, sorted by late then name",
    "write_report overwrites its output, so running the job twice gives an identical file",
    "Additional export files and carriers missing from carriers.json are handled",
  ],
  hints: [
    "Sketch the pipeline before coding: load → dedupe → delay → skip undelivered → group by carrier → compute → sort → write. `load_records` and `parse_ts` are already done.",
    "Look at `LMN30120002` in the ATL export and `LMN30120003` in both exports. Which row of each is current, and is it always the last one?",
    "For aggregation, `stats.setdefault(name, {\"shipments\": 0, \"late\": []})` gives each carrier an accumulator. Store `(delay, shipment_id)` pairs for late ones: `len`, `sum` and `max` then give you every column.",
    "Dedupe: replace `latest[sid]` only if `parse_ts(rec[\"updated_at\"]) > parse_ts(current[\"updated_at\"])`. Delay: `int((parse_ts(d) - parse_ts(p)).total_seconds() // 60)`. Sort: `rows.sort(key=lambda r: (-r[\"late\"], r[\"carrier\"]))`. Write with `open(out_path, \"w\", newline=\"\")`.",
  ],
  questions: [
    {
      id: "order-pipeline",
      kind: "order",
      prompt: "Put the report pipeline steps in a correct order.",
      items: [
        "Load the rows from every export file",
        "Keep only the latest update for each shipment_id",
        "Compute each shipment's delay and drop undelivered ones",
        "Group by carrier and compute counts, average and worst",
        "Sort carriers by late count, then name",
        "Write the CSV, replacing any previous output",
      ],
      explanation:
        "Deduplication must happen before any counting or averaging, otherwise duplicates and stale rows leak into the statistics. Sorting and writing come last.",
    },
    {
      id: "predict-dict-dedupe",
      kind: "short",
      prompt: "What does this print?",
      code: `rows = [("S1", "10:00", 125), ("S1", "08:00", 60)]
latest = {}
for sid, updated, delay in rows:
    latest[sid] = delay
print(latest["S1"])`,
      codeLanguage: "python",
      accept: ["60"],
      explanation:
        "Assigning into a dict keeps the last value written, so the stale 08:00 row (delay 60) wins over the 10:00 update. That's why dedupe must compare timestamps, not rely on order.",
    },
    {
      id: "predict-append",
      kind: "mcq",
      prompt: "`write_report` opens its file with mode \"a\". The cron job runs at 06:00 and is retried at 06:05 after a network blip. What does the file contain afterwards?",
      options: [
        "One header and the carrier rows",
        "Two headers and every carrier row twice",
        "Only the rows from the 06:05 run",
        "An empty file",
      ],
      answer: 1,
      explanation: "Append mode adds to the end each time, so the second run writes another header and another copy of the rows. Mode \"w\" truncates first, making the job idempotent.",
    },
  ],
  debrief: {
    solution: `The solution is a pipeline of small functions:

\`\`\`python
def dedupe_latest(records):
    latest = {}
    for rec in records:
        current = latest.get(rec["shipment_id"])
        if current is None or parse_ts(rec["updated_at"]) > parse_ts(current["updated_at"]):
            latest[rec["shipment_id"]] = rec
    return list(latest.values())

def build_report(paths, carriers_path):
    with open(carriers_path) as f:
        names = json.load(f)                      # code -> name; fall back to the code
    stats = {}
    for rec in dedupe_latest(load_records(paths)):
        delay = delay_minutes(rec)
        if delay is None:
            continue
        s = stats.setdefault(names.get(rec["carrier"], rec["carrier"]), {"shipments": 0, "late": []})
        s["shipments"] += 1
        if delay > LATE_AFTER_MINUTES:
            s["late"].append((delay, rec["shipment_id"]))
    ...  # len(late), mean of late delays, max(late)[1], then sort by (-late, carrier)
\`\`\`

\`write_report\` uses mode \`"w"\`. In the data, \`LMN30120002\` had a stale row *after* the current one, \`LMN30120003\` was in transit at ATL but delivered at ORD, and \`LMN30120005\` was exported by both hubs — each is a trap the hand-made spreadsheet fell into.`,
    commonMistakes: [
      "Deduplicating with `{r[\"id\"]: r for r in rows}`, which keeps the last row seen rather than the latest update.",
      "Counting in-transit shipments, or treating exactly 15 minutes as late.",
      "Averaging delay over all delivered shipments when the report asks for the average of late ones.",
      "Opening the output in append mode, so retries duplicate the report.",
      "Hard-coding the two export paths inside build_report, so a new hub's export is silently ignored.",
    ],
    realWorld:
      "This is the shape of most operational automation: ETL jobs, nightly reconciliations, billing runs. Data engineers call the dedupe step \"latest record per key\" (in SQL, a window function over updated_at), and they design jobs to be idempotent so schedulers like cron, Airflow or Kubernetes CronJobs can retry them safely. Keeping each step a small function is what lets you test the tricky parts — like the stale duplicate — directly.",
  },
  review: [
    {
      id: "py-dedupe-latest",
      skill: "py.automation",
      variants: [
        {
          id: "py-dedupe-latest-a",
          kind: "mcq",
          prompt: "Two exports contain the same order: ATL says `status=in_transit, updated 08:00`; ORD says `status=delivered, updated 13:31`. ORD's file is processed first. Which dedupe rule gives the right answer?",
          options: [
            "Keep the first row seen",
            "Keep the last row seen",
            "Keep the row with the latest updated timestamp",
            "Keep both rows",
          ],
          answer: 2,
          explanation: "Processing order is arbitrary; only the timestamp says which version is current. With this file order first-seen happens to work and last-seen does not, but either rule breaks as soon as the order changes.",
        },
        {
          id: "py-dedupe-latest-b",
          kind: "short",
          prompt: "What does this print?",
          code: `events = [("T7", 3, "late"), ("T7", 9, "on-time"), ("T7", 5, "late")]
best = {}
for tid, version, status in events:
    if tid not in best or version > best[tid][0]:
        best[tid] = (version, status)
print(best["T7"][1])`,
          codeLanguage: "python",
          accept: ["on-time"],
          explanation: "Version 9 is the highest, so its status wins even though a lower version comes after it.",
        },
      ],
    },
    {
      id: "py-idempotent-output",
      skill: "py.automation",
      variants: [
        {
          id: "py-idempotent-output-a",
          kind: "mcq",
          prompt: "Which property lets a scheduler safely retry a report job after a failure?",
          options: [
            "The job runs in under a minute",
            "The job is idempotent: running it again with the same inputs gives the same output",
            "The job prints progress messages",
            "The job appends a timestamp to every line",
          ],
          answer: 1,
          explanation: "Idempotent jobs can be re-run without double-counting or duplicating output.",
        },
        {
          id: "py-idempotent-output-b",
          kind: "mcq",
          prompt: "A nightly job adds each day's totals to `running_totals.csv` with mode \"a\". It crashed halfway and was re-run. What is the most likely problem?",
          options: [
            "The file is now empty",
            "Some of the day's rows are in the file twice",
            "Python refuses to open the file",
            "Nothing; append mode is idempotent",
          ],
          answer: 1,
          explanation: "The partial first run already appended some rows; the re-run appends them again. Write each run's output to its own file (or rebuild it from inputs with mode \"w\").",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Priya wants a weekly on-call summary from two alert exports (`pager_primary.csv` and `pager_backup.csv`). The same alert ID can appear in both, with states `triggered`, `acknowledged` and `resolved` and a `changed_at` timestamp. She wants the number of alerts per host that were still unresolved at the end of the week.",
    question: {
      id: "transfer-alert-summary",
      kind: "order",
      prompt: "Order the steps for her script.",
      items: [
        "Read both CSV exports into one list of rows",
        "For each alert ID keep the row with the latest changed_at",
        "Filter to alerts whose latest state is not resolved",
        "Count the remaining alerts per host",
        "Write the summary to a file opened with mode \"w\"",
      ],
      explanation:
        "Same pipeline, different domain: merge inputs, reduce to the current state per key, filter, aggregate, and write idempotently. Filtering before deduping would count an alert as open based on a stale row.",
    },
  },
  refresher: {
    body: `Automating a report means turning a manual process into a pipeline of small steps: **load** all inputs, **dedupe** (one record per key — the most recent version, chosen by timestamp, not by position), **derive** values, **aggregate** per group with a dict, **sort**, and **write**.

Two rules prevent most bad reports: dedupe *before* you count anything, and write output with mode \`"w"\` so running the job twice gives the same file.`,
    practice: {
      id: "refresher-dedupe-first",
      kind: "mcq",
      prompt: "Why must deduplication happen before counting late shipments?",
      options: [
        "It makes the script faster",
        "Otherwise duplicate or stale rows are counted as extra shipments",
        "Python requires it",
        "Counting changes the shipment IDs",
      ],
      answer: 1,
      explanation: "Counting first would include every copy of a shipment, and stale copies might show the wrong delivery status.",
    },
  },
};
