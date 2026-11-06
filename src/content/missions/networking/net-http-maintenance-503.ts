import type { MissionInput } from "@/content/schema";
import { OPS, SEGMENTS, WWW_USER, dnsServer, gateway, resolvConf } from "./lab";

const maintBody = "<html><title>Maintenance</title><body>Lumen customer portal: scheduled maintenance 02:00-06:00 UTC. We'll be back shortly.</body></html>\n";

const runbook = `Portal maintenance runbook (web-01)
1. sudo systemctl stop portal
2. sudo systemctl start maint-page      # serves the 503 page on :80
3. ... deploy ...
4. sudo systemctl stop maint-page
5. sudo systemctl start portal
6. curl -I http://portal.lumen.internal/dashboard/   -> expect 200
`;

export const netHttpMaintenance503: MissionInput = {
  slug: "net-http-maintenance-503",
  version: 1,
  track: "networking",
  tier: "intermediate",
  order: 4,
  title: "Maintenance ended four hours ago; customers still get 503",
  summary:
    "The customer portal still returns 503 Service Unavailable long after the maintenance window. Read HTTP status codes and headers with curl, find what is really answering on port 80, and bring the portal back.",
  minutes: 30,
  assessmentTypes: ["configure-system", "interpret-output", "investigate-logs"],
  skills: ["net.http"],
  appliesSkills: ["net.ports", "net.dns", "net.troubleshooting"],
  prerequisites: ["net-routing-gateway"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#incidents",
    body: `Customer support has 40 tickets: \`portal.lumen.internal\` still shows the "scheduled maintenance" page. The window ended at 06:00; it's 10:05. Whoever ran the deploy on **web-01** has gone off shift.

The deploy notes are in \`~/portal-runbook.txt\` on ops-ws. I need the portal back, and I'd like to understand what the different responses actually mean — support keeps saying "the site is giving errors", which isn't much to go on.

Please leave the maintenance page installed (we'll need it next week), just not serving.`,
  },
  objectives: [
    "Interpret HTTP status classes (2xx, 3xx, 4xx, 5xx) and what each says about client vs server",
    "Use `curl -I` and `curl -v` to see status lines, headers and which server answered",
    "Distinguish \"the HTTP server answered with an error\" from \"no HTTP connection was possible\"",
    "Find which process holds a port and restore the intended service",
  ],
  concept: {
    title: "HTTP status codes tell you who is unhappy",
    body: `If curl prints an HTTP status, TCP worked and *some* HTTP server answered. The status code says what it decided:

| Class | Meaning | Examples |
| --- | --- | --- |
| 2xx | Success | 200 OK |
| 3xx | Go elsewhere | 301 Moved Permanently (see \`Location\`), 302, 304 |
| 4xx | Client's request is wrong | 400, 401 Unauthorized, 403 Forbidden, **404 Not Found** |
| 5xx | Server failed | 500, 502 Bad Gateway, **503 Service Unavailable**, 504 |

A 5xx is never fixed in the browser. But note *which* server produced it — the \`Server:\` header and the body often reveal that a proxy, load balancer or a maintenance page answered, not the application.

Compare with errors that have **no** status at all — those are lower layers:

\`\`\`
curl: (6) Could not resolve host     -> DNS
curl: (7) Connection refused         -> nothing listening on that port
curl: (28) Connection timed out      -> filtered or no route
\`\`\`

Useful commands: \`curl -I URL\` (headers only), \`curl -v URL\` (the request and response headers), \`curl -s -o /dev/null -w '%{http_code}\\n' URL\` (just the code).`,
  },
  workedExample: {
    title: "Worked example: the tracking widget returns 404 after a deploy",
    body: `The tracking widget calls \`http://api.lumen.internal:8080/v2/track/LX1042\` and shows "error".

**1. Get the status, not just "error":**
\`\`\`
$ curl -s -o /dev/null -w '%{http_code}\\n' http://api.lumen.internal:8080/v2/track/LX1042
404
\`\`\`
An HTTP answer, so DNS, routing and the port are fine. 404 means the server doesn't have that path.

**2. Compare with a known-good path:**
\`\`\`
$ curl -s -o /dev/null -w '%{http_code}\\n' http://api.lumen.internal:8080/v1/track/LX1042
200
\`\`\`

**3. Conclusion:** the widget was deployed expecting \`/v2\`, but the API deploy that adds \`/v2\` hasn't happened yet. That's a client/server version mismatch, not an outage — 4xx pointed at the request, not the server's health.`,
  },
  simulationNote:
    "HTTP servers here return fixed status codes and bodies per path; there are no real redirects to follow (`-L`), cookies or TLS handshakes. `https://` URLs connect to port 443 without certificate checks. Services, ports and the systemd journal behave as on a real host.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T10:05:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53"), { path: "/home/ops/portal-runbook.txt", content: runbook, owner: "ops", group: "ops" }],
        },
        gateway(),
        dnsServer(),
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [{ path: "/srv/maintenance/index.html", content: maintBody }],
          services: [
            {
              name: "maint-page",
              description: "Static maintenance page on :80",
              execUser: "www-data",
              command: "/usr/bin/python3 /opt/maint/serve.py --port 80 --status 503 --root /srv/maintenance",
              state: "active",
              enabled: true,
              kind: "http",
              listens: [{ port: 80, proto: "tcp" }],
              http: [
                { path: "/", status: 503, body: maintBody },
                { path: "/dashboard/", status: 503, body: maintBody },
                { path: "/healthz", status: 503, body: maintBody },
              ],
              journal: ["Nov 05 01:58:40 web-01 systemd[1]: Started maint-page.service - Static maintenance page on :80."],
            },
            {
              name: "portal",
              description: "Lumen customer portal (nginx)",
              execUser: "www-data",
              command: "/usr/sbin/nginx -c /etc/portal/nginx.conf -g daemon off;",
              state: "failed",
              enabled: true,
              kind: "http",
              listens: [{ port: 80, proto: "tcp" }],
              http: [
                { path: "/", status: 301, body: "<html><head><title>301 Moved Permanently</title></head><body>Moved to /dashboard/</body></html>\n" },
                { path: "/dashboard/", status: 200, body: "<html><title>Lumen Portal</title><body>Track your shipments</body></html>\n" },
                { path: "/healthz", status: 200, body: "ok\n" },
              ],
              journal: [
                "Nov 05 05:51:02 web-01 systemd[1]: Starting portal.service - Lumen customer portal (nginx)...",
                "Nov 05 05:51:02 web-01 nginx[4410]: nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)",
                "Nov 05 05:51:02 web-01 systemd[1]: portal.service: Main process exited, code=exited, status=1/FAILURE",
                "Nov 05 05:51:02 web-01 systemd[1]: portal.service: Failed with result 'exit-code'.",
                "Nov 05 05:51:02 web-01 systemd[1]: Failed to start portal.service - Lumen customer portal (nginx).",
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
        id: "dashboard-200",
        name: "http://portal.lumen.internal/dashboard/ returns 200 from ops-ws",
        assert: { type: "http_status", from: "ops-ws", url: "http://portal.lumen.internal/dashboard/", status: 200 },
        feedback: {
          what: "The portal dashboard does not return HTTP 200 from ops-ws.",
          why: "This is what customers load. A 503 here means something is still answering on port 80 with the maintenance page; a curl error with no status means nothing answers at all.",
          next: "Run `curl -I http://portal.lumen.internal/dashboard/` and read the status line. Then on web-01, `sudo ss -ltnp` shows which process owns port 80, and `systemctl status portal` shows why the portal isn't running.",
        },
      },
      {
        id: "health-and-redirect",
        name: "The real portal answers: /healthz is 200 and / redirects with 301",
        assert: {
          type: "all",
          of: [
            { type: "http_status", from: "ops-ws", url: "http://portal.lumen.internal/healthz", status: 200 },
            { type: "http_status", from: "ops-ws", url: "http://portal.lumen.internal/", status: 301 },
          ],
        },
        feedback: {
          what: "/healthz is not 200, or / does not return the portal's 301 redirect to /dashboard/.",
          why: "Those responses come only from the real portal service; the monitoring system and customers' bookmarks rely on them.",
          next: "Make sure the `portal` service itself is serving port 80, not a stand-in.",
        },
      },
      {
        id: "maint-off-but-kept",
        name: "maint-page is stopped and won't start at boot, but is still installed",
        assert: {
          type: "all",
          of: [
            { type: "service_state", host: "web-01", service: "maint-page", state: "inactive" },
            { type: "service_enabled", host: "web-01", service: "maint-page", enabled: false },
            { type: "file_exists", host: "web-01", path: "/srv/maintenance/index.html" },
            { type: "service_enabled", host: "web-01", service: "portal", enabled: true },
          ],
        },
        feedback: {
          what: "maint-page is still running or still enabled at boot, the maintenance page was removed, or portal is no longer enabled.",
          why: "If maint-page stays enabled, it grabs port 80 again at the next reboot and the outage repeats. Sam wants the page kept for next week.",
          next: "On web-01: `sudo systemctl stop maint-page`, `sudo systemctl disable maint-page`, then start portal. Don't delete /srv/maintenance.",
        },
      },
    ],
    solution: [
      "curl -I http://portal.lumen.internal/dashboard/",
      "curl -v http://portal.lumen.internal/",
      "cat ~/portal-runbook.txt",
      "ssh web-01",
      "sudo ss -ltnp",
      "systemctl status portal",
      "systemctl status maint-page",
      "sudo systemctl stop maint-page",
      "sudo systemctl disable maint-page",
      "sudo systemctl start portal",
      "sudo ss -ltnp",
      "exit",
      "curl -I http://portal.lumen.internal/",
      "curl -I http://portal.lumen.internal/dashboard/",
    ],
    wrongSolutions: [
      { label: "Restarts the portal while the maintenance page still holds port 80", steps: ["ssh web-01", "sudo systemctl restart portal", "exit"] },
      { label: "Stops the maintenance page but leaves it enabled at boot", steps: ["ssh web-01", "sudo systemctl stop maint-page", "sudo systemctl start portal", "exit"] },
      { label: "Restarts the maintenance page hoping it clears the 503", steps: ["ssh web-01", "sudo systemctl restart maint-page", "exit"] },
      { label: "Deletes the maintenance page files along with disabling it", steps: ["ssh web-01", "sudo rm -rf /srv/maintenance", "sudo systemctl disable --now maint-page", "sudo systemctl start portal", "exit"] },
    ],
    starterCommands: ["curl -I http://portal.lumen.internal/dashboard/", "curl -v http://portal.lumen.internal/", "cat ~/portal-runbook.txt", "ssh web-01"],
  },
  successCriteria: [
    "http://portal.lumen.internal/dashboard/ returns 200",
    "/healthz returns 200 and / returns the portal's 301 redirect",
    "maint-page is stopped and disabled but still installed; portal is enabled",
  ],
  hints: [
    "Start with `curl -I http://portal.lumen.internal/dashboard/`. You get an HTTP status — so DNS, routing and TCP all work. Which class is 503, and which server sent it (look at the `Server:` header)?",
    "Compare with `~/portal-runbook.txt`. Which steps look like they never happened? On web-01, `sudo ss -ltnp` shows which process owns port 80.",
    "`systemctl status portal` shows it failed at 05:51 with `bind() to 0.0.0.0:80 failed (98: Address already in use)`: maint-page was still holding port 80 when someone tried to start the portal.",
    "On web-01: `sudo systemctl stop maint-page`, `sudo systemctl disable maint-page`, `sudo systemctl start portal`. Then from ops-ws, `curl -I` the dashboard (200) and `/` (301).",
  ],
  questions: [
    {
      id: "interpret-503-headers",
      kind: "mcq",
      prompt: "Before the fix, this came back. What does it tell you?",
      code: "$ curl -I http://portal.lumen.internal/dashboard/\nHTTP/1.1 503 Service Unavailable\nServer: python3\nDate: Thu Nov  5 10:05:01 UTC 2026\nContent-Type: text/html\nContent-Length: 137\nConnection: keep-alive",
      codeLanguage: "text",
      options: [
        "DNS for portal.lumen.internal is broken",
        "The network path and TCP work; a server on port 80 answered with 503 — and it isn't the portal's nginx",
        "The client sent a malformed request",
        "The firewall on web-01 is dropping traffic",
      ],
      answer: 1,
      explanation:
        "Any HTTP status proves DNS, routing and the TCP connection worked. 5xx is a server-side condition, and `Server: python3` shows a stand-in (the maintenance server) answered, not the nginx-based portal.",
    },
    {
      id: "status-classes",
      kind: "mcq",
      prompt: "After the fix, `curl -I http://portal.lumen.internal/` returns `301 Moved Permanently`. Is that a problem?",
      options: [
        "Yes — 3xx means the server failed",
        "No — it tells the client the resource lives at another URL (here /dashboard/); browsers follow it automatically",
        "Yes — the client sent a bad request",
        "No — 301 means the page is cached",
      ],
      answer: 1,
      explanation: "3xx codes are redirects. The portal deliberately redirects / to /dashboard/. `curl -L` would follow it.",
    },
    {
      id: "explain-503-root-cause",
      kind: "explain",
      prompt: "Write the incident summary for Sam: why did customers keep getting 503 after maintenance, and what did you change so it won't recur at the next reboot?",
      concepts: [
        { label: "The maintenance page was still running / holding port 80", anyOf: ["maint-page", "maintenance page", "maintenance server", "still running", "port 80", "held the port", "holding the port", "was never stopped"] },
        { label: "The portal failed to start: address already in use", anyOf: ["address already in use", "bind", "failed to start", "couldn't start", "could not start", "port conflict", "already in use"] },
        { label: "Disabled the maintenance page at boot / started and enabled the portal", anyOf: ["disable", "disabled", "enabled", "at boot", "reboot", "won't start again", "will not start again"] },
      ],
      minConcepts: 2,
      explanation: "The runbook's steps 4 and 5 ran out of order; the portal can't bind a port another process holds.",
      modelAnswer:
        "The maintenance page service (maint-page) was never stopped after the deploy, so it kept holding port 80 and answered every request with 503. When the portal was started at 05:51 it failed with 'bind() to 0.0.0.0:80 failed: address already in use'. I stopped maint-page and disabled it so it won't start again at the next reboot, then started the portal (still enabled); / now returns 301 and /dashboard/ returns 200.",
    },
  ],
  debrief: {
    solution: `\`\`\`
ops-ws$ curl -I http://portal.lumen.internal/dashboard/
HTTP/1.1 503 Service Unavailable
Server: python3                         <- not the portal's nginx
web-01$ sudo ss -ltnp
tcp LISTEN ... 0.0.0.0:80 ... users:(("python3",pid=...))
web-01$ systemctl status portal
... bind() to 0.0.0.0:80 failed (98: Address already in use)
web-01$ sudo systemctl stop maint-page
web-01$ sudo systemctl disable maint-page
web-01$ sudo systemctl start portal
ops-ws$ curl -I http://portal.lumen.internal/            # 301 Moved Permanently
ops-ws$ curl -I http://portal.lumen.internal/dashboard/  # 200 OK
\`\`\`

The runbook's last steps ran in the wrong order: \`start portal\` before \`stop maint-page\`. The portal failed to bind port 80 and the maintenance page kept answering. Because maint-page was also *enabled*, a reboot would have recreated the outage even after a manual fix.`,
    commonMistakes: [
      "Restarting the portal again while port 80 is still held — it fails the same way every time.",
      "Stopping maint-page without disabling it, so it wins the race for port 80 at the next reboot.",
      "Treating 503 as a network problem; any HTTP status means the network delivered the request.",
      "Deleting the maintenance assets that will be needed again next week.",
    ],
    realWorld:
      "Real maintenance modes are usually a switch in the load balancer or reverse proxy (return 503 with a `Retry-After` header) rather than a competing process, precisely to avoid port races. Status codes are the vocabulary of web monitoring: alert on rising 5xx rates (server-side) separately from 4xx (often client or deploy mismatches), and always check which tier produced the code — the app, a proxy (502/504), or a CDN.",
  },
  review: [
    {
      id: "net-status-class",
      skill: "net.http",
      variants: [
        {
          id: "net-status-class-a",
          kind: "mcq",
          prompt: "An API returns `403 Forbidden`. Which side needs to change?",
          options: ["The server is crashing", "The client's request: it isn't allowed (credentials or permissions)", "DNS", "The network path"],
          answer: 1,
          explanation: "4xx codes describe a problem with the request; 403 means authenticated or not, this client isn't allowed.",
        },
        {
          id: "net-status-class-b",
          kind: "mcq",
          prompt: "A reverse proxy returns `502 Bad Gateway`. What does that usually mean?",
          options: [
            "The client's URL is wrong",
            "The proxy is up but got an invalid or no response from the upstream application",
            "DNS failed on the client",
            "The page moved",
          ],
          answer: 1,
          explanation: "502 is generated by the proxy about its upstream; check the backend service the proxy forwards to.",
        },
        {
          id: "net-status-class-c",
          kind: "mcq",
          prompt: "`curl -I https://reports.lumen.internal/old-kpis` returns `404 Not Found` while `/` returns 200. What is the best conclusion?",
          options: ["The server is down", "The server works; that path doesn't exist on it", "The certificate is invalid", "A firewall blocks the path"],
          answer: 1,
          explanation: "The server answered (200 on /), so 404 is about the specific resource.",
        },
      ],
    },
    {
      id: "net-curl-error-vs-status",
      skill: "net.http",
      variants: [
        {
          id: "net-curl-error-vs-status-a",
          kind: "mcq",
          prompt: "Which output proves that an HTTP server received the request?",
          options: ["curl: (7) Connection refused", "curl: (28) Connection timed out", "HTTP/1.1 500 Internal Server Error", "curl: (6) Could not resolve host"],
          answer: 2,
          explanation: "Only a status line comes from an HTTP server. The others are failures before any HTTP exchange.",
        },
        {
          id: "net-curl-error-vs-status-b",
          kind: "short",
          prompt: "Write a curl command that prints only the HTTP status code for http://portal.lumen.internal/healthz.",
          accept: ["curl -s -o /dev/null -w '%{http_code}' http://portal.lumen.internal/healthz", "curl -s -o /dev/null -w \"%{http_code}\" http://portal.lumen.internal/healthz"],
          acceptPatterns: ["^curl\\s+(?=.*-w\\s*['\"]?%\\{http_code\\})(?=.*-o\\s+/dev/null)(?=.*http://portal\\.lumen\\.internal/healthz).*$", "^curl\\s+-I\\s+.*portal\\.lumen\\.internal/healthz.*$"],
          explanation: "`-o /dev/null` discards the body and `-w '%{http_code}'` prints the status; `curl -I` (headers) also shows it on the first line.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "After a deploy, Aiko's dispatch dashboard shows a blank panel. In the browser's network tab, `GET /api/loads` returns `504 Gateway Timeout` with header `Server: nginx`. nginx on web-01 proxies /api/ to api-01:8080.",
    question: {
      id: "transfer-504",
      kind: "mcq",
      prompt: "Where do you look first?",
      options: [
        "Aiko's browser cache",
        "Whether nginx on web-01 can reach api-01:8080 and whether the API responds in time",
        "The DNS record for dispatch.lumen.internal",
        "The office router",
      ],
      answer: 1,
      explanation: "nginx answered (so the browser reached web-01), but it timed out waiting for its upstream. Test from web-01: `curl -v http://api-01.lumen.internal:8080/health`.",
    },
  },
  refresher: {
    body: `If curl shows \`HTTP/1.1 <code>\`, the network worked and a server answered. **2xx** success, **3xx** redirect, **4xx** the request is wrong (404 missing, 403 forbidden), **5xx** the server failed (500, 502, 503, 504). Errors like *Could not resolve host*, *Connection refused* or *timed out* have no status — they're lower layers.

\`curl -I URL\` shows the status and headers; the \`Server:\` header tells you which program answered.`,
    practice: {
      id: "refresher-503",
      kind: "mcq",
      prompt: "Which status class means \"the server had a problem\"?",
      options: ["2xx", "3xx", "4xx", "5xx"],
      answer: 3,
      explanation: "5xx codes are server-side errors, e.g. 500, 502, 503.",
    },
  },
};
