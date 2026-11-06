import type { MissionInput } from "@/content/schema";

const starter = String.raw`# eta.py - ETA helpers called by the dispatch dashboard's backend.


def eta_hours(distance_km, speed_kmh, stops):
    driving = distance_km / speed_kmh
    stop_time = stops * 20 / 60
    print(round(driving + stop_time, 2))


def format_eta(hours):
    # TODO: turn 3.25 into "3h 15m" (minutes always two digits: "2h 05m").
    pass


def dispatch_message(shipment_id, distance_km, stops=0):
    # TODO: return e.g. "LMN30050001: ETA 3h 40m" using the two helpers above.
    pass
`;

const solution = String.raw`# eta.py - ETA helpers called by the dispatch dashboard's backend.


def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20):
    driving_hours = distance_km / speed_kmh
    stop_hours = stops * stop_minutes / 60
    return round(driving_hours + stop_hours, 2)


def format_eta(hours):
    total_minutes = round(hours * 60)
    whole_hours, minutes = divmod(total_minutes, 60)
    return f"{whole_hours}h {minutes:02d}m"


def dispatch_message(shipment_id, distance_km, stops=0):
    hours = eta_hours(distance_km, stops=stops)
    return f"{shipment_id}: ETA {format_eta(hours)}"
`;

const printsAndReturns = String.raw`def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20):
    result = round(distance_km / speed_kmh + stops * stop_minutes / 60, 2)
    print("eta_hours ->", result)
    return result


def format_eta(hours):
    total_minutes = round(hours * 60)
    h, m = divmod(total_minutes, 60)
    return f"{h}h {m:02d}m"


def dispatch_message(shipment_id, distance_km, stops=0):
    return f"{shipment_id}: ETA {format_eta(eta_hours(distance_km, stops=stops))}"
`;

const splitThenRound = String.raw`def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20):
    return round(distance_km / speed_kmh + stops * stop_minutes / 60, 2)


def format_eta(hours):
    whole_hours = int(hours)
    minutes = round((hours - whole_hours) * 60)
    return f"{whole_hours}h {minutes:02d}m"


def dispatch_message(shipment_id, distance_km, stops=0):
    return f"{shipment_id}: ETA {format_eta(eta_hours(distance_km, stops=stops))}"
`;

const hardcodedStopMinutes = String.raw`def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20):
    return round(distance_km / speed_kmh + stops * 20 / 60, 2)


def format_eta(hours):
    total_minutes = round(hours * 60)
    h, m = divmod(total_minutes, 60)
    return f"{h}h {m:02d}m"


def dispatch_message(shipment_id, distance_km, stops=0):
    return f"{shipment_id}: ETA {format_eta(eta_hours(distance_km, stops=stops))}"
`;

const returnsPrint = String.raw`def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20):
    return print(round(distance_km / speed_kmh + stops * stop_minutes / 60, 2))


def format_eta(hours):
    total_minutes = round(hours * 60)
    h, m = divmod(total_minutes, 60)
    return f"{h}h {m:02d}m"


def dispatch_message(shipment_id, distance_km, stops=0):
    return f"{shipment_id}: ETA {format_eta(eta_hours(distance_km, stops=stops) or 0)}"
`;

export const mission: MissionInput = {
  slug: "py-eta-functions",
  version: 1,
  track: "python",
  tier: "beginner",
  order: 3,
  title: "The ETA that only appeared in the logs",
  summary:
    "The dispatch dashboard shows \"None\" for every ETA because the helper prints its answer instead of returning it. Rebuild the ETA functions with parameters, defaults and return values.",
  minutes: 25,
  assessmentTypes: ["repair-code", "interpret-output"],
  skills: ["py.functions"],
  appliesSkills: ["py.types", "py.control-flow"],
  prerequisites: ["py-delay-triage"],
  brief: {
    from: "Aiko Tanaka, Frontend engineer",
    channel: "#dispatch-dashboard",
    body: `Every ETA on the dispatch board says **None** since this morning's deploy, but the correct numbers are showing up in the backend's log output — so the maths seems fine and the value just never reaches me.

Marco says \`eta.py\` is yours this sprint. What I need from it:

- \`eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20)\` → hours as a number, rounded to 2 dp. Most of our trucks average 70 km/h and a stop takes 20 minutes, so callers should be able to leave those out.
- \`format_eta(hours)\` → text like \`"3h 15m"\` (minutes always two digits).
- \`dispatch_message(shipment_id, distance_km, stops=0)\` → \`"LMN30050001: ETA 3h 40m"\`.

Please don't print from these — the service log is parsed as JSON lines and stray prints break it.`,
  },
  objectives: [
    "Explain the difference between a function returning a value and printing it",
    "Give parameters sensible default values and call functions with keyword arguments",
    "Compose small functions so each one does one job and can be tested separately",
    "Convert a decimal quantity into whole units without producing impossible values like \"2h 60m\"",
  ],
  concept: {
    title: "A function's result is what it returns",
    body: `Calling a function evaluates to its **return value**. \`print()\` is something different: it writes text to the screen (or a log) and the function carries on. A function with no \`return\` statement — or one that reaches the end — returns \`None\`.

\`\`\`python
def shout(word):
    print(word.upper())     # side effect: text appears

x = shout("late")           # prints LATE
print(x)                    # None - nothing was returned
\`\`\`

Callers (a dashboard, another function, a test) can only use what you *return*. Printing is for humans at the edge of a program, not for passing data between functions.

**Parameters with defaults** make the common case short without hiding the knob: \`def eta_hours(distance_km, speed_kmh=70)\` can be called as \`eta_hours(140)\` or \`eta_hours(140, 90)\`. **Keyword arguments** such as \`eta_hours(140, stops=2)\` let you skip earlier defaults and make the call self-explanatory. Defaults are evaluated once, so use immutable values (numbers, strings, \`None\`), never \`[]\`.

**Composition**: small functions that each return one thing can be combined — \`format_eta(eta_hours(...))\` — and tested independently.`,
  },
  workedExample: {
    title: "Worked example: dock loading time",
    body: `The warehouse wants a loading-time estimate for a truck: each pallet takes 4 minutes by default, and the result should read like \`"1h 05m"\`.

**Step 1 — a calculating function that returns, with a default:**

\`\`\`python
def loading_minutes(pallets, minutes_per_pallet=4, setup_minutes=10):
    return setup_minutes + pallets * minutes_per_pallet
\`\`\`

\`loading_minutes(12)\` → \`58\`; \`loading_minutes(12, setup_minutes=0)\` → \`48\` (keyword argument skips the middle default).

**Step 2 — a formatting function that works in whole units first.** Converting everything to an integer number of minutes, then splitting, avoids results like "0h 60m":

\`\`\`python
def format_minutes(total):
    hours, minutes = divmod(round(total), 60)   # 65 -> (1, 5)
    return f"{hours}h {minutes:02d}m"          # "1h 05m"
\`\`\`

\`divmod(a, b)\` returns the quotient and remainder together; \`:02d\` pads to two digits.

**Step 3 — compose them, still returning:**

\`\`\`python
def loading_notice(bay, pallets):
    return f"Bay {bay}: {format_minutes(loading_minutes(pallets))}"
\`\`\`

The caller decides whether to print it. Your ETA helpers follow the same shape, but in hours and with stops.`,
  },
  workspace: {
    kind: "python",
    entry: "eta.py",
    files: [
      { path: "eta.py", content: starter, editable: true },
      {
        path: "service.log",
        content: `{"ts":"2026-11-05T08:00:02Z","level":"info","msg":"GET /eta shipment=LMN30050001"}
2.0
{"ts":"2026-11-05T08:00:02Z","level":"info","msg":"eta response","value":null}
{"ts":"2026-11-05T08:00:03Z","level":"error","msg":"log parser: line 2 is not JSON"}
`,
        editable: false,
      },
    ],
    tests: [
      {
        id: "returns-not-prints",
        name: "eta_hours returns the value and prints nothing",
        code: String.raw`r, printed = capture_output(main.eta_hours, 140, 70, 0)
assert r is not None, f"eta_hours(140, 70, 0) returned None - did you print instead of return? (printed: {printed.strip()!r})"
assert r == 2.0, f"eta_hours(140, 70, 0) should return 2.0, got {r!r}"
assert printed == "", f"eta_hours should not print anything, but printed {printed.strip()!r}"`,
        feedback: {
          what: "eta_hours returned None, returned the wrong value, or printed to the output.",
          why: "The dashboard can only use a returned value. Prints go to the service log, which is parsed as JSON and breaks on stray lines.",
          next: "Replace print(...) with return ..., and remove any debugging prints.",
        },
      },
      {
        id: "defaults-and-keywords",
        name: "Default speed, stops and stop length work, and can be overridden",
        code: String.raw`cases = [
    ((140,), {}, 2.0),
    ((140,), {"stops": 3}, 3.0),
    ((100, 50), {"stops": 1, "stop_minutes": 30}, 2.5),
    ((90, 60), {}, 1.5),
]
for args, kwargs, want in cases:
    r = main.eta_hours(*args, **kwargs)
    assert r == want, f"eta_hours({args}, {kwargs}) should be {want}, got {r!r}"`,
        feedback: {
          what: "eta_hours did not accept the default arguments or keyword arguments the dashboard uses.",
          why: "Callers rely on speed_kmh=70, stops=0 and stop_minutes=20 when they leave them out, and they pass stops=... by name.",
          next: "Declare the defaults in the def line: def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20). Use stop_minutes in the calculation instead of a hard-coded 20.",
        },
      },
      {
        id: "format-basic",
        name: "format_eta produces hours and two-digit minutes",
        code: String.raw`cases = {3.25: "3h 15m", 0.5: "0h 30m", 2.0: "2h 00m", 10.75: "10h 45m"}
for hours, want in cases.items():
    r = main.format_eta(hours)
    assert r == want, f"format_eta({hours}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "format_eta did not return the expected \"Xh MMm\" text.",
          why: "The dashboard displays this string as-is; dispatchers read it at a glance.",
          next: "Convert hours to a whole number of minutes, split into hours and minutes (divmod helps), and format minutes with :02d.",
        },
      },
      {
        id: "format-rounding-edge",
        name: "format_eta never shows 60 minutes",
        hidden: true,
        code: String.raw`cases = {2.999: "3h 00m", 1.0833333: "1h 05m", 0.0: "0h 00m"}
for hours, want in cases.items():
    r = main.format_eta(hours)
    assert r == want, f"format_eta({hours}) should be {want!r}, got {r!r}"`,
        feedback: {
          what: "A value just under a whole hour was shown as \"2h 60m\" (or similar) instead of \"3h 00m\".",
          why: "Rounding the minutes after splitting off the hours lets 59.94 minutes round up to 60 without carrying into the hours.",
          next: "Round to whole minutes first (round(hours * 60)), then split that integer into hours and minutes.",
        },
      },
      {
        id: "dispatch-message",
        name: "dispatch_message composes the helpers",
        code: String.raw`r, printed = capture_output(main.dispatch_message, "LMN30050001", 210, stops=2)
assert r == "LMN30050001: ETA 3h 40m", f"dispatch_message('LMN30050001', 210, stops=2) should be 'LMN30050001: ETA 3h 40m', got {r!r}"
assert printed == "", f"dispatch_message should not print, but printed {printed.strip()!r}"
r = main.dispatch_message("LMN30050002", 35)
assert r == "LMN30050002: ETA 0h 30m", f"dispatch_message('LMN30050002', 35) should be 'LMN30050002: ETA 0h 30m', got {r!r}"`,
        feedback: {
          what: "dispatch_message did not return the expected sentence.",
          why: "Reusing eta_hours and format_eta keeps one source of truth for the maths and the format.",
          next: "Call eta_hours(distance_km, stops=stops), pass the result to format_eta, and return an f-string with the shipment id.",
        },
      },
    ],
    solution: { "eta.py": solution },
    wrongSolutions: [
      { label: "Returns the value but still prints a debug line", files: { "eta.py": printsAndReturns } },
      { label: "Splits hours before rounding minutes (\"2h 60m\")", files: { "eta.py": splitThenRound } },
      { label: "Ignores the stop_minutes parameter", files: { "eta.py": hardcodedStopMinutes } },
      { label: "Returns the result of print()", files: { "eta.py": returnsPrint } },
    ],
  },
  successCriteria: [
    "eta_hours returns hours rounded to 2 dp, uses the defaults 70 km/h, 0 stops and 20 minutes per stop, and prints nothing",
    "format_eta returns text like \"3h 15m\" with two-digit minutes and never shows 60 minutes",
    "dispatch_message returns \"<id>: ETA <formatted eta>\" built from the other two functions",
  ],
  hints: [
    "Compare `service.log` with the starter code: the number 2.0 appears in the log, and the response value is null. Which line of `eta_hours` produced the log line, and what does the function give back?",
    "A function without a `return` gives back `None`. Defaults go in the `def` line: `def f(a, b=70):`.",
    "For formatting, work in whole minutes: `total = round(hours * 60)`, then `divmod(total, 60)` gives hours and leftover minutes. `f\"{m:02d}\"` pads to two digits.",
    "`def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20): return round(distance_km / speed_kmh + stops * stop_minutes / 60, 2)`. Then `dispatch_message` returns `f\"{shipment_id}: ETA {format_eta(eta_hours(distance_km, stops=stops))}\"`.",
  ],
  questions: [
    {
      id: "predict-print-return",
      kind: "mcq",
      prompt: "What is printed by the last line?",
      code: `def cost(kg):
    print(kg * 1.8)

total = cost(10)
print(total)`,
      codeLanguage: "python",
      options: ["18.0", "None", "18.0 then 18.0", "Nothing; it raises an error"],
      answer: 1,
      explanation:
        "`cost(10)` prints 18.0 as a side effect but has no return statement, so it returns None. `total` is None, and the last line prints None.",
    },
    {
      id: "predict-defaults",
      kind: "short",
      prompt: "What does this print?",
      code: `def load_time(pallets, minutes_each=4):
    return pallets * minutes_each

print(load_time(5), load_time(5, 2))`,
      codeLanguage: "python",
      accept: ["20 10"],
      acceptPatterns: ["^20\\s*,?\\s*10$"],
      explanation: "The first call uses the default 4 (5 × 4 = 20); the second overrides it with 2 (5 × 2 = 10).",
    },
  ],
  debrief: {
    solution: `Return values, use defaults for the common case, and compose:

\`\`\`python
def eta_hours(distance_km, speed_kmh=70, stops=0, stop_minutes=20):
    driving_hours = distance_km / speed_kmh
    stop_hours = stops * stop_minutes / 60
    return round(driving_hours + stop_hours, 2)

def format_eta(hours):
    whole_hours, minutes = divmod(round(hours * 60), 60)
    return f"{whole_hours}h {minutes:02d}m"

def dispatch_message(shipment_id, distance_km, stops=0):
    return f"{shipment_id}: ETA {format_eta(eta_hours(distance_km, stops=stops))}"
\`\`\`

The original \`eta_hours\` computed the right number and then printed it — so the number reached the log and \`None\` reached the dashboard. Rounding to whole minutes *before* splitting means 2.999 h becomes 180 min → \`3h 00m\`.`,
    commonMistakes: [
      "Keeping a print() next to the return \"for debugging\", which still pollutes a machine-parsed log.",
      "Writing return print(x): print returns None, so the caller still gets None.",
      "Adding a stop_minutes parameter but still multiplying by a hard-coded 20.",
      "Splitting hours with int() and then rounding the leftover minutes, which produces \"2h 60m\".",
    ],
    realWorld:
      "In services, libraries and data pipelines, functions communicate through return values (and exceptions); only the outermost layer talks to humans, usually through a logging framework rather than print. Defaults with keyword arguments are how most Python APIs stay easy to call while still being configurable — think `requests.get(url, timeout=5)`.",
  },
  review: [
    {
      id: "py-return-vs-print",
      skill: "py.functions",
      variants: [
        {
          id: "py-return-vs-print-a",
          kind: "mcq",
          prompt: "What does `x` hold after this runs?",
          code: `def pallets_needed(boxes):
    print(boxes // 40 + 1)

x = pallets_needed(100)`,
          codeLanguage: "python",
          options: ["3", "2", "None", '"3"'],
          answer: 2,
          explanation: "The function prints 3 but returns nothing, so x is None.",
        },
        {
          id: "py-return-vs-print-b",
          kind: "mcq",
          prompt: "What happens on the last line?",
          code: `def fuel_litres(km):
    print(km * 0.3)

budget = fuel_litres(200) * 1.6`,
          codeLanguage: "python",
          options: [
            "budget is 96.0",
            "TypeError: None cannot be multiplied by a float",
            "budget is None",
            "It prints 96.0",
          ],
          answer: 1,
          explanation: "fuel_litres prints 60.0 and returns None; None * 1.6 raises TypeError.",
        },
      ],
    },
    {
      id: "py-default-args",
      skill: "py.functions",
      variants: [
        {
          id: "py-default-args-a",
          kind: "short",
          prompt: "What does this print?",
          code: `def fee(kg, rate=2, minimum=5):
    return max(kg * rate, minimum)

print(fee(1), fee(4), fee(4, minimum=10))`,
          codeLanguage: "python",
          accept: ["5 8 10"],
          acceptPatterns: ["^5\\s*,?\\s*8\\s*,?\\s*10$"],
          explanation: "fee(1) = max(2, 5) = 5; fee(4) = max(8, 5) = 8; fee(4, minimum=10) = max(8, 10) = 10.",
        },
        {
          id: "py-default-args-b",
          kind: "short",
          prompt: "What does this print?",
          code: `def shift_hours(days, hours_per_day=8, overtime=0):
    return days * hours_per_day + overtime

print(shift_hours(3), shift_hours(3, overtime=4))`,
          codeLanguage: "python",
          accept: ["24 28"],
          acceptPatterns: ["^24\\s*,?\\s*28$"],
          explanation: "3 × 8 = 24; with overtime=4 passed by keyword, 24 + 4 = 28. The keyword argument skips over hours_per_day, which keeps its default.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Sam Ortiz asks for a monthly cost summary. A teammate's helper is:\n\n```python\ndef carrier_cost(invoices):\n    total = sum(invoices)\n    print(f\"Total: {total}\")\n```\n\nand the summary script does `with_tax = carrier_cost(march) * 1.2`.",
    question: {
      id: "transfer-cost-helper",
      kind: "mcq",
      prompt: "What is the smallest change that makes the summary script work and keeps the helper reusable?",
      options: [
        "Wrap the call in str(): str(carrier_cost(march)) * 1.2",
        "Change print(...) to return total, and let the caller print if it wants",
        "Make total a global variable and read it after calling the function",
        "Add print(with_tax) after the multiplication",
      ],
      answer: 1,
      explanation:
        "The caller needs a value, so the function must return it. Globals hide the data flow, and str() would make the multiplication repeat text.",
    },
  },
  refresher: {
    body: `\`print(x)\` shows \`x\` on the screen; \`return x\` hands \`x\` back to whoever called the function. If a function never reaches a \`return\`, the call evaluates to \`None\` — even if it printed the right answer along the way.

Default values let callers skip arguments: with \`def eta(km, speed=70)\`, both \`eta(140)\` and \`eta(140, speed=90)\` work. Build small functions that return values, and print only at the very edge of the program.`,
    practice: {
      id: "refresher-none-return",
      kind: "mcq",
      prompt: "Which function lets `y = double(4)` set `y` to 8?",
      options: [
        "def double(n):\n    print(n * 2)",
        "def double(n):\n    return n * 2",
        "def double(n):\n    n * 2",
        "def double(n):\n    result = n * 2",
      ],
      answer: 1,
      explanation: "Only the version with `return n * 2` hands the value back; the others return None.",
    },
  },
};
