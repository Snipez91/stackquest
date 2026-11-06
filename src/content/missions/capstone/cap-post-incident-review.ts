import type { MissionInput } from "@/content/schema";

/**
 * Capstone: post-incident review from an evidence pack spanning five systems.
 * The learner reconstructs the timeline, separates trigger/root cause from
 * contributing factors, and writes the explanation. Graded via questions.
 */

const alerts = String.raw`# PagerDuty-style alert export - service group "dispatch" - 2026-03-04 (UTC)
02:10:00  WARN   disk_usage db-01:/var 80%            route=#infra-alerts (no page)
02:55:00  WARN   disk_usage db-01:/var 90%            route=#infra-alerts (no page)
03:36:00  WARN   disk_usage db-01:/var 99%            route=#infra-alerts (no page)
03:39:20  CRIT   routes-api 5xx ratio 64% (5m)        route=oncall PAGE -> Priya Raman
03:41:05  CRIT   synthetic "public tracking page" 503  route=oncall PAGE -> Priya Raman
03:43:10  ACK    Priya Raman
04:02:00  INFO   disk_usage db-01:/var 61%            route=#infra-alerts
04:06:30  RESOLVED routes-api 5xx ratio 0.4% (5m)
04:07:15  RESOLVED synthetic "public tracking page" 200
`;

const dbDisk = String.raw`priya@db-01:~$ df -h /var /var/lib/postgresql
Filesystem      Size  Used Avail Use% Mounted on
/dev/vdb1        60G   60G     0 100% /var
/dev/vdb1        60G   60G     0 100% /var

priya@db-01:~$ sudo du -sh /var/lib/postgresql /var/log/lumen/etl /var/log/journal
19G     /var/lib/postgresql
39G     /var/log/lumen/etl
1.1G    /var/log/journal

priya@db-01:~$ ls -lh /var/log/lumen/etl/
-rw-r--r-- 1 svc-etl svc-etl  39G Mar  4 03:38 carrier-sync.log

priya@db-01:~$ tail -n 3 /var/log/lumen/etl/carrier-sync.log
2026-03-04 03:37:59,812 DEBUG carrier_sync.map raw carrier payload: {"scans":[{"id":"NS-99120331","events":[{"code":"AR","ts":"2026-03-04T03:31:10Z","facility":{"id":"ORD-3", ...
2026-03-04 03:37:59,813 DEBUG carrier_sync.map mapping NS-99120331 event AR -> arrived_at_hub
2026-03-04 03:37:59,813 DEBUG urllib3.connectionpool https://carrier-gw.lumen.internal:443 "GET /v2/scans?page=8812 HTTP/1.1" 200 1048211
`;

const postgresLog = String.raw`2026-03-04 03:38:02.114 UTC [811] PANIC:  could not write to file "pg_wal/xlogtemp.811": No space left on device
2026-03-04 03:38:02.120 UTC [700] LOG:  WAL writer process (PID 811) was terminated by signal 6: Aborted
2026-03-04 03:38:02.120 UTC [700] LOG:  terminating any other active server processes
2026-03-04 03:38:02.131 UTC [700] LOG:  all server processes terminated; reinitializing
2026-03-04 03:38:02.140 UTC [700] FATAL:  could not write lock file "postmaster.pid": No space left on device
2026-03-04 03:38:02.141 UTC [700] LOG:  database system is shut down
2026-03-04 03:58:40.502 UTC [2290] LOG:  starting PostgreSQL 16.4 on x86_64-pc-linux-gnu
2026-03-04 03:58:41.010 UTC [2290] LOG:  database system was interrupted; last known up at 2026-03-04 03:37:58 UTC
2026-03-04 03:58:41.877 UTC [2290] LOG:  redo done at 3/91F2A1C8
2026-03-04 03:58:42.003 UTC [2290] LOG:  database system is ready to accept connections
`;

const apiJournal = String.raw`Mar 04 03:38:03 api-01 python3[1544]: ERROR routes.db pool: connection to server at "db-01.lumen.internal" (10.20.2.30), port 5432 failed: Connection refused
Mar 04 03:38:03 api-01 python3[1544]: ERROR routes.http GET /api/routes?depot=ORD -> 500 (OperationalError)
Mar 04 03:38:04 api-01 python3[1544]: ERROR routes.http GET /api/routes?depot=ATL -> 500 (OperationalError)
Mar 04 03:40:00 api-01 python3[1544]: WARNING routes.http request rate 91 req/s (baseline 10 req/s)
Mar 04 03:45:00 api-01 python3[1544]: WARNING routes.http request rate 94 req/s (baseline 10 req/s)
Mar 04 03:58:43 api-01 python3[1544]: INFO routes.db pool: reconnected to db-01.lumen.internal:5432
Mar 04 03:58:44 api-01 python3[1544]: INFO routes.http GET /api/routes?depot=ORD -> 200
`;

const nginxSummary = String.raw`# web-01 nginx access log, requests per minute by location and status (aggregated with awk)
time   location          200    500    503   total
03:30  /api/routes        598      0      0    598
03:30  /track             211      0      0    211
03:37  /api/routes        604      0      0    604
03:38  /api/routes          9    588      0    597
03:39  /api/routes          0   3120   1304   4424
03:40  /api/routes          0   3650   1690   5340
03:40  /track              12      0    204    216
03:50  /api/routes          0   3590   1702   5292
03:50  /track               9      0    199    208
03:59  /api/routes        610      0      0    610
03:59  /track             214      0      0    214

# /etc/nginx/conf.d/limits.conf (excerpt)
limit_req_zone $server_name zone=perserver:10m rate=100r/s;   # one shared bucket per server_name
# applied to: location /api/  and  location /track
`;

const dashboardJs = String.raw`// routes-panel.js (dispatch dashboard 3.8.x) - excerpt
async function loadRoutes(depot) {
  try {
    const res = await fetch("/api/routes?depot=" + depot);
    if (!res.ok) throw new Error("HTTP " + res.status);
    render(await res.json());
  } catch (err) {
    showBanner("Failed to load routes");
    // retry straight away so dispatchers see data as soon as it is back
    setTimeout(() => loadRoutes(depot), 0);
  }
}
`;

const consoleLog = String.raw`Dispatch dashboard console, ORD depot screen, 2026-03-04
03:38:03.200 GET /api/routes?depot=ORD 500 (Internal Server Error)
03:38:03.231 GET /api/routes?depot=ORD 500 (Internal Server Error)
03:38:03.259 GET /api/routes?depot=ORD 500 (Internal Server Error)
03:38:03.288 GET /api/routes?depot=ORD 500 (Internal Server Error)
... (1,842 more identical requests in the next 60 s)
03:39:41.002 GET /api/routes?depot=ORD 503 (Service Temporarily Unavailable)
`;

const etlChange = String.raw`commit 4be19c2  (deployed 2026-03-03 23:50 UTC)
Author: Marco Bellini
    carrier_sync: temporarily enable DEBUG to chase NorthStar mapping bug

--- a/carrier_sync/settings.py
+++ b/carrier_sync/settings.py
@@
-LOG_LEVEL = "INFO"
+LOG_LEVEL = "DEBUG"   # TODO revert after NorthStar investigation
 LOG_FILE = "/var/log/lumen/etl/carrier-sync.log"

--- carrier_sync/logging_setup.py (unchanged, shown for context)
import logging

def configure(level, path):
    handler = logging.FileHandler(path)   # no rotation, no size limit
    logging.basicConfig(level=level, handlers=[handler])
    # DEBUG on the root logger also enables urllib3 and the raw payload dumps

# cron on db-01: */10 * * * * svc-etl /opt/lumen/etl/run-carrier-sync.sh
`;

const responderNotes = String.raw`Responder notes (Priya Raman)
03:43  Ack. routes-api 500s, db pool "connection refused". Tracking page 503 too?
03:47  db-01: postgres down, /var 100%. carrier-sync.log is 39G.
03:49  Paused the carrier-sync cron entry. Asked Marco to confirm DEBUG change.
03:52  Truncated carrier-sync.log after copying the last 50k lines to /root/evidence/.
03:58  Started postgresql. Recovery completed, accepting connections.
04:00  Dashboards recovering. Request rate on /api/routes back to baseline once 200s returned.
04:10  Marco reverted LOG_LEVEL to INFO (commit 9d0e7aa). Cron re-enabled 04:15.
`;

export const mission: MissionInput = {
  slug: "cap-post-incident-review",
  version: 1,
  track: "capstone",
  tier: "advanced",
  order: 3,
  title: "Post-incident review: the night the log ate the database",
  summary:
    "A 25-minute outage took down dispatch and the public tracking page. Use evidence from five systems to build the timeline, separate the root cause from contributing factors, and write the review.",
  minutes: 40,
  assessmentTypes: ["investigate-logs", "order-steps", "explain-root-cause", "interpret-output"],
  skills: ["lx.logs", "lx.troubleshooting"],
  appliesSkills: ["py.automation", "py.files", "js.error-handling", "js.async", "net.troubleshooting"],
  prerequisites: ["cap-dispatch-outage", "js-dispatch-error-states"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#post-incident-reviews",
    body: `Last night (03:38 to 04:06 UTC) dispatch lost its routes **and** customers lost the public tracking page. Priya restored service, but I need the review written before Thursday's ops meeting, and I want it blameless and precise.

The evidence pack is attached: alerts, db-01 disk output, Postgres log, the routes-api journal, web-01 request counts, the dashboard code and console, the ETL change, and Priya's notes.

Three things I need from you:
1. The **timeline** in the right order.
2. The **root cause**, kept separate from the things that made it worse or slower to catch.
3. A short **explanation** I can read aloud. Why did a logging change in a data job take down a customer-facing page?`,
  },
  objectives: [
    "Reconstruct an incident timeline by correlating timestamps across logs from different systems",
    "Distinguish the trigger and root cause from contributing factors that amplified impact or delayed detection",
    "Trace how a failure propagated across layers: Python job, filesystem, database, API, front end, proxy",
    "Write a blameless causal explanation that names mechanisms rather than people",
  ],
  concept: {
    title: "Root cause versus contributing factors",
    body: `A post-incident review answers **what happened, why, and what would stop it happening again**. Three terms keep the analysis honest:

- **Trigger**: the change or event that started the chain (a deploy, a traffic spike, a certificate expiry).
- **Root cause**: the underlying condition that made the trigger harmful. If you fix it, this class of incident cannot happen the same way again. Ask *why* repeatedly until the answer is something you can change in the system, not "someone made a mistake".
- **Contributing factors**: conditions that did not start the incident but **widened the blast radius** (more users affected) or **delayed detection or recovery**.

To build a timeline from several systems, **normalise timestamps** (all UTC here), anchor on hard facts (a PANIC line, a status change) and order by cause and effect, not by which log you read first. Watch for **amplification loops**: when a client retries instantly on errors, an outage of one component turns into overload of shared components that were otherwise healthy.

\`\`\`text
trigger -> root-cause condition -> first failure -> propagation -> user impact
                        ^ contributing factors widen or prolong each arrow
\`\`\`

Blameless does not mean vague: name the mechanism ("debug logging with no size limit on the database's filesystem"), not the person.`,
  },
  workedExample: {
    title: "Worked example: the expired certificate that broke label printing",
    body: `A different, smaller incident: depot label printers stopped printing at 00:00 UTC on the 1st.

**Evidence, by time (all UTC):**

\`\`\`text
23:30  cert-monitor: WARN label-api cert expires in 30 min   (email only)
00:00  label-api: TLS handshake failures from printers (certificate expired)
00:00  printers: "print failed", retry every 1 s, 400 printers
00:04  web-01: rate limiter returns 503 for /labels AND /returns (shared bucket)
00:22  on-call paged by customer support, renews cert, restarts label-api
\`\`\`

**Trigger:** the clock passing the certificate's expiry time.
**Root cause:** certificate renewal was manual, with no automation for this service.
**Contributing factors:** the expiry warning went to email instead of paging (delayed detection); printers retried every second (amplified load); the rate limiter shared one bucket across unrelated paths (widened impact to /returns).

**Action items** map to each: automate renewal (root cause), page on expiry under 7 days (detection), exponential backoff in printers (amplification), per-path rate limits (blast radius).

Notice that the 503s on /returns were real impact, but they were not the root cause.`,
  },
  simulationNote:
    "This is a read-only evidence pack: there is no lab to change. All times are UTC. Log excerpts are trimmed to the relevant lines; the nginx counts were aggregated per minute for you. Grading uses the questions below. The explanation is checked for key concepts by a keyword heuristic, so compare your answer with the model answer afterwards.",
  workspace: {
    kind: "evidence",
    files: [
      { path: "01-alerts.log", content: alerts, language: "log" },
      { path: "02-db-01-disk.txt", content: dbDisk, language: "bash" },
      { path: "03-db-01-postgresql.log", content: postgresLog, language: "log" },
      { path: "04-api-01-journal.log", content: apiJournal, language: "log" },
      { path: "05-web-01-nginx-summary.txt", content: nginxSummary, language: "text" },
      { path: "06-dashboard-routes-panel.js", content: dashboardJs, language: "javascript" },
      { path: "07-dashboard-console.log", content: consoleLog, language: "log" },
      { path: "08-etl-change.diff", content: etlChange, language: "text" },
      { path: "09-responder-notes.txt", content: responderNotes, language: "text" },
    ],
  },
  successCriteria: [
    "The timeline places the logging change, disk exhaustion, database crash, API errors, retry storm and recovery in causal order",
    "The root cause is identified as unbounded debug logging on the filesystem the database depends on, not the retry storm or the rate limiter",
    "Contributing factors (non-paging disk alerts, instant retries, shared rate-limit bucket) are identified as such",
    "The written explanation traces the failure from the Python job to the customer-facing page",
  ],
  hints: [
    "Start with the hardest fact in the pack: the first line in the Postgres log. Everything before it is a cause candidate, everything after it is propagation.",
    "Work backwards from the PANIC: why was there no space? Which file is 39G, which process writes it, and what changed in that process recently? Check 08-etl-change.diff for the deploy time.",
    "Work forwards from the PANIC: what did routes-api see one second later, and what did the dashboard code do on each error? Compare request counts at 03:37 and 03:40 in the nginx summary.",
    "Why did /track (which does not use the database) return 503? Read the limit_req_zone line: what key does the bucket use, and which locations share it?",
    "Root cause: DEBUG logging through a non-rotating FileHandler filled /var, which Postgres shares. Contributing: disk alerts at 80/90/99% never paged, the dashboard retried with setTimeout(..., 0) and no backoff, and one rate-limit bucket covered both /api/ and /track.",
  ],
  questions: [
    {
      id: "timeline-order",
      kind: "order",
      prompt: "Put these events in the order they happened.",
      items: [
        "carrier_sync deployed with LOG_LEVEL = \"DEBUG\" and a non-rotating log file",
        "Disk warnings for db-01:/var at 80% and 90% go to a channel without paging anyone",
        "Postgres PANICs: could not write WAL, no space left on device, and shuts down",
        "routes-api returns 500s and dashboards start retrying with no delay",
        "Shared rate limit on web-01 starts returning 503, including for the public /track page",
        "On-call pauses the ETL cron, frees space and restarts Postgres; error rates return to baseline",
      ],
      explanation:
        "Deploy 23:50 -> warnings 02:10/02:55 -> PANIC 03:38:02 -> API 500s from 03:38:03 and instant retries -> 503s at 03:39-03:40 -> pause, truncate, restart at 03:49-03:58 with recovery by 04:06.",
    },
    {
      id: "root-cause",
      kind: "mcq",
      prompt: "Which statement is the best root cause for this incident?",
      options: [
        "The dispatch dashboard retried failed requests without any delay",
        "Postgres crashed",
        "The carrier_sync job logged at DEBUG through a file handler with no rotation or size limit, on the same filesystem as the database, so it filled /var",
        "nginx's rate limiter was configured too low",
      ],
      answer: 2,
      explanation:
        "Postgres crashing is the first failure, not the reason for it. The retries and rate limiter widened the impact but would not have caused an outage on their own. The underlying condition was unbounded log growth on the database's filesystem; the DEBUG change was the trigger that exposed it.",
    },
    {
      id: "track-page-503",
      kind: "mcq",
      prompt:
        "The public /track page does not use the database, yet it returned 503 from 03:40. Which evidence explains this, and what kind of factor is it?",
      options: [
        "The Postgres log; it is the root cause",
        "The limit_req_zone keyed on $server_name: /api/ retries consumed the shared bucket, so /track was rejected too. This is a contributing factor that widened the blast radius",
        "The alerts export; it is the trigger",
        "The ETL diff; /track reads the carrier-sync log",
      ],
      answer: 1,
      explanation:
        "One bucket per server_name meant the retry storm on /api/routes (about 5,300 req/min) exhausted the limit for every location on that server. Customer impact got wider, but the bucket configuration did not start the incident.",
    },
    {
      id: "amplifier-code",
      kind: "short",
      prompt:
        "In 06-dashboard-routes-panel.js, which delay (in milliseconds) does the retry use, the value that turned an API outage into a request storm?",
      accept: ["0", "0 ms", "0ms", "zero"],
      acceptPatterns: ["^setTimeout\\(.*,\\s*0\\s*\\)$"],
      explanation:
        "`setTimeout(() => loadRoutes(depot), 0)` re-sends the request as soon as the previous one fails, from every open dashboard at once. Exponential backoff with jitter (for example 1 s, 2 s, 4 s ... capped at 60 s) keeps clients from overwhelming a recovering service.",
    },
    {
      id: "review-explanation",
      kind: "explain",
      prompt:
        "Write the \"What happened and why\" paragraph for Sam. Explain how a logging change in a data job took down a customer-facing page, and name the root cause separately from at least two contributing factors.",
      explanation:
        "Strong answers follow the chain: DEBUG logging -> unbounded file on /var -> disk full -> Postgres PANIC -> API 500s -> instant retries -> shared rate-limit 503s on /track, and keep the root cause distinct from the amplifiers and detection gaps.",
      concepts: [
        { label: "debug logging with no rotation or size limit", anyOf: ["debug", "log level", "log_level", "rotation", "rotate", "size limit", "filehandler", "unbounded", "log file grew", "39g"] },
        { label: "the disk on db-01 filled up", anyOf: ["disk full", "full disk", "no space", "out of space", "filled /var", "filled the disk", "100%", "disk space", "filesystem full"] },
        { label: "the database crashed or shut down, so the API failed", anyOf: ["postgres", "database", "panic", "wal", "500", "api errors", "routes-api"] },
        { label: "client retries without backoff amplified the load", anyOf: ["retry", "retries", "retried", "backoff", "back-off", "settimeout", "storm", "amplif"] },
        { label: "shared rate limit took down /track", anyOf: ["rate limit", "rate-limit", "limit_req", "shared bucket", "503", "/track", "tracking page"] },
        { label: "detection gap: disk alerts did not page", anyOf: ["did not page", "didn't page", "no page", "not paged", "never paged", "alert", "warning", "monitoring", "detection"] },
      ],
      minConcepts: 4,
      modelAnswer:
        "At 23:50 the carrier_sync ETL was deployed with DEBUG logging. Its log goes through a FileHandler with no rotation or size limit, on db-01's /var filesystem, which Postgres also uses. Over about four hours the log grew to 39G and filled the disk; the 80%, 90% and 99% warnings went to a channel and never paged anyone. At 03:38 Postgres could not write WAL (no space left on device) and shut down, so routes-api returned 500s. Every open dashboard then retried with setTimeout(..., 0), raising /api traffic roughly ninefold. Because nginx's rate limit uses one bucket per server_name, those retries also caused 503s on the public /track page. Root cause: unbounded debug logging on the database's filesystem. Contributing factors: disk alerts that did not page, retries without backoff, and a shared rate-limit bucket.",
    },
  ],
  debrief: {
    solution: `**Timeline (UTC):** 23:50 DEBUG deploy -> 02:10 and 02:55 disk warnings (no page) -> 03:36 99% -> **03:38:02 Postgres PANIC** (WAL write, no space) -> 03:38:03 routes-api 500s -> dashboards retry with \`setTimeout(..., 0)\`, /api/routes goes from about 600 to about 5,300 req/min -> 03:39-03:40 shared rate limit returns 503, including /track -> 03:39 page on 5xx -> 03:49 ETL paused, 03:52 log truncated, 03:58 Postgres recovers -> 04:06 resolved.

**Trigger:** commit 4be19c2 set \`LOG_LEVEL = "DEBUG"\` (which also enabled urllib3 and raw payload dumps).
**Root cause:** the ETL logs through \`logging.FileHandler\` with no rotation or size cap, on the same filesystem as the database's data, so any increase in log volume could take down Postgres.
**Contributing factors:**
- *Detection:* disk alerts at 80, 90 and 99% only posted to a channel; the first page came from API errors, 90 minutes after the 80% warning.
- *Amplification:* the dashboard retried instantly with no backoff, multiplying load by about 9.
- *Blast radius:* \`limit_req_zone $server_name\` shared one bucket across /api/ and /track, so a back-office outage became a customer-facing one.

**Action items** follow from each: \`RotatingFileHandler\` (or journald) with size caps and a separate log volume; page at 90% disk; exponential backoff with jitter in the dashboard; per-location rate-limit zones; a deploy check that rejects DEBUG in production config.`,
    commonMistakes: [
      "Naming \"Postgres crashed\" as the root cause. It is the first failure; the review must explain why it crashed.",
      "Naming the retry storm or the rate limiter as root cause because they produced the most visible errors. They amplified the impact; they did not start it.",
      "Blaming the person who enabled DEBUG. Turning on debug logging is reasonable; a system where that can fill the database's disk is the problem to fix.",
      "Ordering events by which log you read first instead of by timestamp and causality (the disk warnings come hours before the first error).",
      "Missing the detection gap: three warnings fired and nobody was paged.",
    ],
    realWorld:
      "This shape (an unbounded resource consumed by a side job, a shared dependency failing, then clients amplifying it) is one of the most common in incident databases. Good reviews produce one action item per causal link and contributing factor, each with an owner, rather than a single \"be more careful\" item. Retry with exponential backoff and jitter, log rotation with caps, separate volumes for data and logs, and alerting on rate of change (\"disk will be full in 2 hours\") are standard mitigations worth adopting before you need them.",
  },
  review: [
    {
      id: "cap-root-vs-contributing",
      skill: "lx.logs",
      variants: [
        {
          id: "cap-root-vs-contributing-a",
          kind: "mcq",
          prompt:
            "A nightly backup job wrote to the same disk as a message queue and filled it; the queue stopped; producers retried in a tight loop and overloaded the API gateway. Which is a contributing factor rather than the root cause?",
          options: [
            "The backup job writing to the queue's disk without a size limit",
            "Producers retrying in a tight loop",
            "The disk having no space for the queue",
            "None: they are all root causes",
          ],
          answer: 1,
          explanation:
            "The tight retry loop amplified the impact onto the gateway, but the incident started because backups could fill the queue's disk. Fixing retries alone would not prevent the queue outage.",
        },
        {
          id: "cap-root-vs-contributing-b",
          kind: "mcq",
          prompt:
            "Certificates for an internal API expired; renewal was manual; expiry warnings went to an unread mailbox; clients retried every second. What is the root cause?",
          options: [
            "Clients retried every second",
            "Warnings went to an unread mailbox",
            "Certificate renewal depended on a manual step with no automation",
            "The certificate's expiry date",
          ],
          answer: 2,
          explanation:
            "The expiry date is the trigger. Manual renewal is the condition that made it harmful. The mailbox (detection) and the retries (amplification) are contributing factors.",
        },
      ],
    },
    {
      id: "cap-timeline-anchor",
      skill: "lx.logs",
      variants: [
        {
          id: "cap-timeline-anchor-a",
          kind: "mcq",
          prompt:
            "You have logs from four systems. Which line is the best anchor for building the timeline of a database outage?",
          options: [
            "The first customer complaint in the support queue",
            "The database's own first FATAL or PANIC line",
            "The time the on-call engineer acknowledged the page",
            "The last line of the web server's access log",
          ],
          answer: 1,
          explanation:
            "The component's own first fatal error marks the moment it failed. Earlier events are cause candidates and later events are propagation or response. Complaints and acknowledgements lag behind.",
        },
        {
          id: "cap-timeline-anchor-b",
          kind: "mcq",
          prompt:
            "An API's journal shows `connection refused` to Redis from 14:02:07. Redis's log shows `OOM command not allowed` at 14:01:55 and `shutting down` at 14:02:05. A deploy finished at 13:40. What is the most defensible order?",
          options: [
            "API errors -> Redis OOM -> deploy",
            "Deploy -> Redis OOM -> Redis shutdown -> API connection refused",
            "Redis shutdown -> deploy -> API errors",
            "It cannot be determined without customer reports",
          ],
          answer: 1,
          explanation:
            "Order by timestamp and causality: the deploy precedes the memory problem, the OOM precedes the shutdown, and the API errors follow within two seconds.",
        },
      ],
    },
    {
      id: "cap-retry-backoff",
      skill: "js.error-handling",
      variants: [
        {
          id: "cap-retry-backoff-a",
          kind: "mcq",
          prompt: "Which retry policy is safest for a dashboard that polls an API from hundreds of browsers?",
          options: [
            "Retry immediately until it succeeds",
            "Retry every 100 ms forever",
            "Exponential backoff with jitter and a cap (for example 1 s, 2 s, 4 s ... up to 60 s)",
            "Reload the whole page on every error",
          ],
          answer: 2,
          explanation:
            "Backoff spreads retries out as failures continue, jitter stops all clients retrying in sync, and a cap keeps recovery reasonably fast.",
        },
        {
          id: "cap-retry-backoff-b",
          kind: "short",
          prompt:
            "A client catches a fetch error and calls `setTimeout(retry, 0)`. If the API is down for 10 minutes and 300 dashboards are open, does the request rate go up, go down, or stay the same compared with normal 30-second polling? (Answer: up, down, or same.)",
          accept: ["up", "goes up", "it goes up", "increases"],
          explanation:
            "With a 0 ms delay each client fires again as soon as the error returns, many times per second, instead of once every 30 seconds. The load on the failing service and anything in front of it rises sharply.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "A month later: the geo-lookup service slowed down after a memory leak (fixed by a restart). During the slowdown the mobile app's address autocomplete sent a request on every keystroke with no debounce, and the shared API gateway hit its connection limit, so login requests also failed. Geo-lookup's memory alert was set to email only.",
    question: {
      id: "transfer-classify-factors",
      kind: "mcq",
      prompt: "Which classification is correct?",
      options: [
        "Root cause: no debounce in autocomplete. Contributing: memory leak, email-only alert",
        "Root cause: memory leak in geo-lookup. Contributing: no debounce (amplification), shared gateway connection limit (blast radius), email-only alert (detection)",
        "Root cause: the gateway connection limit. Contributing: everything else",
        "Root cause: logins failing. Contributing: the memory leak",
      ],
      answer: 1,
      explanation:
        "The leak is the condition that started the failure. The keystroke storm amplified it, the shared gateway limit spread it to logins, and the email-only alert delayed detection, the same pattern as the disk-full incident.",
    },
  },
  refresher: {
    body: `In a post-incident review:

- The **trigger** is what started the chain (a deploy, an expiry, a spike).
- The **root cause** is the condition that let the trigger cause harm. Fix it and this kind of incident cannot repeat in the same way.
- **Contributing factors** made it worse (more users affected, more load) or slower to notice or fix.

Build the timeline from timestamps, all converted to one time zone. Anchor on the first hard failure, then look backwards for causes and forwards for effects.`,
    practice: {
      id: "refresher-trigger-vs-root",
      kind: "mcq",
      prompt:
        "A config deploy at 10:00 set a cache size to 0, and the API slowed to a crawl. The deploy pipeline has no validation for that setting. Which is the trigger?",
      options: ["The missing validation", "The 10:00 config deploy", "The API being slow", "The users who complained"],
      answer: 1,
      explanation:
        "The deploy started the chain, so it is the trigger. The missing validation is closer to the root cause, because it allowed a harmful value to ship.",
    },
  },
};
