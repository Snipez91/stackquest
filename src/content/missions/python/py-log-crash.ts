import type { MissionInput } from "@/content/schema";

const scannerLog = `2026-11-05T03:00:02Z|ATL-DOCK-3|LMN30090011|RECEIVED|12.5
2026-11-05T03:00:09Z|ATL-DOCK-3|LMN30090012|RECEIVED|3.0
2026-11-05T03:01:15Z|ATL-DOCK-1|LMN30090013|IN_TRANSIT|8.25
2026-11-05T03:02:40Z|ATL-DOCK-1|LMN3009
2026-11-05T03:02:41Z|ATL-DOCK-1|LMN30090014|IN_TRANSIT|N/A

2026-11-05T03:03:05Z|ATL-DOCK-2|LMN30090015|DELIVRD|4.4
2026-11-05T03:03:30Z|ATL-DOCK-2|LMN30090016|DELIVERED|1.75
2026-11-05T03:04:12Z|ATL-DOCK-3|LMN30090017|OUT_FOR_DELIVERY|22.0|extra
2026-11-05T03:05:00Z|ATL-DOCK-3|LMN30090018|EXCEPTION|0.9
2026-11-05T03:05:44Z|ATL-DOCK-1|LMN30090019|DELIVERED|6.6
`;

const crashTxt = `[cron] 2026-11-05T03:15:01Z ops-ws running: python process_log.py scanner.log
Traceback (most recent call last):
  File "/opt/lumen/process_log.py", line 28, in <module>
    print(summarize_log(sys.argv[1]))
          ~~~~~~~~~~~~~^^^^^^^^^^^^^
  File "/opt/lumen/process_log.py", line 21, in summarize_log
    rec = parse_line(line)
  File "/opt/lumen/process_log.py", line 6, in parse_line
    ts, scanner, tracking_id, status, weight = line.strip().split("|")
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: not enough values to unpack (expected 5, got 3)
[cron] exit status 1 - nightly dock summary NOT sent
`;

const starter = String.raw`# process_log.py - nightly summary of dock scanner events.
import sys


def parse_line(line):
    ts, scanner, tracking_id, status, weight = line.strip().split("|")
    return {
        "ts": ts,
        "scanner": scanner,
        "tracking_id": tracking_id,
        "status": status,
        "weight_kg": float(weight),
    }


def summarize_log(path):
    by_status = {}
    processed = 0
    with open(path) as f:
        for line in f:
            rec = parse_line(line)
            by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
            processed += 1
    return {"processed": processed, "skipped": 0, "by_status": by_status, "errors": []}


if __name__ == "__main__":
    print(summarize_log(sys.argv[1]))
`;

const solution = String.raw`# process_log.py - nightly summary of dock scanner events.
import sys

VALID_STATUSES = {"RECEIVED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"}


def parse_line(line):
    fields = line.strip().split("|")
    if len(fields) != 5:
        raise ValueError(f"expected 5 fields, got {len(fields)}")
    ts, scanner, tracking_id, status, weight = fields
    if status not in VALID_STATUSES:
        raise ValueError(f"unknown status {status!r}")
    try:
        weight_kg = float(weight)
    except ValueError:
        raise ValueError(f"bad weight {weight!r}") from None
    return {
        "ts": ts,
        "scanner": scanner,
        "tracking_id": tracking_id,
        "status": status,
        "weight_kg": weight_kg,
    }


def summarize_log(path):
    by_status = {}
    processed = 0
    errors = []
    with open(path) as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                rec = parse_line(line)
            except ValueError as exc:
                errors.append((line_no, str(exc)))
                continue
            by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
            processed += 1
    return {"processed": processed, "skipped": len(errors), "by_status": by_status, "errors": errors}


if __name__ == "__main__":
    print(summarize_log(sys.argv[1]))
`;

const goodParse = String.raw`VALID_STATUSES = {"RECEIVED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"}


def parse_line(line):
    fields = line.strip().split("|")
    if len(fields) != 5:
        raise ValueError(f"expected 5 fields, got {len(fields)}")
    ts, scanner, tracking_id, status, weight = fields
    if status not in VALID_STATUSES:
        raise ValueError(f"unknown status {status!r}")
    return {"ts": ts, "scanner": scanner, "tracking_id": tracking_id, "status": status, "weight_kg": float(weight)}

`;

const swallowEverything =
  goodParse +
  String.raw`
def summarize_log(path):
    try:
        by_status, processed, errors = {}, 0, []
        with open(path) as f:
            for line_no, line in enumerate(f, start=1):
                if not line.strip():
                    continue
                try:
                    rec = parse_line(line)
                except ValueError as exc:
                    errors.append((line_no, str(exc)))
                    continue
                by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
                processed += 1
        return {"processed": processed, "skipped": len(errors), "by_status": by_status, "errors": errors}
    except Exception:
        return {"processed": 0, "skipped": 0, "by_status": {}, "errors": []}
`;

const catchAllPerLine =
  goodParse +
  String.raw`
def summarize_log(path):
    by_status, processed, errors = {}, 0, []
    with open(path) as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                rec = parse_line(line)
                by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
                processed += 1
            except Exception as exc:
                errors.append((line_no, str(exc)))
    return {"processed": processed, "skipped": len(errors), "by_status": by_status, "errors": errors}
`;

const zeroBasedLines =
  goodParse +
  String.raw`
def summarize_log(path):
    by_status, processed, errors = {}, 0, []
    with open(path) as f:
        for line_no, line in enumerate(f):
            if not line.strip():
                continue
            try:
                rec = parse_line(line)
            except ValueError as exc:
                errors.append((line_no, str(exc)))
                continue
            by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
            processed += 1
    return {"processed": processed, "skipped": len(errors), "by_status": by_status, "errors": errors}
`;

const noStatusValidation = String.raw`def parse_line(line):
    ts, scanner, tracking_id, status, weight = line.strip().split("|")
    return {"ts": ts, "scanner": scanner, "tracking_id": tracking_id, "status": status, "weight_kg": float(weight)}


def summarize_log(path):
    by_status, processed, errors = {}, 0, []
    with open(path) as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                rec = parse_line(line)
            except ValueError as exc:
                errors.append((line_no, str(exc)))
                continue
            by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
            processed += 1
    return {"processed": processed, "skipped": len(errors), "by_status": by_status, "errors": errors}
`;

const blanksAsErrors =
  goodParse +
  String.raw`
def summarize_log(path):
    by_status, processed, errors = {}, 0, []
    with open(path) as f:
        for line_no, line in enumerate(f, start=1):
            try:
                rec = parse_line(line)
            except ValueError as exc:
                errors.append((line_no, str(exc)))
                continue
            by_status[rec["status"]] = by_status.get(rec["status"], 0) + 1
            processed += 1
    return {"processed": processed, "skipped": len(errors), "by_status": by_status, "errors": errors}
`;

export const mission: MissionInput = {
  slug: "py-log-crash",
  version: 1,
  track: "python",
  tier: "intermediate",
  order: 3,
  title: "One truncated scan line killed the nightly summary",
  summary:
    "The nightly dock summary crashed on a half-written scanner line and nobody got the report. Handle malformed records with specific exceptions, report them by line number, and keep real bugs visible.",
  minutes: 35,
  assessmentTypes: ["repair-code", "investigate-logs", "explain-root-cause"],
  skills: ["py.exceptions"],
  appliesSkills: ["py.files", "py.iteration", "py.strings"],
  prerequisites: ["py-hub-csv-report"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `The 03:15 cron job on \`ops-ws\` died again — see \`crash.txt\`. The ATL dock scanners occasionally write half a line when they lose Wi-Fi, and \`process_log.py\` falls over on the first bad record, so the whole nightly summary is lost.

What I want:

- \`parse_line(line)\` raises **\`ValueError\`** for any malformed record: not exactly 5 \`|\`-separated fields, a weight that isn't a number, or a status outside \`RECEIVED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION\`.
- \`summarize_log(path)\` uses \`parse_line\` for each line, skips blank lines, and returns \`processed\`, \`skipped\`, \`by_status\` and \`errors\` — a list of \`(line_number, message)\` with line numbers as you'd see them in an editor.

And please don't just wrap it all in \`try/except\`. If the log file is missing, or the code itself has a bug, I want the job to fail loudly.`,
  },
  objectives: [
    "Read a traceback to find which input record triggered a crash",
    "Raise ValueError with a useful message when input violates the expected format",
    "Catch only the exception type you expect, as close as possible to where it happens",
    "Record skipped records with 1-based line numbers so they can be fixed at the source",
    "Explain why catching all exceptions hides real bugs",
  ],
  concept: {
    title: "Exceptions separate bad data from broken code",
    body: `When Python can't do what a line asks, it **raises** an exception that travels up the call stack until something handles it — or the program stops with a traceback. \`try/except\` lets you handle it:

\`\`\`python
try:
    rec = parse_line(line)      # may raise ValueError for bad data
except ValueError as exc:       # only the failure we expect
    errors.append((line_no, str(exc)))
    continue                    # skip this record, keep going
\`\`\`

Two design rules make this robust:

1. **Signal bad input with a specific type.** Python already raises \`ValueError\` for \`float("N/A")\` and for unpacking the wrong number of fields. For rules Python can't know (allowed statuses), \`raise ValueError("unknown status 'DELIVRD'")\` yourself. Now "this record is bad" has one meaning.
2. **Catch narrowly.** \`except ValueError\` handles bad records. \`except Exception\` would also catch \`TypeError\`, \`KeyError\` or \`NameError\` caused by a *bug in your code* and quietly count it as a "skipped record" — the job reports success while doing the wrong thing. Errors you didn't anticipate (missing file, bugs) should propagate and fail loudly.

Put the \`try\` around the smallest piece that can fail for the expected reason, not around the whole function.`,
  },
  workedExample: {
    title: "Worked example: importing driver timesheets",
    body: `Timesheet lines look like \`D-104;2026-11-03;7.5\`. Some have a typo in the hours (\`7,5\`) or a missing field.

**Step 1 — make the parser strict and specific:**

\`\`\`python
def parse_timesheet(line):
    parts = line.strip().split(";")
    if len(parts) != 3:
        raise ValueError(f"expected 3 fields, got {len(parts)}")
    driver, day, hours = parts
    hours = float(hours)               # raises ValueError for "7,5"
    if not 0 <= hours <= 16:
        raise ValueError(f"hours out of range: {hours}")
    return driver, day, hours
\`\`\`

**Step 2 — handle only that failure, per line, and keep evidence:**

\`\`\`python
def import_timesheets(path):
    good, rejected = [], []
    with open(path) as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                good.append(parse_timesheet(line))
            except ValueError as exc:
                rejected.append((line_no, str(exc)))
    return good, rejected
\`\`\`

**Step 3 — notice what is *not* caught.** \`open()\` is outside the \`try\`, so a missing file raises \`FileNotFoundError\` and the caller knows the import never happened. A typo such as \`parse_timesheat\` raises \`NameError\`, which also propagates — instead of rejecting every line as "bad data".`,
  },
  workspace: {
    kind: "python",
    entry: "process_log.py",
    files: [
      { path: "process_log.py", content: starter, editable: true },
      { path: "scanner.log", content: scannerLog, editable: false },
      { path: "crash.txt", content: crashTxt, editable: false },
    ],
    tests: [
      {
        id: "parse-good-line",
        name: "parse_line returns a record for a valid line",
        code: String.raw`r = main.parse_line("2026-11-05T03:00:02Z|ATL-DOCK-3|LMN30090011|RECEIVED|12.5\n")
assert r["tracking_id"] == "LMN30090011", f"tracking_id should be 'LMN30090011', got {r.get('tracking_id')!r}"
assert r["status"] == "RECEIVED", f"status should be 'RECEIVED', got {r.get('status')!r}"
assert r["weight_kg"] == 12.5 and isinstance(r["weight_kg"], float), f"weight_kg should be the float 12.5, got {r.get('weight_kg')!r}"`,
        feedback: {
          what: "parse_line did not return the expected fields for a well-formed line.",
          why: "Valid records must keep flowing exactly as before; the fix should only change how bad records are handled.",
          next: "Keep the field names ts, scanner, tracking_id, status, weight_kg and convert the weight with float().",
        },
      },
      {
        id: "parse-rejects-bad",
        name: "parse_line raises ValueError for every kind of malformed record",
        code: String.raw`bad = {
    "truncated": "2026-11-05T03:02:40Z|ATL-DOCK-1|LMN3009",
    "bad weight": "2026-11-05T03:02:41Z|ATL-DOCK-1|LMN30090014|IN_TRANSIT|N/A",
    "unknown status": "2026-11-05T03:03:05Z|ATL-DOCK-2|LMN30090015|DELIVRD|4.4",
    "extra field": "2026-11-05T03:04:12Z|ATL-DOCK-3|LMN30090017|OUT_FOR_DELIVERY|22.0|extra",
}
for kind, line in bad.items():
    try:
        main.parse_line(line)
    except ValueError:
        continue
    except Exception as exc:
        raise AssertionError(f"{kind} line should raise ValueError, but raised {type(exc).__name__}: {exc}")
    raise AssertionError(f"{kind} line should raise ValueError, but parse_line returned normally: {line!r}")`,
        feedback: {
          what: "parse_line accepted a malformed record, or signalled it with something other than ValueError.",
          why: "One exception type for \"bad record\" lets the caller handle bad data without also catching bugs. An unknown status like DELIVRD would otherwise be counted as real data.",
          next: "Check len(fields) == 5 and status membership explicitly and raise ValueError with a message; float() already raises ValueError for N/A.",
        },
      },
      {
        id: "summary-counts",
        name: "summarize_log processes good lines, skips bad ones, ignores blanks",
        code: String.raw`r = main.summarize_log("scanner.log")
assert r["processed"] == 6, f"scanner.log has 6 valid records, processed = {r['processed']}"
assert r["skipped"] == 4, f"scanner.log has 4 malformed records, skipped = {r['skipped']} (blank lines should not count)"
want = {"RECEIVED": 2, "IN_TRANSIT": 1, "DELIVERED": 2, "EXCEPTION": 1}
assert r["by_status"] == want, f"by_status should be {want}, got {r['by_status']}"
with open("empty.log", "w") as f:
    f.write("\n\n")
r = main.summarize_log("empty.log")
assert (r["processed"], r["skipped"]) == (0, 0), f"a log with only blank lines should give processed=0, skipped=0, got {r['processed']}, {r['skipped']}"`,
        feedback: {
          what: "The processed/skipped counts or the status breakdown did not match scanner.log.",
          why: "Ops compares these numbers with the scanner fleet's own counters; blank lines are just padding and are not bad records.",
          next: "Skip lines where line.strip() is empty, wrap only the parse_line call in try/except ValueError, and count each outcome.",
        },
      },
      {
        id: "error-line-numbers",
        name: "errors lists 1-based line numbers with readable messages",
        code: String.raw`r = main.summarize_log("scanner.log")
errs = r["errors"]
nums = [e[0] for e in errs]
assert nums == [4, 5, 7, 9], f"bad records are on lines 4, 5, 7 and 9 of scanner.log, errors lists lines {nums}"
assert all(isinstance(e[1], str) and e[1] for e in errs), f"each error should carry a non-empty message, got {errs}"
assert "DELIVRD" in errs[2][1], f"the message for line 7 should mention the bad status 'DELIVRD', got {errs[2][1]!r}"`,
        feedback: {
          what: "The reported line numbers were off, or the messages were missing or unhelpful.",
          why: "The scanner team fixes records by opening the log at the reported line. Line 1 in an editor is the first line, so numbering must start at 1.",
          next: "Use enumerate(f, start=1) and store (line_no, str(exc)). Include the offending value in the ValueError message you raise.",
        },
      },
      {
        id: "missing-file-propagates",
        name: "A missing log file is an error, not an empty summary",
        hidden: true,
        code: String.raw`try:
    r = main.summarize_log("no_such_scanner.log")
except FileNotFoundError:
    pass
else:
    raise AssertionError(f"summarize_log on a missing file should raise FileNotFoundError, but returned {r!r}")`,
        feedback: {
          what: "summarize_log returned a summary for a file that does not exist.",
          why: "An empty summary looks like a quiet night. If the log is missing, the job must fail so someone investigates.",
          next: "Don't wrap open() in try/except. Only catch ValueError around parse_line.",
        },
      },
      {
        id: "bugs-propagate",
        name: "Unexpected errors (bugs) are not counted as bad records",
        hidden: true,
        code: String.raw`original = main.parse_line
def buggy(line):
    raise TypeError("simulated bug inside parse_line")
main.parse_line = buggy
try:
    try:
        r = main.summarize_log("scanner.log")
    except TypeError:
        pass
    else:
        raise AssertionError(f"a TypeError from a bug should propagate, but summarize_log returned {r!r} - is it catching every exception?")
finally:
    main.parse_line = original`,
        feedback: {
          what: "When parse_line failed with an unexpected TypeError, summarize_log treated it as a skipped record.",
          why: "Catching every exception turns code bugs into \"bad data\": the job reports success while skipping everything. That is how silent data loss happens.",
          next: "Catch ValueError specifically (except ValueError as exc:), not Exception or a bare except.",
        },
      },
    ],
    solution: { "process_log.py": solution },
    wrongSolutions: [
      { label: "Wraps the whole function in except Exception and returns an empty summary", files: { "process_log.py": swallowEverything } },
      { label: "Catches every exception per line", files: { "process_log.py": catchAllPerLine } },
      { label: "Numbers lines from 0", files: { "process_log.py": zeroBasedLines } },
      { label: "Catches errors but never validates the status", files: { "process_log.py": noStatusValidation } },
      { label: "Counts blank lines as bad records", files: { "process_log.py": blanksAsErrors } },
    ],
  },
  successCriteria: [
    "parse_line returns a record for valid lines and raises ValueError for wrong field counts, bad weights and unknown statuses",
    "summarize_log on scanner.log reports 6 processed, 4 skipped, the correct status counts, and errors on lines 4, 5, 7 and 9",
    "Blank lines are ignored rather than counted as errors",
    "A missing file and unexpected exceptions still propagate instead of being swallowed",
  ],
  hints: [
    "Start with `crash.txt`. Read the traceback from the bottom: what is the exception, and which function and line raised it? Then find a line in `scanner.log` with only 3 fields.",
    "Decide on one signal for \"this record is malformed\": `ValueError`. Some cases already raise it (unpacking, float). Which case silently passes today and needs an explicit `raise`?",
    "In `summarize_log`, put `try:` around just the `parse_line(line)` call, use `except ValueError as exc:`, and `continue` after recording the error. Leave `open()` outside any try.",
    "Use `for line_no, line in enumerate(f, start=1):`, skip `if not line.strip()`, and in the except block do `errors.append((line_no, str(exc)))`. `skipped` is `len(errors)`. In `parse_line`, split first, check `len(fields) != 5`, and check `status not in VALID_STATUSES`.",
  ],
  questions: [
    {
      id: "which-log-line",
      kind: "short",
      prompt: "Using `crash.txt` and `scanner.log`: on which line number of scanner.log was the first record that crashed the original job?",
      accept: ["4", "line 4"],
      acceptPatterns: ["^(line\\s*)?4$"],
      placeholder: "a line number",
      explanation:
        "The traceback says \"expected 5, got 3\" from the unpacking in parse_line. Lines 1–3 have 5 fields; line 4 (`...|ATL-DOCK-1|LMN3009`) has only 3, so the job died there and processed nothing after it.",
    },
    {
      id: "explain-broad-except",
      kind: "explain",
      prompt:
        "A teammate suggests fixing the crash with `try: ... except Exception: pass` around the loop body. Explain to Sam why that is risky and what you did instead.",
      concepts: [
        {
          label: "Broad except hides bugs or unexpected errors",
          anyOf: ["hide", "hides", "hidden", "mask", "swallow", "silent", "silently", "bug", "bugs", "unexpected", "typo"],
        },
        {
          label: "Catch the specific exception (ValueError)",
          anyOf: ["valueerror", "value error", "specific", "narrow", "only the expected", "particular exception"],
        },
        {
          label: "Report or record the skipped records",
          anyOf: ["line number", "record", "report", "log the", "logged", "errors list", "keep track", "count"],
        },
      ],
      minConcepts: 2,
      explanation:
        "A broad handler cannot tell bad data from broken code. Raising and catching a specific ValueError, and recording each skip, keeps bad records visible and lets real failures stop the job.",
      modelAnswer:
        "Catching Exception and passing would silently swallow every error, including bugs in our own code such as a TypeError or a typo, so the job would report success while skipping good data. Instead parse_line raises ValueError for malformed records, and summarize_log catches only that specific exception around the parse call, records each skipped record with its line number and message, and lets anything unexpected — like a missing file — fail loudly.",
    },
    {
      id: "predict-try-flow",
      kind: "mcq",
      prompt: "What does this print?",
      code: `def weight(raw):
    try:
        return float(raw)
    except ValueError:
        return -1

print(weight("2.5"), weight("N/A"))`,
      codeLanguage: "python",
      options: ["2.5 -1", "2.5 N/A", "-1 -1", "ValueError is raised"],
      answer: 0,
      explanation:
        "float(\"2.5\") succeeds and is returned. float(\"N/A\") raises ValueError, which the except block handles by returning -1.",
    },
  ],
  debrief: {
    solution: `Make bad data raise one specific exception, and handle only that:

\`\`\`python
def parse_line(line):
    fields = line.strip().split("|")
    if len(fields) != 5:
        raise ValueError(f"expected 5 fields, got {len(fields)}")
    ts, scanner, tracking_id, status, weight = fields
    if status not in VALID_STATUSES:
        raise ValueError(f"unknown status {status!r}")
    ...  # float(weight) raises ValueError for "N/A"

def summarize_log(path):
    ...
    with open(path) as f:                       # missing file -> propagates
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                rec = parse_line(line)
            except ValueError as exc:           # bad record -> recorded
                errors.append((line_no, str(exc)))
                continue
            ...
\`\`\`

The \`try\` is around one call, it names one exception type, and it leaves evidence. A missing file or a programming error still stops the job with a traceback, which is what Priya asked for.`,
    commonMistakes: [
      "Wrapping the whole function in try/except Exception, so a missing log file produces an empty \"all clear\" summary.",
      "Catching Exception per line, which converts code bugs (TypeError, KeyError) into \"skipped records\".",
      "Numbering lines from 0 with enumerate(f), so every reported line is one too early.",
      "Only catching errors and never validating the status, so garbage like DELIVRD is counted as real data.",
      "Counting blank lines as malformed records, inflating the skipped count.",
    ],
    realWorld:
      "Production ingestion pipelines usually route bad records to a \"dead-letter\" store with the reason and source position, while infrastructure failures (missing input, permissions, bugs) fail the job and alert. Many teams also set a threshold — if more than, say, 5% of records are rejected, fail anyway, because that suggests an upstream format change rather than a few noisy scanners.",
  },
  review: [
    {
      id: "py-specific-except",
      skill: "py.exceptions",
      variants: [
        {
          id: "py-specific-except-a",
          kind: "mcq",
          prompt: "A price feed sometimes sends `\"--\"` instead of a number. Which handler is the best fit around `price = float(raw)`?",
          options: ["except:", "except Exception:", "except ValueError:", "except (ValueError, TypeError, KeyError, NameError):"],
          answer: 2,
          explanation: "float(\"--\") raises ValueError. Catching only that keeps unrelated bugs visible.",
        },
        {
          id: "py-specific-except-b",
          kind: "mcq",
          prompt: "Code inside `try: ... except Exception: skipped += 1` has a typo: `parse_lien(line)`. What happens when it runs on 1,000 valid lines?",
          options: [
            "It crashes immediately with NameError",
            "It reports 1,000 skipped records and 0 processed, with no error",
            "Python fixes the typo automatically",
            "It processes all lines normally",
          ],
          answer: 1,
          explanation: "NameError is an Exception, so the broad handler swallows it on every line. The job looks like it ran; the data is silently lost.",
        },
        {
          id: "py-specific-except-c",
          kind: "mcq",
          prompt: "Where should `open(path)` go relative to a `try/except ValueError` that handles bad records?",
          options: [
            "Inside the try, so a missing file is counted as a bad record",
            "Outside the try, so a missing file raises FileNotFoundError to the caller",
            "Inside a bare except so nothing can fail",
            "It doesn't matter",
          ],
          answer: 1,
          explanation: "A missing file is not a bad record; it means the job couldn't run and should fail loudly.",
        },
      ],
    },
    {
      id: "py-raise-valueerror",
      skill: "py.exceptions",
      variants: [
        {
          id: "py-raise-valueerror-a",
          kind: "short",
          prompt: "What does this print?",
          code: `def check(status):
    if status not in {"OK", "LATE"}:
        raise ValueError(f"bad status {status}")
    return status

try:
    check("LTAE")
except ValueError as exc:
    print(exc)`,
          codeLanguage: "python",
          accept: ["bad status LTAE"],
          explanation: "check raises ValueError with that message; `print(exc)` prints the message text.",
        },
        {
          id: "py-raise-valueerror-b",
          kind: "short",
          prompt: "What does this print?",
          code: `def pieces(raw):
    n = int(raw)
    if n <= 0:
        raise ValueError("pieces must be positive")
    return n

results = []
for raw in ["3", "0", "x", "2"]:
    try:
        results.append(pieces(raw))
    except ValueError:
        results.append(None)
print(results)`,
          codeLanguage: "python",
          accept: ["[3, None, None, 2]"],
          acceptPatterns: ["^\\[\\s*3\\s*,\\s*None\\s*,\\s*None\\s*,\\s*2\\s*\\]$"],
          explanation: "\"0\" fails the explicit check and \"x\" fails int(); both raise ValueError and are recorded as None. The loop continues for the rest.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Marco's health-check script on `api-01` loads `thresholds.json` like this:\n\n```python\ntry:\n    with open(\"thresholds.json\") as f:\n        limits = json.load(f)\n    check_latency(limits[\"p99_ms\"])\nexcept Exception:\n    limits = {\"p99_ms\": 10_000}\n```\n\nAfter a deploy, the file was renamed, and `check_latency` also has a new bug that raises `TypeError`. The dashboard shows the check as green.",
    question: {
      id: "transfer-healthcheck-except",
      kind: "mcq",
      prompt: "What is the best change?",
      options: [
        "Change except Exception to a bare except:",
        "Keep the fallback, but add a print in the except block",
        "Let FileNotFoundError and the TypeError propagate (or catch only json.JSONDecodeError for a corrupt file), so the check fails visibly",
        "Increase the fallback threshold so the check stays green",
      ],
      answer: 2,
      explanation:
        "Both failures are real problems that the broad handler hid behind a permissive default. Catch only the specific, expected failure (if any), and let the rest fail the check.",
    },
  },
  refresher: {
    body: `When an operation fails, Python **raises** an exception. If nothing catches it, the program stops with a traceback. \`try: ... except ValueError: ...\` catches only \`ValueError\` — the type \`float("N/A")\` raises for bad text.

Catch the exception you expect, around the smallest piece of code that can raise it, and record what happened (for example the line number). Don't catch \`Exception\` "to be safe": that also hides bugs and missing files, and the program pretends everything worked.`,
    practice: {
      id: "refresher-which-except",
      kind: "mcq",
      prompt: "Which exception does `int(\"12kg\")` raise?",
      options: ["TypeError", "ValueError", "KeyError", "IndexError"],
      answer: 1,
      explanation: "The argument is the right type (str) but has an invalid value for an integer, so int() raises ValueError.",
    },
  },
};
