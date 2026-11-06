import type { MissionInput } from "@/content/schema";

const starter = String.raw`# quote.py - freight quotes for the sales portal.
RATE_PER_KG = {"ATL-ORD": 0.42, "ATL-DEN": 0.55, "ORD-DEN": 0.38}


def lane_key(origin, dest):
    return f"{origin}-{dest}"


def base_cost(lane, weight_kg):
    return RATE_PER_KG[lane] * weight_kg


def apply_surcharges(cost, surcharges):
    total = cost
    for name, amount in surcharges.items():
        total = total + amount
    return total


def quote(request):
    lane = lane_key(request["origin"], request["dest"])
    cost = base_cost(lane, request["weight_kg"])
    return round(apply_surcharges(cost, request.get("surcharges", {})), 2)
`;

const tracebacks = `== portal-errors 2026-11-05 (api-01, /srv/portal) ==

--- error 1  14:02:17Z  POST /quote ---
request = {"origin": "ATL", "dest": "ORD", "weight_kg": 120, "surcharges": {"fuel": "12.50", "liftgate": 35}}
Traceback (most recent call last):
  File "/srv/portal/handlers.py", line 88, in post_quote
    price = quote.quote(req)
  File "/srv/portal/quote.py", line 23, in quote
    return round(apply_surcharges(cost, request.get("surcharges", {})), 2)
                 ~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/srv/portal/quote.py", line 16, in apply_surcharges
    total = total + amount
            ~~~~~~^~~~~~~~
TypeError: unsupported operand type(s) for +: 'float' and 'str'

--- error 2  14:09:44Z  POST /quote ---
request = {"origin": "atl", "dest": "den ", "weight_kg": 40}
Traceback (most recent call last):
  File "/srv/portal/handlers.py", line 88, in post_quote
    price = quote.quote(req)
  File "/srv/portal/quote.py", line 22, in quote
    cost = base_cost(lane, request["weight_kg"])
  File "/srv/portal/quote.py", line 10, in base_cost
    return RATE_PER_KG[lane] * weight_kg
           ~~~~~~~~~~~^^^^^^
KeyError: 'atl-den '

--- error 3  14:31:05Z  POST /quote ---
request = {"origin": "ORD", "dest": "DEN", "weight_kg": "40"}
Traceback (most recent call last):
  File "/srv/portal/handlers.py", line 88, in post_quote
    price = quote.quote(req)
  File "/srv/portal/quote.py", line 22, in quote
    cost = base_cost(lane, request["weight_kg"])
  File "/srv/portal/quote.py", line 10, in base_cost
    return RATE_PER_KG[lane] * weight_kg
           ~~~~~~~~~~~~~~~~~~^~~~~~~~~~~
TypeError: can't multiply sequence by non-int of type 'float'
`;

const solution = String.raw`# quote.py - freight quotes for the sales portal.
RATE_PER_KG = {"ATL-ORD": 0.42, "ATL-DEN": 0.55, "ORD-DEN": 0.38}


def lane_key(origin, dest):
    return f"{origin.strip().upper()}-{dest.strip().upper()}"


def base_cost(lane, weight_kg):
    if lane not in RATE_PER_KG:
        raise ValueError(f"no rate for lane {lane}")
    return RATE_PER_KG[lane] * float(weight_kg)


def apply_surcharges(cost, surcharges):
    total = cost
    for name, amount in surcharges.items():
        total = total + float(amount)
    return total


def quote(request):
    lane = lane_key(request["origin"], request["dest"])
    cost = base_cost(lane, request["weight_kg"])
    return round(apply_surcharges(cost, request.get("surcharges", {})), 2)
`;

const withLaneAndWeight = (surchargeLine: string, baseBody: string, laneBody: string) => String.raw`RATE_PER_KG = {"ATL-ORD": 0.42, "ATL-DEN": 0.55, "ORD-DEN": 0.38}


def lane_key(origin, dest):
${laneBody}


def base_cost(lane, weight_kg):
${baseBody}


def apply_surcharges(cost, surcharges):
    total = cost
    for name, amount in surcharges.items():
${surchargeLine}
    return total


def quote(request):
    lane = lane_key(request["origin"], request["dest"])
    cost = base_cost(lane, request["weight_kg"])
    return round(apply_surcharges(cost, request.get("surcharges", {})), 2)
`;

const goodLane = `    return f"{origin.strip().upper()}-{dest.strip().upper()}"`;
const goodBase = `    if lane not in RATE_PER_KG:
        raise ValueError(f"no rate for lane {lane}")
    return RATE_PER_KG[lane] * float(weight_kg)`;
const goodSurcharge = `        total = total + float(amount)`;

const intSurcharges = withLaneAndWeight(`        total = total + int(float(amount))`, goodBase, goodLane);
const zeroRateDefault = withLaneAndWeight(
  goodSurcharge,
  `    return RATE_PER_KG.get(lane, 0) * float(weight_kg)`,
  goodLane,
);
const upperOnly = withLaneAndWeight(goodSurcharge, goodBase, `    return f"{origin.upper()}-{dest.upper()}"`);

const suppressSymptoms = String.raw`RATE_PER_KG = {"ATL-ORD": 0.42, "ATL-DEN": 0.55, "ORD-DEN": 0.38}


def lane_key(origin, dest):
    return f"{origin}-{dest}"


def base_cost(lane, weight_kg):
    return RATE_PER_KG[lane] * weight_kg


def apply_surcharges(cost, surcharges):
    total = cost
    for name, amount in surcharges.items():
        total = total + amount
    return total


def quote(request):
    try:
        lane = lane_key(request["origin"], request["dest"])
        cost = base_cost(lane, request["weight_kg"])
        return round(apply_surcharges(cost, request.get("surcharges", {})), 2)
    except (TypeError, KeyError):
        return 0.0
`;

export const mission: MissionInput = {
  slug: "py-traceback-repair",
  version: 1,
  track: "python",
  tier: "advanced",
  order: 3,
  title: "Three tracebacks from the quote portal",
  summary:
    "The sales portal's quote endpoint fails for some customers. Read three production tracebacks, find the real cause of each, and repair the code without hiding errors.",
  minutes: 35,
  assessmentTypes: ["repair-code", "investigate-logs", "explain-root-cause"],
  skills: ["py.debugging"],
  appliesSkills: ["py.exceptions", "py.types", "py.strings"],
  prerequisites: ["py-log-crash"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `Sales says some customers get "Something went wrong" when they request a freight quote. I pulled three tracebacks from \`api-01\` into \`tracebacks.txt\`, each with the request that triggered it. They all end up in \`quote.py\`.

The portal form is filled in by humans and sent as JSON, so expect text where you'd like numbers and inconsistent case and spacing. Please fix the causes, not the symptoms:

- each of the three requests should get a correct quote
- a lane we genuinely don't serve must raise **\`ValueError\`** naming the lane, so the portal can tell the customer — not a \`KeyError\`, and definitely not a \$0 quote

Sam will want a sentence on root cause for the incident review.`,
  },
  objectives: [
    "Read a traceback from the bottom up: exception type and message, failing line, then the chain of callers",
    "Use the exception message and the triggering input together to form a root-cause hypothesis",
    "Fix the cause at the right place instead of suppressing the exception",
    "Keep genuinely invalid input visible as a clear, specific error",
  ],
  concept: {
    title: "A traceback is a call stack, printed oldest-first",
    body: `When an exception escapes, Python prints the **chain of calls that was active**, outermost first:

\`\`\`text
Traceback (most recent call last):
  File "handlers.py", line 88, in post_quote     <- the outermost caller
  File "quote.py", line 23, in quote
  File "quote.py", line 16, in apply_surcharges  <- where it was raised
    total = total + amount
TypeError: unsupported operand type(s) for +: 'float' and 'str'
\`\`\`

Read it **bottom-up**:

1. **Last line** — the exception type and message. \`'float' and 'str'\` tells you the *types* involved.
2. **Last frame** — the exact line that raised, and the function it's in.
3. **Frames above** — who called it with what. The bug is often *not* on the line that raised; that line just received a bad value from higher up.

Then combine with the input: \`"fuel": "12.50"\` is a string, which explains \`float + str\`.

Common messages decode quickly: \`KeyError: 'atl-den '\` shows the *exact* key looked up (note the trailing space); \`can't multiply sequence by non-int\` means a str or list was multiplied by a float; \`'NoneType' object has no attribute\` means something returned \`None\` earlier.

A fix that wraps the call in \`try/except\` and returns a default removes the traceback but not the bug — the customer now gets a wrong number instead of an error.`,
  },
  workedExample: {
    title: "Worked example: a crashing driver-hours report",
    body: `Traceback from the payroll export:

\`\`\`text
  File "payroll.py", line 31, in export
    hours = weekly_hours(shifts[driver])
  File "payroll.py", line 12, in weekly_hours
    return sum(end - start for start, end in shifts)
TypeError: unsupported operand type(s) for -: 'str' and 'str'
\`\`\`

**Step 1 — last line:** subtraction between two \`str\` values.

**Step 2 — last frame:** \`weekly_hours\`, line 12: \`end - start\`. So \`start\` and \`end\` are strings.

**Step 3 — go up a frame:** \`shifts[driver]\` comes from the CSV loader — \`csv\` returns text, so \`"17.5" - "9.0"\` fails.

**Step 4 — choose the fix location.** Converting inside \`weekly_hours\` with \`float()\` works; converting in the loader is better if other code uses the same data. Either way, the conversion must be lossless (\`float\`, not \`int\`).

**Step 5 — reproduce, fix, re-run:**

\`\`\`python
assert weekly_hours([("9.0", "17.5")]) == 8.5
\`\`\`

What we did **not** do: \`except TypeError: return 0\`. That would pay drivers for zero hours without anyone noticing.`,
  },
  workspace: {
    kind: "python",
    entry: "quote.py",
    files: [
      { path: "quote.py", content: starter, editable: true },
      { path: "tracebacks.txt", content: tracebacks, editable: false },
    ],
    tests: [
      {
        id: "error-1-surcharges",
        name: "Error 1: surcharges sent as text are added as numbers",
        code: String.raw`req = {"origin": "ATL", "dest": "ORD", "weight_kg": 120, "surcharges": {"fuel": "12.50", "liftgate": 35}}
r = main.quote(req)
assert r == 97.9, f"quote for error 1's request should be 97.9 (50.40 base + 12.50 + 35), got {r!r}"
r = main.quote({"origin": "ATL", "dest": "ORD", "weight_kg": 100})
assert r == 42.0, f"a request without surcharges should still quote 42.0, got {r!r}"`,
        feedback: {
          what: "The request from error 1 still fails or gives the wrong total.",
          why: "\"12.50\" is a str (the form sends text); float + str raises the TypeError in the traceback.",
          next: "Convert each surcharge amount to a number with float() before adding it.",
        },
      },
      {
        id: "error-2-lane-case",
        name: "Error 2: lanes are matched regardless of case and spacing",
        code: String.raw`r = main.quote({"origin": "atl", "dest": "den ", "weight_kg": 40})
assert r == 22.0, f"quote for error 2's request should be 22.0 (ATL-DEN at 0.55/kg), got {r!r}"
r = main.quote({"origin": " Ord", "dest": "DEN", "weight_kg": 10})
assert r == 3.8, f"' Ord' to 'DEN' should be the ORD-DEN lane (3.8), got {r!r}"`,
        feedback: {
          what: "A lane typed in lower case or with spaces was not found.",
          why: "KeyError: 'atl-den ' shows the exact key looked up — lower case with a trailing space — while the table uses 'ATL-DEN'.",
          next: "Normalise origin and dest in lane_key with .strip().upper() before building the key.",
        },
      },
      {
        id: "error-3-weight-text",
        name: "Error 3: weight sent as text is converted",
        code: String.raw`r = main.quote({"origin": "ORD", "dest": "DEN", "weight_kg": "40"})
assert r == 15.2, f"quote for error 3's request should be 15.2, got {r!r}"
r = main.quote({"origin": "ORD", "dest": "DEN", "weight_kg": "12.5"})
assert r == 4.75, f"weight '12.5' should quote 4.75, got {r!r}"`,
        feedback: {
          what: "A weight sent as text (\"40\") still fails or is converted lossily.",
          why: "\"can't multiply sequence by non-int of type 'float'\" means a str was multiplied by the float rate.",
          next: "Convert weight_kg with float() in base_cost (int() would lose 12.5 → 12).",
        },
      },
      {
        id: "unknown-lane",
        name: "Unknown lanes raise ValueError naming the lane",
        hidden: true,
        code: String.raw`try:
    r = main.quote({"origin": "ATL", "dest": "SEA", "weight_kg": 10})
except ValueError as exc:
    assert "ATL-SEA" in str(exc), f"the ValueError should name the lane 'ATL-SEA', got {str(exc)!r}"
except Exception as exc:
    raise AssertionError(f"an unknown lane should raise ValueError, but raised {type(exc).__name__}: {exc}")
else:
    raise AssertionError(f"an unknown lane should raise ValueError, but quote returned {r!r} - customers would be quoted that price")`,
        feedback: {
          what: "A lane we don't serve produced a price (possibly 0) or a KeyError instead of a ValueError naming the lane.",
          why: "Suppressing the error or defaulting the rate to 0 turns a clear failure into a free shipment offer.",
          next: "In base_cost, check lane in RATE_PER_KG and raise ValueError(f\"no rate for lane {lane}\") when it isn't.",
        },
      },
      {
        id: "decimal-surcharges",
        name: "Decimal surcharges are not truncated",
        hidden: true,
        code: String.raw`r = main.quote({"origin": "ATL", "dest": "ORD", "weight_kg": 10, "surcharges": {"fuel": "7.25", "residential": "4.75"}})
assert r == 16.2, f"4.20 base + 7.25 + 4.75 should be 16.2, got {r!r}"`,
        feedback: {
          what: "Surcharges with cents were rounded down or truncated.",
          why: "int() drops the fractional part, so every quote with decimal surcharges is undercharged.",
          next: "Use float(amount), not int(...).",
        },
      },
    ],
    solution: { "quote.py": solution },
    wrongSolutions: [
      { label: "Catches TypeError/KeyError in quote and returns 0.0", files: { "quote.py": suppressSymptoms } },
      { label: "Converts surcharges with int(), truncating cents", files: { "quote.py": intSurcharges } },
      { label: "Defaults unknown lanes to a rate of 0", files: { "quote.py": zeroRateDefault } },
      { label: "Upper-cases the lane but doesn't strip spaces", files: { "quote.py": upperOnly } },
    ],
  },
  successCriteria: [
    "All three requests from tracebacks.txt produce correct quotes",
    "Surcharges and weights sent as text are converted without losing decimals",
    "Lanes are matched case- and whitespace-insensitively",
    "A lane that isn't in the rate table raises ValueError naming the lane",
  ],
  hints: [
    "Take one traceback at a time and read it from the bottom: exception type, message, then the last `File ... line ...` frame. Write down what types or values the message mentions.",
    "Compare each message with the `request = ...` line above it. Which value in the request has a type or format the code doesn't expect?",
    "Error 2's message prints the exact key: `'atl-den '`. What would the key need to look like to match `RATE_PER_KG`? Error 3: which operand of `*` is a string?",
    "Three small fixes: `lane_key` returns `f\"{origin.strip().upper()}-{dest.strip().upper()}\"`; `base_cost` raises `ValueError` when the lane isn't in the table and multiplies by `float(weight_kg)`; `apply_surcharges` adds `float(amount)`.",
  ],
  questions: [
    {
      id: "which-frame",
      kind: "short",
      prompt: "In error 1, which function contains the line that raised the exception?",
      accept: ["apply_surcharges", "apply_surcharges()"],
      acceptPatterns: ["^apply_surcharges(\\(\\))?$"],
      placeholder: "function name",
      explanation:
        "The last frame before the exception line is `File \"/srv/portal/quote.py\", line 16, in apply_surcharges`. The frames above it (quote, post_quote) are its callers.",
    },
    {
      id: "explain-error-1",
      kind: "explain",
      prompt: "Write the one- or two-sentence root cause of error 1 for Sam's incident review, including why the fix is not `except TypeError`.",
      concepts: [
        {
          label: "The surcharge arrived as text (a string) from the form/JSON",
          anyOf: ["string", "str", "text", "\"12.50\"", "12.50", "quoted"],
        },
        {
          label: "Adding a float and a str raises TypeError",
          anyOf: ["typeerror", "type error", "float and str", "float and a str", "float to a str", "can't add", "cannot add", "mixed types", "incompatible types"],
        },
        {
          label: "Fix by converting with float() rather than suppressing",
          anyOf: ["convert", "conversion", "parse the amount", "cast", "to a number", "into a number", "to a float", "into a float"],
        },
      ],
      minConcepts: 2,
      explanation:
        "The traceback names float + str; the request shows \"fuel\": \"12.50\". Converting the amount fixes the cause, while catching TypeError would only hide it (and return a wrong price).",
      modelAnswer:
        "The portal sent the fuel surcharge as the string \"12.50\", and apply_surcharges added it to a float total, which raises TypeError (float + str). The fix is to convert each amount with float() before adding; catching TypeError would only hide the error and quote the customer a wrong price.",
    },
    {
      id: "predict-keyerror",
      kind: "mcq",
      prompt: "What is printed?",
      code: `rates = {"ATL-ORD": 0.42}
try:
    rates["atl-ord"]
except KeyError as exc:
    print(exc)`,
      codeLanguage: "python",
      options: ["'atl-ord'", "'ATL-ORD'", "KeyError", "0.42"],
      answer: 0,
      explanation:
        "A KeyError's message is the key that was looked up, shown with repr — which is why error 2's traceback reveals the lower case and the trailing space.",
    },
  ],
  debrief: {
    solution: `Each traceback pointed at a different unconverted or unnormalised input:

| Error | Message | Cause | Fix |
| --- | --- | --- | --- |
| 1 | \`float\` + \`str\` | surcharge \`"12.50"\` is text | \`float(amount)\` |
| 2 | \`KeyError: 'atl-den '\` | lane key not normalised | \`.strip().upper()\` in \`lane_key\` |
| 3 | can't multiply sequence by float | weight \`"40"\` is text | \`float(weight_kg)\` |

\`\`\`python
def lane_key(origin, dest):
    return f"{origin.strip().upper()}-{dest.strip().upper()}"

def base_cost(lane, weight_kg):
    if lane not in RATE_PER_KG:
        raise ValueError(f"no rate for lane {lane}")
    return RATE_PER_KG[lane] * float(weight_kg)
\`\`\`

Notice that errors 2 and 3 raised in the same line of \`base_cost\` but had different causes — the message, not the line number, distinguishes them.`,
    commonMistakes: [
      "Wrapping quote() in try/except and returning 0.0: the tracebacks disappear and customers get free or wrong quotes.",
      "Using RATE_PER_KG.get(lane, 0), which silently prices unknown lanes at zero.",
      "Converting with int(), which truncates \"12.50\" and \"12.5\".",
      "Fixing only the case (upper()) and missing the trailing space that the KeyError message showed.",
      "Reading only the top of the traceback (handlers.py) and looking for the bug in the wrong file.",
    ],
    realWorld:
      "Error trackers like Sentry group production tracebacks by their last frames and show the local variables — the same bottom-up reading you did here. Most production bugs at service boundaries are type and format mismatches from user input. The durable fix is validation at the edge (often a schema on the request body) plus clear, specific errors for input you can't serve.",
  },
  review: [
    {
      id: "py-traceback-reading",
      skill: "py.debugging",
      variants: [
        {
          id: "py-traceback-reading-a",
          kind: "short",
          prompt: "Which function raised the exception?",
          code: `Traceback (most recent call last):
  File "sync.py", line 40, in run
    push(batch)
  File "sync.py", line 22, in push
    payload = encode(record)
  File "sync.py", line 9, in encode
    return record["id"].upper()
AttributeError: 'int' object has no attribute 'upper'`,
          codeLanguage: "text",
          accept: ["encode", "encode()"],
          acceptPatterns: ["^encode(\\(\\))?$"],
          explanation: "The last frame (line 9, in encode) is where it was raised; run and push are callers. The message says record[\"id\"] was an int.",
        },
        {
          id: "py-traceback-reading-b",
          kind: "short",
          prompt: "On which line number of `labels.py` was the exception raised?",
          code: `Traceback (most recent call last):
  File "labels.py", line 51, in <module>
    main()
  File "labels.py", line 47, in main
    print_label(order)
  File "labels.py", line 18, in print_label
    weight = order["weight"] / order["pieces"]
ZeroDivisionError: division by zero`,
          codeLanguage: "text",
          accept: ["18", "line 18"],
          acceptPatterns: ["^(line\\s*)?18$"],
          explanation: "The bottom frame, line 18 in print_label, raised. pieces was 0 for that order.",
        },
        {
          id: "py-traceback-reading-c",
          kind: "mcq",
          prompt: "A traceback ends with `AttributeError: 'NoneType' object has no attribute 'group'` on the line `m.group(1)`. What is the most likely root cause?",
          options: [
            "The regex module is broken",
            "An earlier re.match(...) found no match and returned None, and the code didn't check",
            "group() needs no argument",
            "m is a string",
          ],
          answer: 1,
          explanation: "re.match returns None when nothing matches. The fix is to handle the no-match case, usually by raising a clear error or skipping the line.",
        },
      ],
    },
    {
      id: "py-fix-cause",
      skill: "py.debugging",
      variants: [
        {
          id: "py-fix-cause-a",
          kind: "mcq",
          prompt: "`KeyError: 'den'` is raised by `HUB_TIMEZONES[hub]`, where the table keys are upper case. Which fix addresses the cause?",
          options: [
            "HUB_TIMEZONES.get(hub, \"UTC\")",
            "try: ... except KeyError: pass",
            "Normalise hub with hub.strip().upper() before the lookup, and raise a clear error for truly unknown hubs",
            "Add \"den\" as a second key",
          ],
          answer: 2,
          explanation: "The cause is unnormalised input. A UTC default would schedule DEN deliveries in the wrong timezone silently.",
        },
        {
          id: "py-fix-cause-b",
          kind: "mcq",
          prompt: "`TypeError: '<' not supported between instances of 'str' and 'int'` comes from `if row[\"pallets\"] < 10:` in a CSV report. Best fix?",
          options: [
            "Wrap the comparison in try/except TypeError and skip the row",
            "Compare with \"10\" instead of 10",
            "Convert row[\"pallets\"] with int() when loading the CSV",
            "Delete the comparison",
          ],
          answer: 2,
          explanation: "CSV values are text. Converting at load time fixes every later use; comparing with \"10\" would compare text (\"9\" > \"10\").",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev Okafor's lab inventory script crashes on `ops-ws`:\n\n```text\nTraceback (most recent call last):\n  File \"inventory.py\", line 30, in <module>\n    report(load(\"hosts.txt\"))\n  File \"inventory.py\", line 21, in report\n    print(host[\"name\"], subnet_of(host[\"ip\"]))\n  File \"inventory.py\", line 12, in subnet_of\n    a, b, c, _ = ip.split(\".\")\nValueError: not enough values to unpack (expected 4, got 1)\n```\n\nhosts.txt has a line `dns-01  10.20.0.53` and another `gw-01  (dhcp)`.",
    question: {
      id: "transfer-inventory-traceback",
      kind: "mcq",
      prompt: "What is the root cause, and where should it be handled?",
      options: [
        "split() is broken for IP addresses; use a regex instead",
        "A host has \"(dhcp)\" instead of an IP; load() or subnet_of() should detect non-IP values and raise or skip them explicitly",
        "line 30 should call report() twice",
        "The tuple needs 5 names instead of 4",
      ],
      answer: 1,
      explanation:
        "\"(dhcp)\".split(\".\") gives one piece, so the unpacking fails. The message (got 1) plus the input explain it. Decide explicitly how to treat hosts without a static IP rather than letting the unpack crash.",
    },
  },
  refresher: {
    body: `Read a traceback **from the bottom**. The last line gives the exception type and a message — often naming the types or the exact key involved. The frame just above it is the line that raised. The frames above that are the callers that passed the values in.

Put the message next to the input that caused it ("12.50" is a string; 'atl-den ' has a trailing space) and fix that cause. Don't wrap the call in \`try/except\` to make the traceback go away — that just turns a visible error into a wrong answer.`,
    practice: {
      id: "refresher-bottom-up",
      kind: "mcq",
      prompt: "Where in a Python traceback is the line that actually raised the exception?",
      options: [
        "The first File line at the top",
        "The last File line, just above the exception message",
        "It isn't shown",
        "In the middle",
      ],
      answer: 1,
      explanation: "Tracebacks are printed oldest call first (\"most recent call last\"), so the raising line is at the bottom.",
    },
  },
};
