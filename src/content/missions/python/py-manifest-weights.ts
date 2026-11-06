import type { MissionInput } from "@/content/schema";

const starter = String.raw`# billing.py - helpers used by the nightly invoicing job.
# Scanner weights arrive as TEXT, for example "12.5", " 8 kg" or "3.25KG".


def parse_weight(raw):
    # TODO: return the weight in kilograms as a float.
    return raw


def billable_weight(actual_kg, length_cm, width_cm, height_cm):
    # TODO: charge the larger of the actual weight and the volumetric weight
    # (length x width x height / 5000), rounded to 2 decimal places.
    return actual_kg


def manifest_total(raw_weights):
    total = ""
    for raw in raw_weights:
        total = total + parse_weight(raw)
    return total
`;

const solution = String.raw`# billing.py - helpers used by the nightly invoicing job.
# Scanner weights arrive as TEXT, for example "12.5", " 8 kg" or "3.25KG".

VOLUMETRIC_DIVISOR = 5000


def parse_weight(raw):
    cleaned = raw.strip().lower()
    if cleaned.endswith("kg"):
        cleaned = cleaned[:-2]
    return float(cleaned.strip())


def billable_weight(actual_kg, length_cm, width_cm, height_cm):
    volumetric_kg = length_cm * width_cm * height_cm / VOLUMETRIC_DIVISOR
    chargeable = max(actual_kg, volumetric_kg)
    return round(chargeable, 2)


def manifest_total(raw_weights):
    total = 0.0
    for raw in raw_weights:
        total = total + parse_weight(raw)
    return total
`;

const intConversion = String.raw`def parse_weight(raw):
    cleaned = raw.strip().lower().replace("kg", "").strip()
    return int(cleaned)


def billable_weight(actual_kg, length_cm, width_cm, height_cm):
    volumetric_kg = length_cm * width_cm * height_cm / 5000
    return round(max(actual_kg, volumetric_kg), 2)


def manifest_total(raw_weights):
    total = 0
    for raw in raw_weights:
        total = total + parse_weight(raw)
    return total
`;

const textAccumulator = String.raw`def parse_weight(raw):
    cleaned = raw.strip().lower().replace("kg", "").strip()
    return float(cleaned)


def billable_weight(actual_kg, length_cm, width_cm, height_cm):
    volumetric_kg = length_cm * width_cm * height_cm / 5000
    return round(max(actual_kg, volumetric_kg), 2)


def manifest_total(raw_weights):
    total = ""
    for raw in raw_weights:
        total = total + str(parse_weight(raw))
    return total
`;

const actualOnly = String.raw`def parse_weight(raw):
    cleaned = raw.strip().lower().replace("kg", "").strip()
    return float(cleaned)


def billable_weight(actual_kg, length_cm, width_cm, height_cm):
    return round(actual_kg, 2)


def manifest_total(raw_weights):
    total = 0.0
    for raw in raw_weights:
        total = total + parse_weight(raw)
    return total
`;

export const mission: MissionInput = {
  slug: "py-manifest-weights",
  version: 1,
  track: "python",
  tier: "beginner",
  order: 1,
  title: "Fix the manifest weight totals",
  summary:
    "Scanner weights arrive as text, so the invoicing script glued them together instead of adding them. Convert them to numbers and compute billable weight.",
  minutes: 20,
  assessmentTypes: ["write-code", "interpret-output"],
  skills: ["py.variables", "py.types"],
  appliesSkills: [],
  prerequisites: [],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#billing-pipeline",
    body: `Finance flagged invoice INV-2291 this morning: the weight total for manifest M-2291 reads **"12.58 kg3.25KG"** instead of a number. The ATL dock scanners export weights as text — values like \`"12.5"\`, \`" 8 kg"\` and \`"3.25KG"\` — and \`billing.py\` adds them up as if they were numbers.

We bill about 4,000 parcels a day from this script, so please fix it properly:

- \`parse_weight(raw)\` turns one scanner value into kilograms as a \`float\`.
- \`manifest_total(raw_weights)\` adds up a list of scanner values.
- \`billable_weight(actual_kg, length_cm, width_cm, height_cm)\` charges whichever is larger, the actual weight or the volumetric weight (L × W × H ÷ 5000), rounded to 2 decimal places.

Run the checks before you hand it back.`,
  },
  objectives: [
    "Explain why adding two strings concatenates them instead of summing them",
    "Convert text input into a float at the point where it enters the program",
    "Use well-named intermediate variables to make a calculation readable",
    "Initialise an accumulator variable with the right type before a loop",
  ],
  concept: {
    title: "Names point at values, and values have types",
    body: `A variable in Python is a **name bound to a value**. \`total = 0.0\` binds the name \`total\` to a float; \`total = total + 5\` computes a *new* value and rebinds the name to it.

Every value has a **type**, and the type decides what operators mean:

\`\`\`python
"12.5" + "8"   # str + str -> "12.58"   (concatenation)
12.5 + 8       # float + int -> 20.5    (arithmetic)
"12.5" + 8     # TypeError: can only concatenate str (not "int") to str
\`\`\`

Python never guesses that \`"12.5"\` "looks like" a number. Text from files, scanners, forms and APIs is always \`str\` until *you* convert it with \`int()\` or \`float()\`. \`int("12.5")\` raises \`ValueError\` because that text is not a whole number, so pick the conversion that matches the data.

The safest pattern is to **convert at the boundary**: clean and convert the text the moment it enters your program, then work only with numbers. An accumulator such as a running total must start as the type you want at the end — \`0.0\`, not \`""\` — because every \`+\` in the loop uses the type of the value already stored.`,
  },
  workedExample: {
    title: "Worked example: averaging reefer temperatures",
    body: `A refrigerated-container sensor reports readings as text: \`["-18.5C", " -19 C", "-17.25c"]\`. We want the average in °C.

**Step 1 — clean one value.** Strip spaces, normalise case, drop the unit, then convert:

\`\`\`python
def parse_temp(raw):
    cleaned = raw.strip().lower()      # "-18.5c"
    if cleaned.endswith("c"):
        cleaned = cleaned[:-1]         # "-18.5"
    return float(cleaned.strip())      # -18.5
\`\`\`

**Step 2 — accumulate with the right starting type.** \`0.0\` is a float, so each \`+\` is arithmetic:

\`\`\`python
def average_temp(readings):
    total = 0.0
    count = 0
    for raw in readings:
        total = total + parse_temp(raw)
        count = count + 1
    return total / count
\`\`\`

**Step 3 — check with a value you can work out by hand.** \`(-18.5 + -19 + -17.25) / 3 = -18.25\`.

Notice the names: \`cleaned\`, \`total\`, \`count\`. Each holds one idea, so a reader can follow the calculation line by line. Your billing helpers need the same shape with a different unit and a different formula.`,
  },
  workspace: {
    kind: "python",
    entry: "billing.py",
    files: [
      { path: "billing.py", content: starter, editable: true },
      {
        path: "scanner_export.txt",
        content: `manifest=M-2291 hub=ATL exported=2026-11-03T22:14:09Z
LMN30011872 weight="12.5"
LMN30011873 weight=" 8 kg"
LMN30011874 weight="3.25KG"
`,
        editable: false,
      },
    ],
    tests: [
      {
        id: "parse-plain-number",
        name: "parse_weight converts plain numeric text to a float",
        code: String.raw`r = main.parse_weight("12.5")
assert isinstance(r, float), f"parse_weight('12.5') should return a float, got {type(r).__name__}: {r!r}"
assert r == 12.5, f"parse_weight('12.5') should be 12.5, got {r!r}"`,
        feedback: {
          what: "parse_weight did not return the number 12.5 as a float for the text \"12.5\".",
          why: "Everything downstream (totals, billing) does arithmetic. A str or an int in the wrong place either concatenates or loses the decimal part.",
          next: "Convert the text with float(...) and return the result.",
        },
      },
      {
        id: "parse-with-units",
        name: "parse_weight ignores spaces, case and the kg unit",
        code: String.raw`for raw, want in [(" 8 kg", 8.0), ("3.25KG", 3.25), ("0.5 Kg", 0.5)]:
    r = main.parse_weight(raw)
    assert isinstance(r, float), f"parse_weight({raw!r}) should return a float, got {type(r).__name__}"
    assert abs(r - want) < 1e-9, f"parse_weight({raw!r}) should be {want}, got {r!r}"`,
        feedback: {
          what: "parse_weight failed on a value with surrounding spaces or a kg/KG unit.",
          why: "Real scanner exports are messy. float(\" 8 kg\") raises ValueError, so the text must be cleaned before it is converted.",
          next: "Strip whitespace, lower-case the text, remove a trailing \"kg\", strip again, then call float().",
        },
      },
      {
        id: "manifest-total-sums",
        name: "manifest_total adds weights numerically",
        code: String.raw`r = main.manifest_total(["12.5", " 8 kg", "3.25KG"])
assert isinstance(r, (int, float)) and not isinstance(r, bool), f"manifest_total should return a number, got {type(r).__name__}: {r!r}"
assert abs(r - 23.75) < 1e-9, f"manifest_total of M-2291 should be 23.75, got {r!r}"`,
        feedback: {
          what: "manifest_total did not return 23.75 for the three M-2291 weights.",
          why: "This is the exact bug Finance saw: starting the total as \"\" makes every + a string concatenation.",
          next: "Start the accumulator as 0.0 (a number) and add the parsed float from each value.",
        },
      },
      {
        id: "billable-picks-larger",
        name: "billable_weight charges the larger of actual and volumetric weight",
        code: String.raw`r = main.billable_weight(2.0, 50, 40, 30)
assert r == 12.0, f"A 2 kg parcel measuring 50x40x30 cm has volumetric weight 12.0 kg, so billable should be 12.0, got {r!r}"
r = main.billable_weight(15.0, 50, 40, 30)
assert r == 15.0, f"A 15 kg parcel measuring 50x40x30 cm should bill its actual 15.0 kg, got {r!r}"`,
        feedback: {
          what: "billable_weight did not pick the larger of actual weight and L x W x H / 5000.",
          why: "Light but bulky parcels take up truck space; carriers bill them by volume. Undercharging them is lost revenue on every shipment.",
          next: "Compute volumetric_kg = length_cm * width_cm * height_cm / 5000 in its own variable, then use max() with actual_kg.",
        },
      },
      {
        id: "billable-rounds",
        name: "billable_weight rounds to 2 decimal places",
        hidden: true,
        code: String.raw`r = main.billable_weight(1.0, 33, 21, 17)
assert r == 2.36, f"33x21x17 cm gives 2.3562 kg volumetric; rounded to 2 dp that is 2.36, got {r!r}"`,
        feedback: {
          what: "billable_weight did not round its result to 2 decimal places.",
          why: "Invoices show two decimals. Unrounded values make line items disagree with the printed total.",
          next: "Wrap the final value in round(value, 2).",
        },
      },
      {
        id: "edge-whole-and-empty",
        name: "whole-number text and empty manifests",
        hidden: true,
        code: String.raw`r = main.parse_weight("7")
assert isinstance(r, float) and r == 7.0, f"parse_weight('7') should be the float 7.0, got {type(r).__name__}: {r!r}"
t = main.manifest_total([])
assert t == 0 and not isinstance(t, str), f"manifest_total([]) should be 0, got {t!r}"`,
        feedback: {
          what: "Either a whole-number weight did not come back as a float, or an empty manifest did not total 0.",
          why: "Consistent types prevent surprises later (e.g. integer formatting). An empty manifest is common at the start of a shift.",
          next: "Always use float() for weights, and make sure the accumulator's starting value is a number.",
        },
      },
    ],
    solution: { "billing.py": solution },
    wrongSolutions: [
      { label: "Converts with int(), losing or rejecting decimals", files: { "billing.py": intConversion } },
      { label: "Accumulates into a string with str()", files: { "billing.py": textAccumulator } },
      { label: "Ignores volumetric weight", files: { "billing.py": actualOnly } },
    ],
  },
  successCriteria: [
    "parse_weight returns a float for plain text, text with spaces, and text with a kg unit in any case",
    "manifest_total returns 23.75 for the M-2291 weights and 0 for an empty list",
    "billable_weight returns the larger of actual and volumetric weight, rounded to 2 decimal places",
  ],
  hints: [
    "Look at the type of each value as it flows through the code. What type does the scanner give you, and what type does `total` start as?",
    "`float(\" 8 kg\")` raises `ValueError`. The text has to be cleaned first — think about which string methods remove surrounding spaces and change case.",
    "In `manifest_total`, the very first line decides what `+` means for the whole loop. Change the starting value so it is a number.",
    "For billable weight: put `length_cm * width_cm * height_cm / 5000` in a variable called `volumetric_kg`, then return `round(max(actual_kg, volumetric_kg), 2)`. For parsing: `raw.strip().lower()`, remove a trailing `\"kg\"`, `.strip()` again, then `float(...)`.",
  ],
  questions: [
    {
      id: "predict-concat",
      kind: "mcq",
      prompt: "What does this print?",
      code: `a = "12.5"
b = "8"
print(a + b)`,
      codeLanguage: "python",
      options: ["20.5", "12.58", "TypeError", "12.5 8"],
      answer: 1,
      explanation:
        "Both values are str, so + concatenates them: \"12.5\" followed by \"8\" is \"12.58\". Python does not inspect text to see whether it looks numeric.",
    },
    {
      id: "predict-rebinding",
      kind: "short",
      prompt: "What does this print?",
      code: `count = 3
backup = count
count = count + 1
print(backup)`,
      codeLanguage: "python",
      accept: ["3"],
      placeholder: "the printed value",
      explanation:
        "`backup = count` binds `backup` to the value 3. `count = count + 1` creates a new value 4 and rebinds only `count`; `backup` still refers to 3.",
    },
  ],
  debrief: {
    solution: `Convert at the boundary, then do arithmetic only with numbers:

\`\`\`python
def parse_weight(raw):
    cleaned = raw.strip().lower()
    if cleaned.endswith("kg"):
        cleaned = cleaned[:-2]
    return float(cleaned.strip())

def manifest_total(raw_weights):
    total = 0.0                      # a number, so + is arithmetic
    for raw in raw_weights:
        total = total + parse_weight(raw)
    return total

def billable_weight(actual_kg, length_cm, width_cm, height_cm):
    volumetric_kg = length_cm * width_cm * height_cm / 5000
    return round(max(actual_kg, volumetric_kg), 2)
\`\`\`

The original bug had two halves: \`parse_weight\` returned the text unchanged, and \`total\` started as \`""\`. Together they turned every \`+\` into concatenation.`,
    commonMistakes: [
      "Using int() for weights: int(\"12.5\") raises ValueError, and int(12.5) silently drops the .5 kg.",
      "Fixing parse_weight but leaving total = \"\" so the loop raises TypeError (str + float).",
      "Calling str() on each value to make the TypeError go away, which brings back the original concatenation bug.",
      "Forgetting to strip again after removing \"kg\", so \"8 \" is left with a trailing space (float tolerates it, but other parsers do not).",
    ],
    realWorld:
      "Every boundary of a real system — CSV exports, HTTP query strings, environment variables, message queues — delivers text. Mature codebases convert and validate at that edge (often with a schema library) so the rest of the code can trust its types. When you see a number glued to another number in a report, suspect a missing conversion first.",
  },
  review: [
    {
      id: "py-variable-rebinding",
      skill: "py.variables",
      variants: [
        {
          id: "py-variable-rebinding-a",
          kind: "short",
          prompt: "What does this print?",
          code: `pallets = 10
original = pallets
pallets = pallets - 4
print(original)`,
          codeLanguage: "python",
          accept: ["10"],
          explanation: "`original` was bound to 10. Rebinding `pallets` to 6 does not change what `original` refers to.",
        },
        {
          id: "py-variable-rebinding-b",
          kind: "short",
          prompt: "What does this print?",
          code: `stops = 2
planned = stops
stops = stops * 3
print(planned, stops)`,
          codeLanguage: "python",
          accept: ["2 6"],
          acceptPatterns: ["^2\\s*,?\\s*6$"],
          explanation: "`planned` keeps the value 2. `stops * 3` produces a new value 6, and only `stops` is rebound to it.",
        },
        {
          id: "py-variable-rebinding-c",
          kind: "mcq",
          prompt: "A loop should add up delivery times. Which starting line makes `total = total + minutes` work for numeric `minutes`?",
          options: ['total = ""', "total = 0", "total = None", "total = []"],
          answer: 1,
          explanation:
            "The accumulator must start as a number. \"\" would raise TypeError (str + int), None has no +, and a list + int is also a TypeError.",
        },
      ],
    },
    {
      id: "py-type-conversion",
      skill: "py.types",
      variants: [
        {
          id: "py-type-conversion-a",
          kind: "mcq",
          prompt: 'What happens when Python runs `int("4.75")`?',
          options: ["Returns 4", "Returns 5", "Returns 4.75", "Raises ValueError"],
          answer: 3,
          explanation:
            "int() on text only accepts whole-number text. For \"4.75\" use float(\"4.75\") (and int(float(...)) only if you really mean to truncate).",
        },
        {
          id: "py-type-conversion-b",
          kind: "mcq",
          prompt: 'What does `"3" * 2` evaluate to?',
          options: ["6", '"33"', "TypeError", '"3 3"'],
          answer: 1,
          explanation: "str * int repeats the text, so \"3\" * 2 is \"33\". The operator's meaning depends on the operand types.",
        },
        {
          id: "py-type-conversion-c",
          kind: "short",
          prompt: 'What does `float(" 2.50 ") + 1` evaluate to?',
          accept: ["3.5"],
          acceptPatterns: ["^3\\.50*$"],
          explanation: "float() ignores surrounding whitespace, giving 2.5; adding 1 gives 3.5.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Priya's on-call script reads disk usage percentages from an environment variable: `DISK_ALERT_THRESHOLD=\"85\"`. It compares `usage > threshold` where `usage` is the float 91.2 and `threshold` is read with `os.environ[\"DISK_ALERT_THRESHOLD\"]`.",
    question: {
      id: "transfer-env-threshold",
      kind: "mcq",
      prompt: "What happens when the comparison runs, and what is the fix?",
      options: [
        "It works: Python converts \"85\" automatically",
        "TypeError because float and str cannot be compared with >; convert with float(os.environ[...])",
        "It is always False because strings are smaller than numbers",
        "ValueError because \"85\" is not a float",
      ],
      answer: 1,
      explanation:
        "Environment variables are always text. Ordering comparisons between float and str raise TypeError in Python 3. Convert at the boundary: threshold = float(os.environ[\"DISK_ALERT_THRESHOLD\"]).",
    },
  },
  refresher: {
    body: `Text and numbers are different types. \`"5" + "5"\` is \`"55"\` because \`+\` on two strings joins them; \`5 + 5\` is \`10\` because \`+\` on two numbers adds them. Anything read from a file, scanner, form or environment variable starts as \`str\`.

Convert it once, as soon as it arrives: \`float(" 8 ")\` gives \`8.0\` (surrounding spaces are fine, but units like "kg" must be removed first). When you build a total in a loop, start the total as \`0\` or \`0.0\` so every \`+\` is arithmetic.`,
    practice: {
      id: "refresher-sum-text",
      kind: "mcq",
      prompt: 'Which expression evaluates to the number 7.5?',
      options: ['"5" + "2.5"', 'float("5") + float("2.5")', 'int("5") + int("2.5")', 'str(5) + str(2.5)'],
      answer: 1,
      explanation:
        "Only converting both values with float() gives numeric addition. int(\"2.5\") raises ValueError; the others concatenate text.",
    },
  },
};
