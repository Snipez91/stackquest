import type { MissionInput } from "@/content/schema";

const starter = String.raw`# labels.py - text for the warehouse thermal printers and the shift summary.


def normalize_tracking_id(raw):
    return raw.upper()


def format_label_line(shipment):
    return shipment["id"] + " " + shipment["dest"] + " " + str(shipment["weight_kg"]) + " kg"


def summary_line(count, total_kg):
    return str(count) + " parcels, " + str(total_kg) + " kg total"
`;

const solution = String.raw`# labels.py - text for the warehouse thermal printers and the shift summary.


def normalize_tracking_id(raw):
    cleaned = raw.strip().upper()
    return "".join(ch for ch in cleaned if ch not in " -\t")


def format_label_line(shipment):
    tracking_id = normalize_tracking_id(shipment["id"])
    dest = shipment["dest"].strip().upper()
    weight = shipment["weight_kg"]
    return f"{tracking_id:<12}{dest:^5}{weight:>8.2f} kg"


def summary_line(count, total_kg):
    noun = "parcel" if count == 1 else "parcels"
    return f"{count:,} {noun}, {total_kg:,.1f} kg total"
`;

const missesHyphens = String.raw`def normalize_tracking_id(raw):
    return raw.strip().upper().replace(" ", "")


def format_label_line(shipment):
    tracking_id = normalize_tracking_id(shipment["id"])
    dest = shipment["dest"].strip().upper()
    return f"{tracking_id:<12}{dest:^5}{shipment['weight_kg']:>8.2f} kg"


def summary_line(count, total_kg):
    noun = "parcel" if count == 1 else "parcels"
    return f"{count:,} {noun}, {total_kg:,.1f} kg total"
`;

const roundInsteadOfFormat = String.raw`def normalize_tracking_id(raw):
    return raw.strip().upper().replace(" ", "").replace("-", "").replace("\t", "")


def format_label_line(shipment):
    tracking_id = normalize_tracking_id(shipment["id"])
    dest = shipment["dest"].strip().upper()
    weight = str(round(shipment["weight_kg"], 2))
    return tracking_id.ljust(12) + dest.center(5) + weight.rjust(8) + " kg"


def summary_line(count, total_kg):
    noun = "parcel" if count == 1 else "parcels"
    return f"{count:,} {noun}, {total_kg:,.1f} kg total"
`;

const noSeparatorsOrPlural = String.raw`def normalize_tracking_id(raw):
    return raw.strip().upper().replace(" ", "").replace("-", "").replace("\t", "")


def format_label_line(shipment):
    tracking_id = normalize_tracking_id(shipment["id"])
    dest = shipment["dest"].strip().upper()
    return f"{tracking_id:<12}{dest:^5}{shipment['weight_kg']:>8.2f} kg"


def summary_line(count, total_kg):
    return f"{count} parcels, {total_kg:.1f} kg total"
`;

const forgetsToAssign = String.raw`def normalize_tracking_id(raw):
    raw.strip()
    raw.upper()
    return raw.replace(" ", "").replace("-", "")


def format_label_line(shipment):
    tracking_id = normalize_tracking_id(shipment["id"])
    dest = shipment["dest"]
    dest.strip()
    dest.upper()
    return f"{tracking_id:<12}{dest:^5}{shipment['weight_kg']:>8.2f} kg"


def summary_line(count, total_kg):
    noun = "parcel" if count == 1 else "parcels"
    return f"{count:,} {noun}, {total_kg:,.1f} kg total"
`;

export const mission: MissionInput = {
  slug: "py-label-formatting",
  version: 1,
  track: "python",
  tier: "intermediate",
  order: 1,
  title: "Crooked labels and unfindable tracking IDs",
  summary:
    "Hand-typed tracking IDs don't match the database and printer labels come out misaligned. Normalise text with string methods and lay out columns with f-string format specs.",
  minutes: 25,
  assessmentTypes: ["write-code", "interpret-output"],
  skills: ["py.strings"],
  appliesSkills: ["py.functions", "py.control-flow"],
  prerequisites: ["py-eta-functions"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#warehouse-systems",
    body: `Two complaints from the ATL warehouse, both landing in \`labels.py\`:

1. Staff type tracking IDs into the lookup screen as \`lmn 3007-0001\`, \`LMN-3007-0001 \` and so on. The database stores \`LMN30070001\` — upper case, no spaces, tabs or hyphens — so lookups fail. \`normalize_tracking_id\` should fix that.
2. The thermal printer uses a monospaced font and the columns wander. Each label line must be: tracking ID left-aligned in 12 characters, destination hub (upper case) centred in 5, weight right-aligned in 8 with exactly 2 decimals, then \` kg\`. For example \`"LMN30070001  ATL    12.50 kg"\`.

Also, the shift summary should read \`"1,234 parcels, 15,230.5 kg total"\` — thousands separators, one decimal, and \`"1 parcel"\` when there's only one.`,
  },
  objectives: [
    "Explain why string methods return new strings rather than changing the original",
    "Normalise messy human input with strip, upper and character filtering",
    "Use f-string format specs for width, alignment, precision and thousands separators",
    "Choose between rounding a number and formatting it for display",
  ],
  concept: {
    title: "Strings are immutable; format specs describe layout",
    body: `A \`str\` can never be changed in place. Methods such as \`.strip()\`, \`.upper()\` and \`.replace()\` **return a new string**; the original is untouched:

\`\`\`python
code = " atl "
code.upper()          # returns " ATL " ... which is thrown away
code = code.strip().upper()   # rebind to keep the result -> "ATL"
\`\`\`

Chaining works because each call returns a string the next method can act on.

For output, an f-string field can carry a **format spec** after a colon: \`{value:[align][width][,][.precision][type]}\`.

| Spec | Meaning | \`f"{x:...}"\` result |
| --- | --- | --- |
| \`<12\` | left-align in 12 chars | \`"LMN1        "\` |
| \`^5\` | centre in 5 | \`" ATL "\` |
| \`>8.2f\` | right-align in 8, 2 decimals | \`"   12.50"\` |
| \`,\` | thousands separator | \`"1,234"\` |
| \`03d\` | zero-pad integer to 3 | \`"007"\` |

\`round(12.5, 2)\` is still the number \`12.5\` — numbers don't remember trailing zeros. Formatting with \`.2f\` is what guarantees "12.50" on paper. Keep numbers as numbers while calculating and decide their appearance only when you turn them into text.`,
  },
  workedExample: {
    title: "Worked example: a dock-door status board",
    body: `The dock board shows one line per door: door number zero-padded to 2 digits, carrier name upper-cased and left-aligned in 10, and utilisation as a percentage right-aligned in 6 with 1 decimal. Carrier names come from a form, so they may have stray spaces.

**Step 1 — clean the text, keeping the result:**

\`\`\`python
def clean_carrier(raw):
    return raw.strip().upper()        # " northline " -> "NORTHLINE"
\`\`\`

**Step 2 — describe the layout with format specs, not manual spaces:**

\`\`\`python
def door_line(door, carrier, utilisation):
    name = clean_carrier(carrier)
    return f"D{door:02d} {name:<10}{utilisation:>6.1%}"
\`\`\`

\`door_line(7, " northline ", 0.8125)\` → \`"D07 NORTHLINE  81.2%"\`. The \`%\` type multiplies by 100 and adds the sign; \`02d\` pads 7 to "07".

**Step 3 — handle the grammar with a conditional expression:**

\`\`\`python
def doors_summary(n):
    word = "door" if n == 1 else "doors"
    return f"{n:,} {word} active"
\`\`\`

Count the characters of the output once by hand: fixed-width fields mean every line is the same length, which is exactly what a monospaced printer needs.`,
  },
  workspace: {
    kind: "python",
    entry: "labels.py",
    files: [
      { path: "labels.py", content: starter, editable: true },
      {
        path: "printer_sample.txt",
        content: `--- what the printer produced this morning (starter code) ---
lmn 3007-0001 atl 12.5 kg
LMN30070002 DEN 3 kg
LMN30070003 ORD 1234.567 kg
1234 parcels, 15230.46 kg total
--- what operations expects ---
LMN30070001  ATL    12.50 kg
LMN30070002  DEN     3.00 kg
LMN30070003  ORD  1234.57 kg
1,234 parcels, 15,230.5 kg total
`,
        editable: false,
      },
    ],
    tests: [
      {
        id: "normalize-basic",
        name: "normalize_tracking_id removes case, spaces, hyphens and tabs",
        code: String.raw`cases = {
    " lmn 3007-0001 ": "LMN30070001",
    "LMN-3007-0002": "LMN30070002",
    "lmn30070003\t": "LMN30070003",
}
for raw, want in cases.items():
    r = main.normalize_tracking_id(raw)
    assert r == want, f"normalize_tracking_id({raw!r}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "A hand-typed tracking ID was not turned into the database form (upper case, no spaces, hyphens or tabs).",
          why: "The lookup compares strings exactly; one stray hyphen or lower-case letter means \"not found\" for a parcel that exists.",
          next: "Strip the ends, upper-case, then remove every space, hyphen and tab from the inside (replace() or a join over the characters).",
        },
      },
      {
        id: "normalize-edge",
        name: "Already-clean IDs are unchanged; internal runs of spaces are removed",
        hidden: true,
        code: String.raw`cases = {"LMN30070004": "LMN30070004", "  lmn 3007  0005": "LMN30070005", "Lmn--3007 - 0006": "LMN30070006"}
for raw, want in cases.items():
    r = main.normalize_tracking_id(raw)
    assert r == want, f"normalize_tracking_id({raw!r}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "An ID with repeated separators, or an already-normal ID, came out wrong.",
          why: "Normalisation must be idempotent: running it on clean data must not change it, and messy data in any amount must converge to one form.",
          next: "Remove every occurrence of the separator characters, not just the first one.",
        },
      },
      {
        id: "label-layout",
        name: "format_label_line produces fixed-width columns",
        code: String.raw`cases = [
    ({"id": "LMN30070001", "dest": "ATL", "weight_kg": 12.5}, "LMN30070001  ATL    12.50 kg"),
    ({"id": "LMN30070002", "dest": "DEN", "weight_kg": 3}, "LMN30070002  DEN     3.00 kg"),
]
for shipment, want in cases:
    r = main.format_label_line(shipment)
    assert r == want, f"format_label_line({shipment}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "A label line did not match the column layout (12 left / 5 centred / 8 right with 2 decimals, then \" kg\").",
          why: "The printer uses a monospaced font; if each field is not exactly its width, every column after it shifts.",
          next: "Use one f-string with format specs: {id:<12}{dest:^5}{weight:>8.2f} kg. Note that str(round(3, 2)) is \"3\", not \"3.00\".",
        },
      },
      {
        id: "label-normalises-fields",
        name: "Label lines normalise the ID and hub, and keep width for large weights",
        hidden: true,
        code: String.raw`r = main.format_label_line({"id": "lmn-3007-0003", "dest": " ord ", "weight_kg": 1234.567})
want = "LMN30070003  ORD  1234.57 kg"
assert r == want, f"expected {want!r}, got {r!r}"
assert len(main.format_label_line({"id": "LMN30070009", "dest": "atl", "weight_kg": 0.456})) == len(want), "every label line should be the same length"`,
        feedback: {
          what: "The label did not normalise a messy ID or hub, or a line came out a different length from the others.",
          why: "Labels are printed straight from operator input, and the scanner reads the ID off the label — it must be the database form.",
          next: "Reuse normalize_tracking_id for the ID, and .strip().upper() the hub before formatting.",
        },
      },
      {
        id: "summary-line",
        name: "summary_line uses thousands separators, one decimal, and singular/plural",
        code: String.raw`cases = [
    ((1234, 15230.46), "1,234 parcels, 15,230.5 kg total"),
    ((1, 2.0), "1 parcel, 2.0 kg total"),
    ((0, 0), "0 parcels, 0.0 kg total"),
]
for args, want in cases:
    r = main.summary_line(*args)
    assert r == want, f"summary_line{args} should be {want!r}, got {r!r}"`,
        feedback: {
          what: "The shift summary did not match the expected wording or number format.",
          why: "Supervisors read this aloud at handover; \"15230.46\" is easy to misread and \"1 parcels\" looks careless in reports sent to customers.",
          next: "Use {count:,} and {total_kg:,.1f}, and choose \"parcel\" or \"parcels\" with a conditional expression.",
        },
      },
    ],
    solution: { "labels.py": solution },
    wrongSolutions: [
      { label: "Only removes spaces, not hyphens or tabs", files: { "labels.py": missesHyphens } },
      { label: "Uses round() + str() instead of a .2f format", files: { "labels.py": roundInsteadOfFormat } },
      { label: "No thousands separators and always plural", files: { "labels.py": noSeparatorsOrPlural } },
      { label: "Calls string methods without keeping their results", files: { "labels.py": forgetsToAssign } },
    ],
  },
  successCriteria: [
    "normalize_tracking_id returns the upper-case ID with all spaces, hyphens and tabs removed, and leaves clean IDs unchanged",
    "format_label_line returns 12 / 5 / 8-character columns with 2-decimal weights and normalised ID and hub",
    "summary_line returns counts and totals with thousands separators, one decimal, and correct singular or plural",
  ],
  hints: [
    "Compare the two halves of `printer_sample.txt`. List every difference: case, separators, alignment, decimals, commas.",
    "String methods return new strings. `raw.upper()` on its own line does nothing useful — the result has to be kept (assigned, returned or chained).",
    "Format specs go after a colon inside the braces: `<` left, `^` centre, `>` right, then width, then `.2f` for two decimals. `,` adds thousands separators.",
    "`normalize_tracking_id`: `raw.strip().upper().replace(\" \", \"\").replace(\"-\", \"\").replace(\"\\t\", \"\")`. Label: `f\"{tid:<12}{dest:^5}{weight:>8.2f} kg\"`. Summary: `f\"{count:,} {noun}, {total_kg:,.1f} kg total\"` with `noun = \"parcel\" if count == 1 else \"parcels\"`.",
  ],
  questions: [
    {
      id: "predict-format-spec",
      kind: "mcq",
      prompt: "What does this print? (Spaces are shown as they would appear.)",
      code: `print(f"[{3.14159:>8.2f}]")`,
      codeLanguage: "python",
      options: ["[3.14]", "[    3.14]", "[3.14    ]", "[3.14159 ]"],
      answer: 1,
      explanation: "`.2f` gives \"3.14\" (4 characters) and `>8` right-aligns it in 8, so four spaces come first.",
    },
    {
      id: "predict-immutable",
      kind: "short",
      prompt: "What does this print?",
      code: `hub = " atl "
hub.strip()
hub = hub.upper()
print(f"[{hub}]")`,
      codeLanguage: "python",
      accept: ["[ ATL ]"],
      acceptPatterns: ["^\\[ ATL \\]$"],
      explanation:
        "The result of `hub.strip()` was discarded, so the spaces remain. Only `.upper()` was kept by reassigning, giving \"[ ATL ]\".",
    },
  ],
  debrief: {
    solution: `Normalise, keep each result, and let format specs do the layout:

\`\`\`python
def normalize_tracking_id(raw):
    cleaned = raw.strip().upper()
    return "".join(ch for ch in cleaned if ch not in " -\\t")

def format_label_line(shipment):
    tracking_id = normalize_tracking_id(shipment["id"])
    dest = shipment["dest"].strip().upper()
    return f"{tracking_id:<12}{dest:^5}{shipment['weight_kg']:>8.2f} kg"

def summary_line(count, total_kg):
    noun = "parcel" if count == 1 else "parcels"
    return f"{count:,} {noun}, {total_kg:,.1f} kg total"
\`\`\`

A chain of \`.replace()\` calls is an equally good normaliser. The key ideas are: string methods return new strings, and \`.2f\` (not \`round\`) is what guarantees two decimals in text.`,
    commonMistakes: [
      "Calling raw.strip() or raw.upper() on its own line and expecting raw to change.",
      "Using round(x, 2) and str() for display, which prints \"3\" or \"12.5\" instead of \"3.00\" and \"12.50\".",
      "Building columns with manual spaces, which only lines up for one particular length of value.",
      "Removing only the first separator (e.g. with a slice) instead of every occurrence.",
    ],
    realWorld:
      "Normalising identifiers at the boundary (case, whitespace, separators) is how real systems make lookups reliable — email addresses, hostnames, postcodes and SKUs all get the same treatment. Fixed-width formatting is still everywhere in logistics: thermal labels, EDI files, mainframe exports and CLI tables. Format specs keep that logic declarative and testable.",
  },
  review: [
    {
      id: "py-string-immutability",
      skill: "py.strings",
      variants: [
        {
          id: "py-string-immutability-a",
          kind: "short",
          prompt: "What does this print?",
          code: `carrier = "northline"
carrier.upper()
print(carrier)`,
          codeLanguage: "python",
          accept: ["northline"],
          explanation: "upper() returns a new string, which is discarded. The name `carrier` still refers to the original lower-case text.",
        },
        {
          id: "py-string-immutability-b",
          kind: "short",
          prompt: "What does this print?",
          code: `sku = "ab-12-cd"
sku.replace("-", "")
sku = sku.upper()
print(sku)`,
          codeLanguage: "python",
          accept: ["AB-12-CD"],
          explanation: "The replace() result was thrown away; only upper() was kept by reassigning, so the hyphens remain.",
        },
        {
          id: "py-string-immutability-c",
          kind: "mcq",
          prompt: "Which line actually removes the surrounding spaces from `host` for later use?",
          options: ["host.strip()", "host = host.strip()", "strip(host)", "host.strip(inplace=True)"],
          answer: 1,
          explanation: "Strings are immutable; you must keep the new string that strip() returns, typically by reassigning the name.",
        },
      ],
    },
    {
      id: "py-format-spec",
      skill: "py.strings",
      variants: [
        {
          id: "py-format-spec-a",
          kind: "short",
          prompt: "What does `f\"{48210.5:,.2f}\"` produce?",
          accept: ["48,210.50"],
          explanation: "`,` adds a thousands separator and `.2f` gives exactly two decimals.",
        },
        {
          id: "py-format-spec-b",
          kind: "short",
          prompt: "What does `f\"BAY-{7:03d}\"` produce?",
          accept: ["BAY-007"],
          explanation: "`03d` pads the integer with zeros to a width of 3.",
        },
        {
          id: "py-format-spec-c",
          kind: "mcq",
          prompt: "Which f-string shows the weight 3 as `3.00` right-aligned in 6 characters?",
          options: ['f"{w:6}"', 'f"{w:>6.2f}"', 'f"{round(w, 2):>6}"', 'f"{w:<6.2f}"'],
          answer: 1,
          explanation: "`>6` right-aligns in 6 and `.2f` forces two decimals. round(3, 2) is still 3, which displays as \"3\".",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev Okafor's DNS audit compares hostnames from the IPAM export (`\"Web-01.Lumen.Internal \"`) with hostnames from the zone file (`\"web-01.lumen.internal\"`). Every host is reported as \"missing\".",
    question: {
      id: "transfer-hostname-normalise",
      kind: "mcq",
      prompt: "Which normalisation, applied to both sides before comparing, fixes the audit without hiding real differences?",
      options: [
        'name.replace("-", "")',
        "name.strip().lower()",
        "name[:6]",
        "name.upper().replace(\".\", \"\")",
      ],
      answer: 1,
      explanation:
        "DNS names are case-insensitive and the export has trailing whitespace, so strip().lower() makes equal names compare equal. Removing hyphens or dots, or truncating, could make different hosts look the same.",
    },
  },
  refresher: {
    body: `Strings never change in place. \`name.strip()\` *returns* a cleaned copy; if you don't keep it (\`name = name.strip()\`), the work is lost. Chain methods to apply several clean-ups: \`raw.strip().upper().replace("-", "")\`.

To control how a value looks, put a format spec after a colon in an f-string: \`{x:>8.2f}\` means "right-align in 8 characters, with 2 decimals", \`{n:,}\` adds thousands separators. Format at the moment you produce text; keep numbers as numbers until then.`,
    practice: {
      id: "refresher-two-decimals",
      kind: "short",
      prompt: "What does `f\"{7.5:.2f}\"` produce?",
      accept: ["7.50"],
      explanation: ".2f always shows exactly two decimal places.",
    },
  },
};
