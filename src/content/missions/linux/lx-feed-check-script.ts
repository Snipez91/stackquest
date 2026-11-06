import type { MissionInput } from "@/content/schema";

const F = "```";

const header = "ts,depot,tracking_id,status";

const okFeed = `${header}
2026-03-02T05:10:00Z,BRS-1,LMN40220001,OK
2026-03-02T05:10:04Z,BRS-1,LMN40220002,OK
2026-03-02T05:11:30Z,BRS-1,LMN40220003,ERROR_RETRY
2026-03-02T05:12:02Z,BRS-1,LMN40220004,OK
`;

const brsFeed = `${header}
2026-03-02T05:20:00Z,BRS-2,LMN40220101,OK
2026-03-02T05:20:09Z,BRS-2,LMN40220102,ERROR
2026-03-02T05:20:31Z,BRS-2,LMN40220103,ERROR_RETRY
2026-03-02T05:21:00Z,BRS-2,LMN40220104,ERROR
2026-03-02T05:21:44Z,BRS-2,LMN40220105,OK
2026-03-02T05:22:10Z,BRS-2,LMN40220106,ERROR_RETRY
2026-03-02T05:22:58Z,BRS-2,LMN40220107,ERROR
`;

const depot7Feed = `${header}
2026-03-02T05:30:00Z,BRS-7,LMN40220201,OK
2026-03-02T05:30:12Z,BRS-7,LMN40220202,ERROR
2026-03-02T05:31:40Z,BRS-7,LMN40220203,OK
`;

const starter = `#!/bin/bash
# check-feeds.sh FILE... — count failed scan records in depot feed files.
# Used by the 06:00 pre-dispatch check:  check-feeds.sh /srv/feeds/*.csv || page-oncall
#
# Contract (see /srv/feeds/README):
#   - no arguments          -> usage message on stderr, exit 2
#   - for each FILE         -> print "FILE: N errors" (N = records whose status is exactly ERROR)
#   - unreadable/missing    -> message on stderr, keep checking the other files
#   - exit 0 only if every file was readable and had 0 errors, otherwise exit 1

for f in $*; do
  n=$(grep -c ERROR $f)
  echo "$f: $n errors"
  if [ $n > 0 ]; then
    status=1
  fi
done
exit 0
`;

const solution = `#!/bin/bash
# check-feeds.sh FILE... — count failed scan records in depot feed files.
# Used by the 06:00 pre-dispatch check:  check-feeds.sh /srv/feeds/*.csv || page-oncall
#
# Contract (see /srv/feeds/README):
#   - no arguments          -> usage message on stderr, exit 2
#   - for each FILE         -> print "FILE: N errors" (N = records whose status is exactly ERROR)
#   - unreadable/missing    -> message on stderr, keep checking the other files
#   - exit 0 only if every file was readable and had 0 errors, otherwise exit 1

if [ $# -eq 0 ]; then
  echo "usage: check-feeds.sh FILE..." >&2
  exit 2
fi

status=0
for f in "$@"; do
  if [ ! -r "$f" ]; then
    echo "check-feeds: cannot read $f" >&2
    status=1
    continue
  fi
  n=$(awk -F, '$4 == "ERROR"' "$f" | wc -l)
  echo "$f: $n errors"
  if [ "$n" -gt 0 ]; then
    status=1
  fi
done
exit $status
`;

const quotedButGrepAnywhere = solution.replace(`n=$(awk -F, '$4 == "ERROR"' "$f" | wc -l)`, `n=$(grep -c ERROR "$f")`);
const alwaysZero = solution.replace("exit $status", "exit 0");
const unquoted = solution.replace(`for f in "$@"; do`, "for f in $*; do");
const stopsAtMissing = solution.replace(`    status=1
    continue`, `    exit 1`);

const readme = `Depot feed files (one per depot, written by the scanner gateways at 05:00-05:45)

  ts,depot,tracking_id,status
  status is one of: OK, ERROR, ERROR_RETRY
    ERROR        the scan failed permanently and must be fixed before dispatch
    ERROR_RETRY  the gateway retries automatically; not an error for the pre-dispatch check

Some depots use spaces in their file names ("depot 7.csv"). Yes, really.
`;

const cmd = (args: string) => `bash ~/bin/check-feeds.sh ${args} 2>/dev/null; echo "rc=$?"`;

export const lxFeedCheckScript: MissionInput = {
  slug: "lx-feed-check-script",
  version: 1,
  track: "linux",
  tier: "advanced",
  order: 3,
  title: "The pre-dispatch check that always says everything is fine",
  summary:
    "A bash script that gates dispatch counts errors wrongly, breaks on file names with spaces, and always exits 0. Repair its argument handling, loop, tests and exit codes so automation can trust it.",
  minutes: 40,
  assessmentTypes: ["repair-code", "write-code", "explain-root-cause"],
  skills: ["lx.scripting"],
  appliesSkills: ["lx.text-processing", "lx.pipes", "lx.environment"],
  prerequisites: ["lx-eta-sync-env", "lx-top-error-sources"],
  brief: {
    from: "Dev Okafor, Network engineer",
    channel: "#ops",
    body: `This morning BRS-2 had three permanently failed scans and dispatch sent the vans out anyway. The 06:00 job runs \`check-feeds.sh /srv/feeds/*.csv || page-oncall\` on \`ops-ws\`, and nobody got paged.

I had a look at \`~/bin/check-feeds.sh\` (open in the editor) and I think it's wrong in several ways at once: it always exits 0, it counts \`ERROR_RETRY\` as an error, it chokes on \`depot 7.csv\`, and with no arguments it just does nothing.

Can you make it follow the contract in its header comment? Test it on the files in \`/srv/feeds\` — \`ok.csv\` is clean, \`brs-2.csv\` has 3 real errors, \`depot 7.csv\` has 1.`,
  },
  objectives: [
    "Handle script arguments with $#, $1 and \"$@\", and validate them before doing work",
    "Loop over arguments safely, quoting variables so names with spaces stay intact",
    "Write correct tests with [ ] (-eq/-gt for numbers, -r for files) and branch with if",
    "Report results through exit codes and stderr so other programs (||, cron, CI) can act on them",
  ],
  concept: {
    title: "A script is a program: inputs, decisions, and an exit code",
    body: `Scripts get their **arguments** as \`$1\`, \`$2\`, …; \`$#\` is how many there are; \`"$@"\` expands to all of them **as separate words, exactly as given**. Unquoted \`$*\` or \`$f\` are split on spaces, so \`depot 7.csv\` becomes two names, \`depot\` and \`7.csv\`. Rule of thumb: **quote every expansion** (\`"$f"\`, \`"$@"\`).

${F}bash
if [ $# -eq 0 ]; then                 # validate input first
  echo "usage: $0 FILE..." >&2        # errors go to stderr
  exit 2                              # 2 = usage error, by convention
fi
for f in "$@"; do
  [ -r "$f" ] || { echo "cannot read $f" >&2; status=1; continue; }
  ...
done
exit $status
${F}

Tests are commands too. \`[ "$n" -gt 0 ]\` compares numbers (\`-eq -ne -lt -le -gt -ge\`); \`=\` compares strings. Inside \`[ ]\`, \`>\` is **not** "greater than": it's a redirect, so \`[ $n > 0 ]\` creates a file called \`0\` and is always true.

Every command returns an **exit status**: 0 = success, anything else = failure. \`&&\`, \`||\`, \`if\`, cron alerting and CI all look only at that number. A checker that prints problems but exits 0 tells automation "all good". Keep output for humans on stdout, diagnostics on stderr, and the verdict in the exit code.`,
  },
  workedExample: {
    title: "Worked example: a disk-space guard for the backup job",
    body: `Requirement: \`space-ok.sh DIR...\` prints each directory's usage, warns about missing ones, and exits 1 if any is over 80%, so \`space-ok.sh /srv /var && run-backup\` only backs up when there is room.

${F}bash
#!/bin/bash
if [ $# -lt 1 ]; then
  echo "usage: space-ok.sh DIR..." >&2
  exit 2
fi
rc=0
for d in "$@"; do                      # "$@": each argument intact
  if [ ! -d "$d" ]; then
    echo "space-ok: no such directory: $d" >&2
    rc=1
    continue                           # keep checking the others
  fi
  used=$(df-percent "$d")              # e.g. prints 83
  echo "$d: $used%"
  if [ "$used" -gt 80 ]; then          # numeric test, quoted
    rc=1
  fi
done
exit $rc                               # the verdict
${F}

**Test it like a caller would**, including the edge cases:

${F}bash
bash space-ok.sh; echo "rc=$?"                       # rc=2
bash space-ok.sh /srv; echo "rc=$?"                  # rc=0 or 1
bash space-ok.sh "/srv/my dir" /nope; echo "rc=$?"   # spaces + missing
${F}

(\`df-percent\` stands in for \`df --output=pcent\`, which this lab doesn't simulate.)`,
  },
  simulationNote:
    "bash is simulated with arguments, quoting and word splitting, if/for/while/case, [ ] and [[ ]] tests, $(...), functions and exit codes. The checks run your saved script on the feed files in a fresh shell and compare its output and exit status, so any correct implementation passes (awk, grep -c with an anchored pattern, or a while-read loop). set -e/-u/-o pipefail are accepted but ignored here, so don't rely on them.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T09:00:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [{ name: "ops", uid: 1000, groups: [], home: "/home/ops" }],
          files: [
            { path: "/home/ops/bin", type: "dir", owner: "ops", group: "ops" },
            { path: "/home/ops/bin/check-feeds.sh", content: starter, mode: "0755", owner: "ops", group: "ops" },
            { path: "/srv/feeds", type: "dir", mode: "0755" },
            { path: "/srv/feeds/README", content: readme },
            { path: "/srv/feeds/ok.csv", content: okFeed },
            { path: "/srv/feeds/brs-2.csv", content: brsFeed },
            { path: "/srv/feeds/depot 7.csv", content: depot7Feed },
          ],
        },
      ],
      start: { host: "ops-ws", user: "ops", cwd: "/home/ops" },
      editableFiles: ["/home/ops/bin/check-feeds.sh"],
    },
    checks: [
      {
        id: "usage-exit-2",
        name: "No arguments: usage on stderr, exit 2",
        assert: {
          type: "all",
          of: [
            { type: "command_output", run: 'bash ~/bin/check-feeds.sh 2>/dev/null; echo "rc=$?"', pattern: "^rc=2$" },
            { type: "command_output", run: "bash ~/bin/check-feeds.sh 2>&1 >/dev/null", pattern: "\\S" },
          ],
        },
        feedback: {
          what: "Run with no arguments, the script does not exit with status 2, or prints no message on stderr.",
          why: "If the 06:00 glob ever matches nothing, a silent exit 0 looks like 'all feeds clean'. A usage error must be loud and distinguishable from 'errors found' (1).",
          next: "At the top: if [ $# -eq 0 ]; then echo \"usage: check-feeds.sh FILE...\" >&2; exit 2; fi",
        },
      },
      {
        id: "clean-feed-passes",
        name: "A clean feed reports 0 errors and exits 0 (ERROR_RETRY is not an error)",
        assert: { type: "command_output", run: cmd("/srv/feeds/ok.csv"), pattern: "^/srv/feeds/ok\\.csv: 0 errors\\nrc=0$" },
        feedback: {
          what: "check-feeds.sh /srv/feeds/ok.csv does not print exactly '/srv/feeds/ok.csv: 0 errors' and exit 0.",
          why: "ok.csv has one ERROR_RETRY record, which the gateway retries by itself. Counting it as an error would page on-call every morning, and people stop trusting the check.",
          next: "Match the status field exactly, not the substring ERROR anywhere: awk -F, '$4 == \"ERROR\"' \"$f\" | wc -l, or grep -c ',ERROR$' \"$f\".",
        },
      },
      {
        id: "errors-fail",
        name: "A feed with errors reports the right count and exits 1",
        assert: { type: "command_output", run: cmd("/srv/feeds/brs-2.csv"), pattern: "^/srv/feeds/brs-2\\.csv: 3 errors\\nrc=1$" },
        feedback: {
          what: "check-feeds.sh /srv/feeds/brs-2.csv does not print '/srv/feeds/brs-2.csv: 3 errors' and exit 1.",
          why: "This is exactly this morning's case: the exit code is the only thing '|| page-oncall' looks at. Exit 0 here means vans leave with unfixed scans.",
          next: "Initialise status=0, set status=1 when [ \"$n\" -gt 0 ] (numeric test; > inside [ ] is a redirect), and end with exit $status.",
        },
      },
      {
        id: "spaces-and-missing",
        name: "Names with spaces work and a missing file doesn't stop the others",
        assert: {
          type: "command_output",
          run: cmd('/srv/feeds/missing.csv "/srv/feeds/depot 7.csv" /srv/feeds/ok.csv'),
          pattern: "^/srv/feeds/depot 7\\.csv: 1 errors\\n/srv/feeds/ok\\.csv: 0 errors\\nrc=1$",
        },
        feedback: {
          what: "With a missing file, 'depot 7.csv' and ok.csv, the script did not report 'depot 7.csv: 1 errors' and 'ok.csv: 0 errors' on stdout and exit 1.",
          why: "Unquoted $* splits 'depot 7.csv' into two bogus names, and exiting at the first missing file hides the state of every feed after it.",
          next: "Loop with for f in \"$@\"; quote \"$f\" everywhere; for unreadable files ([ ! -r \"$f\" ]) print to stderr, set status=1 and continue.",
        },
      },
    ],
    solution: [
      "cat /srv/feeds/README",
      "bash ~/bin/check-feeds.sh /srv/feeds/*.csv; echo \"rc=$?\"",
      { write: "/home/ops/bin/check-feeds.sh", content: solution },
      "bash ~/bin/check-feeds.sh; echo \"rc=$?\"",
      "bash ~/bin/check-feeds.sh /srv/feeds/*.csv; echo \"rc=$?\"",
      "bash ~/bin/check-feeds.sh /srv/feeds/ok.csv; echo \"rc=$?\"",
    ],
    wrongSolutions: [
      { label: "Quotes everything but still counts ERROR_RETRY with grep -c ERROR", steps: [{ write: "/home/ops/bin/check-feeds.sh", content: quotedButGrepAnywhere }] },
      { label: "Correct output but always exits 0", steps: [{ write: "/home/ops/bin/check-feeds.sh", content: alwaysZero }] },
      { label: "Loops over unquoted $*, splitting 'depot 7.csv'", steps: [{ write: "/home/ops/bin/check-feeds.sh", content: unquoted }] },
      { label: "Exits at the first missing file", steps: [{ write: "/home/ops/bin/check-feeds.sh", content: stopsAtMissing }] },
    ],
    starterCommands: ["cat /srv/feeds/README", "ls -l /srv/feeds", "bash ~/bin/check-feeds.sh /srv/feeds/*.csv; echo \"rc=$?\""],
  },
  successCriteria: [
    "With no arguments the script prints a usage message on stderr and exits 2",
    "ok.csv reports 0 errors and exits 0; ERROR_RETRY is not counted",
    "brs-2.csv reports 3 errors and exits 1",
    "File names with spaces work, and a missing file is reported on stderr without stopping the other files",
  ],
  hints: [
    "Run the current script exactly as cron does and look at both the output and `echo \"rc=$?\"`. Then try it with no arguments and with `\"/srv/feeds/depot 7.csv\"`. Note every way it violates the header contract.",
    "Three of the bugs are about the shell, one is about the data. Shell: `$*` unquoted, `[ $n > 0 ]`, `exit 0`. Data: what does `grep -c ERROR` match in `ok.csv`? (`cat /srv/feeds/README`.)",
    "Structure: argument check with `$#` first; `status=0`; `for f in \"$@\"`; inside, `[ ! -r \"$f\" ]` → message to `>&2`, `status=1`, `continue`; count; print; `[ \"$n\" -gt 0 ] && status=1`; after the loop `exit $status`.",
    "For the count, compare the 4th comma-separated field exactly: `n=$(awk -F, '$4 == \"ERROR\"' \"$f\" | wc -l)`. Save, then test all four cases from the checks with `; echo \"rc=$?\"` after each.",
  ],
  questions: [
    {
      id: "predict-gt-redirect",
      kind: "mcq",
      prompt: "In the original script, `n` is `0` for ok.csv. What does `if [ $n > 0 ]; then status=1; fi` do?",
      options: [
        "Nothing: 0 is not greater than 0",
        "Sets status=1 and creates a file named 0, because > is a redirect inside [ ]",
        "Syntax error",
        "Compares the strings '0' and '0'",
      ],
      answer: 1,
      explanation:
        "[ $n > 0 ] is the command [ 0 ] with stdout redirected to a file called 0. [ 0 ] tests a non-empty string, which is true. Use -gt for numbers.",
    },
    {
      id: "predict-word-splitting",
      kind: "mcq",
      prompt: "The script is called as `check-feeds.sh \"/srv/feeds/depot 7.csv\"`. How many times does `for f in $*; do ... done` run its body?",
      options: ["Once", "Twice", "Zero times", "Seven times"],
      answer: 1,
      explanation: "Unquoted $* is split on whitespace: '/srv/feeds/depot' and '7.csv'. \"$@\" keeps each argument as one word.",
    },
    {
      id: "explain-exit-codes",
      kind: "explain",
      prompt: "Explain to Sam why the script's output looked right in Dev's terminal but dispatch was still sent out, and what the exit code now means.",
      concepts: [
        { label: "Automation (|| page-oncall, cron) only looks at the exit status", anyOf: ["exit code", "exit status", "return code", "$?", "|| page", "page-oncall", "cron only", "only looks at"] },
        { label: "It always exited 0 (success)", anyOf: ["always exited 0", "exit 0", "always 0", "always succeeded", "reported success", "zero"] },
        { label: "New meaning: 0 clean, 1 errors or unreadable, 2 usage", anyOf: ["0 means", "1 means", "2 means", "usage", "exits 1", "exit 1", "non-zero", "nonzero"] },
      ],
      minConcepts: 2,
      explanation: "People read the output; machines read the exit status. The checker must put its verdict in the exit code.",
      modelAnswer:
        "The 06:00 job runs check-feeds.sh || page-oncall, and that only looks at the exit status, not the text. The old script printed counts but always ended with exit 0, which means success, so the pager never fired even when BRS-2 had errors. Now it exits 0 only when every feed is readable and has no ERROR records, exits 1 when there are errors or unreadable files, and exits 2 with a usage message when called without arguments.",
    },
  ],
  debrief: {
    solution: `${F}bash
if [ $# -eq 0 ]; then echo "usage: check-feeds.sh FILE..." >&2; exit 2; fi
status=0
for f in "$@"; do
  if [ ! -r "$f" ]; then echo "check-feeds: cannot read $f" >&2; status=1; continue; fi
  n=$(awk -F, '$4 == "ERROR"' "$f" | wc -l)
  echo "$f: $n errors"
  if [ "$n" -gt 0 ]; then status=1; fi
done
exit $status
${F}

Four independent bugs, each with its own fix: \`$*\` → \`"$@"\` (word splitting), \`grep -c ERROR\` → exact field match (ERROR_RETRY), \`[ $n > 0 ]\` → \`[ "$n" -gt 0 ]\` (redirect, not comparison), and \`exit 0\` → \`exit $status\`. \`grep -c ',ERROR$' "$f"\` or a \`while IFS=, read -r ts depot id st\` loop are equally valid counts.`,
    commonMistakes: [
      "Using > or < inside [ ] for numbers; they are redirections. Use -gt/-lt, or (( n > 0 )).",
      "Leaving variables unquoted, so file names with spaces are split into several arguments.",
      "Printing the right report but still ending with exit 0, so callers never see the failure.",
      "Counting ERROR anywhere in the line, which also matches ERROR_RETRY.",
      "Exiting on the first missing file instead of reporting it and checking the rest.",
      "Sending error messages to stdout, where they mix with the report that other tools parse.",
    ],
    realWorld:
      "Run shellcheck on every script: it flags unquoted expansions, [ $a > $b ] and many more of these bugs automatically. In production scripts, set -euo pipefail makes unhandled failures stop the script (understand its edge cases first), and a trap can clean up temp files. Exit codes are the contract between tools: systemd, cron wrappers, CI pipelines and monitoring checks (Nagios-style 0/1/2) all decide what to do from that one number.",
  },
  review: [
    {
      id: "lx-quote-args",
      skill: "lx.scripting",
      variants: [
        {
          id: "lx-quote-args-a",
          kind: "mcq",
          prompt: "Which loop processes each script argument exactly as passed, including `\"depot 7.csv\"`?",
          options: ["for f in $*; do", "for f in $@; do", "for f in \"$@\"; do", "for f in \"$*\"; do"],
          answer: 2,
          explanation: "\"$@\" expands to one word per argument. \"$*\" joins them all into a single word; unquoted forms split on spaces.",
        },
        {
          id: "lx-quote-args-b",
          kind: "short",
          prompt: "A script is run as `report.sh a \"b c\" d`. What does `echo $#` print inside it?",
          accept: ["3"],
          explanation: "The quotes make \"b c\" one argument, so there are three.",
        },
        {
          id: "lx-quote-args-c",
          kind: "mcq",
          prompt: "`f=\"/srv/feeds/depot 7.csv\"`. Which command counts its lines correctly?",
          options: ["wc -l $f", "wc -l \"$f\"", "wc -l '$f'", "wc -l {$f}"],
          answer: 1,
          explanation: "Double quotes keep the value as one word while still expanding $f. Single quotes would pass the literal text $f.",
        },
      ],
    },
    {
      id: "lx-exit-and-tests",
      skill: "lx.scripting",
      variants: [
        {
          id: "lx-exit-and-tests-a",
          kind: "short",
          prompt: "What does this print?",
          code: "check() { [ \"$1\" -gt 5 ]; }\ncheck 9 && echo big || echo small\ncheck 3 && echo big || echo small",
          codeLanguage: "bash",
          accept: ["big small", "big\nsmall"],
          acceptPatterns: ["^big\\s+small$"],
          explanation: "A function's exit status is that of its last command. [ 9 -gt 5 ] succeeds (0), [ 3 -gt 5 ] fails (1).",
        },
        {
          id: "lx-exit-and-tests-b",
          kind: "mcq",
          prompt: "Which test is true when the variable n holds a number greater than zero?",
          options: ["[ $n > 0 ]", "[ \"$n\" -gt 0 ]", "[ \"$n\" = 0 ]", "[ -n 0 ]"],
          answer: 1,
          explanation: "-gt is the numeric comparison. > inside [ ] redirects output to a file named 0.",
        },
        {
          id: "lx-exit-and-tests-c",
          kind: "mcq",
          prompt: "A health script prints `FAIL: db-01 unreachable` and then runs `exit 0`. What does `health.sh && deploy.sh` do?",
          options: ["Skips the deploy because FAIL was printed", "Runs deploy.sh, because exit status 0 means success", "Errors out", "Asks for confirmation"],
          answer: 1,
          explanation: "&& looks only at the exit status. The message is for humans; the verdict must be a non-zero exit.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Aiko wants a wrapper `deploy-dash.sh VERSION` for the dispatch dashboard. It must refuse to run without exactly one argument, refuse if `/srv/releases/dash-VERSION` doesn't exist, and otherwise switch the `current` symlink. CI runs `deploy-dash.sh \"$TAG\" && notify-team`.",
    question: {
      id: "transfer-deploy-wrapper",
      kind: "mcq",
      prompt: "Which beginning handles the inputs correctly?",
      options: [
        "if [ $1 ]; then ln -sfn /srv/releases/dash-$1 /srv/releases/current; fi",
        "if [ $# -ne 1 ]; then echo \"usage: deploy-dash.sh VERSION\" >&2; exit 2; fi\nif [ ! -d \"/srv/releases/dash-$1\" ]; then echo \"no such release: $1\" >&2; exit 1; fi",
        "for v in $*; do ln -sfn /srv/releases/dash-$v /srv/releases/current; done; exit 0",
        "echo \"deploying $1\"; exit 0",
      ],
      answer: 1,
      explanation:
        "Validate the argument count, check the target exists (quoted), report problems on stderr and fail with a non-zero status so && notify-team doesn't announce a deploy that didn't happen.",
    },
  },
  refresher: {
    body: `Inside a script, \`$1\`, \`$2\` … are the arguments, \`$#\` is how many, and \`"$@"\` is all of them, each kept whole. Always quote expansions: \`"$f"\`.

\`[ ... ]\` is a test command: \`-eq -gt -lt\` for numbers, \`=\` for strings, \`-r FILE\` for "readable". Never use \`>\` inside \`[ ]\` — it's a redirect.

Every command ends with an exit status: 0 = success, non-zero = failure. \`&&\`, \`||\`, \`if\` and cron only see that number, so finish with \`exit $status\`, and send error messages to stderr with \`>&2\`.`,
    practice: {
      id: "refresher-dollar-question",
      kind: "mcq",
      prompt: "You run `grep -q ERROR feed.csv` and then `echo $?`. It prints `1`. What does that mean?",
      options: ["One match was found", "No match was found", "grep crashed", "The file has one line"],
      answer: 1,
      explanation: "grep exits 0 when it finds a match and 1 when it finds none; $? holds the last command's exit status.",
    },
  },
};
