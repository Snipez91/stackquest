import type { MissionInput } from "@/content/schema";
import { OPS, BIND_USER, LUMEN_ZONE, WWW_USER, dispatchNginx, gateway, resolvConf } from "./lab";

const namedOptions = `// /etc/bind/named.conf.options
options {
    directory "/var/cache/bind";
    // CHG-4502 (maintenance 2026-11-05 22:00): restrict while testing new zone
    listen-on { 127.0.0.1; };
    allow-query { 192.168.50.0/24; 10.20.0.0/16; localhost; };
    recursion no;
};
`;

const maintLog = `Maintenance window 2026-11-05 22:00-02:00 (CHG-4502) - change log
22:05 dns-01   restricted named listen-on to localhost while testing the new zone file
22:40 web-01   enabled ufw (security baseline: default deny, allow ssh)
23:10 api-01   kernel update + reboot
23:30 web-01   metrics-agent disabled (being replaced, ignore its alerts)
01:55 window closed - "all services verified" (nobody tested from the office)
`;

export const netCompoundOutage: MissionInput = {
  slug: "net-compound-outage",
  version: 1,
  track: "networking",
  tier: "advanced",
  order: 4,
  title: "After the maintenance window, nothing works from the office",
  summary:
    "The morning after a maintenance window, the dispatch dashboard is unusable from the office. Faults on several hosts hide behind each other: diagnose layer by layer, fix each narrowly, verify end to end.",
  minutes: 50,
  assessmentTypes: ["configure-system", "investigate-logs", "order-steps", "explain-root-cause"],
  skills: ["net.troubleshooting"],
  appliesSkills: ["net.dns", "net.ports", "net.firewalls", "net.tcp-udp", "net.http", "net.tcpip-model", "net.routing"],
  prerequisites: ["net-tcp-udp-dns", "net-tls-certificates"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `SEV-2. Since 06:00 the Atlanta night-to-day handover can't use the **dispatch dashboard** from the office (\`ops-ws\`). Last night's maintenance touched dns-01, web-01 and api-01 (log in \`~/maint-log.txt\`) and was signed off as "all services verified".

What I know: the browser says the name can't be found. When I typed the IP, it spun and timed out. Once the dashboard loads it also needs the tracking API (web-01 → \`api.lumen.internal:8080\`).

I suspect more than one thing is broken. Please work through it methodically, fix each fault with the narrowest change, don't disable any firewall, and give me a short write-up of what was wrong where.`,
  },
  objectives: [
    "Apply a layered method across several hosts: confirm or eliminate one layer before moving on",
    "Recognise that fixing one fault can reveal the next, and re-test the original symptom after each fix",
    "Separate real faults from noise (alerts about intentionally disabled services)",
    "Fix each fault narrowly and verify end to end from the user's location",
  ],
  concept: {
    title: "Compound faults: peel them one at a time",
    body: `Real outages often have several independent causes. They **mask** each other: while DNS is broken you can't observe that the web server is firewalled, and while the web server is unreachable you can't see that its backend is down. A method keeps you from fixing things at random:

1. **Reproduce from the user's location**, with the exact request (\`curl -v http://dispatch.lumen.internal/\`).
2. **Split by layer.** Does the name resolve (\`dig\`)? Does the IP answer (\`ping\`, \`nc -zv ip port\`)? Does HTTP answer (\`curl -I\`)? Each answer eliminates or isolates a layer.
3. **Read the error precisely.** *timed out* (filtered or no path), *refused* (nothing listening), *NXDOMAIN* (server answered: no such name), *no servers could be reached* (no DNS reply at all).
4. **Go to the host that owns the failing layer** and look at its config, listeners (\`ss -lntup\`), firewall (\`ufw status\`) and services (\`systemctl\`, \`journalctl\`).
5. **Fix one fault, then re-test the original symptom.** The error should change — that change is your next clue.
6. **Use change logs as leads, not as truth.** They tell you where to look; the system state tells you what's wrong — and some log lines are irrelevant.

Stop only when the user's original request works, from the user's location.`,
  },
  simulationNote:
    "Five lab hosts are simulated: DNS (named with listen-on read from named.conf.options at start), ufw, services and HTTP. There is no real BIND, no browser and no tracking data behind /health; the dispatch dashboard's dependency on the API is checked from web-01 directly.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-06T06:40:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53"), { path: "/home/ops/maint-log.txt", content: maintLog, owner: "ops", group: "ops" }],
        },
        gateway(),
        {
          name: "dns-01",
          users: [OPS, BIND_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.53/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("127.0.0.1"), { path: "/etc/bind/named.conf.options", content: namedOptions }],
          services: [
            {
              name: "named",
              description: "BIND Domain Name Server",
              execUser: "bind",
              command: "/usr/sbin/named -f -u bind",
              state: "active",
              enabled: true,
              kind: "dns",
              requiresReadable: ["/etc/bind/named.conf.options"],
              listens: [
                { port: 53, proto: "udp", address: "127.0.0.1" },
                { port: 53, proto: "tcp", address: "127.0.0.1" },
              ],
              listenFrom: { path: "/etc/bind/named.conf.options", addressPattern: "^\\s*listen-on\\s*\\{\\s*(any|[0-9.]+)\\s*;" },
              journal: [
                "Nov 05 22:05:31 dns-01 named[2210]: listening on IPv4 interface lo, 127.0.0.1#53",
                "Nov 05 22:05:31 dns-01 named[2210]: all zones loaded",
                "Nov 05 22:05:31 dns-01 named[2210]: running",
              ],
            },
          ],
          dnsZones: LUMEN_ZONE,
        },
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53")],
          services: [
            dispatchNginx,
            {
              name: "metrics-agent",
              description: "Legacy metrics agent (being replaced)",
              execUser: "root",
              command: "/opt/metrics-agent/bin/agent",
              state: "inactive",
              enabled: false,
              journal: ["Nov 05 23:30:02 web-01 systemd[1]: Stopped metrics-agent.service - Legacy metrics agent (being replaced)."],
            },
          ],
          firewall: {
            enabled: true,
            defaultInbound: "deny",
            rules: [
              { action: "allow", port: 22, proto: "tcp", from: "192.168.50.0/24" },
              { action: "allow", port: 22, proto: "tcp", from: "10.20.1.0/24" },
            ],
          },
        },
        {
          name: "api-01",
          users: [OPS, { name: "tracking", uid: 1101, home: "/opt/tracking-api", shell: "/usr/sbin/nologin" }],
          interfaces: [{ name: "eth0", address: "10.20.1.20/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53")],
          services: [
            {
              name: "tracking-api",
              description: "Lumen tracking API",
              execUser: "tracking",
              command: "/opt/tracking-api/bin/tracking-api --port 8080",
              state: "inactive",
              enabled: false,
              kind: "http",
              listens: [{ port: 8080, proto: "tcp" }],
              http: [{ path: "/health", status: 200, body: "{\"status\":\"ok\"}\n" }],
            },
          ],
        },
      ],
      segments: [
        { name: "office", cidr: "192.168.50.0/24" },
        { name: "servers", cidr: "10.20.1.0/24" },
      ],
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "dns-for-office",
        name: "ops-ws resolves dispatch.lumen.internal through dns-01",
        assert: { type: "command_output", host: "ops-ws", run: "dig +short dispatch.lumen.internal", pattern: "^10\\.20\\.1\\.10$" },
        feedback: {
          what: "`dig +short dispatch.lumen.internal` on ops-ws does not return 10.20.1.10.",
          why: "Every user in the office resolves through dns-01. An /etc/hosts entry on one workstation hides the problem for one name and one machine only (and dig ignores it).",
          next: "Compare `dig @10.20.1.53 dispatch.lumen.internal` from ops-ws with `dig @127.0.0.1 ...` on dns-01, then look at `sudo ss -lunp` and /etc/bind/named.conf.options on dns-01. named reads listen-on at startup.",
        },
      },
      {
        id: "dashboard-from-office",
        name: "The dashboard loads from ops-ws, and web-01's firewall stays on",
        assert: {
          type: "all",
          of: [
            { type: "http_status", from: "ops-ws", url: "http://dispatch.lumen.internal/", status: 200 },
            { type: "command_output", host: "web-01", run: "sudo ufw status verbose", pattern: "Status: active[\\s\\S]*Default: deny \\(incoming\\)" },
          ],
        },
        feedback: {
          what: "http://dispatch.lumen.internal/ doesn't return 200 from ops-ws, or ufw on web-01 is no longer active with default-deny.",
          why: "Once DNS works, a timeout to web-01 port 80 while ping works points at a filter. The security baseline (default deny) must stay — add the narrow allow it was missing.",
          next: "On web-01: `sudo ufw status numbered`, then e.g. `sudo ufw allow from 192.168.50.0/24 to any port 80 proto tcp`.",
        },
      },
      {
        id: "dashboard-backend",
        name: "web-01 reaches the tracking API by name, and it survives a reboot",
        assert: {
          type: "all",
          of: [
            { type: "http_status", from: "web-01", url: "http://api.lumen.internal:8080/health", status: 200 },
            { type: "service_enabled", host: "api-01", service: "tracking-api", enabled: true },
          ],
        },
        feedback: {
          what: "From web-01, http://api.lumen.internal:8080/health doesn't return 200, or tracking-api isn't enabled at boot on api-01.",
          why: "The dashboard is useless without tracking data. A service that is started but not enabled disappears at the next reboot — which is exactly what happened at 23:10.",
          next: "Test from web-01 (`ssh web-01 curl -s http://api.lumen.internal:8080/health`). Refused → check `systemctl status tracking-api` on api-01 and use `sudo systemctl enable --now tracking-api`.",
        },
      },
    ],
    solution: [
      "cat ~/maint-log.txt",
      "curl -v http://dispatch.lumen.internal/",
      "dig @10.20.1.53 dispatch.lumen.internal",
      "ping -c 1 10.20.1.53",
      "ssh 10.20.1.53",
      "dig +short @127.0.0.1 dispatch.lumen.internal",
      "sudo ss -lunp",
      "cat /etc/bind/named.conf.options",
      "sudo sed -i 's/listen-on { 127.0.0.1; };/listen-on { any; };/' /etc/bind/named.conf.options",
      "sudo systemctl restart named",
      "sudo ss -lunp",
      "exit",
      "dig +short dispatch.lumen.internal",
      "curl -I --max-time 5 http://dispatch.lumen.internal/",
      "ping -c 1 web-01.lumen.internal",
      "ssh web-01",
      "sudo ufw status numbered",
      "sudo ufw allow from 192.168.50.0/24 to any port 80 proto tcp",
      "curl -s http://api.lumen.internal:8080/health",
      "ssh api-01",
      "systemctl status tracking-api",
      "sudo systemctl enable --now tracking-api",
      "exit",
      "curl -s http://api.lumen.internal:8080/health",
      "exit",
      "curl -I http://dispatch.lumen.internal/",
    ],
    wrongSolutions: [
      {
        label: "Works around DNS with /etc/hosts and disables web-01's firewall",
        steps: [
          "echo '10.20.1.10 dispatch.lumen.internal' | sudo tee -a /etc/hosts",
          "ssh web-01",
          "sudo ufw disable",
          "ssh api-01",
          "sudo systemctl enable --now tracking-api",
          "exit",
          "exit",
        ],
      },
      {
        label: "Fixes DNS and the firewall but only starts the API (not enabled)",
        steps: [
          "ssh 10.20.1.53",
          "sudo sed -i 's/listen-on { 127.0.0.1; };/listen-on { any; };/' /etc/bind/named.conf.options",
          "sudo systemctl restart named",
          "exit",
          "ssh web-01",
          "sudo ufw allow from 192.168.50.0/24 to any port 80 proto tcp",
          "exit",
          "ssh api-01",
          "sudo systemctl start tracking-api",
          "exit",
        ],
      },
      {
        label: "Edits named's config but never restarts it",
        steps: [
          "ssh 10.20.1.53",
          "sudo sed -i 's/listen-on { 127.0.0.1; };/listen-on { any; };/' /etc/bind/named.conf.options",
          "exit",
          "ssh web-01",
          "sudo ufw allow from 192.168.50.0/24 to any port 80 proto tcp",
          "exit",
          "ssh api-01",
          "sudo systemctl enable --now tracking-api",
          "exit",
        ],
      },
      {
        label: "Chases the metrics-agent alert and stops after DNS",
        steps: [
          "ssh 10.20.1.53",
          "sudo sed -i 's/listen-on { 127.0.0.1; };/listen-on { any; };/' /etc/bind/named.conf.options",
          "sudo systemctl restart named",
          "exit",
          "ssh web-01",
          "sudo systemctl start metrics-agent",
          "exit",
        ],
      },
    ],
    starterCommands: ["cat ~/maint-log.txt", "curl -v http://dispatch.lumen.internal/", "dig @10.20.1.53 dispatch.lumen.internal", "ping -c 1 10.20.1.10"],
  },
  successCriteria: [
    "dig on ops-ws resolves dispatch.lumen.internal via dns-01",
    "The dashboard loads from ops-ws with web-01's firewall still active and default-deny",
    "web-01 reaches http://api.lumen.internal:8080/health, and tracking-api is enabled on api-01",
  ],
  hints: [
    "Reproduce first: `curl -v http://dispatch.lumen.internal/` on ops-ws. Then split the problem: does `dig @10.20.1.53 dispatch.lumen.internal` get an answer? Does `ping 10.20.1.53` work? Treat ~/maint-log.txt as a list of suspects.",
    "dns-01 answers ping, but DNS queries are refused. On dns-01 (`ssh 10.20.1.53`), compare `dig @127.0.0.1 ...` with what ops-ws sees, and check the Local Address of named in `sudo ss -lunp`.",
    "named listens only on 127.0.0.1 because of `listen-on { 127.0.0.1; };`. Change it to `listen-on { any; };` and restart named. Then re-test the dashboard from ops-ws: the error changes. What does a timeout to web-01 port 80, while ping works, suggest?",
    "On web-01, ufw only allows SSH: add `sudo ufw allow from 192.168.50.0/24 to any port 80 proto tcp`. Then from web-01 `curl -s http://api.lumen.internal:8080/health` is refused: on api-01, `sudo systemctl enable --now tracking-api` (it never came back after the reboot). Ignore metrics-agent — the log says it was disabled on purpose.",
  ],
  questions: [
    {
      id: "order-error-progression",
      kind: "order",
      prompt: "As you fix the faults one at a time, the office's symptom changes. Order the errors as you meet them, from the initial state to the end.",
      items: [
        "curl: (6) Could not resolve host: dispatch.lumen.internal",
        "curl: (28) Failed to connect to dispatch.lumen.internal port 80: Connection timed out",
        "Dashboard loads, but web-01 → api.lumen.internal:8080 is refused",
        "Dashboard and API both return 200",
      ],
      explanation:
        "DNS failed first and hid everything else. With DNS fixed, the firewall on web-01 dropped port 80 (timeout). With that fixed, the backend was refused because tracking-api wasn't running. Each fix exposed the next layer.",
    },
    {
      id: "interpret-dns-refused",
      kind: "mcq",
      prompt: "From ops-ws, `dig @10.20.1.53 dispatch.lumen.internal` reported `connection refused`, while on dns-01 `dig @127.0.0.1 dispatch.lumen.internal` answered 10.20.1.10. What does that isolate?",
      options: [
        "The zone is missing the record",
        "The route to dns-01 is broken",
        "named works and has the record, but isn't listening on dns-01's network address",
        "A firewall on dns-01 drops port 53",
      ],
      answer: 2,
      explanation:
        "The record exists (local answer) and the host is reachable (a refusal is an active reply; a firewall drop would time out). That leaves the bind address — confirmed by `ss` showing 127.0.0.1:53.",
    },
    {
      id: "explain-writeup",
      kind: "explain",
      prompt: "Write Priya's short incident summary: the faults you found, on which host, how each was fixed, and why the maintenance sign-off missed them.",
      concepts: [
        { label: "DNS: named listening only on localhost (listen-on 127.0.0.1) on dns-01", anyOf: ["listen-on", "localhost", "127.0.0.1", "named", "dns-01", "bind address"] },
        { label: "Firewall on web-01 blocked port 80; added a narrow allow", anyOf: ["ufw", "firewall", "port 80", "web-01", "default deny", "allow from"] },
        { label: "tracking-api on api-01 not running / not enabled after reboot", anyOf: ["tracking-api", "api-01", "enable", "enabled", "reboot", "not running", "inactive"] },
        { label: "Nobody tested from the office / end to end", anyOf: ["office", "end to end", "end-to-end", "user's location", "from the client", "only tested locally", "nobody tested", "locally"] },
      ],
      minConcepts: 3,
      explanation: "Three independent faults on three hosts, each invisible while the one before it was broken; local checks passed for each.",
      modelAnswer:
        "Three faults from the maintenance window. 1) dns-01: named had listen-on { 127.0.0.1; }, so it only answered localhost and the office got 'connection refused'; changed it to listen-on { any; } and restarted named. 2) web-01: ufw was enabled with default deny and only SSH allowed, so port 80 timed out; added a narrow allow for TCP 80 from 192.168.50.0/24 and kept the firewall on. 3) api-01: tracking-api was not enabled, so it didn't come back after the reboot; ran systemctl enable --now. The sign-off missed them because each service was only checked locally on its own host and nobody tested end to end from the office; each fault also hid the next one.",
    },
  ],
  debrief: {
    solution: `\`\`\`
# 1. DNS (dns-01)
ops-ws$ dig @10.20.1.53 dispatch.lumen.internal     # connection refused
dns-01$ sudo ss -lunp                               # named on 127.0.0.1:53 only
dns-01$ sudo sed -i 's/listen-on { 127.0.0.1; };/listen-on { any; };/' /etc/bind/named.conf.options
dns-01$ sudo systemctl restart named

# 2. Firewall (web-01)
ops-ws$ curl -I http://dispatch.lumen.internal/     # now: timed out (ping works)
web-01$ sudo ufw allow from 192.168.50.0/24 to any port 80 proto tcp

# 3. Backend service (api-01)
web-01$ curl -s http://api.lumen.internal:8080/health   # connection refused
api-01$ sudo systemctl enable --now tracking-api

ops-ws$ curl -I http://dispatch.lumen.internal/     # 200
\`\`\`

The metrics-agent alert on web-01 was noise: the change log says it was disabled deliberately, and nothing in the request path depends on it. Each local check during the window passed (dig on dns-01 itself, nginx running on web-01, api-01 back up) — none of them exercised the path a user takes.`,
    commonMistakes: [
      "Fixing the first fault, seeing a different error, and assuming the fix didn't work instead of treating the new error as the next clue.",
      "Using /etc/hosts and `ufw disable` to get the dashboard up quickly, leaving DNS broken for everyone else and web-01 unprotected.",
      "Starting tracking-api without enabling it, so the next reboot repeats the outage.",
      "Spending time on unrelated alerts (metrics-agent) instead of following the request path.",
    ],
    realWorld:
      "Post-change verification should include a synthetic check from where users are (a blackbox probe from the office VLAN, or a smoke test run by CI against the public name), not just per-host service checks. Incident write-ups list each contributing fault separately because each needs its own prevention: a config review for BIND, a firewall baseline that includes the host's service ports, and `systemctl is-enabled` in the reboot checklist.",
  },
  review: [
    {
      id: "net-next-clue",
      skill: "net.troubleshooting",
      variants: [
        {
          id: "net-next-clue-a",
          kind: "mcq",
          prompt: "You fix DNS and the error changes from `Could not resolve host` to `Connection timed out` on port 443. What does that mean?",
          options: ["The DNS fix failed", "The DNS fix worked; the next fault is at the transport layer (filtered port or no path)", "The server returned 503", "The certificate expired"],
          answer: 1,
          explanation: "The request now gets past name resolution; a timeout points at a firewall or routing problem towards that port.",
        },
        {
          id: "net-next-clue-b",
          kind: "mcq",
          prompt: "After opening a firewall port, the error changes from `timed out` to `Connection refused`. What's next?",
          options: ["Revert the firewall change", "Check whether the service is running and listening on that port (`ss -ltnp`, `systemctl status`)", "Check DNS", "Check the default route"],
          answer: 1,
          explanation: "Packets now arrive and the host answers with a reset: nothing listens there.",
        },
      ],
    },
    {
      id: "net-method-order",
      skill: "net.troubleshooting",
      variants: [
        {
          id: "net-method-order-a",
          kind: "order",
          prompt: "Order a methodical approach to a multi-host outage.",
          items: [
            "Reproduce the exact failing request from the user's location",
            "Split by layer: name, IP reachability, port, HTTP",
            "Go to the host that owns the failing layer and inspect its state",
            "Make the narrowest fix for that one fault",
            "Re-test the original request and follow the new error",
          ],
          explanation: "Reproduce, isolate, inspect, fix narrowly, re-test — and repeat until the user's request works.",
        },
        {
          id: "net-method-order-b",
          kind: "mcq",
          prompt: "A change log lists ten changes from last night. How should you use it?",
          options: [
            "Revert all ten changes",
            "As a list of suspects to check against the observed failure, not as proof",
            "Ignore it",
            "Fix the most recent change only",
          ],
          answer: 1,
          explanation: "Change logs point you at likely hosts; the evidence on the system tells you which change actually matters.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On Monday the Memphis depot can't print labels via `labels.lumen.test`. Over the weekend: the label server was moved to a new subnet, its firewall template was updated, and the print spooler package was upgraded. From a depot PC, `dig +short labels.lumen.test` returns the new address, `ping` to it works, and `nc -zv labels.lumen.test 9100` times out.",
    question: {
      id: "transfer-labels-compound",
      kind: "mcq",
      prompt: "Which change do you investigate first?",
      options: [
        "The DNS move — names are always the cause",
        "The firewall template on the label server — the port times out while ping works",
        "The spooler upgrade — packages break things",
        "The depot PC's default route",
      ],
      answer: 1,
      explanation:
        "DNS and IP reachability are already proven. A timeout (not a refusal) on 9100 points at filtering; check the new firewall template first. If the error then becomes 'refused', look at the spooler.",
    },
  },
  refresher: {
    body: `When several things are broken at once, fix them **one layer at a time**: reproduce the failing request from the user's side, test name resolution, then IP reachability, then the port, then HTTP. Go to the host that owns the first failing layer, fix that one fault narrowly, and **re-test the original request**. A changed error message is progress — it shows you the next fault.`,
    practice: {
      id: "refresher-changed-error",
      kind: "mcq",
      prompt: "After your fix, a different error appears. What does that usually mean?",
      options: ["Your fix made things worse", "Your fix worked and revealed the next fault further along the path", "The original fault came back", "Nothing changed"],
      answer: 1,
      explanation: "Compound faults hide behind each other; a new error usually means the request now gets further.",
    },
  },
};
