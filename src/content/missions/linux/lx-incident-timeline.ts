import type { MissionInput } from "@/content/schema";

const F = "```";

const syslog = `Mar 02 01:30:01 api-01 CRON[29871]: (root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)
Mar 02 01:45:01 api-01 CRON[29940]: (tracker) CMD (/srv/tracker/bin/cache-warm --quiet)
Mar 02 01:47:03 api-01 legacy-export[1874]: export batch 77 slow (31.0s), upstream db busy
Mar 02 02:00:01 api-01 CRON[30112]: (reports) CMD (/opt/lumen/bin/report-backfill --since 2026-02-01 --all-depots)
Mar 02 02:00:02 api-01 report-backfill[30113]: loading scans since 2026-02-01 into memory (all depots)
Mar 02 02:15:01 api-01 CRON[30388]: (root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)
Mar 02 02:30:01 api-01 CRON[30455]: (root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)
Mar 02 02:41:12 api-01 report-backfill[30113]: done: 2,184,330 rows written, exiting
Mar 02 02:45:01 api-01 CRON[30602]: (tracker) CMD (/srv/tracker/bin/cache-warm --quiet)
`;

const kernLog = `Mar 02 02:12:55 api-01 kernel: [812345.118204] report-backfill invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
Mar 02 02:12:55 api-01 kernel: [812345.118391] oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,global_oom,task_memcg=/system.slice/tracker-api.service,task=tracker-api,pid=2417,uid=995
Mar 02 02:12:55 api-01 kernel: [812345.118402] Out of memory: Killed process 2417 (tracker-api) total-vm:3912044kB, anon-rss:2811904kB, file-rss:0kB, shmem-rss:0kB, UID:995
Mar 02 02:27:40 api-01 kernel: [813230.004417] report-backfill invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0
Mar 02 02:27:40 api-01 kernel: [813230.004590] oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,global_oom,task_memcg=/system.slice/tracker-api.service,task=tracker-api,pid=2486,uid=995
Mar 02 02:27:40 api-01 kernel: [813230.004601] Out of memory: Killed process 2486 (tracker-api) total-vm:3890112kB, anon-rss:2790012kB, file-rss:0kB, shmem-rss:0kB, UID:995
`;

const nginxError = `2026/03/02 01:47:03 [error] 912#912: *48811 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 10.20.8.33, server: api.lumen.internal, request: "GET /v1/legacy-export?batch=77 HTTP/1.1", upstream: "http://127.0.0.1:8090/v1/legacy-export?batch=77"
2026/03/02 02:12:56 [error] 912#912: *49920 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.4.17, server: api.lumen.internal, request: "POST /api/v2/scans HTTP/1.1", upstream: "http://127.0.0.1:8081/api/v2/scans"
2026/03/02 02:12:58 [error] 912#912: *49924 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.2.50, server: api.lumen.internal, request: "POST /api/v2/scans HTTP/1.1", upstream: "http://127.0.0.1:8081/api/v2/scans"
2026/03/02 02:13:03 [error] 912#912: *49931 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.4.17, server: api.lumen.internal, request: "POST /api/v2/scans HTTP/1.1", upstream: "http://127.0.0.1:8081/api/v2/scans"
2026/03/02 02:27:41 [error] 912#912: *51207 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.4.17, server: api.lumen.internal, request: "POST /api/v2/scans HTTP/1.1", upstream: "http://127.0.0.1:8081/api/v2/scans"
2026/03/02 02:27:47 [error] 912#912: *51215 connect() failed (111: Connection refused) while connecting to upstream, client: 10.20.8.33, server: api.lumen.internal, request: "GET /api/v2/routes/today HTTP/1.1", upstream: "http://127.0.0.1:8081/api/v2/routes/today"
`;

const trackerJournal = [
  "Mar 02 01:58:12 api-01 tracker-api[2417]: WARN slow query: SELECT ... FROM scans WHERE depot = $1 (2.1s)",
  "Mar 02 02:12:55 api-01 systemd[1]: tracker-api.service: A process of this unit has been killed by the OOM killer.",
  "Mar 02 02:12:55 api-01 systemd[1]: tracker-api.service: Main process exited, code=killed, status=9/KILL",
  "Mar 02 02:12:55 api-01 systemd[1]: tracker-api.service: Failed with result 'oom-kill'.",
  "Mar 02 02:13:05 api-01 systemd[1]: tracker-api.service: Scheduled restart job, restart counter is at 1.",
  "Mar 02 02:13:05 api-01 systemd[1]: Started tracker-api.service - Lumen tracking API.",
  "Mar 02 02:13:09 api-01 tracker-api[2486]: listening on 0.0.0.0:8081",
  "Mar 02 02:27:40 api-01 systemd[1]: tracker-api.service: A process of this unit has been killed by the OOM killer.",
  "Mar 02 02:27:40 api-01 systemd[1]: tracker-api.service: Main process exited, code=killed, status=9/KILL",
  "Mar 02 02:27:40 api-01 systemd[1]: tracker-api.service: Failed with result 'oom-kill'.",
  "Mar 02 02:27:50 api-01 systemd[1]: tracker-api.service: Scheduled restart job, restart counter is at 2.",
  "Mar 02 02:27:50 api-01 systemd[1]: Started tracker-api.service - Lumen tracking API.",
  "Mar 02 02:27:54 api-01 tracker-api[2533]: listening on 0.0.0.0:8081",
];

const template = `# INC-0302 — tracking API outage, night of 1-2 March (api-01)
# Fill in each field from the logs. Times are UTC, HH:MM:SS.
#
# trigger_command      the command that started the chain of events (what was run, by which job)
# first_oom_kill       when the kernel first killed tracker-api
# first_upstream_error when nginx first failed to reach tracker-api (customer impact starts)
# oom_kill_count       how many times tracker-api was OOM-killed that night
# backfill_finished    when the job that caused it finished

trigger_command=
first_oom_kill=
first_upstream_error=
oom_kill_count=
backfill_finished=
`;

const answers = (o: Partial<Record<"t" | "k" | "u" | "n" | "f", string>>) =>
  template
    .replace("trigger_command=", `trigger_command=${o.t ?? ""}`)
    .replace("first_oom_kill=", `first_oom_kill=${o.k ?? ""}`)
    .replace("first_upstream_error=", `first_upstream_error=${o.u ?? ""}`)
    .replace("oom_kill_count=", `oom_kill_count=${o.n ?? ""}`)
    .replace("backfill_finished=", `backfill_finished=${o.f ?? ""}`);

const good = { t: "/opt/lumen/bin/report-backfill --since 2026-02-01 --all-depots (cron, user reports)", k: "02:12:55", u: "02:12:56", n: "2", f: "02:41:12" };

const time = (key: string, hms: string) => `^${key}\\s*=\\s*(2026-03-02[ T]|Mar 02 )?${hms}(Z|\\s*UTC)?\\s*$`;

export const lxIncidentTimeline: MissionInput = {
  slug: "lx-incident-timeline",
  version: 1,
  track: "linux",
  tier: "advanced",
  order: 1,
  title: "Reconstruct the 02:00 outage from four different logs",
  summary:
    "The tracking API dropped scans twice overnight and recovered on its own. Correlate syslog, kernel, nginx and journal entries with different formats into a defensible timeline, ignoring look-alike noise.",
  minutes: 35,
  assessmentTypes: ["investigate-logs", "order-steps", "explain-root-cause"],
  skills: ["lx.logs"],
  appliesSkills: ["lx.text-processing", "lx.services", "lx.processes"],
  prerequisites: ["lx-stale-port-holder"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#incidents",
    body: `Overnight the Bristol scanners reported failed uploads for about half an hour, then everything recovered by itself. Nobody was paged because \`tracker-api\` on \`api-01\` came back each time.

I need a factual timeline for the 09:30 review — not guesses. Please fill in \`~/incident/INC-0302.txt\` (open in the editor) from the logs on \`api-01\`: syslog, the kernel log, nginx's error log and the \`tracker-api\` journal. You're in \`adm\`, so you can read all of them.

Be careful with anything before 02:00: legacy-export has been noisy for weeks and is unrelated.`,
  },
  objectives: [
    "Know where to look: /var/log/syslog, /var/log/kern.log, application logs and journalctl -u",
    "Search several logs at once with grep, and narrow by time window",
    "Correlate events across logs with different timestamp formats",
    "Separate cause, effect and coincidental noise when building a timeline",
  ],
  concept: {
    title: "Logs are witnesses: each sees one part of the story",
    body: `No single log tells you what happened. Each component records **its own view**:

| Source | Sees |
| --- | --- |
| \`/var/log/syslog\` | cron jobs (\`CRON[pid]: (user) CMD (...)\`), daemons that log via syslog |
| \`/var/log/kern.log\` | the kernel: OOM killer, disks, network drivers |
| \`journalctl -u UNIT\` | one systemd unit: its output plus systemd's start/stop/restart decisions |
| \`/var/log/nginx/error.log\` | the proxy: upstream failures, as the *client side* experiences them |

To build a timeline:

1. **Anchor on the symptom** (nginx couldn't reach the upstream) and find the first occurrence.
2. **Look just before it in every other source** — what changed in the minutes before?
3. **Follow the causal chain**: a cron job started → memory pressure → kernel OOM killer chose a victim → systemd restarted it → nginx saw refused connections in the gap.
4. **Check repetition and end**: how many times, and what stopped it?

Formats differ — \`Mar 02 02:12:55\` (syslog), \`2026/03/02 02:12:56\` (nginx) — so compare the time part. grep across files with \`-h\` (no file names) or \`-H\` (with), and narrow a window with a pattern like \`grep ' 02:1[0-9]:'\`. Be suspicious of events that are merely *nearby*: correlation in time is a lead, not proof. Confirm it with a mechanism (here, the kernel names both the trigger and the victim).`,
  },
  workedExample: {
    title: "Worked example: why did the label printer queue stall at 14:20?",
    body: `On \`ops-ws\`, labels stopped printing between 14:20 and 14:35.

**1. Anchor on the symptom.**

${F}bash
sudo journalctl -u labeld --no-pager | grep -n 'error'
# Mar 05 14:20:31 ops-ws labeld[880]: write to /var/spool/labels failed: No space left on device
${F}

**2. What else happened just before 14:20?**

${F}bash
grep -h ' 14:1[5-9]:\\| 14:20:' /var/log/syslog /var/log/kern.log
# Mar 05 14:15:01 ops-ws CRON[5120]: (aiko) CMD (/home/aiko/bin/render-all --debug)
# Mar 05 14:20:30 ops-ws kernel: EXT4-fs warning (device sda2): ext4_dx_add_entry: Directory index full!
${F}

**3. Confirm the mechanism, not just the timing.** \`du -sh /var/spool/labels/*\` shows 9 GB of \`debug-*.png\` from \`render-all --debug\`.

**4. Find the end.** \`grep 'render-all' /var/log/syslog\` shows it exiting at 14:34:50; labeld recovers at 14:35:02.

Timeline: 14:15:01 debug render started (cron, aiko) → 14:20:31 spool full, first failure → 14:34:50 render exited → 14:35:02 recovered. The EXT4 warning was a symptom of the same full disk, not a separate cause.`,
  },
  simulationNote:
    "The logs are static files and journal entries copied from the night of the incident; grep, awk, tail, head and journalctl -u work on them as on a real host. Kernel messages are in /var/log/kern.log (journalctl -k and --since/--until are not simulated). The service has already recovered, so nothing needs fixing: the deliverable is the timeline file.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T08:50:00Z",
      hosts: [
        {
          name: "api-01",
          users: [
            { name: "ops", uid: 1000, groups: ["adm"], home: "/home/ops" },
            { name: "tracker", uid: 995, groups: [], home: "/srv/tracker", shell: "/usr/sbin/nologin" },
            { name: "reports", uid: 994, groups: [], home: "/var/lib/reports", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/var/log/syslog", content: syslog, mode: "0640", owner: "syslog", group: "adm" },
            { path: "/var/log/kern.log", content: kernLog, mode: "0640", owner: "syslog", group: "adm" },
            { path: "/var/log/nginx", type: "dir", mode: "0755", owner: "root", group: "adm" },
            { path: "/var/log/nginx/error.log", content: nginxError, mode: "0640", owner: "www-data", group: "adm" },
            { path: "/var/log/nginx/access.log", content: "", mode: "0640", owner: "www-data", group: "adm" },
            { path: "/home/ops/incident", type: "dir", owner: "ops", group: "ops" },
            { path: "/home/ops/incident/INC-0302.txt", content: template, owner: "ops", group: "ops" },
            { path: "/etc/tracker", type: "dir", mode: "0755" },
            { path: "/etc/tracker/api.yml", content: "listen: 0.0.0.0:8081\n", mode: "0644" },
          ],
          services: [
            {
              name: "tracker-api",
              description: "Lumen tracking API",
              execUser: "tracker",
              command: "/srv/tracker/bin/tracker-api --config /etc/tracker/api.yml",
              state: "active",
              enabled: true,
              listens: [{ port: 8081, proto: "tcp" }],
              journal: trackerJournal,
            },
            {
              name: "nginx",
              description: "A high performance web server and a reverse proxy server",
              execUser: "root",
              command: "/usr/sbin/nginx -g daemon on; master_process on;",
              state: "active",
              enabled: true,
              listens: [{ port: 443, proto: "tcp" }],
            },
          ],
          processes: [{ pid: 1874, user: "tracker", command: "/srv/tracker/bin/legacy-export --listen 127.0.0.1:8090", cpu: 0.3, mem: 1.1, listens: [{ port: 8090, proto: "tcp" }] }],
        },
      ],
      start: { host: "api-01", user: "ops", cwd: "/home/ops/incident" },
      editableFiles: ["/home/ops/incident/INC-0302.txt"],
    },
    checks: [
      {
        id: "trigger-and-first-kill",
        name: "Trigger and first OOM kill identified",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/home/ops/incident/INC-0302.txt", pattern: "^trigger_command\\s*=.*report-backfill" },
            { type: "file_matches", path: "/home/ops/incident/INC-0302.txt", pattern: time("first_oom_kill", "02:12:55") },
          ],
        },
        feedback: {
          what: "trigger_command does not name the report-backfill job, or first_oom_kill is not the time the kernel first killed tracker-api.",
          why: "The review needs the root cause, not the victim: tracker-api was killed, but the memory pressure came from something else that the kernel names.",
          next: "Read /var/log/kern.log: the 'invoked oom-killer' line names the process that needed memory, and 'Killed process ... (tracker-api)' gives the time. Then find when that process was started in /var/log/syslog (grep CRON).",
        },
      },
      {
        id: "impact-start",
        name: "Customer impact start taken from nginx, not the unrelated legacy-export noise",
        assert: { type: "file_matches", path: "/home/ops/incident/INC-0302.txt", pattern: time("first_upstream_error", "02:12:56") },
        feedback: {
          what: "first_upstream_error is not the first time nginx failed to reach tracker-api.",
          why: "The 01:47 error is a timeout to the legacy-export upstream on port 8090, a different service. Using it would make the outage look 25 minutes longer and point at the wrong system.",
          next: "grep 8081 /var/log/nginx/error.log | head -n 1 — only lines whose upstream is 127.0.0.1:8081 are tracker-api.",
        },
      },
      {
        id: "extent-and-end",
        name: "Number of kills and the end of the trigger are correct",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/home/ops/incident/INC-0302.txt", pattern: "^oom_kill_count\\s*=\\s*(2|two)\\s*$", flags: "mi" },
            { type: "file_matches", path: "/home/ops/incident/INC-0302.txt", pattern: time("backfill_finished", "02:41:12") },
          ],
        },
        feedback: {
          what: "oom_kill_count or backfill_finished does not match the logs.",
          why: "The review will decide whether a restart policy was enough. That depends on whether this happened once or repeatedly, and on what actually ended it.",
          next: "Count the kills with grep -c 'Killed process' /var/log/kern.log (or the journal's 'killed by the OOM killer' lines), and find the backfill's last line in /var/log/syslog.",
        },
      },
    ],
    solution: [
      "journalctl -u tracker-api --no-pager",
      "grep -h 'oom\\|Killed process' /var/log/kern.log",
      "grep 8081 /var/log/nginx/error.log | head -n 1",
      "grep -c 'Killed process' /var/log/kern.log",
      "grep report-backfill /var/log/syslog",
      { write: "/home/ops/incident/INC-0302.txt", content: answers(good) },
      "cat ~/incident/INC-0302.txt",
    ],
    wrongSolutions: [
      {
        label: "Blames the victim and starts the clock at the legacy-export noise",
        steps: [{ write: "/home/ops/incident/INC-0302.txt", content: answers({ ...good, t: "tracker-api", u: "01:47:03" }) }],
      },
      {
        label: "Counts one kill and uses the API's recovery as the end",
        steps: [{ write: "/home/ops/incident/INC-0302.txt", content: answers({ ...good, n: "1", f: "02:27:54" }) }],
      },
      {
        label: "Uses the cron start time as the first kill",
        steps: [{ write: "/home/ops/incident/INC-0302.txt", content: answers({ ...good, k: "02:00:01" }) }],
      },
      {
        label: "Leaves the template unfilled",
        steps: ["cat ~/incident/INC-0302.txt"],
      },
    ],
    starterCommands: ["cat INC-0302.txt", "ls -l /var/log /var/log/nginx", "journalctl -u tracker-api -n 20"],
  },
  successCriteria: [
    "trigger_command names the report-backfill cron job and first_oom_kill is 02:12:55",
    "first_upstream_error is 02:12:56, the first nginx failure for the tracker-api upstream",
    "oom_kill_count is 2 and backfill_finished is 02:41:12",
  ],
  hints: [
    "Start with the unit that suffered: `journalctl -u tracker-api --no-pager`. systemd says *how* it died (`code=killed, status=9/KILL`, `'oom-kill'`), but not who caused the memory pressure.",
    "The kernel decides OOM kills, so read `/var/log/kern.log`. Two kinds of lines matter: `X invoked oom-killer` (who needed memory) and `Killed process PID (NAME)` (the victim).",
    "nginx's error log has errors for two different upstreams. Only `127.0.0.1:8081` is tracker-api: `grep 8081 /var/log/nginx/error.log | head -n 1`.",
    "`grep report-backfill /var/log/syslog` shows when cron started the job, as which user, with which arguments, and when it exited. `grep -c 'Killed process' /var/log/kern.log` gives the count. Times go in as HH:MM:SS.",
  ],
  questions: [
    {
      id: "order-incident",
      kind: "order",
      prompt: "Put the night's events in order.",
      items: [
        "cron starts report-backfill as user reports",
        "report-backfill triggers the OOM killer, which kills tracker-api",
        "nginx gets 'Connection refused' from 127.0.0.1:8081",
        "systemd restarts tracker-api (restart counter 1)",
        "tracker-api is OOM-killed a second time",
        "report-backfill finishes and exits",
      ],
      explanation:
        "02:00:01 cron → 02:12:55 first OOM kill → 02:12:56 first refused connection → 02:13:05 restart → 02:27:40 second kill → 02:41:12 backfill exits; no further kills.",
    },
    {
      id: "interpret-oom-victim",
      kind: "mcq",
      prompt: "The kernel line says `report-backfill invoked oom-killer` and then `Killed process 2417 (tracker-api)`. What does this tell you?",
      options: [
        "tracker-api had a memory leak and killed itself",
        "report-backfill needed memory that wasn't available; the kernel chose tracker-api (the largest candidate) as the victim",
        "report-backfill killed tracker-api with kill -9",
        "systemd killed tracker-api for using too much CPU",
      ],
      answer: 1,
      explanation:
        "The process that 'invoked' the OOM killer is the one whose allocation failed. The kernel then picks a victim by its OOM score — usually the biggest memory user — which need not be the cause.",
    },
    {
      id: "explain-root-cause",
      kind: "explain",
      prompt: "Write the root-cause paragraph Sam will read aloud: what happened, why tracker-api was the one that died, and why the 01:47 error is not part of it.",
      concepts: [
        { label: "The report-backfill cron job caused memory exhaustion", anyOf: ["report-backfill", "backfill", "cron job", "memory pressure", "out of memory", "ran out of memory", "oom"] },
        { label: "The kernel OOM killer picked tracker-api as victim (largest process)", anyOf: ["oom killer", "oom-killer", "kernel killed", "victim", "largest", "most memory", "chose tracker-api", "picked tracker-api"] },
        { label: "systemd restarted it, so it recovered by itself twice", anyOf: ["systemd restart", "restarted", "restart", "recovered", "came back", "twice", "two times"] },
        { label: "The 01:47 error was a different upstream (legacy-export, port 8090)", anyOf: ["legacy-export", "legacy export", "8090", "different upstream", "different service", "unrelated"] },
      ],
      minConcepts: 3,
      explanation:
        "Cause (backfill memory), mechanism (OOM killer picks the biggest process), effect (refused connections until systemd restarted it), and the noise ruled out with evidence (different upstream).",
      modelAnswer:
        "At 02:00:01 cron started report-backfill as the reports user; it loads a month of scans for all depots into memory. At 02:12:55 the host ran out of memory and the kernel OOM killer picked tracker-api as the victim because it was the largest process, even though the backfill caused the pressure. nginx got connection refused on 127.0.0.1:8081 from 02:12:56 until systemd restarted the API; the same happened again at 02:27:40, two kills in total, and it stopped when the backfill exited at 02:41:12. The 01:47 error was a timeout to the unrelated legacy-export upstream on port 8090.",
    },
  ],
  debrief: {
    solution: `${F}text
02:00:01  syslog     CRON (reports) CMD /opt/lumen/bin/report-backfill --since 2026-02-01 --all-depots
02:12:55  kern.log   report-backfill invoked oom-killer -> Killed process 2417 (tracker-api)
02:12:56  nginx      connect() failed (111) upstream 127.0.0.1:8081       <- impact starts
02:13:05  journal    systemd: Scheduled restart job, restart counter 1 -> Started
02:27:40  kern.log   second OOM kill (pid 2486)
02:27:50  journal    restart counter 2
02:41:12  syslog     report-backfill: done, exiting                       <- no more kills
${F}

Two pieces of evidence separate cause from noise: the kernel line names the process that *invoked* the OOM killer, and the 01:47 nginx error has a different upstream (\`:8090\`, legacy-export). The useful follow-ups for the review are a memory limit on the backfill (\`MemoryMax=\` in a unit, or running it on a reporting replica) and alerting on systemd's restart counter so a "self-healing" service still pages someone.`,
    commonMistakes: [
      "Naming the victim (tracker-api) as the root cause because its journal shows the crash.",
      "Starting the timeline at the first error in nginx's log without checking which upstream it belongs to.",
      "Stopping after the first kill and missing that it repeated until the backfill exited.",
      "Treating the end of the incident as the API's last restart rather than the trigger going away.",
      "Assuming time-adjacent events are related without a mechanism that links them.",
    ],
    realWorld:
      "On real hosts, journalctl -k --since '02:00' --until '02:45' replaces kern.log, and journalctl -o short-iso merges every unit into one chronological stream. Fleets ship logs to a central store (Loki, Elasticsearch, CloudWatch) where you query by host and time range across sources, but the method is the same: anchor on impact, look just before it everywhere, confirm the mechanism, find the end. Note that dmesg timestamps are seconds since boot, which is another format you'll need to convert.",
  },
  review: [
    {
      id: "lx-where-logs-live",
      skill: "lx.logs",
      variants: [
        {
          id: "lx-where-logs-live-a",
          kind: "mcq",
          prompt: "You suspect the kernel's OOM killer stopped a process last night. Where do you look first?",
          options: ["/var/log/nginx/access.log", "/var/log/kern.log or journalctl -k", "/etc/systemd/system", "~/.bash_history"],
          answer: 1,
          explanation: "OOM kills are kernel events, logged to the kernel ring buffer (kern.log / journalctl -k).",
        },
        {
          id: "lx-where-logs-live-b",
          kind: "mcq",
          prompt: "Which log tells you that a cron job ran, as which user, and with which command?",
          options: ["/var/log/syslog (CRON lines)", "/var/log/kern.log", "journalctl -u nginx", "/etc/crontab"],
          answer: 0,
          explanation: "cron logs `CRON[pid]: (user) CMD (command)` to syslog. /etc/crontab defines jobs but doesn't record runs.",
        },
        {
          id: "lx-where-logs-live-c",
          kind: "short",
          prompt: "Write the command that shows the full journal for the systemd unit `tracker-api` without a pager.",
          accept: ["journalctl -u tracker-api --no-pager", "journalctl -u tracker-api --no-pager", "journalctl --no-pager -u tracker-api"],
          acceptPatterns: ["^(sudo\\s+)?journalctl\\s+(-u\\s*tracker-api(\\.service)?\\s+--no-pager|--no-pager\\s+-u\\s*tracker-api(\\.service)?)$"],
          explanation: "-u selects the unit; --no-pager prints everything to the terminal.",
        },
      ],
    },
    {
      id: "lx-correlate-timestamps",
      skill: "lx.logs",
      variants: [
        {
          id: "lx-correlate-timestamps-a",
          kind: "mcq",
          prompt: "nginx logs `2026/03/02 02:12:56 [error] ... upstream: \"http://127.0.0.1:8081/...\"` and the kernel logs `Mar 02 02:12:55 ... Killed process 2417 (tracker-api)`. tracker-api listens on 8081. What is the most reasonable reading?",
          options: [
            "Unrelated: the formats differ",
            "The nginx error is the effect of the kill one second earlier",
            "nginx caused the kill",
            "The clocks must be wrong",
          ],
          answer: 1,
          explanation: "Same time window, and a mechanism links them: the upstream on 8081 vanished, so connections were refused.",
        },
        {
          id: "lx-correlate-timestamps-b",
          kind: "mcq",
          prompt: "An error at 01:47 in nginx's error log mentions `upstream: \"http://127.0.0.1:8090/v1/legacy-export\"`. The outage you're investigating is tracker-api on 8081 from 02:12. What do you do with the 01:47 line?",
          options: [
            "Use it as the start of the outage",
            "Note it as unrelated: different upstream and no mechanism linking it",
            "Delete it from the log",
            "Assume it caused the OOM",
          ],
          answer: 1,
          explanation: "Proximity in time is a lead, not proof. A different upstream with no causal link is noise for this incident.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `db-01`, Postgres restarted at 03:14. `journalctl -u postgresql` shows `Main process exited, code=killed, status=9/KILL` at 03:14:07. `/var/log/syslog` shows `03:00:01 CRON[811]: (backup) CMD (/usr/local/bin/full-dump --no-compress)` and `03:14:09 CRON[905]: (root) CMD (debian-sa1 1 1)`. `/var/log/kern.log` shows `03:14:07 kernel: full-dump invoked oom-killer` and `Killed process 1204 (postgres)`.",
    question: {
      id: "transfer-db-oom",
      kind: "mcq",
      prompt: "Which root cause belongs in the incident report?",
      options: [
        "debian-sa1 at 03:14:09 crashed Postgres",
        "Postgres has a memory leak",
        "The 03:00 full-dump backup exhausted memory and the OOM killer chose postgres as the victim",
        "systemd killed Postgres for being slow",
      ],
      answer: 2,
      explanation:
        "The kernel names full-dump as the process that invoked the OOM killer, and postgres as the victim. debian-sa1 ran two seconds *after* the kill and is unrelated.",
    },
  },
  refresher: {
    body: `Each log records one component's view. \`/var/log/syslog\` has cron runs and general daemon messages, \`/var/log/kern.log\` (or \`journalctl -k\`) has kernel events like OOM kills, \`journalctl -u UNIT\` has a service's output and systemd's restarts, and application logs (nginx) show what clients experienced.

To reconstruct an incident: find the first symptom, look at every source just before it, follow the mechanism from cause to effect, and find what ended it. Compare the time part when formats differ, and rule out look-alikes (a different upstream, a different service) with evidence.`,
    practice: {
      id: "refresher-oom-line",
      kind: "mcq",
      prompt: "In `Out of memory: Killed process 2417 (tracker-api)`, what is 2417?",
      options: ["The memory in MB", "The PID of the killed process", "The uid of the user", "The port it used"],
      answer: 1,
      explanation: "The kernel reports the victim's PID and name.",
    },
  },
};
