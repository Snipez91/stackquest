import type { MissionInput } from "@/content/schema";

const reportStarter = String.raw`# report.py - weight report for customers who invoice in pounds.
# The email scheduler does "import report" and calls weight_line() for each shipment.

LB_PER_KG = 2.2


def kg_to_lb(kg):
    return round(kg * LB_PER_KG, 1)


def weight_line(shipment_id, kg):
    return f"{shipment_id}: {kg_to_lb(kg)} lb"


print(weight_line("LMN30100001", 10))
`;

const unitsStarter = String.raw`"""units.py - shared unit conversions for every Lumen script.

TODO: move the conversion here so billing and reporting agree.
"""
`;

const billingLegacy = String.raw`# billing_legacy.py - owned by the billing team (read-only for you).
# It already expects units.py to provide kg_to_lb.
from units import kg_to_lb


def invoice_weight_lb(kg):
    return kg_to_lb(kg)
`;

const unitsSolution = String.raw`"""units.py - shared unit conversions for every Lumen script."""

LB_PER_KG = 2.20462


def kg_to_lb(kg):
    return round(kg * LB_PER_KG, 2)


def lb_to_kg(lb):
    return round(lb / LB_PER_KG, 2)
`;

const reportSolution = String.raw`# report.py - weight report for customers who invoice in pounds.
# The email scheduler does "import report" and calls weight_line() for each shipment.
from units import kg_to_lb


def weight_line(shipment_id, kg):
    return f"{shipment_id}: {kg_to_lb(kg)} lb"


if __name__ == "__main__":
    print(weight_line("LMN30100001", 10))
`;

const unitsOldConstant = String.raw`LB_PER_KG = 2.2


def kg_to_lb(kg):
    return round(kg * LB_PER_KG, 2)


def lb_to_kg(lb):
    return round(lb / LB_PER_KG, 2)
`;

const reportDeletesDemo = String.raw`from units import kg_to_lb


def weight_line(shipment_id, kg):
    return f"{shipment_id}: {kg_to_lb(kg)} lb"
`;

const reportKeepsCopy = String.raw`LB_PER_KG = 2.20462


def kg_to_lb(kg):
    return round(kg * LB_PER_KG, 2)


def weight_line(shipment_id, kg):
    return f"{shipment_id}: {kg_to_lb(kg)} lb"


if __name__ == "__main__":
    print(weight_line("LMN30100001", 10))
`;

const unitsCircular = String.raw`from report import weight_line

LB_PER_KG = 2.20462


def kg_to_lb(kg):
    return round(kg * LB_PER_KG, 2)


def lb_to_kg(lb):
    return round(lb / LB_PER_KG, 2)


def describe(shipment_id, kg):
    return weight_line(shipment_id, kg)
`;

const reportPrintsOnImport = String.raw`from units import kg_to_lb


def weight_line(shipment_id, kg):
    return f"{shipment_id}: {kg_to_lb(kg)} lb"


print(weight_line("LMN30100001", 10))
`;

export const mission: MissionInput = {
  slug: "py-shared-units-module",
  version: 1,
  track: "python",
  tier: "intermediate",
  order: 4,
  title: "Two conversions, one invoice dispute",
  summary:
    "Billing and reporting convert kilograms to pounds differently, and importing the report prints into customer emails. Extract a shared module and make imports side-effect free.",
  minutes: 30,
  assessmentTypes: ["repair-code", "explain-root-cause"],
  skills: ["py.modules"],
  appliesSkills: ["py.functions", "py.strings"],
  prerequisites: ["py-label-formatting"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#billing-pipeline",
    body: `A customer in Memphis disputed invoice INV-3310: the invoice says **22.05 lb** for a 10 kg crate and our weight report says **22.0 lb**. Billing uses 2.20462 lb/kg; \`report.py\` has its own copy of the conversion with 2.2. Two copies of the same rule will always drift.

Also, the email scheduler does \`import report\`, and every customer email this week started with a stray line \`LMN30100001: 22.0 lb\`.

Please:

- Put the conversions in \`units.py\`: \`LB_PER_KG = 2.20462\`, \`kg_to_lb(kg)\` and \`lb_to_kg(lb)\`, both rounded to 2 dp. \`billing_legacy.py\` already imports from it.
- Make \`report.py\` use \`units\` instead of its own copy.
- Importing \`report\` must print nothing, but \`python report.py\` should still print the sample line for quick manual checks.`,
  },
  objectives: [
    "Move shared logic into a module and import it from several scripts",
    "Explain what happens when Python imports a module (it runs the file top to bottom, once)",
    "Use the `if __name__ == \"__main__\":` guard to separate script behaviour from importable code",
    "Recognise circular imports and module-name shadowing from their symptoms",
  ],
  concept: {
    title: "Importing a module runs it",
    body: `\`import units\` makes Python find \`units.py\` (searching the script's directory first, then the standard library and installed packages — the order in \`sys.path\`), **execute the whole file top to bottom**, and cache the resulting module object in \`sys.modules\`. Later imports reuse the cache.

Because the file is executed, any top-level \`print()\` or other action runs on import. That's why scripts guard their "run me" code:

\`\`\`python
def weight_line(...): ...          # definitions: safe to import

if __name__ == "__main__":         # only when run as  python report.py
    print(weight_line("LMN1", 10))
\`\`\`

\`__name__\` is \`"__main__"\` for the file you run directly and the module's name (\`"report"\`) when it is imported.

\`from units import kg_to_lb\` binds the name \`kg_to_lb\` in *your* module to the function object in \`units\`. One definition, many users: change the constant in \`units.py\` and every importer gets the change.

Two classic traps: a **circular import** (\`report\` imports \`units\` while \`units\` imports \`report\`) fails because one module is only half-executed when the other asks for its names. And a local file named like a standard module (\`json.py\`, \`csv.py\`) **shadows** the real one, because the script's directory is searched first.`,
  },
  workedExample: {
    title: "Worked example: a shared distance helper",
    body: `Two scripts, \`routes.py\` and \`fuel.py\`, each convert miles to kilometres — one with 1.6, one with 1.609344.

**Step 1 — create one home for the rule:**

\`\`\`python
# distance.py
KM_PER_MILE = 1.609344

def miles_to_km(miles):
    return round(miles * KM_PER_MILE, 1)
\`\`\`

**Step 2 — delete the copies and import instead:**

\`\`\`python
# fuel.py
from distance import miles_to_km

def litres_needed(miles, litres_per_100km=32):
    return round(miles_to_km(miles) * litres_per_100km / 100, 1)

if __name__ == "__main__":
    print(litres_needed(250))      # manual check: python fuel.py
\`\`\`

**Step 3 — check both ways of using the file:**

- \`python fuel.py\` → \`__name__ == "__main__"\`, so the sample line prints.
- \`import fuel\` from another script → \`__name__ == "fuel"\`, nothing prints; the caller just gets \`litres_needed\`.

**Step 4 — keep the dependency one-way.** \`distance.py\` must not import \`fuel\` or \`routes\`. Low-level helpers are imported *by* scripts, never the reverse; that rule alone prevents circular imports.`,
  },
  workspace: {
    kind: "python",
    entry: "report.py",
    files: [
      { path: "report.py", content: reportStarter, editable: true },
      { path: "units.py", content: unitsStarter, editable: true },
      { path: "billing_legacy.py", content: billingLegacy, editable: false },
    ],
    tests: [
      {
        id: "units-module",
        name: "units.py provides the agreed constant and conversions",
        code: String.raw`import units
assert getattr(units, "LB_PER_KG", None) == 2.20462, f"units.LB_PER_KG should be 2.20462, got {getattr(units, 'LB_PER_KG', None)!r}"
r = units.kg_to_lb(10)
assert r == 22.05, f"units.kg_to_lb(10) should be 22.05, got {r!r}"
r = units.lb_to_kg(22.0462)
assert r == 10.0, f"units.lb_to_kg(22.0462) should be 10.0, got {r!r}"
r = units.kg_to_lb(0.5)
assert r == 1.1, f"units.kg_to_lb(0.5) should be 1.1, got {r!r}"`,
        feedback: {
          what: "units.py is missing LB_PER_KG, kg_to_lb or lb_to_kg, or they give the wrong values.",
          why: "This module becomes the single source of truth for conversions; billing and reporting must agree to the cent.",
          next: "Define LB_PER_KG = 2.20462 and the two functions (round to 2 dp) in units.py.",
        },
      },
      {
        id: "billing-imports",
        name: "billing_legacy can import kg_to_lb from units",
        code: String.raw`import billing_legacy
r = billing_legacy.invoice_weight_lb(10)
assert r == 22.05, f"billing_legacy.invoice_weight_lb(10) should be 22.05, got {r!r}"`,
        feedback: {
          what: "billing_legacy.py could not import kg_to_lb from units, or got a different value.",
          why: "Another team's code already depends on this name. A shared module is a contract: its names are its interface.",
          next: "Make sure units.py defines a function called kg_to_lb at the top level of the module.",
        },
      },
      {
        id: "report-values",
        name: "report.weight_line uses the agreed conversion",
        code: String.raw`r = main.weight_line("LMN30100001", 10)
assert r == "LMN30100001: 22.05 lb", f"weight_line('LMN30100001', 10) should be 'LMN30100001: 22.05 lb', got {r!r}"`,
        feedback: {
          what: "The report still shows a different number of pounds than billing.",
          why: "This is the customer dispute: 22.0 lb on the report, 22.05 lb on the invoice.",
          next: "Delete report.py's own LB_PER_KG and kg_to_lb, and import kg_to_lb from units instead.",
        },
      },
      {
        id: "import-is-silent",
        name: "Importing report (and units) prints nothing",
        code: String.raw`import importlib, units
_, printed = capture_output(importlib.reload, main)
assert printed == "", f"importing report printed {printed.strip()!r} - this ends up in customer emails"
_, printed = capture_output(importlib.reload, units)
assert printed == "", f"importing units printed {printed.strip()!r}"`,
        feedback: {
          what: "Importing a module printed output.",
          why: "The scheduler imports report to call weight_line; top-level code runs on every import, so the print leaks into each email.",
          next: "Move the sample print under if __name__ == \"__main__\":.",
        },
      },
      {
        id: "script-still-prints",
        name: "Running report.py directly still prints the sample line",
        hidden: true,
        code: String.raw`import runpy
_, printed = capture_output(runpy.run_path, "report.py", run_name="__main__")
assert "LMN30100001: 22.05 lb" in printed, f"python report.py should print 'LMN30100001: 22.05 lb', printed {printed.strip()!r}"`,
        feedback: {
          what: "Running report.py as a script no longer prints the sample line.",
          why: "Sam asked to keep the quick manual check. Deleting the print fixes the emails but removes a useful tool; the guard keeps both behaviours.",
          next: "Keep the print, but inside if __name__ == \"__main__\": at the bottom of report.py.",
        },
      },
      {
        id: "single-source",
        name: "report gets its conversion from units (no private copy)",
        hidden: true,
        code: String.raw`import sys, types, importlib
real_units = sys.modules.get("units")
real_report = sys.modules.get("report")
fake = types.ModuleType("units")
fake.LB_PER_KG = 1.0
fake.kg_to_lb = lambda kg: 999
fake.lb_to_kg = lambda lb: 999
try:
    sys.modules["units"] = fake
    sys.modules.pop("report", None)
    fresh = importlib.import_module("report")
    r = fresh.weight_line("X", 1)
    assert "999" in r, f"with a different units module, report.weight_line returned {r!r} - report seems to have its own copy of the conversion"
finally:
    if real_units is not None:
        sys.modules["units"] = real_units
    if real_report is not None:
        sys.modules["report"] = real_report`,
        feedback: {
          what: "report.py still computes pounds with its own code instead of the function from units.",
          why: "If report keeps a private copy, the two will drift again the next time someone changes one of them.",
          next: "Remove kg_to_lb and LB_PER_KG from report.py and use from units import kg_to_lb (or import units).",
        },
      },
    ],
    solution: { "report.py": reportSolution, "units.py": unitsSolution },
    wrongSolutions: [
      { label: "Moves the code but keeps the 2.2 constant", files: { "report.py": reportSolution, "units.py": unitsOldConstant } },
      { label: "Deletes the demo print instead of guarding it", files: { "report.py": reportDeletesDemo, "units.py": unitsSolution } },
      { label: "Keeps a private copy of the conversion in report.py", files: { "report.py": reportKeepsCopy, "units.py": unitsSolution } },
      { label: "units.py imports from report (circular import)", files: { "report.py": reportSolution, "units.py": unitsCircular } },
      { label: "Leaves the print at the top level of report.py", files: { "report.py": reportPrintsOnImport, "units.py": unitsSolution } },
    ],
  },
  successCriteria: [
    "units.py defines LB_PER_KG = 2.20462, kg_to_lb and lb_to_kg (2 dp), and billing_legacy.py can import from it",
    "report.weight_line returns pounds computed by units, with no private copy of the conversion",
    "Importing report or units prints nothing, while running report.py directly still prints the sample line",
  ],
  hints: [
    "Two problems, two ideas: *where a rule lives* (one module, imported by everyone) and *what runs when a file is imported* (everything at the top level).",
    "`billing_legacy.py` shows the interface units.py must offer: `from units import kg_to_lb`. Put the constant and both functions in `units.py`.",
    "In `report.py`, delete the local constant and function and add `from units import kg_to_lb` at the top. `units.py` must not import `report` — dependencies point one way.",
    "Wrap the sample line: `if __name__ == \"__main__\":` followed by the indented `print(weight_line(\"LMN30100001\", 10))`. When imported, `__name__` is `\"report\"`, so it won't run.",
  ],
  questions: [
    {
      id: "explain-shadowing",
      kind: "explain",
      prompt:
        "Marco saved a scratch file called `json.py` in the project folder. Now `import json` followed by `json.loads(body)` fails with `AttributeError: module 'json' has no attribute 'loads'`. Explain the root cause and the fix.",
      concepts: [
        {
          label: "The local file shadows the standard-library module",
          anyOf: ["shadow", "shadows", "shadowing", "instead of the standard", "instead of the real", "his own json.py", "local json.py", "local file", "same name"],
        },
        {
          label: "The script's directory is searched first (sys.path order)",
          anyOf: ["sys.path", "searched first", "search path", "current directory", "script directory", "project folder first", "looks in the folder", "first match"],
        },
        {
          label: "Rename or remove the file (and its cache)",
          anyOf: ["rename", "delete", "remove", "move the file", "pycache", "different name"],
        },
      ],
      minConcepts: 2,
      explanation:
        "Imports are resolved by searching sys.path in order, starting with the script's directory, so a local file with a standard module's name wins. Renaming it restores the real module.",
      modelAnswer:
        "Python resolves imports by walking sys.path in order, and the script's own directory is searched first. The local json.py has the same name as the standard-library module, so it shadows it: import json loads Marco's scratch file, which has no loads function. The fix is to rename or delete json.py (and its __pycache__ entry) so the first match is the real standard-library json.",
    },
    {
      id: "predict-name-main",
      kind: "mcq",
      prompt: "`tools.py` contains the code below. Another script runs `import tools`. What is printed?",
      code: `print("loading", __name__)

if __name__ == "__main__":
    print("running checks")`,
      codeLanguage: "python",
      options: ["Nothing", "loading tools", "loading __main__ then running checks", "loading tools then running checks"],
      answer: 1,
      explanation:
        "Importing runs the top-level code, so the first print runs with __name__ equal to \"tools\". The guarded block only runs when tools.py is executed directly.",
    },
  ],
  debrief: {
    solution: `One module owns the rule; scripts import it; script-only code is guarded:

\`\`\`python
# units.py
LB_PER_KG = 2.20462

def kg_to_lb(kg):
    return round(kg * LB_PER_KG, 2)

def lb_to_kg(lb):
    return round(lb / LB_PER_KG, 2)
\`\`\`

\`\`\`python
# report.py
from units import kg_to_lb

def weight_line(shipment_id, kg):
    return f"{shipment_id}: {kg_to_lb(kg)} lb"

if __name__ == "__main__":
    print(weight_line("LMN30100001", 10))
\`\`\`

The dependency arrow points one way (\`report → units\`, \`billing_legacy → units\`), so there's no cycle, and importing either module only defines names.`,
    commonMistakes: [
      "Copying the function into units.py but leaving the old copy in report.py, so the two can drift again.",
      "Deleting the sample print instead of guarding it, losing the manual check Sam asked for.",
      "Making units.py import from report.py, creating a circular import that fails with ImportError.",
      "Forgetting that every top-level statement runs on import, not just function definitions.",
      "Naming a scratch file after a standard module (json.py, csv.py, email.py) and shadowing it.",
    ],
    realWorld:
      "Shared modules (and later, internal packages) are how teams enforce \"one definition of a business rule\": tax rates, unit conversions, tracking-ID formats. The `__main__` guard is also what lets tools like pytest, Celery or a web framework import your modules safely. When an import behaves strangely in production, `print(module.__file__)` shows exactly which file Python loaded.",
  },
  review: [
    {
      id: "py-name-main",
      skill: "py.modules",
      variants: [
        {
          id: "py-name-main-a",
          kind: "mcq",
          prompt: "What is the value of `__name__` inside `dispatch.py` when another script does `import dispatch`?",
          options: ['"__main__"', '"dispatch"', '"dispatch.py"', "None"],
          answer: 1,
          explanation: "An imported module's __name__ is its module name. Only the file run directly gets \"__main__\".",
        },
        {
          id: "py-name-main-b",
          kind: "mcq",
          prompt: "A module has `send_alerts()` called at the top level. A test file imports it to test a helper. What happens?",
          options: [
            "Nothing, imports never run code",
            "send_alerts() runs during the import, so the test sends real alerts",
            "Python skips function calls in imported files",
            "The import fails with ImportError",
          ],
          answer: 1,
          explanation: "Importing executes the whole file. Put the call under if __name__ == \"__main__\": so it only runs as a script.",
        },
      ],
    },
    {
      id: "py-import-resolution",
      skill: "py.modules",
      variants: [
        {
          id: "py-import-resolution-a",
          kind: "mcq",
          prompt: "A project folder contains `csv.py` (a scratch file). A script in that folder does `import csv` then `csv.DictReader(f)`. What is the most likely result?",
          options: [
            "It works; the standard library always wins",
            "AttributeError: the local csv.py is imported instead of the standard module",
            "SyntaxError",
            "Python asks which csv to use",
          ],
          answer: 1,
          explanation: "The script's directory comes first on sys.path, so the local file shadows the standard library module.",
        },
        {
          id: "py-import-resolution-b",
          kind: "mcq",
          prompt: "`a.py` starts with `from b import helper`, and `b.py` starts with `from a import CONFIG`. Running `python a.py` fails. Why?",
          options: [
            "Two files cannot both use from-imports",
            "Circular import: one module is only partly executed when the other asks for its names",
            "helper must be imported with import b",
            "CONFIG must be a function",
          ],
          answer: 1,
          explanation: "While a is importing b, b tries to read names from a that haven't been defined yet. Move the shared names into a third module that both import.",
        },
        {
          id: "py-import-resolution-c",
          kind: "short",
          prompt: "How many times does `print(\"init\")` at the top of `units.py` run if a program executes `import units` three times (in different modules)?",
          accept: ["1", "once", "one"],
          explanation: "The first import executes the file and caches the module in sys.modules; later imports reuse the cached module.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev Okafor writes a quick test script called `socket.py` in `~/lab/` to poke at `dns-01`. Afterwards, a different script in the same folder that does `import requests` fails with an error deep inside the HTTP library: `AttributeError: module 'socket' has no attribute 'AF_INET'`.",
    question: {
      id: "transfer-socket-shadow",
      kind: "mcq",
      prompt: "What is the most likely cause?",
      options: [
        "dns-01 is down",
        "requests is not installed",
        "Dev's socket.py shadows the standard-library socket module that requests imports",
        "AF_INET was removed from Python",
      ],
      answer: 2,
      explanation:
        "Libraries import standard modules by name too. With the script's folder first on sys.path, Dev's socket.py is found before the real one. Renaming it (e.g. dns_probe.py) fixes the error.",
    },
  },
  refresher: {
    body: `\`import units\` finds \`units.py\` and **runs it from top to bottom** once, then remembers the result. Anything at the top level — including \`print()\` calls — happens during the import.

Put shared rules in one module and import them everywhere instead of copying them. Put "only when I run this file" code under \`if __name__ == "__main__":\`, because \`__name__\` is \`"__main__"\` only for the file you run directly. And don't name your files after standard modules like \`json.py\`.`,
    practice: {
      id: "refresher-guard",
      kind: "mcq",
      prompt: "Which code in `report.py` runs ONLY when you execute `python report.py`, and not when another script imports it?",
      options: [
        "Code under if __name__ == \"__main__\":",
        "Top-level code outside any guard",
        "Import statements at the top of the file",
        "Function definitions (def lines)",
      ],
      answer: 0,
      explanation:
        "Top-level code, imports and def lines run in both cases. Only the guarded block checks that the file is being run directly.",
    },
  },
};
