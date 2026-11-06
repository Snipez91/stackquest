import type { MissionInput } from "@/content/schema";
import { OPS, SEGMENTS, WWW_USER, dispatchNginx, dnsServer, gateway, resolvConf } from "./lab";

const apiEnv = `# tracking-api runtime settings (read once at service start)
# 2026-11-05 MB: tightened for the security review
LISTEN_ADDR=127.0.0.1
LISTEN_PORT=8080
DB_URL=postgres://tracking@db-01.lumen.internal/tracking
LOG_LEVEL=info
`;

export const netPortsListeners: MissionInput = {
  slug: "net-ports-listeners",
  version: 1,
  track: "networking",
  tier: "beginner",
  order: 4,
  title: "The API answers on the box but nowhere else",
  summary:
    "The tracking API works with curl on api-01 itself but refuses connections from everywhere else. Use ss, nc and curl to find which address and port it is really listening on, and fix the bind address.",
  minutes: 25,
  assessmentTypes: ["configure-system", "interpret-output"],
  skills: ["net.ports"],
  appliesSkills: ["net.dns", "net.troubleshooting"],
  prerequisites: ["net-dns-name-vs-ip"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#backend",
    body: `I tightened the tracking-api config on **api-01** this afternoon for the security review and restarted it. On api-01, \`curl http://localhost:8080/health\` returns ok, so I thought we were good.

But the dispatch dashboard on web-01 now shows "tracking unavailable", and from **ops-ws** I get *connection refused* on \`api.lumen.internal:8080\`. The host pings fine. The firewall on api-01 isn't even enabled, so I'm stumped.

Can you work out what's actually listening, fix it, and keep the API on port 8080? Config is in \`/etc/tracking-api/api.env\`.`,
  },
  objectives: [
    "Explain how an IP address plus a port identifies one service on a host",
    "Read `ss -ltnp` to see which address and port a process is bound to",
    "Tell \"connection refused\" (nothing listening there) apart from a timeout (filtered or no path)",
    "Change a service's bind address and restart it so the new setting takes effect",
  ],
  concept: {
    title: "A listening socket is an address *and* a port",
    body: `A server process asks the kernel to **listen** on a port, and also chooses which local address to accept connections on:

| Bind address | Accepts connections from |
| --- | --- |
| \`127.0.0.1:8080\` | only the host itself (loopback) |
| \`10.20.1.20:8080\` | anything that reaches that interface address |
| \`0.0.0.0:8080\` | any local address (all interfaces) |

\`ss -ltnp\` shows listening TCP sockets (\`-l\` listening, \`-t\` TCP, \`-n\` numeric, \`-p\` process). The **Local Address:Port** column is the bind.

From a client, the error tells you where to look:

- **Connection refused** — the packet reached the host, but nothing listens on that address/port, so the kernel replied with a reset. The network path is fine.
- **Timed out** — no reply at all: a firewall dropped it, or there's no route.

A service bound to \`127.0.0.1\` passes every *local* test (\`curl localhost:8080\`) and refuses every remote one. Most daemons read their bind address only at startup, so changing the config file does nothing until the service restarts.`,
  },
  workedExample: {
    title: "Worked example: metrics exporter invisible to the monitoring server",
    body: `The monitoring server can't scrape \`db-01:9187\`, though \`curl localhost:9187/metrics\` works on db-01.

**1. From the monitoring server:**
\`\`\`
$ nc -zv db-01.lumen.internal 9187
nc: connect to db-01.lumen.internal (10.20.2.30) port 9187 (tcp) failed: Connection refused
\`\`\`
Refused, not timed out: the host answered, so routing and firewall aren't the issue.

**2. On db-01, what is bound where?**
\`\`\`
$ sudo ss -ltnp
State  Local Address:Port  Process
LISTEN 127.0.0.1:9187      users:(("pg_exporter",pid=2201,fd=4))
LISTEN 0.0.0.0:5432        users:(("postgres",pid=900,fd=6))
\`\`\`
The exporter listens only on loopback.

**3. Fix the setting** (\`--web.listen-address=:9187\`, meaning all addresses) and **restart** the exporter. \`ss -ltn\` now shows \`0.0.0.0:9187\`, and \`nc -zv\` from the monitoring server succeeds.`,
  },
  simulationNote:
    "Listening sockets, bind addresses and \"connection refused\" are modelled from each service's state. tracking-api reads LISTEN_ADDR and LISTEN_PORT from /etc/tracking-api/api.env each time it starts. There is no reverse proxy, TLS or real application behind /health.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T15:30:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53")],
        },
        gateway(),
        dnsServer(),
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53")],
          services: [dispatchNginx],
        },
        {
          name: "api-01",
          users: [OPS, { name: "tracking", uid: 1101, home: "/opt/tracking-api", shell: "/usr/sbin/nologin" }],
          interfaces: [{ name: "eth0", address: "10.20.1.20/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53"), { path: "/etc/tracking-api/api.env", content: apiEnv, mode: "0644" }],
          services: [
            {
              name: "tracking-api",
              description: "Lumen tracking API",
              execUser: "tracking",
              command: "/opt/tracking-api/bin/tracking-api --env /etc/tracking-api/api.env",
              state: "active",
              enabled: true,
              kind: "http",
              requiresReadable: ["/etc/tracking-api/api.env"],
              listens: [{ port: 8080, proto: "tcp", address: "127.0.0.1" }],
              listenFrom: { path: "/etc/tracking-api/api.env", addressPattern: "^LISTEN_ADDR=([0-9.]+)\\s*$", portPattern: "^LISTEN_PORT=(\\d+)\\s*$" },
              http: [{ path: "/health", status: 200, body: "{\"status\":\"ok\",\"db\":\"up\"}\n" }],
              journal: [
                "Nov 05 14:58:12 api-01 systemd[1]: Stopping tracking-api.service - Lumen tracking API...",
                "Nov 05 14:58:12 api-01 systemd[1]: Started tracking-api.service - Lumen tracking API.",
                "Nov 05 14:58:13 api-01 tracking-api[2207]: listening on 127.0.0.1:8080",
              ],
            },
          ],
        },
      ],
      segments: SEGMENTS,
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "api-from-office",
        name: "ops-ws gets HTTP 200 from http://api.lumen.internal:8080/health",
        assert: { type: "http_status", from: "ops-ws", url: "http://api.lumen.internal:8080/health", status: 200 },
        feedback: {
          what: "From ops-ws, `curl http://api.lumen.internal:8080/health` still does not return 200.",
          why: "Clients outside api-01 are the whole point of the API; a socket that only accepts loopback connections is invisible to them.",
          next: "On api-01 run `sudo ss -ltnp` and read the Local Address column for port 8080. Change LISTEN_ADDR in /etc/tracking-api/api.env so the service accepts connections on its network address, then restart it.",
        },
      },
      {
        id: "api-from-dashboard",
        name: "web-01 (the dispatch dashboard) reaches the API on 10.20.1.20:8080",
        assert: { type: "http_status", from: "web-01", url: "http://10.20.1.20:8080/health", status: 200 },
        feedback: {
          what: "web-01 cannot get HTTP 200 from http://10.20.1.20:8080/health.",
          why: "The dashboard calls the API from web-01, and it expects port 8080. Moving the API to another port, or only fixing access from ops-ws, leaves the dashboard broken.",
          next: "Keep LISTEN_PORT=8080. Check with `ssh web-01 curl -s http://10.20.1.20:8080/health`.",
        },
      },
      {
        id: "service-running",
        name: "tracking-api is running and enabled",
        assert: {
          type: "all",
          of: [
            { type: "service_state", host: "api-01", service: "tracking-api", state: "active" },
            { type: "service_enabled", host: "api-01", service: "tracking-api", enabled: true },
          ],
        },
        feedback: {
          what: "tracking-api on api-01 is not active (or not enabled at boot).",
          why: "A config change only helps if the service restarts cleanly with it, and it must come back after a reboot.",
          next: "Run `sudo systemctl restart tracking-api` and check `systemctl status tracking-api` and `journalctl -u tracking-api`.",
        },
      },
    ],
    solution: [
      "nc -zv api.lumen.internal 8080",
      "ssh api-01",
      "curl -s http://localhost:8080/health",
      "sudo ss -ltnp",
      "cat /etc/tracking-api/api.env",
      "sudo sed -i 's/^LISTEN_ADDR=.*/LISTEN_ADDR=0.0.0.0/' /etc/tracking-api/api.env",
      "sudo systemctl restart tracking-api",
      "sudo ss -ltnp",
      "exit",
      "curl -s http://api.lumen.internal:8080/health",
    ],
    wrongSolutions: [
      { label: "Edits the config but never restarts the service", steps: ["ssh api-01", "sudo sed -i 's/^LISTEN_ADDR=.*/LISTEN_ADDR=0.0.0.0/' /etc/tracking-api/api.env", "exit"] },
      { label: "Opens the port in ufw (the firewall isn't the problem)", steps: ["ssh api-01", "sudo ufw allow 8080/tcp", "sudo systemctl restart tracking-api", "exit"] },
      {
        label: "Moves the API to port 80 instead of fixing the bind address",
        steps: ["ssh api-01", "sudo sed -i 's/^LISTEN_PORT=.*/LISTEN_PORT=80/' /etc/tracking-api/api.env", "sudo sed -i 's/^LISTEN_ADDR=.*/LISTEN_ADDR=0.0.0.0/' /etc/tracking-api/api.env", "sudo systemctl restart tracking-api", "exit"],
      },
    ],
    starterCommands: ["ping -c 2 api.lumen.internal", "nc -zv api.lumen.internal 8080", "ssh api-01", "sudo ss -ltnp"],
  },
  successCriteria: [
    "http://api.lumen.internal:8080/health returns 200 from ops-ws",
    "web-01 gets 200 from http://10.20.1.20:8080/health (API still on port 8080)",
    "tracking-api is active and enabled on api-01",
  ],
  hints: [
    "Compare the two client errors you can produce: `ping api.lumen.internal` works, and `nc -zv api.lumen.internal 8080` says *refused*. Refused means the host answered — so what isn't listening?",
    "Log in with `ssh api-01` and run `sudo ss -ltnp`. Look at the Local Address:Port column for port 8080, and compare it with sshd on port 22.",
    "tracking-api is bound to 127.0.0.1:8080, so only api-01 itself can connect. The address comes from `LISTEN_ADDR` in /etc/tracking-api/api.env.",
    "Set `LISTEN_ADDR=0.0.0.0` (or api-01's own address 10.20.1.20) with `sudo sed -i 's/^LISTEN_ADDR=.*/LISTEN_ADDR=0.0.0.0/' /etc/tracking-api/api.env`, then `sudo systemctl restart tracking-api` — the file is only read at startup. Check `sudo ss -ltnp` again, `exit`, and curl from ops-ws.",
  ],
  questions: [
    {
      id: "interpret-ss",
      kind: "mcq",
      prompt: "On api-01 before the fix, `sudo ss -ltnp` showed this. Which statement is correct?",
      code: "Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process\ntcp   LISTEN 0      511    127.0.0.1:8080     0.0.0.0:*         users:((\"tracking-api\",pid=1000,fd=3))\ntcp   LISTEN 0      511    0.0.0.0:22         0.0.0.0:*         users:((\"sshd\",pid=812,fd=5))",
      codeLanguage: "text",
      options: [
        "Both services accept connections from other hosts",
        "sshd accepts connections on all addresses; tracking-api only from api-01 itself",
        "tracking-api is not running",
        "Port 8080 is blocked by a firewall",
      ],
      answer: 1,
      explanation:
        "0.0.0.0:22 means every local address; 127.0.0.1:8080 means loopback only. The process is running — it's just bound where remote clients can't reach it.",
    },
    {
      id: "refused-vs-timeout",
      kind: "mcq",
      prompt: "A client gets `Connection refused` on port 8080. What can you conclude?",
      options: [
        "A firewall silently dropped the packet",
        "There is no route to the host",
        "The host received the connection attempt and nothing was listening on that address and port",
        "DNS returned the wrong address",
      ],
      answer: 2,
      explanation:
        "A refusal is an active reply (TCP reset) from the destination's kernel. Drops and missing routes produce timeouts or \"no route to host\" instead.",
    },
    {
      id: "predict-no-restart",
      kind: "mcq",
      prompt: "If you change LISTEN_ADDR to 0.0.0.0 in api.env but don't restart tracking-api, what does `ss -ltn` show for port 8080?",
      options: ["0.0.0.0:8080", "127.0.0.1:8080 — the running process still has its old socket", "Nothing; the service stops", "Both addresses"],
      answer: 1,
      explanation: "The process read the file when it started and bound its socket then. Editing the file changes nothing until the service restarts (or reloads, if it supports that).",
    },
  ],
  debrief: {
    solution: `\`\`\`
ops-ws$ nc -zv api.lumen.internal 8080      # Connection refused -> host answered
api-01$ curl -s localhost:8080/health      # ok   (local test passes)
api-01$ sudo ss -ltnp
tcp LISTEN ... 127.0.0.1:8080 ... tracking-api   <- loopback only
api-01$ sudo sed -i 's/^LISTEN_ADDR=.*/LISTEN_ADDR=0.0.0.0/' /etc/tracking-api/api.env
api-01$ sudo systemctl restart tracking-api
api-01$ sudo ss -ltnp
tcp LISTEN ... 0.0.0.0:8080 ... tracking-api
ops-ws$ curl -s http://api.lumen.internal:8080/health
{"status":"ok","db":"up"}
\`\`\`

Binding to \`10.20.1.20\` instead of \`0.0.0.0\` is also valid: it accepts connections on the production interface only. The "security tightening" was well-meant — limiting exposure is good — but it belongs in a firewall rule that allows the clients who need the API, not in a bind address that excludes all of them.`,
    commonMistakes: [
      "Trusting `curl localhost` as proof that a service is reachable — loopback tests can't detect a loopback-only bind.",
      "Editing the config file without restarting the service, so the old socket stays in place.",
      "Opening the firewall for a port when the client error was \"refused\" (an active reply), not a timeout.",
      "Moving the service to a different port, which breaks every client that expects the old one.",
    ],
    realWorld:
      "Databases, Redis, Prometheus exporters and dev servers (Flask, Vite, Node) often default to 127.0.0.1 for safety, which is the most common cause of \"works locally, refused remotely\". In containers the same issue appears as an app bound to 127.0.0.1 inside the container, which a published port can never reach. `ss -ltnp` (or `netstat -ltnp` on older systems) is the first command to run.",
  },
  review: [
    {
      id: "net-bind-address",
      skill: "net.ports",
      variants: [
        {
          id: "net-bind-address-a",
          kind: "mcq",
          prompt: "`ss -ltn` on db-01 shows `127.0.0.1:5432`. A client on api-01 connects to db-01:5432. What happens?",
          options: ["It connects", "Connection refused", "DNS failure", "It times out because of the route"],
          answer: 1,
          explanation: "Postgres only accepts loopback connections; db-01's kernel refuses connections to its network address on 5432.",
        },
        {
          id: "net-bind-address-b",
          kind: "mcq",
          prompt: "Which `ss` Local Address lets other hosts reach a service on port 9090?",
          options: ["127.0.0.1:9090", "0.0.0.0:9090", "[::1]:9090", "127.0.0.53:9090"],
          answer: 1,
          explanation: "0.0.0.0 binds every local IPv4 address. 127.x and ::1 are loopback only.",
        },
      ],
    },
    {
      id: "net-refused-meaning",
      skill: "net.ports",
      variants: [
        {
          id: "net-refused-meaning-a",
          kind: "mcq",
          prompt: "`nc -zv reports-01 443` prints `Connection refused`. What do you check next on reports-01?",
          options: ["The default route", "`ss -ltnp` for a listener on 443", "/etc/resolv.conf", "The switch port"],
          answer: 1,
          explanation: "Refused means the host answered with a reset: check whether anything listens on 443 (and on which address).",
        },
        {
          id: "net-refused-meaning-b",
          kind: "short",
          prompt: "Write the `ss` command (with flags) that lists listening TCP sockets numerically with their owning process.",
          accept: ["ss -ltnp", "ss -tlnp", "ss -lntp", "ss -ntlp", "ss -tnlp", "ss -nltp", "sudo ss -ltnp", "sudo ss -tlnp"],
          acceptPatterns: ["^(sudo\\s+)?ss\\s+-(?=[ltnp]*l)(?=[ltnp]*t)(?=[ltnp]*n)(?=[ltnp]*p)[ltnp]{4}$"],
          explanation: "-l listening, -t TCP, -n numeric ports, -p process (needs root to see other users' processes).",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Aiko starts the dispatch dashboard dev server on her laptop with `npm run dev`. It prints `Local: http://localhost:5173/`. Her colleague on the same office network tries `http://192.168.50.41:5173/` and gets \"connection refused\".",
    question: {
      id: "transfer-dev-server-bind",
      kind: "mcq",
      prompt: "What is the most likely fix?",
      options: [
        "Add a DNS record for Aiko's laptop",
        "Start the dev server bound to all addresses (e.g. `--host 0.0.0.0`)",
        "Change the port to 80",
        "Disable the laptop's firewall",
      ],
      answer: 1,
      explanation: "\"Refused\" plus a localhost-only URL means the server is bound to loopback. Binding to 0.0.0.0 (or the LAN address) lets colleagues connect.",
    },
  },
  refresher: {
    body: `A service listens on an **address and a port**. \`127.0.0.1:8080\` accepts only connections from the same machine; \`0.0.0.0:8080\` accepts them on every interface. \`sudo ss -ltnp\` shows exactly what is bound where.

"Connection refused" means the host answered but nothing listens on that address/port. Most services read their bind address at startup, so change the config **and restart**.`,
    practice: {
      id: "refresher-loopback-only",
      kind: "mcq",
      prompt: "A service shows `127.0.0.1:6379` in `ss -ltn`. Who can connect to it?",
      options: ["Any host on the network", "Only processes on the same machine", "Only hosts in the same subnet", "Nobody"],
      answer: 1,
      explanation: "127.0.0.1 is the loopback address; it's only reachable from the host itself.",
    },
  },
};
