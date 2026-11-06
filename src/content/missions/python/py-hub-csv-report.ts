import type { MissionInput } from "@/content/schema";

const ordersCsv = `order_id,customer,hub,weight_kg,days_late,status
LMN30080001,Acme Medical,ATL,12.5,0,delivered
LMN30080002,"Ramirez, J",ATL,3.25,2,delivered
LMN30080003,Northwind Foods,ORD,140.0,0,delivered
LMN30080004,"Okoye & Sons, Ltd",ORD,22.75,1,delivered
LMN30080005,Bluefin Labs,DEN,8.0,-1,delivered
LMN30080006,Acme Medical,ATL,5.5,3,delivered
LMN30080007,Helios Solar,DEN,310.25,0,delivered
LMN30080008,"Chen, W",ORD,1.2,4,delivered
`;

const starter = String.raw`# hub_report.py - weekly hub performance report for Sam.


def load_orders(path):
    orders = []
    f = open(path)
    lines = f.readlines()
    header = lines[0].strip().split(",")
    for line in lines:
        values = line.strip().split(",")
        orders.append(dict(zip(header, values)))
    return orders


def late_orders(orders, hub=None):
    # TODO: order_ids with days_late > 0, in file order.
    # If hub is given, only orders from that hub.
    return []


def weight_by_hub(orders):
    # TODO: {hub: total weight_kg rounded to 2 dp}
    return {}


def late_report_lines(orders):
    # TODO: ["1. LMN30080002 ATL +2d", "2. ...", ...] for the late orders.
    return []


if __name__ == "__main__":
    for line in late_report_lines(load_orders("orders.csv")):
        print(line)
`;

const solution = String.raw`# hub_report.py - weekly hub performance report for Sam.
import csv


def load_orders(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["weight_kg"] = float(row["weight_kg"])
        row["days_late"] = int(row["days_late"])
    return rows


def late_orders(orders, hub=None):
    return [
        o["order_id"]
        for o in orders
        if o["days_late"] > 0 and (hub is None or o["hub"] == hub)
    ]


def weight_by_hub(orders):
    totals = {}
    for o in orders:
        totals[o["hub"]] = totals.get(o["hub"], 0.0) + o["weight_kg"]
    return {hub: round(total, 2) for hub, total in totals.items()}


def late_report_lines(orders):
    late = [o for o in orders if o["days_late"] > 0]
    return [f"{n}. {o['order_id']} {o['hub']} +{o['days_late']}d" for n, o in enumerate(late, start=1)]


if __name__ == "__main__":
    for line in late_report_lines(load_orders("orders.csv")):
        print(line)
`;

const restOfSolution = String.raw`

def late_orders(orders, hub=None):
    return [o["order_id"] for o in orders if o["days_late"] > 0 and (hub is None or o["hub"] == hub)]


def weight_by_hub(orders):
    totals = {}
    for o in orders:
        totals[o["hub"]] = totals.get(o["hub"], 0.0) + o["weight_kg"]
    return {hub: round(total, 2) for hub, total in totals.items()}


def late_report_lines(orders):
    late = [o for o in orders if o["days_late"] > 0]
    return [f"{n}. {o['order_id']} {o['hub']} +{o['days_late']}d" for n, o in enumerate(late, start=1)]
`;

const splitByComma =
  String.raw`def load_orders(path):
    with open(path) as f:
        lines = f.read().splitlines()
    header = lines[0].split(",")
    orders = []
    for line in lines[1:]:
        if not line:
            continue
        row = dict(zip(header, line.split(",")))
        row["weight_kg"] = float(row["weight_kg"])
        row["days_late"] = int(row["days_late"])
        orders.append(row)
    return orders
` + restOfSolution;

const noConversion =
  String.raw`import csv


def load_orders(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))
` + restOfSolution;

const hardcodedPath =
  String.raw`import csv


def load_orders(path):
    with open("orders.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["weight_kg"] = float(row["weight_kg"])
        row["days_late"] = int(row["days_late"])
    return rows
` + restOfSolution;

const hubFilterBroken = String.raw`import csv


def load_orders(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["weight_kg"] = float(row["weight_kg"])
        row["days_late"] = int(row["days_late"])
    return rows


def late_orders(orders, hub=None):
    return [o["order_id"] for o in orders if o["days_late"] > 0 and o["hub"] == hub]


def weight_by_hub(orders):
    totals = {}
    for o in orders:
        totals[o["hub"]] = totals.get(o["hub"], 0.0) + o["weight_kg"]
    return {hub: round(total, 2) for hub, total in totals.items()}


def late_report_lines(orders):
    late = [o for o in orders if o["days_late"] > 0]
    return [f"{n}. {o['order_id']} {o['hub']} +{o['days_late']}d" for n, o in enumerate(late)]
`;

export const mission: MissionInput = {
  slug: "py-hub-csv-report",
  version: 1,
  track: "python",
  tier: "intermediate",
  order: 2,
  title: "The hub called ' J\"'",
  summary:
    "A quick CSV script split lines on commas and invented a hub from a customer's name. Read the export properly with the csv module and build the weekly report with comprehensions.",
  minutes: 30,
  assessmentTypes: ["write-code", "interpret-output"],
  skills: ["py.files", "py.iteration"],
  appliesSkills: ["py.collections", "py.types", "py.strings"],
  prerequisites: ["py-route-collections", "py-label-formatting"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#eng-managers",
    body: `I need the weekly hub report for the ops review on Thursday. Marco started \`hub_report.py\` but last week's draft listed a hub called **\`' J"'\`** with a weight of \`"ATL"\`, and the header row showed up as an order. I don't want to present that.

The export is \`orders.csv\` (straight from the order system, so customer names can contain commas and are quoted). I need:

- \`load_orders(path)\` — every order as a dict, \`weight_kg\` as a float and \`days_late\` as an int.
- \`late_orders(orders, hub=None)\` — IDs of orders with \`days_late > 0\`, in file order, optionally for one hub.
- \`weight_by_hub(orders)\` — total kg per hub, 2 dp.
- \`late_report_lines(orders)\` — numbered lines like \`"1. LMN30080002 ATL +2d"\`.

It should work on next week's export too, not just this file.`,
  },
  objectives: [
    "Open files with a with-block so they are closed even when errors occur",
    "Explain why splitting CSV lines on commas breaks on quoted fields, and use csv.DictReader instead",
    "Convert CSV text fields to numbers once, right after reading",
    "Express filters and transforms with list and dict comprehensions, and number items with enumerate",
  ],
  concept: {
    title: "CSV is a format, not \"text with commas\"",
    body: `A CSV field may contain the delimiter if it is quoted: \`LMN2,"Ramirez, J",ATL\` has **three** fields. \`line.split(",")\` knows nothing about quoting and produces four, shifting every later column. The \`csv\` module implements the real rules (quotes, escaped quotes, embedded newlines):

\`\`\`python
import csv
with open(path, newline="") as f:      # closes the file automatically
    rows = list(csv.DictReader(f))     # header row -> dict keys
\`\`\`

\`DictReader\` consumes the header for you, so it never appears as data, and each row is a \`dict\` of **strings** — convert numeric fields yourself. \`newline=""\` lets the csv module handle line endings itself. The \`with\` block guarantees the file is closed when the block ends, even if an exception is raised.

Once the data is a list of dicts, **comprehensions** express "filter and transform" in one readable expression:

\`\`\`python
heavy = [r["id"] for r in rows if r["kg"] > 100]     # list
totals = {hub: round(t, 2) for hub, t in sums.items()}  # dict
\`\`\`

Read them as "*this* for each item in *that* if *condition*". \`enumerate(items, start=1)\` yields \`(1, first), (2, second)...\` so you never manage a counter by hand.`,
  },
  workedExample: {
    title: "Worked example: fuel receipts from drivers",
    body: `\`fuel.csv\` has columns \`driver,station,litres\`, and station names like \`"Shell, I-85 N"\` are quoted.

**Step 1 — read with a context manager and the csv module, then convert:**

\`\`\`python
import csv

def load_receipts(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["litres"] = float(row["litres"])
    return rows
\`\`\`

**Step 2 — filter with a comprehension; make the optional argument really optional:**

\`\`\`python
def big_fills(rows, driver=None):
    return [r["station"] for r in rows
            if r["litres"] > 200 and (driver is None or r["driver"] == driver)]
\`\`\`

\`driver is None or ...\` means "no filter requested, or this row matches". Without the \`is None\` part, calling \`big_fills(rows)\` would compare every driver with \`None\` and return nothing.

**Step 3 — number the output with enumerate:**

\`\`\`python
def receipt_lines(rows):
    return [f"{i}. {r['driver']} {r['litres']:.0f} L" for i, r in enumerate(rows, start=1)]
\`\`\`

**Step 4 — test on a second, tiny file you write yourself** to prove the function reads the \`path\` it is given rather than one hard-coded file.`,
  },
  workspace: {
    kind: "python",
    entry: "hub_report.py",
    files: [
      { path: "hub_report.py", content: starter, editable: true },
      { path: "orders.csv", content: ordersCsv, editable: false },
    ],
    tests: [
      {
        id: "load-rows",
        name: "load_orders reads every order (and not the header) with numeric fields",
        code: String.raw`orders = main.load_orders("orders.csv")
assert isinstance(orders, list), f"load_orders should return a list, got {type(orders).__name__}"
assert len(orders) == 8, f"orders.csv has 8 orders, load_orders returned {len(orders)} rows"
first = orders[0]
assert first["order_id"] == "LMN30080001", f"first order should be LMN30080001, got {first.get('order_id')!r} - is the header being read as data?"
assert isinstance(first["weight_kg"], float) and first["weight_kg"] == 12.5, f"weight_kg should be the float 12.5, got {first['weight_kg']!r}"
assert isinstance(first["days_late"], int) and first["days_late"] == 0, f"days_late should be the int 0, got {first['days_late']!r}"`,
        feedback: {
          what: "load_orders returned the wrong number of rows, included the header as an order, or left numbers as text.",
          why: "Every later calculation depends on this: a header row counts as an extra order, and \"12.5\" cannot be summed.",
          next: "Use csv.DictReader (it consumes the header), then convert weight_kg with float() and days_late with int().",
        },
      },
      {
        id: "quoted-commas",
        name: "Quoted customer names containing commas stay in one field",
        code: String.raw`orders = main.load_orders("orders.csv")
row = next((o for o in orders if o.get("order_id") == "LMN30080002"), None)
assert row is not None, "LMN30080002 should be loaded"
assert row["customer"] == "Ramirez, J", f"customer should be 'Ramirez, J', got {row['customer']!r}"
assert row["hub"] == "ATL", f"hub for LMN30080002 should be 'ATL', got {row['hub']!r} - the comma inside the quotes shifted the columns"`,
        feedback: {
          what: "The comma inside \"Ramirez, J\" was treated as a column separator, shifting the hub and weight columns.",
          why: "This is how last week's draft invented the hub ' J\"'. Splitting on commas ignores CSV quoting rules.",
          next: "Read the file with the csv module instead of str.split(\",\").",
        },
      },
      {
        id: "late-orders",
        name: "late_orders filters by lateness and optional hub, in file order",
        code: String.raw`orders = main.load_orders("orders.csv")
r = main.late_orders(orders)
want = ["LMN30080002", "LMN30080004", "LMN30080006", "LMN30080008"]
assert r == want, f"late_orders(orders) should be {want}, got {r}"
r = main.late_orders(orders, hub="ORD")
assert r == ["LMN30080004", "LMN30080008"], f"late_orders(orders, hub='ORD') should be ['LMN30080004', 'LMN30080008'], got {r}"
assert main.late_orders(orders, "DEN") == [], "DEN has no late orders (one was early: days_late = -1)"`,
        feedback: {
          what: "late_orders returned the wrong IDs, the wrong order, or nothing when no hub was given.",
          why: "Sam presents these IDs to ops leads per hub and for the whole network; both calls must work.",
          next: "Filter with days_late > 0, and treat the hub as \"no filter\" when it is None: (hub is None or o[\"hub\"] == hub).",
        },
      },
      {
        id: "weight-and-lines",
        name: "weight_by_hub totals and numbered report lines",
        code: String.raw`orders = main.load_orders("orders.csv")
w = main.weight_by_hub(orders)
want = {"ATL": 21.25, "ORD": 163.95, "DEN": 318.25}
assert w == want, f"weight_by_hub should be {want}, got {w}"
lines = main.late_report_lines(orders)
want_lines = ["1. LMN30080002 ATL +2d", "2. LMN30080004 ORD +1d", "3. LMN30080006 ATL +3d", "4. LMN30080008 ORD +4d"]
assert lines == want_lines, f"late_report_lines should be {want_lines}, got {lines}"`,
        feedback: {
          what: "The per-hub totals or the numbered report lines did not match.",
          why: "Totals are compared with the finance system; numbering must start at 1 because people refer to \"item 3\" in the meeting.",
          next: "Accumulate totals in a dict (then round in a dict comprehension), and use enumerate(late, start=1) for the numbering.",
        },
      },
      {
        id: "other-file",
        name: "Works on a different export (reads the given path)",
        hidden: true,
        code: String.raw`with open("next_week.csv", "w", newline="") as f:
    f.write('order_id,customer,hub,weight_kg,days_late,status\n')
    f.write('LMN30090001,"Diaz, \"\"Big\"\" Truck Co",SEA,7,5,delivered\n')
    f.write('LMN30090002,Lumen Internal,SEA,2.5,0,delivered\n')
orders = main.load_orders("next_week.csv")
assert len(orders) == 2, f"next_week.csv has 2 orders, got {len(orders)} - is load_orders reading the path it was given?"
assert orders[0]["customer"] == 'Diaz, "Big" Truck Co', f"escaped quotes should be decoded, got {orders[0]['customer']!r}"
assert main.late_orders(orders) == ["LMN30090001"], f"expected ['LMN30090001'], got {main.late_orders(orders)}"
assert main.weight_by_hub(orders) == {"SEA": 9.5}, f"expected {{'SEA': 9.5}}, got {main.weight_by_hub(orders)}"`,
        feedback: {
          what: "load_orders did not correctly read a different CSV file passed as path.",
          why: "Next week's export has a new name and new edge cases (escaped quotes). A report that only works on one file is a one-off, not a tool.",
          next: "Open the path parameter, not a fixed file name, and let the csv module handle quoting.",
        },
      },
    ],
    solution: { "hub_report.py": solution },
    wrongSolutions: [
      { label: "Skips the header but still splits on commas", files: { "hub_report.py": splitByComma } },
      { label: "Uses DictReader but leaves numbers as text", files: { "hub_report.py": noConversion } },
      { label: "Ignores the path argument and always opens orders.csv", files: { "hub_report.py": hardcodedPath } },
      { label: "Hub filter returns nothing when hub is None; numbering starts at 0", files: { "hub_report.py": hubFilterBroken } },
    ],
  },
  successCriteria: [
    "load_orders returns 8 orders from orders.csv with weight_kg as float and days_late as int, and no header row",
    "Quoted fields containing commas (and escaped quotes) are read as one field",
    "late_orders returns late order IDs in file order, for all hubs or one hub",
    "weight_by_hub and late_report_lines match the expected totals and numbered lines, for any export path",
  ],
  hints: [
    "Open `orders.csv` and find the rows whose customer is in quotes. Count the commas on those lines, then count the columns in the header.",
    "Python's standard library has a module for exactly this format. `csv.DictReader` also treats the first line as the header for you. Use `with open(path, newline=\"\") as f:` so the file is closed.",
    "Every value from a CSV is a string. Convert `weight_kg` and `days_late` once, inside `load_orders`, so the other functions can compare and add.",
    "`late_orders`: `[o[\"order_id\"] for o in orders if o[\"days_late\"] > 0 and (hub is None or o[\"hub\"] == hub)]`. Report lines: `for n, o in enumerate(late, start=1)` with `f\"{n}. {o['order_id']} {o['hub']} +{o['days_late']}d\"`.",
  ],
  questions: [
    {
      id: "predict-split",
      kind: "mcq",
      prompt: "What does this print?",
      code: `line = 'LMN30080002,"Ramirez, J",ATL,3.25'
print(line.split(",")[2])`,
      codeLanguage: "python",
      options: ["ATL", "' J\"'", "3.25", "\"Ramirez, J\""],
      answer: 1,
      explanation:
        "split(\",\") ignores quotes, producing ['LMN30080002', '\"Ramirez', ' J\"', 'ATL', '3.25']. Index 2 is ' J\"' — the bogus hub from last week's report.",
    },
    {
      id: "predict-comprehension",
      kind: "short",
      prompt: "What does this print?",
      code: `days = [0, 2, -1, 3]
print([d * 10 for d in days if d > 0])`,
      codeLanguage: "python",
      accept: ["[20, 30]"],
      acceptPatterns: ["^\\[\\s*20\\s*,\\s*30\\s*\\]$"],
      explanation: "The filter keeps 2 and 3 (0 and -1 are not > 0), and the expression multiplies each by 10.",
    },
  ],
  debrief: {
    solution: `Let the csv module parse, convert once, then filter and transform:

\`\`\`python
import csv

def load_orders(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["weight_kg"] = float(row["weight_kg"])
        row["days_late"] = int(row["days_late"])
    return rows

def late_orders(orders, hub=None):
    return [o["order_id"] for o in orders
            if o["days_late"] > 0 and (hub is None or o["hub"] == hub)]
\`\`\`

\`weight_by_hub\` accumulates in a dict and rounds with a dict comprehension; \`late_report_lines\` uses \`enumerate(late, start=1)\`. The starter had four separate bugs: header treated as data, naive splitting, no type conversion, and a file that was never closed.`,
    commonMistakes: [
      "Splitting lines on commas, which breaks on quoted fields such as \"Ramirez, J\".",
      "Forgetting that csv gives strings, then comparing \"2\" > 0 (TypeError) or summing text.",
      "Writing `o[\"hub\"] == hub` without the `hub is None` case, so the unfiltered report is empty.",
      "Hard-coding \"orders.csv\" inside load_orders instead of using the path parameter.",
      "Opening files without with, so they stay open if an exception interrupts the function.",
    ],
    realWorld:
      "CSV exports from ERPs, carriers and spreadsheets routinely contain quoted commas, escaped quotes and even line breaks inside fields. Hand-rolled split() parsers are a well-known source of silently wrong reports. In production you'd also pin the expected header and fail fast if the columns change — the exceptions mission covers how to report bad rows instead of guessing.",
  },
  review: [
    {
      id: "py-csv-module",
      skill: "py.files",
      variants: [
        {
          id: "py-csv-module-a",
          kind: "mcq",
          prompt: 'A CSV line is `T-88,"Lagos, NG",air`. How many fields does `csv.reader` produce, and how many does `line.split(",")` produce?',
          options: ["3 and 3", "3 and 4", "4 and 4", "4 and 3"],
          answer: 1,
          explanation: "The csv module honours the quotes, giving 3 fields; split() cuts inside the quoted name, giving 4.",
        },
        {
          id: "py-csv-module-b",
          kind: "mcq",
          prompt: "With `csv.DictReader`, what type is `row[\"pallets\"]` for a cell containing 12?",
          options: ["int", "float", "str", "It depends on the column header"],
          answer: 2,
          explanation: "The csv module never guesses types; every value is a str until you convert it.",
        },
        {
          id: "py-csv-module-c",
          kind: "mcq",
          prompt: "Why prefer `with open(path) as f:` over `f = open(path)`?",
          options: [
            "It reads the file faster",
            "It closes the file automatically when the block ends, even if an exception occurs",
            "It converts the contents to a list",
            "It is required for CSV files",
          ],
          answer: 1,
          explanation: "The with-statement guarantees cleanup. Leaked file handles eventually hit the OS limit in long-running jobs.",
        },
      ],
    },
    {
      id: "py-comprehension-predict",
      skill: "py.iteration",
      variants: [
        {
          id: "py-comprehension-predict-a",
          kind: "short",
          prompt: "What does this print?",
          code: `weights = [5, 120, 40, 300]
print([w // 10 for w in weights if w >= 40])`,
          codeLanguage: "python",
          accept: ["[12, 4, 30]"],
          acceptPatterns: ["^\\[\\s*12\\s*,\\s*4\\s*,\\s*30\\s*\\]$"],
          explanation: "The filter keeps 120, 40 and 300 in their original order; // 10 gives 12, 4 and 30.",
        },
        {
          id: "py-comprehension-predict-b",
          kind: "short",
          prompt: "What does this print?",
          code: `hubs = ["ATL", "ORD", "DEN"]
for n, hub in enumerate(hubs, start=1):
    if hub == "ORD":
        print(n)`,
          codeLanguage: "python",
          accept: ["2"],
          explanation: "enumerate with start=1 pairs ATL with 1, ORD with 2 and DEN with 3.",
        },
        {
          id: "py-comprehension-predict-c",
          kind: "short",
          prompt: "What does this print?",
          code: `stock = {"ATL": 0, "ORD": 7, "DEN": 2}
print({hub: n * 2 for hub, n in stock.items() if n})`,
          codeLanguage: "python",
          accept: ["{'ORD': 14, 'DEN': 4}"],
          acceptPatterns: ["^\\{\\s*'?ORD'?\\s*:\\s*14\\s*,\\s*'?DEN'?\\s*:\\s*4\\s*\\}$"],
          explanation: "`if n` drops ATL because 0 is falsy; the rest are doubled, in the original insertion order.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Priya needs a list of hosts whose disk usage is above 90% from `disk_report.csv` (columns: `host,mount,used_pct`). Mount points are plain, but some hosts have notes in a quoted `comment` column added last month, such as `\"migrating, do not page\"`.",
    question: {
      id: "transfer-disk-csv",
      kind: "mcq",
      prompt: "Which approach is correct and robust?",
      options: [
        "Split each line on commas and take index 2 as used_pct",
        "Use csv.DictReader, convert row[\"used_pct\"] with float(), and filter with a comprehension",
        "Use csv.DictReader and compare row[\"used_pct\"] > \"90\" as strings",
        "Read the file with f.read() and search for \"9\" in each line",
      ],
      answer: 1,
      explanation:
        "DictReader handles the quoted comment and finds used_pct by name even if columns move. Comparing strings would rank \"100\" below \"90\".",
    },
  },
  refresher: {
    body: `A CSV file isn't just "lines with commas": a quoted field like \`"Ramirez, J"\` contains a comma that is *not* a separator. Use the \`csv\` module, which knows the rules, inside a \`with open(path, newline="") as f:\` block so the file is closed automatically. \`csv.DictReader(f)\` turns each row into a dict keyed by the header, but every value is still a string — convert numbers yourself.

A comprehension like \`[r["id"] for r in rows if r["late"] > 0]\` reads as "the id, for each row, if it is late".`,
    practice: {
      id: "refresher-dictreader-type",
      kind: "mcq",
      prompt: "After reading a CSV with csv.DictReader, how do you add up the `weight_kg` column correctly?",
      options: [
        'sum(r["weight_kg"] for r in rows)',
        'sum(float(r["weight_kg"]) for r in rows)',
        '"".join(r["weight_kg"] for r in rows)',
        'len(rows) * r["weight_kg"]',
      ],
      answer: 1,
      explanation: "Values are strings, so convert each with float() before summing.",
    },
  },
};
