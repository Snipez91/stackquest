import type { MissionInput } from "@/content/schema";

const F = "```";

/**
 * Build a deterministic nginx access log (combined format). Per-client request
 * lists are interleaved round-robin so that duplicates are never adjacent —
 * `uniq` without `sort` gives the wrong answer, as it would on a real log.
 *
 * 5xx per client: 10.20.4.17 = 11, 10.20.8.33 = 7, 10.20.2.50 = 5,
 * 10.20.3.90 = 2 (plus 6 successful responses whose *size* is 503 bytes),
 * 10.20.9.4 = 1, 10.20.6.12 = 0 (but 13 x 404).
 */
type Req = [method: string, path: string, status: number, bytes: number, agent: string];

const rep = (n: number, r: Req): Req[] => Array.from({ length: n }, () => r);
const scanner = "lumen-scanner/3.1";
const browser = "Mozilla/5.0 (X11; Linux x86_64) Firefox/123.0";

const clients: [string, Req[]][] = [
  [
    "10.20.4.17",
    [
      ...rep(3, ["POST", "/api/v2/scans", 502, 157, scanner]),
      ["POST", "/api/v2/scans", 201, 88, scanner],
      ...rep(3, ["POST", "/api/v2/scans", 503, 190, scanner]),
      ["GET", "/api/v2/health", 200, 17, scanner],
      ...rep(5, ["POST", "/api/v2/scans", 502, 157, scanner]),
      ["POST", "/api/v2/scans", 201, 88, scanner],
      ["GET", "/api/v2/health", 200, 17, scanner],
    ],
  ],
  [
    "10.20.8.33",
    [
      ["GET", "/api/v2/manifests/export?depot=BRS-1", 200, 18211, browser],
      ...rep(3, ["GET", "/api/v2/manifests/export?depot=BRS-2", 500, 312, browser]),
      ["GET", "/dispatch/", 200, 4120, browser],
      ...rep(2, ["GET", "/api/v2/manifests/export?depot=BRS-3", 504, 167, browser]),
      ...rep(2, ["GET", "/api/v2/manifests/export?depot=BRS-2", 500, 312, browser]),
      ["GET", "/dispatch/app.js", 200, 88410, browser],
    ],
  ],
  [
    "10.20.2.50",
    [
      ...rep(2, ["POST", "/api/v2/scans", 502, 157, scanner]),
      ["POST", "/api/v2/scans", 201, 88, scanner],
      ...rep(3, ["POST", "/api/v2/scans", 502, 157, scanner]),
      ["GET", "/api/v2/health", 200, 17, scanner],
    ],
  ],
  [
    "10.20.6.12",
    [
      ["GET", "/dispatch/", 200, 4120, browser],
      ...rep(7, ["GET", "/dispatch/img/depot-map-old.png", 404, 153, browser]),
      ...rep(6, ["GET", "/dispatch/fonts/lumen.woff", 404, 153, browser]),
    ],
  ],
  [
    "10.20.3.90",
    [
      ...rep(3, ["GET", "/api/v2/depots/BRS-1/summary", 200, 503, browser]),
      ...rep(2, ["GET", "/api/v2/routes/today", 500, 312, browser]),
      ...rep(3, ["GET", "/api/v2/depots/BRS-2/summary", 200, 503, browser]),
    ],
  ],
  [
    "10.20.9.4",
    [
      ["GET", "/dispatch", 301, 178, browser],
      ["GET", "/dispatch/", 200, 4120, browser],
      ["GET", "/api/v2/routes/today", 503, 190, browser],
      ["GET", "/old-tracker", 301, 178, browser],
      ["GET", "/dispatch/app.js", 200, 88410, browser],
      ["GET", "/api/v2/health", 200, 17, browser],
    ],
  ],
];

function buildLog(): string {
  const queues = clients.map(([ip, reqs]) => ({ ip, reqs: [...reqs] }));
  const lines: string[] = [];
  let t = 8 * 3600 + 1 * 60 + 4; // 08:01:04
  while (queues.some((q) => q.reqs.length)) {
    for (const q of queues) {
      const r = q.reqs.shift();
      if (!r) continue;
      const [method, path, status, bytes, agent] = r;
      const hh = String(Math.floor(t / 3600)).padStart(2, "0");
      const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      lines.push(`${q.ip} - - [02/Mar/2026:${hh}:${mm}:${ss} +0000] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${agent}"`);
      t += 7;
    }
  }
  return lines.join("\n") + "\n";
}

const accessLog = buildLog();

/** One report line: "COUNT IP" (uniq -c style) or "IP COUNT". */
const row = (ip: string, n: number) => {
  const e = ip.replace(/\./g, "\\.");
  return `[ \\t]*(?:${n}[ \\t]+${e}|${e}[ \\t:,]+${n})[ \\t]*`;
};

export const lxTopErrorSources: MissionInput = {
  slug: "lx-top-error-sources",
  version: 1,
  track: "linux",
  tier: "beginner",
  order: 3,
  title: "Which clients are getting the 5xx errors?",
  summary:
    "Build a grep/awk/sort/uniq pipeline over an nginx access log to rank clients by server errors, matching the status field instead of any number that happens to look like one.",
  minutes: 25,
  assessmentTypes: ["interpret-output", "investigate-logs"],
  skills: ["lx.pipes", "lx.text-processing"],
  appliesSkills: ["lx.navigation", "lx.file-ops"],
  prerequisites: ["lx-stage-release-dir"],
  brief: {
    from: "Aiko Tanaka, Frontend engineer",
    channel: "#dispatch-dashboard",
    body: `Since about 08:00 the dispatch dashboard on \`web-01\` has been flaky, and the Bristol depot says their handheld scanners keep showing "server error". Before I start blaming the API: which clients are actually receiving **5xx** responses?

The nginx log is \`/var/log/nginx/access.log\` (you're in \`adm\`, so you can read it).

Can you write the **top 3 clients by number of 5xx responses** to \`~/reports/5xx-by-client.txt\` — one client per line, highest first, with the count (the \`uniq -c\` format is fine)? I'll paste it into the incident ticket.

Careful: some of our JSON responses are exactly 500-something bytes, so "grep for 50" will lie to you.`,
  },
  objectives: [
    "Explain how a pipeline passes one command's stdout to the next command's stdin",
    "Select a specific whitespace-separated field with awk (and cut) instead of matching anywhere in the line",
    "Count and rank values with sort | uniq -c | sort -rn | head",
    "Redirect a pipeline's output to a file with >",
  ],
  concept: {
    title: "Small tools, one stream: filter, select, count, rank",
    body: `A pipe \`A | B\` connects A's **standard output** to B's **standard input**. Each tool does one job on a stream of lines, so you build an answer stage by stage and look at the output after each stage:

${F}bash
awk '$9 ~ /^5/' access.log      # 1. filter: rows whose 9th field starts with 5
  | awk '{print $1}'             # 2. select: just the client IP
  | sort                         # 3. group: identical lines become adjacent
  | uniq -c                      # 4. count each run of identical lines
  | sort -rn                     # 5. rank: numeric, highest first
  | head -n 3                    # 6. keep the top 3
${F}

(Written on one line in practice.) Three details decide whether the answer is right:

- **Match the field, not the line.** In nginx's format, \`$9\` is the status and \`$10\` is the response size. \`grep ' 50'\` also matches a 503-byte \`200\` response. awk splits each line on whitespace into \`$1, $2, …\`; \`cut -d' ' -f9\` does the same for a single-space separator.
- **\`uniq\` only collapses adjacent duplicates**, so always \`sort\` first.
- **\`sort -n\`** compares numbers; plain \`sort\` compares text ("9" > "11").

\`> file\` sends stdout to a file (replacing it); \`>> file\` appends; \`2> file\` captures errors.`,
  },
  workedExample: {
    title: "Worked example: which depots send the most rejected scans?",
    body: `The scan-ingest log on \`api-01\` has lines like:

${F}text
2026-03-01T22:14:09Z BRS-2 LMN40190001 ACCEPTED 120ms
2026-03-01T22:14:11Z LDS-1 LMN40190002 REJECTED 98ms
${F}

Fields: \`$1\` time, \`$2\` depot, \`$3\` tracking id, \`$4\` result, \`$5\` latency.

**1. Filter on the right field and look at the result.**

${F}bash
awk '$4 == "REJECTED"' /var/log/scan-ingest.log | head -n 3
${F}

**2. Keep only the depot, then group and count.**

${F}bash
awk '$4 == "REJECTED" {print $2}' /var/log/scan-ingest.log | sort | uniq -c
#   4 BRS-2
#  12 LDS-1
#   1 MAN-3
${F}

**3. Rank and save.**

${F}bash
mkdir -p ~/reports
awk '$4 == "REJECTED" {print $2}' /var/log/scan-ingest.log | sort | uniq -c | sort -rn | head -n 3 > ~/reports/rejects.txt
cat ~/reports/rejects.txt
${F}

\`grep REJECTED | cut -d' ' -f2\` works too. \`grep -c REJECTED\` alone would give only a total, not per-depot counts.`,
  },
  simulationNote:
    "The log and the text tools (grep, awk, cut, sort, uniq, head, wc) are simulated and behave like GNU versions for the options shown in help/man. awk supports fields, patterns, comparisons, arrays, NR/NF and printf. Real logs are much larger, but the pipeline is exactly what you would run on a production host.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T08:20:00Z",
      hosts: [
        {
          name: "web-01",
          users: [
            { name: "ops", uid: 1000, groups: ["adm"], home: "/home/ops" },
            { name: "www-data", uid: 33, groups: [], home: "/var/www", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/var/log/nginx", type: "dir", mode: "0755", owner: "root", group: "adm" },
            { path: "/var/log/nginx/access.log", content: accessLog, mode: "0640", owner: "www-data", group: "adm" },
            { path: "/var/log/nginx/error.log", content: "2026/03/02 08:01:04 [error] 812#812: *1 upstream prematurely closed connection while reading response header from upstream, client: 10.20.4.17, upstream: \"http://10.20.1.20:8081/api/v2/scans\"\n", mode: "0640", owner: "www-data", group: "adm" },
            { path: "/home/ops/README-logs.txt", content: "nginx combined format:\n$remote_addr - $remote_user [$time_local] \"$request\" $status $body_bytes_sent \"$http_referer\" \"$http_user_agent\"\n", owner: "ops", group: "ops" },
          ],
        },
      ],
      start: { host: "web-01", user: "ops" },
    },
    checks: [
      {
        id: "top3-in-order",
        name: "The report lists the top 3 clients by 5xx count, highest first",
        assert: {
          type: "file_matches",
          path: "/home/ops/reports/5xx-by-client.txt",
          pattern: `^\\s*${row("10.20.4.17", 11)}\\n${row("10.20.8.33", 7)}\\n${row("10.20.2.50", 5)}(\\n|$)`,
          flags: "",
        },
        feedback: {
          what: "~/reports/5xx-by-client.txt does not start with the three clients with the most 5xx responses, each with its count, highest first (or the file does not exist).",
          why: "The incident ticket decides where to look next. Ranking a client too high because its response *size* is 503 bytes, or because it has many 404s, sends the team after the wrong system.",
          next: "Filter on the status field only: awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 3. Check each stage's output, then redirect the final one with > ~/reports/5xx-by-client.txt (mkdir -p ~/reports first).",
        },
      },
      {
        id: "only-5xx-clients",
        name: "Clients with only 4xx errors are not in the report",
        assert: { type: "file_not_matches", path: "/home/ops/reports/5xx-by-client.txt", pattern: "10\\.20\\.6\\.12\\b" },
        feedback: {
          what: "The report includes 10.20.6.12, which received only 404s and no 5xx responses.",
          why: "4xx means the client asked for something wrong (here, stale image and font URLs); 5xx means the server failed. Mixing them hides the real server problem.",
          next: "Make the filter match only statuses 500–599 in field 9, for example awk '$9 >= 500 && $9 <= 599' or awk '$9 ~ /^5[0-9][0-9]$/'.",
        },
      },
    ],
    solution: [
      "head -n 3 /var/log/nginx/access.log",
      "awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c",
      "awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn",
      "mkdir -p ~/reports",
      "awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 3 > ~/reports/5xx-by-client.txt",
      "cat ~/reports/5xx-by-client.txt",
    ],
    wrongSolutions: [
      {
        label: "Greps for ' 50' anywhere in the line, counting 503-byte responses as errors",
        steps: [
          "mkdir -p ~/reports",
          "grep ' 50[0-9] ' /var/log/nginx/access.log | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -n 3 > ~/reports/5xx-by-client.txt",
        ],
      },
      {
        label: "Counts every non-200 response as an error",
        steps: [
          "mkdir -p ~/reports",
          "awk '$9 != 200 {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 3 > ~/reports/5xx-by-client.txt",
        ],
      },
      {
        label: "Uses uniq -c without sorting first",
        steps: [
          "mkdir -p ~/reports",
          "awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | uniq -c | sort -rn | head -n 3 > ~/reports/5xx-by-client.txt",
        ],
      },
      {
        label: "Sorts by IP instead of by count",
        steps: [
          "mkdir -p ~/reports",
          "awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -k2 | head -n 3 > ~/reports/5xx-by-client.txt",
        ],
      },
    ],
    starterCommands: ["head -n 5 /var/log/nginx/access.log", "cat ~/README-logs.txt", "wc -l /var/log/nginx/access.log"],
  },
  successCriteria: [
    "~/reports/5xx-by-client.txt starts with the three clients that received the most 5xx responses, each with its count, highest first",
    "Clients that only received 4xx responses do not appear",
  ],
  hints: [
    "Look at a few raw lines (`head -n 3`) next to `~/README-logs.txt`. Count the whitespace-separated fields: which number is the status, and which is the size?",
    "`awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c` shows every status code and how often it occurs. That confirms you have the right field.",
    "Now filter on that field and print the client: `awk '$9 ~ /^5/ {print $1}'`. What do you need before `uniq -c` so identical IPs are counted together, and what turns the counts into a ranking?",
    "The full pipeline is `awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 3`. Run it, check it, then add `> ~/reports/5xx-by-client.txt` (after `mkdir -p ~/reports`).",
  ],
  questions: [
    {
      id: "top-5xx-path",
      kind: "short",
      prompt: "Use the log to find which request path (field 7, without the query string) produced the most 5xx responses.",
      accept: ["/api/v2/scans", "POST /api/v2/scans"],
      acceptPatterns: ["^(post\\s+)?/api/v2/scans/?$"],
      placeholder: "/path",
      explanation:
        "awk '$9 ~ /^5/ {print $7}' access.log | sort | uniq -c | sort -rn shows POST /api/v2/scans with 16 errors (502/503 from the scanners), which matches the 'upstream prematurely closed connection' line in error.log. The dashboard's manifest export errors (500/504) are a second, smaller problem.",
    },
    {
      id: "predict-uniq",
      kind: "mcq",
      prompt: "What does this print?",
      code: "printf 'b\\na\\nb\\nb\\na\\n' | uniq -c",
      codeLanguage: "bash",
      options: ["  3 b\n  2 a", "  1 b\n  1 a\n  2 b\n  1 a", "  2 a\n  3 b", "  5 b"],
      answer: 1,
      explanation:
        "uniq only merges adjacent identical lines: b | a | b b | a. Add sort before uniq -c to group all identical lines together.",
    },
    {
      id: "explain-grep-50",
      kind: "explain",
      prompt: "Explain why `grep ' 50' access.log | cut -d' ' -f1 | sort | uniq -c` ranks 10.20.3.90 too high, and what you used instead.",
      concepts: [
        { label: "grep matches anywhere in the line (the size field too)", anyOf: ["anywhere", "whole line", "any field", "size", "bytes", "body_bytes", "field 10", "$10", "response size"] },
        { label: "Select the status field explicitly", anyOf: ["$9", "field 9", "ninth field", "9th field", "status field", "status column", "-f9", "awk"] },
        { label: "Those responses were successful (200), not errors", anyOf: ["200", "successful", "success", "not errors", "not an error", "false positive", "false positives", "overcount"] },
      ],
      minConcepts: 2,
      explanation:
        "grep sees the whole line, so a successful 200 response with a 503-byte body matches ' 50'. Testing $9 in awk looks only at the status.",
      modelAnswer:
        "grep matches the pattern anywhere in the line, so 10.20.3.90's successful 200 responses whose size field is 503 bytes were counted as errors — false positives. I used awk to test only the status field, $9 ~ /^5/, then printed $1 and ran sort | uniq -c | sort -rn | head -n 3.",
    },
  ],
  debrief: {
    solution: `${F}bash
awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -n 3 > ~/reports/5xx-by-client.txt
#  11 10.20.4.17    scanner gateway, POST /api/v2/scans -> 502/503
#   7 10.20.8.33    dashboard user, manifest export -> 500/504
#   5 10.20.2.50    second scanner gateway, POST /api/v2/scans -> 502
${F}

Equivalent pipelines pass as well: \`cut -d' ' -f1,9 | grep ' 5'\` after filtering, \`awk '$9 >= 500 && $9 < 600'\`, or an awk array (\`{n[$1]++} END {for (ip in n) print n[ip], ip}\`) followed by \`sort -rn\`. What matters is testing the **status field** and ranking **numerically**. The answer points at the scan-ingest upstream, not the dashboard: both scanner gateways fail on the same path.`,
    commonMistakes: [
      "Matching ' 50' or '5..' anywhere in the line, which also hits 503-byte successful responses.",
      "Treating every non-200 response as an error, so a browser with stale 404 URLs tops the list.",
      "Running uniq -c without sort, which counts only adjacent duplicates.",
      "Sorting the counted output by text or by IP instead of sort -rn.",
      "Overwriting a file you meant to append to (> vs >>), or redirecting before checking the output.",
    ],
    realWorld:
      "This exact pipeline is the first thing SREs run on a box during an incident, before the dashboards load. At scale the same reasoning moves into tools such as Loki, Elasticsearch or BigQuery (GROUP BY client WHERE status >= 500), but the traps are identical: query the parsed status field, not the raw text, and separate client errors (4xx) from server errors (5xx).",
  },
  review: [
    {
      id: "lx-pipeline-count-rank",
      skill: "lx.pipes",
      variants: [
        {
          id: "lx-pipeline-count-rank-a",
          kind: "order",
          prompt: "Order the stages of a pipeline that prints the 5 most frequent user agents (field 2 of a tab-separated file).",
          items: ["cut -f2 agents.tsv", "sort", "uniq -c", "sort -rn", "head -n 5"],
          explanation: "Select the field, group identical values with sort, count runs with uniq -c, rank numerically, keep the top.",
        },
        {
          id: "lx-pipeline-count-rank-b",
          kind: "order",
          prompt: "Order the stages that list the 3 depots with the most REJECTED scans (field 4 is the result, field 2 the depot).",
          items: ["awk '$4 == \"REJECTED\" {print $2}' scans.log", "sort", "uniq -c", "sort -rn", "head -n 3"],
          explanation: "Filter and select in awk, then sort | uniq -c | sort -rn | head.",
        },
      ],
    },
    {
      id: "lx-redirect-semantics",
      skill: "lx.pipes",
      variants: [
        {
          id: "lx-redirect-semantics-a",
          kind: "mcq",
          prompt: "`report.txt` has 10 lines. You run `grep ERROR app.log > report.txt` and grep finds 2 lines. How many lines does report.txt have now?",
          options: ["12", "2", "10", "0"],
          answer: 1,
          explanation: "> truncates the file before the command writes to it. Use >> to append.",
        },
        {
          id: "lx-redirect-semantics-b",
          kind: "mcq",
          prompt: "Which command saves the matching lines to `hits.txt` and sends 'Permission denied' messages to `/dev/null`?",
          options: [
            "grep -r token /etc > hits.txt 2>/dev/null",
            "grep -r token /etc 2> hits.txt > /dev/null",
            "grep -r token /etc | hits.txt",
            "grep -r token /etc >> /dev/null",
          ],
          answer: 0,
          explanation: "> redirects stdout (the matches); 2> redirects stderr (the error messages).",
        },
      ],
    },
    {
      id: "lx-awk-field-filter",
      skill: "lx.text-processing",
      variants: [
        {
          id: "lx-awk-field-filter-a",
          kind: "short",
          prompt: "In `scans.log`, field 4 is the result and field 2 is the depot. Write an awk command that prints the depot of every line whose result is exactly `REJECTED`.",
          accept: ["awk '$4 == \"REJECTED\" {print $2}' scans.log", "awk '$4==\"REJECTED\"{print $2}' scans.log"],
          acceptPatterns: ["^awk\\s+'\\s*\\$4\\s*(==\\s*\"REJECTED\"|~\\s*/\\^REJECTED\\$/)\\s*\\{\\s*print\\s+\\$2\\s*;?\\s*\\}\\s*'\\s+scans\\.log$"],
          explanation: "The pattern before the braces selects lines; the action prints the field.",
        },
        {
          id: "lx-awk-field-filter-b",
          kind: "short",
          prompt: "In an nginx combined log, `$9` is the status and `$7` the path. Write an awk command that prints the path of every 404 response in `access.log`.",
          accept: ["awk '$9 == 404 {print $7}' access.log", "awk '$9==404{print $7}' access.log", "awk '$9 == \"404\" {print $7}' access.log"],
          acceptPatterns: ["^awk\\s+'\\s*\\$9\\s*(==\\s*\"?404\"?|~\\s*/\\^?404\\$?/)\\s*\\{\\s*print\\s+\\$7\\s*;?\\s*\\}\\s*'\\s+access\\.log$"],
          explanation: "Compare the status field itself; a 404 elsewhere in the line (a path or size) must not match.",
        },
      ],
    },
    {
      id: "lx-uniq-needs-sort",
      skill: "lx.text-processing",
      variants: [
        {
          id: "lx-uniq-needs-sort-a",
          kind: "mcq",
          prompt: "`cut -d' ' -f1 access.log | uniq -c | sort -rn | head -n 1` reports `2 10.20.4.17`, but grep -c shows 10.20.4.17 has 15 requests. Why?",
          options: [
            "cut picked the wrong field",
            "uniq -c only counts adjacent duplicates; the input was not sorted",
            "sort -rn sorts in the wrong direction",
            "head -n 1 drops the real count",
          ],
          answer: 1,
          explanation: "Interleaved requests from different clients break up the runs. sort before uniq -c.",
        },
        {
          id: "lx-uniq-needs-sort-b",
          kind: "mcq",
          prompt: "Which pipeline correctly counts how many times each status code appears in field 9?",
          options: [
            "awk '{print $9}' access.log | uniq -c",
            "awk '{print $9}' access.log | sort | uniq -c",
            "awk '{print $9}' access.log | uniq | wc -l",
            "sort access.log | uniq -c",
          ],
          answer: 1,
          explanation: "Select the field, sort so identical codes are adjacent, then uniq -c.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev wants to know which internal hosts query `dns-01` most for names that don't exist. Query log lines look like: `02-Mar-2026 07:12:44 client 10.20.5.31#53122 query lumen-printer-3.lumen.internal A NXDOMAIN`. Field 3 is the literal word `client`, field 4 is `IP#port`, the last field is the result.",
    question: {
      id: "transfer-nxdomain-clients",
      kind: "mcq",
      prompt: "Which pipeline lists clients by number of NXDOMAIN answers, highest first?",
      options: [
        "grep NXDOMAIN query.log | sort | uniq -c | sort -rn",
        "awk '$NF == \"NXDOMAIN\" {split($4, a, \"#\"); print a[1]}' query.log | sort | uniq -c | sort -rn",
        "awk '{print $4}' query.log | sort | uniq -c | sort -rn",
        "grep -c NXDOMAIN query.log",
      ],
      answer: 1,
      explanation:
        "Filter on the result field ($NF), strip the port so each host counts once, then sort | uniq -c | sort -rn. Option A counts whole lines (every line is unique), C ignores the result, D gives one total.",
    },
  },
  refresher: {
    body: `A pipe \`|\` feeds one command's output into the next. Build pipelines one stage at a time and look at the output after each stage.

The counting recipe is: **select** the value (\`awk '{print $1}'\` or \`cut -d' ' -f1\`), **sort** it so duplicates sit together, **\`uniq -c\`** to count each group, **\`sort -rn\`** to rank by count, **\`head\`** to keep the top. Filter on the specific field you mean (\`awk '$9 ~ /^5/'\`), not on text that could appear anywhere in the line.`,
    practice: {
      id: "refresher-which-field",
      kind: "mcq",
      prompt: "In the line `10.20.4.17 - - [02/Mar/2026:08:01:04 +0000] \"POST /api/v2/scans HTTP/1.1\" 502 157`, which awk field is the status code 502?",
      options: ["$7", "$8", "$9", "$10"],
      answer: 2,
      explanation: "Splitting on spaces: $1 IP, $2 -, $3 -, $4 [date, $5 +0000], $6 \"POST, $7 path, $8 HTTP/1.1\", $9 status, $10 size.",
    },
  },
};
