import type { MissionInput } from "@/content/schema";

const F = "```";

const siteConf = `# /etc/nginx/sites-enabled/dispatch.conf — dispatch dashboard (web-01)
server {
    listen 80;
    server_name dispatch.lumen.internal;
    root /srv/www/dispatch;
    access_log /var/log/dispatch/access.log;

    location /api/ {
        proxy_pass http://127.0.0.1:8081
    }
}
`;

const fixedConf = siteConf.replace("proxy_pass http://127.0.0.1:8081\n", "proxy_pass http://127.0.0.1:8081;\n");

const changes = `web-01 change notes

Sat 28 Feb  aiko   testing new dashboard build: python3 -m http.server 80 in /home/aiko/dash-build (stopped nginx first)
Sun 01 Mar  dev    tidied dispatch.conf (merged the /api/ block), not reloaded yet
Sun 01 Mar  ops    log rotation fix: recreated /var/log/dispatch
Mon 02 Mar  ops    kernel patch + reboot at 05:30
`;

const dispatchJournal = [
  "Feb 28 16:02:11 web-01 systemd[1]: Stopping dispatch-web.service - Dispatch dashboard (nginx)...",
  "Feb 28 16:02:11 web-01 systemd[1]: dispatch-web.service: Deactivated successfully.",
  "Feb 28 16:02:11 web-01 systemd[1]: Stopped dispatch-web.service - Dispatch dashboard (nginx).",
  "Mar 02 05:31:20 web-01 systemd[1]: Starting dispatch-web.service - Dispatch dashboard (nginx)...",
  'Mar 02 05:31:20 web-01 nginx[611]: open() "/var/log/dispatch" failed (13: Permission denied)',
  "Mar 02 05:31:20 web-01 systemd[1]: dispatch-web.service: Main process exited, code=exited, status=1/FAILURE",
  "Mar 02 05:31:20 web-01 systemd[1]: dispatch-web.service: Failed with result 'exit-code'.",
  "Mar 02 05:31:20 web-01 systemd[1]: Failed to start dispatch-web.service - Dispatch dashboard (nginx).",
];

export const lxDispatchOutage: MissionInput = {
  slug: "lx-dispatch-outage",
  version: 1,
  track: "linux",
  tier: "advanced",
  order: 4,
  title: "The dashboard is down after the reboot, for more than one reason",
  summary:
    "After a patch reboot the dispatch dashboard and its API are down. Peel back several independent causes — permissions, a config typo, a port squatter, a unit not enabled — one verified fix at a time.",
  minutes: 45,
  assessmentTypes: ["configure-system", "investigate-logs", "order-steps", "explain-root-cause"],
  skills: ["lx.troubleshooting"],
  appliesSkills: ["lx.services", "lx.processes", "lx.permissions", "lx.logs", "lx.text-processing"],
  prerequisites: ["lx-config-permission-denied", "lx-feed-check-script"],
  brief: {
    from: "Aiko Tanaka, Frontend engineer",
    channel: "#incidents",
    body: `The dispatch dashboard on \`web-01\` has been down since the 05:30 patch reboot, and the first vans leave at 07:00. Dispatchers get "connection refused" on \`http://dispatch.lumen.internal\`.

\`dispatch-web\` (our nginx for the dashboard) fails to start, and I think the tracking API behind it (\`tracker-api\`, port 8081) never came up either. A few people touched this box over the weekend — I'm one of them, sorry — see \`/var/log/lumen/changes.txt\`.

Please get both running, make sure they **survive the next reboot**, and keep it tidy: no \`chmod 777\`, and don't kill the \`metrics-agent\` (it's how we know this box is alive). Priya wants a short list of every cause you found for the review.`,
  },
  objectives: [
    "Apply the observe–hypothesise–test–fix–verify loop repeatedly until the symptom is gone",
    "Recognise that fixing one cause can reveal the next, and re-read the evidence after each fix",
    "Combine service, process, permission and log skills in one investigation",
    "Verify end-to-end (HTTP from the host) and across a reboot (enabled units)",
  ],
  concept: {
    title: "Multi-cause outages: one hypothesis, one fix, re-observe",
    body: `Real outages after a reboot or a busy weekend often have **several independent causes**. A service checks its preconditions in order and reports only the **first** one that fails, so the error message changes as you fix things. That's progress, not a new problem.

The loop:

1. **Observe** — \`systemctl status\`, \`journalctl -u UNIT -n 20\`: the newest program line is the current blocker.
2. **Hypothesise one cause** from that line (and the change log).
3. **Test it directly** — \`sudo -u www-data touch DIR/x\`, \`sudo ss -tlnp\`, \`grep -n\` in the config.
4. **Fix the smallest thing** in a way you'd defend in review.
5. **Re-observe**: restart, read the journal again. New error? Back to 2.
6. **Verify end-to-end** from the user's perspective (\`curl\`), and for **persistence** (\`systemctl is-enabled\`) — a reboot caused this, so a reboot must not undo it.

Keep a list as you go: each cause, the evidence, the fix. It becomes the incident write-up, and it stops you "fixing" the same thing twice. Resist shotgun fixes (\`chmod -R 777\`, \`pkill python3\`, \`reboot\` again): they destroy evidence and create new incidents.`,
  },
  simulationNote:
    "Both services are simulated systemd units. dispatch-web checks, in order, that www-data can write its log directory, that the site config contains a valid proxy_pass line, and that port 80 is free; each failure writes its own journal line. HTTP requests with curl are answered by the simulated services. There is no real nginx -t here; on a real host you would run it before every restart.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T06:20:00Z",
      hosts: [
        {
          name: "web-01",
          users: [
            { name: "ops", uid: 1000, groups: ["sudo", "adm"], home: "/home/ops" },
            { name: "aiko", uid: 1003, groups: [], home: "/home/aiko" },
            { name: "lena", uid: 1005, groups: [], home: "/home/lena" },
            { name: "www-data", uid: 33, groups: [], home: "/var/www", shell: "/usr/sbin/nologin" },
            { name: "tracker", uid: 995, groups: [], home: "/srv/tracker", shell: "/usr/sbin/nologin" },
            { name: "prometheus", uid: 993, groups: [], home: "/var/lib/prometheus", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/etc/nginx", type: "dir", mode: "0755" },
            { path: "/etc/nginx/sites-enabled", type: "dir", mode: "0755" },
            { path: "/etc/nginx/sites-enabled/dispatch.conf", content: siteConf, mode: "0644" },
            { path: "/srv/www/dispatch", type: "dir", mode: "0755" },
            { path: "/srv/www/dispatch/index.html", content: "<!doctype html><title>Lumen dispatch</title>\n", mode: "0644" },
            { path: "/var/log/dispatch", type: "dir", mode: "0755", owner: "root", group: "root" },
            { path: "/var/log/lumen", type: "dir", mode: "0755" },
            { path: "/var/log/lumen/changes.txt", content: changes },
            { path: "/etc/tracker", type: "dir", mode: "0755" },
            { path: "/etc/tracker/api.yml", content: "listen: 0.0.0.0:8081\ndb_host: db-01.lumen.internal\n", mode: "0644" },
            { path: "/home/aiko/dash-build", type: "dir", owner: "aiko", group: "aiko" },
            { path: "/home/aiko/dash-build/index.html", content: "<!doctype html><title>dash TEST build</title>\n", owner: "aiko", group: "aiko" },
          ],
          processes: [
            { pid: 702, user: "prometheus", command: "python3 /opt/lumen/metrics-agent.py --listen :9100", cpu: 0.6, mem: 0.9, listens: [{ port: 9100, proto: "tcp" }] },
            { pid: 3302, user: "aiko", command: "python3 -m http.server 80 --directory /home/aiko/dash-build", cpu: 0.0, mem: 0.6, listens: [{ port: 80, proto: "tcp" }] },
          ],
          services: [
            {
              name: "dispatch-web",
              description: "Dispatch dashboard (nginx)",
              execUser: "www-data",
              command: "/usr/sbin/nginx -c /etc/nginx/nginx.conf -g daemon off;",
              state: "failed",
              enabled: true,
              requiresReadable: ["/etc/nginx/sites-enabled/dispatch.conf", "/srv/www/dispatch/index.html"],
              requiresWritable: ["/var/log/dispatch"],
              configChecks: [
                {
                  path: "/etc/nginx/sites-enabled/dispatch.conf",
                  pattern: "^\\s*proxy_pass\\s+http://127\\.0\\.0\\.1:8081/?;\\s*$",
                  error: 'nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/dispatch.conf:10',
                },
              ],
              listens: [{ port: 80, proto: "tcp" }],
              http: [
                { path: "/", status: 200, body: "<!doctype html><title>Lumen dispatch</title>\n" },
                { path: "/health", status: 200, body: "ok\n" },
              ],
              kind: "http",
              journal: dispatchJournal,
            },
            {
              name: "tracker-api",
              description: "Lumen tracking API",
              execUser: "tracker",
              command: "/srv/tracker/bin/tracker-api --config /etc/tracker/api.yml",
              state: "inactive",
              enabled: false,
              requiresReadable: ["/etc/tracker/api.yml"],
              listens: [{ port: 8081, proto: "tcp" }],
              http: [{ path: "/health", status: 200, body: "ok\n" }],
              kind: "http",
            },
          ],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
        },
      ],
      segments: [{ name: "srv", cidr: "10.20.1.0/24" }],
      start: { host: "web-01", user: "ops" },
    },
    checks: [
      {
        id: "dashboard-serving",
        name: "dispatch-web is running and serves the real dashboard on port 80",
        assert: {
          type: "all",
          of: [
            { type: "service_state", service: "dispatch-web", state: "active" },
            { type: "command_output", run: "curl -s http://127.0.0.1/", pattern: "<title>Lumen dispatch</title>" },
          ],
        },
        feedback: {
          what: "dispatch-web is not active, or http://127.0.0.1/ does not return the production dashboard.",
          why: "Dispatchers need the dashboard before 07:00. If Aiko's test server still answers on port 80, they see a test build instead.",
          next: "Read journalctl -u dispatch-web -n 5 after every start attempt: the newest nginx line is the current blocker. Fix it, sudo systemctl restart dispatch-web, and repeat until it is active.",
        },
      },
      {
        id: "api-serving-and-boot",
        name: "tracker-api answers on 8081, and both units start at boot",
        assert: {
          type: "all",
          of: [
            { type: "http_status", from: "web-01", url: "http://127.0.0.1:8081/health", status: 200 },
            { type: "service_enabled", service: "tracker-api", enabled: true },
            { type: "service_enabled", service: "dispatch-web", enabled: true },
          ],
        },
        feedback: {
          what: "tracker-api is not answering on 127.0.0.1:8081/health, or tracker-api / dispatch-web is not enabled.",
          why: "The dashboard proxies /api/ to tracker-api; without it every data panel fails. It didn't come back after the reboot because it was never enabled, so the next reboot would repeat the outage.",
          next: "sudo systemctl enable --now tracker-api, then curl -s http://127.0.0.1:8081/health and systemctl is-enabled tracker-api dispatch-web.",
        },
      },
      {
        id: "tidy-fixes",
        name: "Fixes are least-privilege and nothing else was harmed",
        assert: {
          type: "all",
          of: [
            { type: "access", path: "/var/log/dispatch", user: "www-data", access: "w", expect: true },
            { type: "access", path: "/var/log/dispatch", user: "lena", access: "w", expect: false },
            { type: "mode_max", path: "/var/log/dispatch", max: "0775" },
            { type: "process_running", pattern: "metrics-agent\\.py", expect: true },
            { type: "process_running", pattern: "http\\.server 80", expect: false },
            { type: "file_matches", path: "/etc/nginx/sites-enabled/dispatch.conf", pattern: "^\\s*root /srv/www/dispatch;" },
          ],
        },
        feedback: {
          what: "Something was fixed too broadly: /var/log/dispatch is writable by ordinary users or wider than 775, the metrics agent was stopped, Aiko's test server is still running, or the site config lost other lines.",
          why: "A world-writable log directory lets anyone forge or fill the logs; pkill python3 kills monitoring; rewriting the config drops settings that were correct.",
          next: "Give the directory to the service user (sudo chown www-data /var/log/dispatch), stop only PID of the http.server process (sudo kill PID), and change only the proxy_pass line.",
        },
      },
    ],
    solution: [
      "cat /var/log/lumen/changes.txt",
      "systemctl status dispatch-web",
      "journalctl -u dispatch-web -n 5 --no-pager",
      "ls -ld /var/log/dispatch",
      "sudo chown www-data:www-data /var/log/dispatch",
      "sudo systemctl restart dispatch-web",
      "journalctl -u dispatch-web -n 5 --no-pager",
      "grep -n proxy_pass /etc/nginx/sites-enabled/dispatch.conf",
      "sudo sed -i 's|proxy_pass http://127.0.0.1:8081$|proxy_pass http://127.0.0.1:8081;|' /etc/nginx/sites-enabled/dispatch.conf",
      "sudo systemctl restart dispatch-web",
      "journalctl -u dispatch-web -n 5 --no-pager",
      "sudo ss -tlnp | grep ':80 '",
      "ps -p 3302",
      "sudo kill 3302",
      "sudo systemctl restart dispatch-web",
      "systemctl status tracker-api",
      "sudo systemctl enable --now tracker-api",
      "curl -s http://127.0.0.1/",
      "curl -s http://127.0.0.1:8081/health",
      "systemctl is-enabled dispatch-web tracker-api",
    ],
    wrongSolutions: [
      {
        label: "Shotgun: chmod -R 777 the log directory and pkill python3",
        steps: [
          "sudo chmod -R 777 /var/log/dispatch",
          "sudo sed -i 's|proxy_pass http://127.0.0.1:8081$|proxy_pass http://127.0.0.1:8081;|' /etc/nginx/sites-enabled/dispatch.conf",
          "sudo pkill python3",
          "sudo systemctl restart dispatch-web",
          "sudo systemctl enable --now tracker-api",
        ],
      },
      {
        label: "Fixes dispatch-web but only starts tracker-api (not enabled)",
        steps: [
          "sudo chown www-data /var/log/dispatch",
          "sudo sed -i 's|proxy_pass http://127.0.0.1:8081$|proxy_pass http://127.0.0.1:8081;|' /etc/nginx/sites-enabled/dispatch.conf",
          "sudo kill 3302",
          "sudo systemctl restart dispatch-web",
          "sudo systemctl start tracker-api",
        ],
      },
      {
        label: "Stops after the first two fixes; Aiko's test server still holds port 80",
        steps: [
          "sudo chown www-data /var/log/dispatch",
          "sudo sed -i 's|proxy_pass http://127.0.0.1:8081$|proxy_pass http://127.0.0.1:8081;|' /etc/nginx/sites-enabled/dispatch.conf",
          "sudo systemctl restart dispatch-web",
          "sudo systemctl enable --now tracker-api",
        ],
      },
      {
        label: "Rewrites the site config from memory, dropping the root directive",
        steps: [
          "sudo chown www-data /var/log/dispatch",
          "printf 'server {\\n    listen 80;\\n    location /api/ {\\n        proxy_pass http://127.0.0.1:8081;\\n    }\\n}\\n' | sudo tee /etc/nginx/sites-enabled/dispatch.conf",
          "sudo kill 3302",
          "sudo systemctl restart dispatch-web",
          "sudo systemctl enable --now tracker-api",
        ],
      },
    ],
    starterCommands: ["cat /var/log/lumen/changes.txt", "systemctl status dispatch-web", "journalctl -u dispatch-web -n 5", "systemctl list-units --all --type=service"],
  },
  successCriteria: [
    "dispatch-web is active and http://127.0.0.1/ returns the production dashboard",
    "tracker-api answers on 127.0.0.1:8081/health, and both units are enabled",
    "www-data (not everyone) can write /var/log/dispatch, the metrics agent still runs, Aiko's test server is stopped, and the rest of the site config is intact",
  ],
  hints: [
    "Start with `journalctl -u dispatch-web -n 5` and `/var/log/lumen/changes.txt`. The change notes list three weekend changes to this service; expect each to matter. Fix one, restart, and read the journal again.",
    "First blocker: www-data can't write `/var/log/dispatch` (`ls -ld` it). Give the directory to the service user rather than opening it to everyone.",
    "Next: nginx's own error points at line 10 of `dispatch.conf`, but the real mistake is the line *before* the `}`. `grep -n proxy_pass` it. After that: `bind() ... 80 ... Address already in use` — `sudo ss -tlnp` and the change notes tell you whose process it is.",
    "`sudo chown www-data /var/log/dispatch`; add the missing `;` to the proxy_pass line with `sudo sed -i`; `sudo kill 3302`; `sudo systemctl restart dispatch-web`; then `sudo systemctl enable --now tracker-api`. Verify with `curl -s http://127.0.0.1/`, `curl -s http://127.0.0.1:8081/health` and `systemctl is-enabled dispatch-web tracker-api`.",
  ],
  questions: [
    {
      id: "order-causes",
      kind: "order",
      prompt: "In what order did dispatch-web report its blockers as you fixed them?",
      items: [
        "open() \"/var/log/dispatch\" failed (13: Permission denied)",
        "nginx: [emerg] unexpected \"}\" in dispatch.conf:10",
        "bind() to 0.0.0.0:80 failed (98: Address already in use)",
        "Started dispatch-web.service",
      ],
      explanation:
        "Each start attempt reports only the first failing precondition. Fixing it reveals the next — which is why you re-read the journal after every fix instead of assuming the first error was the only one.",
    },
    {
      id: "interpret-line-10",
      kind: "mcq",
      prompt: "nginx says `unexpected \"}\" in dispatch.conf:10`, but line 10 is just `}`. Where is the mistake?",
      options: [
        "Line 10: the brace is wrong",
        "Line 9: proxy_pass is missing its terminating ';', so nginx reads on and hits the '}'",
        "Line 1: the comment",
        "The file is fine; nginx is wrong",
      ],
      answer: 1,
      explanation: "Parsers report where they noticed the problem, which is often just after the real mistake.",
    },
    {
      id: "explain-all-causes",
      kind: "explain",
      prompt: "Write the cause list for Priya's review: each independent cause and how you fixed it.",
      concepts: [
        { label: "Log directory not writable by www-data", anyOf: ["log directory", "/var/log/dispatch", "www-data", "permission denied", "chown"] },
        { label: "Config syntax error: missing semicolon on proxy_pass", anyOf: ["semicolon", "missing ;", "proxy_pass", "syntax", "dispatch.conf"] },
        { label: "Port 80 held by Aiko's test http.server", anyOf: ["port 80", "http.server", "address already in use", "3302", "test server", "aiko"] },
        { label: "tracker-api not enabled, so it didn't start at boot", anyOf: ["not enabled", "enable", "boot", "reboot", "disabled", "tracker-api"] },
      ],
      minConcepts: 3,
      explanation: "Four independent causes, each with its own evidence and fix. The reboot didn't cause them; it exposed them.",
      modelAnswer:
        "The reboot exposed four weekend changes. First, /var/log/dispatch had been recreated as root:root 755, so www-data got Permission denied; I chowned it to www-data instead of making it 777. Second, Dev's tidy-up of dispatch.conf left the proxy_pass line without its semicolon, which nginx reported at the closing brace on line 10; I added the ;. Third, Aiko's python3 http.server test (PID 3302) still held port 80, so I killed only that PID. Fourth, tracker-api was never enabled, so it did not start at boot; I ran enable --now. Both units are now enabled and curl returns the dashboard and the API health check.",
    },
  ],
  debrief: {
    solution: `${F}text
cause                         evidence                                        fix
log dir root:root 755         nginx: open() "/var/log/dispatch" (13)          chown www-data /var/log/dispatch
proxy_pass missing ';'        [emerg] unexpected "}" ... :10                  sed: add ';' on line 9
port 80 held by test server   bind() ... (98), ss: python3 pid=3302 (aiko)    kill 3302
tracker-api never enabled     inactive + disabled after reboot                systemctl enable --now tracker-api
${F}

Each start attempt surfaced the next blocker; the journal was the guide every time. Equivalent fixes pass: \`chgrp www-data\` + \`chmod 775\` on the log directory, \`pkill -f 'http.server 80'\`, or editing the config another way as long as only that line changes. The end-to-end test — \`curl\` the dashboard and the API, and \`is-enabled\` both units — is what proves the incident is over, including after the next reboot.`,
    commonMistakes: [
      "Stopping after the first fix because the error changed, and declaring victory without re-checking.",
      "chmod -R 777 on the log directory instead of giving it to the service user.",
      "pkill python3 to free port 80, which also stops the metrics agent.",
      "Fixing the line nginx names (the brace) instead of the line before it.",
      "Starting tracker-api without enabling it, so the next reboot reproduces half the outage.",
      "Rewriting a config file from memory and silently losing directives such as root.",
    ],
    realWorld:
      "On real hosts, nginx -t validates config before restart, and systemctl list-units --failed plus systemd-analyze blame show what didn't come up after a reboot. Many teams add a post-reboot smoke test (curl the key endpoints) to the patching runbook, and keep weekend experiments off production ports. A blameless write-up lists every contributing cause like the table above, because fixing only the 'last' one leaves the others waiting for the next reboot.",
  },
  review: [
    {
      id: "lx-first-failure-only",
      skill: "lx.troubleshooting",
      variants: [
        {
          id: "lx-first-failure-only-a",
          kind: "mcq",
          prompt: "You fixed a permission error and restarted the service. It fails again, now with `Address already in use`. What does that mean?",
          options: [
            "Your permission fix broke something",
            "Progress: the first blocker is gone and the next precondition is failing",
            "You need to reboot",
            "The journal is stale",
          ],
          answer: 1,
          explanation: "Services report the first failing check. A new error after a fix usually means the fix worked and there is another cause.",
        },
        {
          id: "lx-first-failure-only-b",
          kind: "mcq",
          prompt: "After fixing three causes, `systemctl status app` says active. What do you still check before closing the incident?",
          options: [
            "Nothing; active means done",
            "An end-to-end request (curl) and systemctl is-enabled for every unit involved",
            "Reboot twice",
            "Delete the journal",
          ],
          answer: 1,
          explanation: "Verify from the user's perspective and for persistence: running now is not the same as working, or as surviving a reboot.",
        },
      ],
    },
    {
      id: "lx-avoid-shotgun",
      skill: "lx.troubleshooting",
      variants: [
        {
          id: "lx-avoid-shotgun-a",
          kind: "mcq",
          prompt: "A service can't write `/var/log/app` (`drwxr-xr-x root root`). It runs as `appsvc`. Which fix is best?",
          options: ["sudo chmod 777 /var/log/app", "sudo chown appsvc /var/log/app", "Run the service as root", "sudo chmod -R 777 /var/log"],
          answer: 1,
          explanation: "Give the service user what it needs and nobody else anything extra.",
        },
        {
          id: "lx-avoid-shotgun-b",
          kind: "mcq",
          prompt: "Port 80 is held by `python3 -m http.server 80` (PID 3302). Another python3 process runs the metrics agent. What do you run?",
          options: ["sudo pkill python3", "sudo kill 3302", "sudo reboot", "sudo killall -9 python3"],
          answer: 1,
          explanation: "Target the one PID; name-based kills take out monitoring too.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "After a weekend migration, `label-render` on `ops-ws` fails. The journal's newest line is `label-render[880]: open() \"/var/spool/labels\" failed (13: Permission denied)`. The change notes say: spool directory recreated by root; label templates moved to /srv/labels; unit file unchanged. `systemctl is-enabled label-render` prints `enabled`.",
    question: {
      id: "transfer-label-render",
      kind: "order",
      prompt: "Order your next steps.",
      items: [
        "ls -ld /var/spool/labels and check the unit's User=",
        "Give that user write access to the spool directory (chown/chgrp), not 777",
        "Restart label-render and read the newest journal line again",
        "If a new error appears (e.g. the moved templates), fix that cause next",
        "Verify end-to-end (print a test label) and that the unit is still enabled",
      ],
      explanation: "One verified fix at a time, re-reading the evidence after each, then verify the outcome and persistence.",
    },
  },
  refresher: {
    body: `When a service fails, it tells you about the **first** thing that's wrong. Fix that, restart, and read \`journalctl -u UNIT -n 5\` again: a different error means you made progress and found the next cause.

Keep a list of cause → evidence → fix as you go. Make each fix small and least-privilege (chown to the service user, kill one PID, change one config line). Finish with an end-to-end test (\`curl\`) and \`systemctl is-enabled\` so a reboot can't bring the outage back.`,
    practice: {
      id: "refresher-reread",
      kind: "mcq",
      prompt: "You fixed a config error and restarted, but the service still fails. What's the best next step?",
      options: ["Undo your fix", "Read the newest journal line for the unit again", "Reboot", "chmod 777 the config"],
      answer: 1,
      explanation: "The current blocker is whatever the newest program line says; it may be a different cause.",
    },
  },
};
