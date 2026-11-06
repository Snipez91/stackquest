import type { MissionInput } from "@/content/schema";

const F = "```";

const journal = [
  "Mar 02 06:02:11 api-01 systemd[1]: Started tracker-api.service - Lumen tracking API.",
  "Mar 02 09:41:03 api-01 systemd[1]: tracker-api.service: Main process exited, code=killed, status=9/KILL",
  "Mar 02 09:41:03 api-01 systemd[1]: tracker-api.service: Failed with result 'signal'.",
  "Mar 02 09:41:20 api-01 systemd[1]: Starting tracker-api.service - Lumen tracking API...",
  "Mar 02 09:41:21 api-01 tracker-api[5213]: bind() to 0.0.0.0:8081 failed (98: Address already in use)",
  "Mar 02 09:41:21 api-01 systemd[1]: tracker-api.service: Main process exited, code=exited, status=1/FAILURE",
  "Mar 02 09:41:21 api-01 systemd[1]: tracker-api.service: Failed with result 'exit-code'.",
  "Mar 02 09:41:21 api-01 systemd[1]: Failed to start tracker-api.service - Lumen tracking API.",
];

const handover = `On-call handover (Sun -> Mon)
- reports team kicked off a manual backfill on Sat afternoon (report-backfill). Should have finished Sat night.
- Marco tested a new tracker build by hand on Friday with the dev server on 8081. He says it's "probably stopped".
- Marco's notebook kernel on this box has unsaved analysis: please don't kill it.
- metrics-agent (port 9100) feeds the dashboards; report-worker processes the nightly queue. Both must keep running.
`;

export const lxStalePortHolder: MissionInput = {
  slug: "lx-stale-port-holder",
  version: 1,
  track: "linux",
  tier: "intermediate",
  order: 3,
  title: "The tracking API can't start: something already owns port 8081",
  summary:
    "A runaway job is eating the CPU and a forgotten dev server holds the API's port. Identify the exact processes with ps, pgrep and ss, signal only those, and bring the service back.",
  minutes: 25,
  assessmentTypes: ["configure-system", "interpret-output", "investigate-logs"],
  skills: ["lx.processes"],
  appliesSkills: ["lx.services", "lx.pipes"],
  prerequisites: ["lx-notify-service-config"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `\`tracker-api\` on \`api-01\` got OOM-killed at 09:41 and now won't come back: the journal says **Address already in use** on 8081. The box is also crawling — load average is through the roof.

Read \`~/handover.txt\` first. My guesses: Marco's Friday dev server never stopped, and the reports backfill from Saturday is still running.

Please:

- stop whatever is holding 8081 and whatever is burning the CPU,
- get \`tracker-api\` running again,
- **don't touch anything else**: Marco's notebook kernel, the metrics agent and the report worker must survive. Last time someone ran \`pkill python3\` and we lost the dashboards for an hour.`,
  },
  objectives: [
    "Read ps aux columns (USER, PID, %CPU, %MEM, COMMAND) to identify a runaway process",
    "Find which process holds a TCP port with ss -tlnp",
    "Signal a specific PID with kill, preferring SIGTERM before SIGKILL",
    "Avoid collateral damage from broad pkill patterns",
  ],
  concept: {
    title: "Processes, PIDs, ports and signals",
    body: `Every running program is a **process** with a unique **PID**, an owning **user**, and the command line it was started with. \`ps aux\` lists all of them; \`%CPU\` and \`%MEM\` show who is consuming resources.

A TCP port can be bound by **one** listening process at a time. If another process already listens on 8081, the next \`bind()\` fails with *Address already in use* (errno 98). \`ss -tlnp\` (TCP, listening, numeric, with process) shows the holder — other users' processes appear only when you run it as root:

${F}text
LISTEN 0 511 0.0.0.0:8081 0.0.0.0:* users:(("python3",pid=4120,fd=3))
${F}

To stop a process you send a **signal**:

| Signal | Number | Meaning |
| --- | --- | --- |
| SIGTERM | 15 | "please exit" — the default for \`kill PID\`; lets it clean up |
| SIGKILL | 9 | immediate, can't be caught; use only if TERM fails |
| SIGHUP | 1 | often "reload your config" for daemons |

You may signal your own processes; others' need \`sudo\`.

**Choose targets by PID, after looking.** \`pkill python3\` signals *every* process named python3; \`pkill -f report\` matches any command line containing "report". Confirm with \`pgrep -a PATTERN\` (lists PID and full command) before you \`kill\`.`,
  },
  workedExample: {
    title: "Worked example: port 5432 is busy on db-01",
    body: `A restored Postgres won't start: *could not bind IPv4 address "0.0.0.0": Address already in use*.

**1. Who holds the port?**

${F}bash
sudo ss -tlnp | grep ':5432'
# LISTEN 0 244 0.0.0.0:5432 ... users:(("pg_ctl-test",pid=7731,fd=6))
${F}

**2. What is that process, and whose?**

${F}bash
ps aux | grep '[7]731'           # [7] stops grep matching itself
# dev   7731  0.4  2.1 ... /usr/lib/postgresql/16/bin/postgres -D /tmp/restore-test
pgrep -a postgres                # are there other postgres processes we must keep?
${F}

It's a throwaway test instance from \`/tmp\`. The other postgres processes listed belong to the replica and must stay.

**3. Ask politely, then verify.**

${F}bash
sudo kill 7731                   # SIGTERM
sudo ss -tlnp | grep ':5432'     # gone? good. Still there after a few seconds? kill -9 7731
sudo systemctl start postgresql
${F}`,
  },
  simulationNote:
    "Processes, ports and signals are simulated: ps, pgrep, pkill, kill and ss read the same process table, and a process that exits releases its port. The simulator does not distinguish how gracefully a process exits (TERM and KILL both end it), so preferring SIGTERM is a habit to carry to real systems, where SIGKILL skips cleanup such as flushing files. top is not available; use ps aux with sort.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T09:48:00Z",
      hosts: [
        {
          name: "api-01",
          users: [
            { name: "ops", uid: 1000, groups: ["sudo", "adm"], home: "/home/ops" },
            { name: "marco", uid: 1001, groups: [], home: "/home/marco" },
            { name: "reports", uid: 994, groups: [], home: "/var/lib/reports", shell: "/usr/sbin/nologin" },
            { name: "tracker", uid: 995, groups: [], home: "/srv/tracker", shell: "/usr/sbin/nologin" },
            { name: "prometheus", uid: 993, groups: [], home: "/var/lib/prometheus", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/home/ops/handover.txt", content: handover, owner: "ops", group: "ops" },
            { path: "/etc/tracker", type: "dir", mode: "0755" },
            { path: "/etc/tracker/api.yml", content: "listen: 0.0.0.0:8081\ndb_host: db-01.lumen.internal\n", mode: "0644" },
          ],
          processes: [
            { pid: 2650, user: "marco", command: "python3 /home/marco/notebooks/.venv/bin/ipykernel_launcher -f /home/marco/.local/share/jupyter/runtime/kernel-7c1e.json", cpu: 0.4, mem: 3.8 },
            { pid: 2710, user: "prometheus", command: "python3 /opt/lumen/metrics-agent.py --listen :9100", cpu: 0.7, mem: 0.9, listens: [{ port: 9100, proto: "tcp" }] },
            { pid: 3001, user: "reports", command: "/opt/lumen/bin/report-worker --queue nightly", cpu: 1.2, mem: 2.0 },
            { pid: 4120, user: "marco", command: "python3 /home/marco/tracker-dev/dev_server.py --port 8081", cpu: 0.1, mem: 1.4, listens: [{ port: 8081, proto: "tcp" }] },
            { pid: 4388, user: "reports", command: "/opt/lumen/bin/report-backfill --from 2019-01-01 --all-depots", cpu: 97.9, mem: 41.3 },
          ],
          services: [
            {
              name: "tracker-api",
              description: "Lumen tracking API",
              execUser: "tracker",
              command: "/srv/tracker/bin/tracker-api --config /etc/tracker/api.yml",
              state: "failed",
              enabled: true,
              requiresReadable: ["/etc/tracker/api.yml"],
              listens: [{ port: 8081, proto: "tcp" }],
              http: [{ path: "/health", status: 200, body: "ok\n" }],
              kind: "http",
              journal,
            },
          ],
          interfaces: [{ name: "eth0", address: "10.20.1.20/24" }],
        },
      ],
      segments: [{ name: "srv", cidr: "10.20.1.0/24" }],
      start: { host: "api-01", user: "ops" },
    },
    checks: [
      {
        id: "api-running",
        name: "tracker-api is running and answering on 8081",
        assert: {
          type: "all",
          of: [
            { type: "service_state", service: "tracker-api", state: "active" },
            { type: "http_status", from: "api-01", url: "http://127.0.0.1:8081/health", status: 200 },
          ],
        },
        feedback: {
          what: "tracker-api is not active, or http://127.0.0.1:8081/health does not answer.",
          why: "Every scanner and the dispatch dashboard call this API. The unit cannot bind 8081 while another process listens there, so restarting alone keeps failing.",
          next: "sudo ss -tlnp | grep 8081 shows the PID holding the port. Stop that process, then sudo systemctl start tracker-api and check systemctl status tracker-api.",
        },
      },
      {
        id: "runaway-stopped",
        name: "The runaway backfill is no longer running",
        assert: { type: "process_running", pattern: "report-backfill", expect: false },
        feedback: {
          what: "report-backfill is still running.",
          why: "At ~98% CPU and 41% memory it is what drove the host into the OOM kill. Leave it and tracker-api will be killed again.",
          next: "ps aux shows its PID in the %CPU column. It belongs to the reports user, so you need sudo kill PID.",
        },
      },
      {
        id: "no-collateral",
        name: "Marco's notebook, the metrics agent and the report worker are still running",
        assert: {
          type: "all",
          of: [
            { type: "process_running", pattern: "ipykernel_launcher", expect: true },
            { type: "process_running", pattern: "metrics-agent\\.py", expect: true },
            { type: "process_running", pattern: "report-worker", expect: true },
          ],
        },
        feedback: {
          what: "A process that should have survived was stopped: Marco's notebook kernel, metrics-agent.py, or report-worker.",
          why: "Broad patterns such as pkill python3, pkill -u marco or pkill -f report match more than the culprit. Here that means lost analysis, blank dashboards or a stalled nightly queue.",
          next: "Use pgrep -a PATTERN to see exactly what a pattern matches, and kill by PID. Reset the lab to bring back what was stopped.",
        },
      },
    ],
    solution: [
      "cat ~/handover.txt",
      "sudo journalctl -u tracker-api -n 5",
      "ps aux",
      "sudo ss -tlnp",
      "pgrep -a python3",
      "sudo kill 4120",
      "sudo kill 4388",
      "sudo ss -tlnp | grep 8081",
      "sudo systemctl start tracker-api",
      "systemctl status tracker-api",
      "curl -s http://127.0.0.1:8081/health",
    ],
    wrongSolutions: [
      {
        label: "pkill python3, which also kills the notebook and the metrics agent",
        steps: ["sudo pkill python3", "sudo pkill report-backfill", "sudo systemctl start tracker-api"],
      },
      {
        label: "Kills everything owned by marco and reports",
        steps: ["sudo pkill -u marco", "sudo pkill -u reports", "sudo systemctl start tracker-api"],
      },
      {
        label: "Restarts the service without freeing the port",
        steps: ["sudo kill 4388", "sudo systemctl restart tracker-api"],
      },
      {
        label: "Frees the port but leaves the runaway backfill running",
        steps: ["sudo kill 4120", "sudo systemctl start tracker-api"],
      },
      {
        label: "pkill -f report, which also stops the report worker",
        steps: ["sudo kill 4120", "sudo pkill -f report", "sudo systemctl start tracker-api"],
      },
    ],
    starterCommands: ["cat ~/handover.txt", "systemctl status tracker-api", "ps aux", "sudo ss -tlnp"],
  },
  successCriteria: [
    "tracker-api is active and http://127.0.0.1:8081/health returns 200",
    "The runaway report-backfill process is gone",
    "Marco's notebook kernel, metrics-agent.py and report-worker are still running",
  ],
  hints: [
    "Two separate questions: *who uses the CPU?* (`ps aux`, look at %CPU) and *who owns port 8081?* (`sudo ss -tlnp`). Plain `ss` hides other users' processes.",
    "Write down the PID, user and full command for each culprit. `pgrep -a python3` shows how many processes a name-based pkill would hit.",
    "Both culprits belong to other users, so you need `sudo kill PID` (SIGTERM by default). Kill by PID, not by name.",
    "`sudo kill 4120 4388`, then confirm with `sudo ss -tlnp | grep 8081` and `ps aux`, then `sudo systemctl start tracker-api` and `curl -s http://127.0.0.1:8081/health`.",
  ],
  questions: [
    {
      id: "interpret-ss",
      kind: "short",
      prompt: "Which PID was holding port 8081?",
      accept: ["4120"],
      acceptPatterns: ["^(pid\\s*=?\\s*)?4120$"],
      placeholder: "PID",
      explanation: "sudo ss -tlnp shows users:((\"python3\",pid=4120,...)) on 0.0.0.0:8081 — Marco's Friday dev server.",
    },
    {
      id: "predict-pkill",
      kind: "mcq",
      prompt: "How many processes on api-01 would `sudo pkill python3` have signalled before your fix?",
      options: ["1", "2", "3", "5"],
      answer: 2,
      explanation:
        "pgrep python3 lists three: the notebook kernel (2650), metrics-agent.py (2710) and the dev server (4120). Only one of them was the problem.",
    },
    {
      id: "explain-term-vs-kill",
      kind: "explain",
      prompt: "Nadia asks why you used plain `kill` (SIGTERM) instead of `kill -9`. Explain the difference and when you'd escalate.",
      concepts: [
        { label: "SIGTERM asks the process to exit and lets it clean up", anyOf: ["clean up", "cleanup", "gracefully", "graceful", "flush", "finish", "shut down", "close files", "handler", "catch"] },
        { label: "SIGKILL is immediate and cannot be caught", anyOf: ["immediately", "immediate", "cannot be caught", "can't be caught", "cannot be ignored", "can't be ignored", "forcibly", "no chance", "kernel kills"] },
        { label: "Escalate to -9 only if TERM doesn't work", anyOf: ["only if", "if it doesn't", "if it does not", "still running", "last resort", "after a few seconds", "escalate", "doesn't exit", "does not exit"] },
      ],
      minConcepts: 2,
      explanation: "TERM lets a process clean up; KILL is a last resort when it ignores TERM.",
      modelAnswer:
        "kill sends SIGTERM, which asks the process to shut down gracefully so it can flush data, close files and remove lock files. kill -9 sends SIGKILL, which the kernel applies immediately and the process cannot catch, so it gets no chance to clean up. I'd only escalate to -9 as a last resort if the process is still running a few seconds after SIGTERM.",
    },
  ],
  debrief: {
    solution: `${F}bash
ps aux                         # 4388 reports 97.9% CPU 41% MEM report-backfill  <- runaway
sudo ss -tlnp                  # 0.0.0.0:8081 users:(("python3",pid=4120))       <- port holder
pgrep -a python3               # 2650 notebook, 2710 metrics-agent, 4120 dev server
sudo kill 4120 4388            # SIGTERM, by PID
sudo systemctl start tracker-api && curl -s http://127.0.0.1:8081/health
${F}

\`pkill -f dev_server.py\` and \`pkill -f report-backfill\` are equally precise and pass the checks — what matters is that the pattern matches exactly one process, which you confirm with \`pgrep -a\` first.`,
    commonMistakes: [
      "pkill python3 (or killall python3), which also kills unrelated Python processes such as the metrics agent and the notebook.",
      "pkill -u USER, which stops every process of that user, not just the culprit.",
      "Restarting the service repeatedly while the port is still held — the error cannot change.",
      "Running ss -tlnp without sudo and concluding nobody holds the port because the process column is empty.",
      "Reaching for kill -9 first, skipping the process's cleanup.",
    ],
    realWorld:
      "On real hosts you would also use top/htop (interactive), lsof -i :8081 or fuser 8081/tcp to find port holders, and systemd-cgls to see which unit a process belongs to. Long-running manual jobs are better started as transient units (systemd-run --unit=backfill ...) so they have resource limits and can be stopped with systemctl stop. The OOM kill itself would show up in journalctl -k.",
  },
  review: [
    {
      id: "lx-port-holder",
      skill: "lx.processes",
      variants: [
        {
          id: "lx-port-holder-a",
          kind: "short",
          prompt: "Write a command that shows which process is listening on TCP port 5432, including processes of other users.",
          accept: ["sudo ss -tlnp | grep 5432", "sudo ss -tlnp | grep :5432", "sudo ss -ltnp | grep 5432"],
          acceptPatterns: ["^sudo\\s+(ss|netstat)\\s+-[tlnp]{4}\\s*\\|\\s*grep\\s+['\"]?:?5432['\"]?$", "^sudo\\s+lsof\\s+-i\\s*:5432$"],
          explanation: "ss -tlnp lists listening TCP sockets with the owning process; sudo is needed to see other users' processes.",
        },
        {
          id: "lx-port-holder-b",
          kind: "mcq",
          prompt: "A service fails with `bind() to 0.0.0.0:80 failed (98: Address already in use)`. What is the most likely cause?",
          options: ["The firewall blocks port 80", "Another process is already listening on port 80", "The service user can't read its config", "DNS for the host is wrong"],
          answer: 1,
          explanation: "errno 98 EADDRINUSE: only one process can listen on a given address and port.",
        },
      ],
    },
    {
      id: "lx-signal-precision",
      skill: "lx.processes",
      variants: [
        {
          id: "lx-signal-precision-a",
          kind: "mcq",
          prompt: "`pgrep -a node` prints `1201 node /srv/dispatch/server.js` and `1877 node /home/aiko/scratch/test.js`. Aiko's test hogs the CPU. What do you run?",
          options: ["sudo pkill node", "sudo kill 1877", "sudo kill -9 1201", "sudo pkill -u aiko"],
          answer: 1,
          explanation: "Kill the specific PID. pkill node would also stop the dispatch server; pkill -u aiko kills all her processes.",
        },
        {
          id: "lx-signal-precision-b",
          kind: "mcq",
          prompt: "Which signal does `kill 4388` send?",
          options: ["SIGKILL (9)", "SIGTERM (15)", "SIGHUP (1)", "SIGSTOP (19)"],
          answer: 1,
          explanation: "With no signal option, kill sends SIGTERM, which asks the process to exit.",
        },
        {
          id: "lx-signal-precision-c",
          kind: "mcq",
          prompt: "You ran `kill 5120` and after 10 seconds `ps -p 5120` still shows it. What next?",
          options: ["Reboot the host", "kill -9 5120", "kill -1 5120", "pkill -9 -u root"],
          answer: 1,
          explanation: "If SIGTERM is ignored, escalate to SIGKILL for that one PID.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `web-01`, `nginx` won't start: `bind() to 0.0.0.0:80 failed (98: Address already in use)`. `sudo ss -tlnp` shows `users:((\"python3\",pid=3302,fd=4))` on port 80, and `ps aux` shows `aiko 3302 ... python3 -m http.server 80` started yesterday for a quick test. `pgrep -a python3` also lists `2201 python3 /opt/lumen/metrics-agent.py`.",
    question: {
      id: "transfer-port-80",
      kind: "order",
      prompt: "Order the steps to get nginx back with no collateral damage.",
      items: [
        "Confirm the holder with sudo ss -tlnp | grep ':80'",
        "Check the PID's owner and command with ps -p 3302 or pgrep -a python3",
        "sudo kill 3302",
        "Verify port 80 is free with sudo ss -tlnp",
        "sudo systemctl start nginx and check its status",
      ],
      explanation: "Identify, confirm, signal one PID, verify the port is free, then start the service — never pkill python3 with the metrics agent running.",
    },
  },
  refresher: {
    body: `Each process has a PID, an owner and a command line; \`ps aux\` lists them with %CPU and %MEM. Only one process can listen on a port, and \`sudo ss -tlnp\` shows which one.

\`kill PID\` sends SIGTERM ("please exit"); \`kill -9 PID\` sends SIGKILL ("stop now", no cleanup). Other users' processes need \`sudo\`. Name-based tools (\`pkill NAME\`) hit every match — check with \`pgrep -a NAME\` first, and prefer killing one PID.`,
    practice: {
      id: "refresher-ps-columns",
      kind: "mcq",
      prompt: "In `ps aux` output, which column tells you how much CPU a process is using?",
      options: ["PID", "%CPU", "VSZ", "STAT"],
      answer: 1,
      explanation: "%CPU is the share of CPU time; %MEM is memory; PID identifies the process.",
    },
  },
};
