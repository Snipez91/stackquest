import type { MissionInput } from "@/content/schema";

/**
 * Capstone: after an API port move, the dashboard's deployed config still
 * points at the old port (refused), and the host firewall does not admit the
 * new port from the browsers that call it (timeout). Graded from the browser
 * host's point of view, using the config that is actually deployed.
 */

const consoleLog = String.raw`Dispatch dashboard - browser console export (Aiko Tanaka, ops-ws, 2026-03-09 07:41 UTC)
------------------------------------------------------------------------------------
07:41:02.010 [app] dispatch-ui 3.9.0 booting
07:41:02.011 [config] DISPATCH_CONFIG = {"apiBase":"http://api-01.lumen.internal:8080/v1","pollSeconds":30}
07:41:02.233 GET http://api-01.lumen.internal:8080/v1/shipments?depot=ORD net::ERR_CONNECTION_REFUSED
07:41:02.234 [shipments] TypeError: Failed to fetch
    at loadShipments (shipments-panel.js:22:23)
    at ShipmentsPanel.refresh (shipments-panel.js:61:11)
07:41:02.235 [ui] banner: "Live shipments unavailable. Retrying in 30s."

--- 07:58 after Aiko edited config.js locally (apiBase -> :9090) and reloaded ---
07:58:40.118 GET http://api-01.lumen.internal:9090/v1/shipments?depot=ORD net::ERR_CONNECTION_TIMED_OUT
07:58:40.119 [shipments] TypeError: Failed to fetch
    at loadShipments (shipments-panel.js:22:23)
`;

const configJs = String.raw`// /var/www/dispatch/config.js - runtime settings for the dispatch dashboard.
// Served as-is by nginx and loaded by index.html before app.js.
window.DISPATCH_CONFIG = {
  apiBase: "http://api-01.lumen.internal:8080/v1",
  pollSeconds: 30,
};
`;

const panelJs = String.raw`// shipments-panel.js (excerpt) - runs in the dispatcher's browser, not on web-01.
export async function loadShipments(depot) {
  const url = window.DISPATCH_CONFIG.apiBase + "/shipments?depot=" + encodeURIComponent(depot);
  const res = await fetch(url, { headers: { Accept: "application/json" } });   // line 22
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
`;

const releaseNotes = String.raw`shipments-api 5.0.0 (deployed 2026-03-08 by the API team)

- BREAKING: the public HTTP listener moved from port 8080 to 9090 to match the
  platform port plan (8080 is reserved for the sidecar proxy rollout).
- New admin/metrics listener on 9091. Internal only: must not be reachable from
  office or dashboard clients.
- Clients: update your base URL. The dashboard reads it from config.js on web-01.
`;

const serverYaml = String.raw`# /etc/shipments-api/server.yaml
http:
  bind: 0.0.0.0
  port: 9090
admin:
  bind: 0.0.0.0
  port: 9091      # metrics + debug endpoints, keep firewalled
`;

const sshd = { pid: 640, user: "root", command: "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups", listens: [{ port: 22, proto: "tcp" as const }] };
const oncall = { name: "oncall", uid: 1000, groups: ["sudo", "adm"], home: "/home/oncall" };
const baseGroups = [
  { name: "oncall", gid: 1000 },
  { name: "sudo", gid: 27 },
  { name: "adm", gid: 4 },
];
const home = { path: "/home/oncall", type: "dir" as const, owner: "oncall", group: "oncall", mode: "0755" };
const lo = { name: "lo", address: "127.0.0.1/8" };
const resolv = { path: "/etc/resolv.conf", content: "nameserver 10.20.0.53\nsearch lumen.internal\n", mode: "0644" };

/** What a browser on ops-ws would do: load the deployed config, then call the API it names. */
const browserFetch =
  "base=$(ssh web-01 cat /var/www/dispatch/config.js | grep apiBase | cut -d'\"' -f2); curl -s -o /dev/null -w '%{http_code}' \"$base/shipments?depot=ORD\"";

export const mission: MissionInput = {
  slug: "cap-dashboard-wrong-port",
  version: 1,
  track: "capstone",
  tier: "advanced",
  order: 2,
  title: "Refused, then timed out: the port move nobody finished",
  summary:
    "After the shipments API moved to port 9090, the dashboard still calls 8080, and the firewall silently drops 9090. Fix the deployed config and the firewall without exposing the admin port.",
  minutes: 35,
  assessmentTypes: ["investigate-logs", "configure-system", "interpret-output"],
  skills: ["net.firewalls", "net.ports", "js.fetch"],
  appliesSkills: ["net.troubleshooting", "js.debugging", "lx.services", "lx.text-processing"],
  prerequisites: ["cap-dispatch-outage", "js-fetch-tracking-json", "net-firewall-scoped-allow"],
  brief: {
    from: "Aiko Tanaka, Frontend engineer",
    channel: "#dispatch-dashboard",
    body: `Monday morning, and the dispatch dashboard's live shipments panel says *"Live shipments unavailable"* for every depot. The API team shipped shipments-api 5.0 on Saturday and moved it to a new port.

I tried pointing my local copy of \`config.js\` at the new port and got a **different** error, a timeout instead of a refusal. My console export is in \`~/incident/\` on \`ops-ws\`.

The API team says the port move is deliberate, so please don't move it back. Could you fix the **deployed** config on \`web-01\` and whatever is blocking the new port on \`api-01\`, so it works from dispatchers' browsers (they're all on 10.20.0.0/16)? Their admin port must stay closed to us, and please clean up anything left over from the old port.`,
  },
  objectives: [
    "Distinguish \"connection refused\" from \"connection timed out\" and map each to a layer (nothing listening versus packets dropped)",
    "Recognise that browser-side JavaScript calls the API from the user's machine, so firewall rules must admit client networks, not just the web server",
    "Correct a front-end runtime configuration on the host that actually serves it",
    "Open exactly one port to one network on a default-deny firewall, keep an internal port closed, and remove a stale rule",
  ],
  concept: {
    title: "Where the request really comes from, and what each failure means",
    body: `A single-page app is **downloaded** from the web server but **runs in the browser**. When its JavaScript calls \`fetch("http://api-01...:9090/...")\`, the TCP connection goes **from the dispatcher's machine to api-01**. web-01 is not involved. Any firewall on api-01 therefore has to admit the *client* network.

When a connection fails, the error tells you which layer to look at:

| Browser / curl error | What happened | Where to look |
| --- | --- | --- |
| \`ERR_CONNECTION_REFUSED\` / curl (7) refused | The host answered with a reset: **nothing listens** on that port | Is the URL's port right? Is the service up? (\`ss -tlnp\`) |
| \`ERR_CONNECTION_TIMED_OUT\` / curl (28) | **No answer at all**: packets were dropped | Firewall rules, routes, host down |
| \`ERR_NAME_NOT_RESOLVED\` / curl (6) | The name has no address | DNS |

So when a fix changes the error from *refused* to *timed out*, that is progress: you are now hitting the right port, and something in between is dropping the traffic.

On a default-deny firewall, add the narrowest rule that serves the real clients (\`ufw allow from 10.20.0.0/16 to any port 9090 proto tcp\`) rather than disabling the firewall, and delete rules for ports that are no longer used.`,
  },
  workedExample: {
    title: "Worked example: the parcel-photo uploads that timed out",
    body: `A different app: the depot tablet app uploads parcel photos straight from the tablets (10.20.60.0/24) to \`media-01:7443\`.

**1. Read the client's error.** Tablets show \`ERR_CONNECTION_TIMED_OUT\`. A timeout, not a refusal, so suspect filtering.

**2. Check the service from the server itself.** On media-01, \`ss -tlnp\` shows the uploader listening on \`0.0.0.0:7443\`, and \`curl -s localhost:7443/health\` returns 200. The service is fine.

**3. Check the firewall.**

\`\`\`text
$ sudo ufw status
Status: active
22/tcp     ALLOW IN   10.20.0.0/16
7443/tcp   ALLOW IN   10.20.1.10        <- only the web server
\`\`\`

The rule admitted the web server, but the uploads come from the tablets.

**4. Narrow fix for the real clients:**

\`\`\`bash
sudo ufw allow from 10.20.60.0/24 to any port 7443 proto tcp
sudo ufw delete allow from 10.20.1.10 to any port 7443 proto tcp
\`\`\`

**5. Verify from a client's point of view** (a host on the tablet network): \`nc -zv media-01 7443\` succeeds.`,
  },
  simulationNote:
    "Four simulated hosts on 10.20.0.0/16; use `ssh HOST` to move between them. ops-ws stands in for a dispatcher's browser: the grader reads the deployed config.js from web-01 and calls the apiBase it names with curl from ops-ws, which is what the browser does. nginx's static file serving is not simulated, so edit the file on web-01 directly. The API's port comes from its release, not from server.yaml in this lab, so moving it back is not an option.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-09T08:05:00Z",
      segments: [{ name: "lan", cidr: "10.20.0.0/16" }],
      start: { host: "ops-ws", user: "oncall", cwd: "/home/oncall" },
      hosts: [
        {
          name: "ops-ws",
          users: [oncall],
          groups: baseGroups,
          interfaces: [lo, { name: "eth0", address: "10.20.5.15/16" }],
          processes: [sshd],
          files: [
            home,
            resolv,
            { path: "/home/oncall/incident", type: "dir", owner: "oncall", group: "oncall", mode: "0755" },
            { path: "/home/oncall/incident/dashboard-console.log", content: consoleLog, owner: "oncall", group: "oncall", mode: "0444" },
            { path: "/home/oncall/incident/shipments-panel.js", content: panelJs, owner: "oncall", group: "oncall", mode: "0444" },
          ],
        },
        {
          name: "web-01",
          users: [oncall, { name: "deploy", uid: 1200, groups: ["www-data"], home: "/home/deploy" }],
          groups: [...baseGroups, { name: "deploy", gid: 1200 }, { name: "www-data", gid: 33 }],
          interfaces: [lo, { name: "eth0", address: "10.20.1.10/16" }],
          processes: [sshd],
          services: [
            {
              name: "nginx",
              description: "A high performance web server and a reverse proxy server",
              command: "/usr/sbin/nginx -g daemon on; master_process on;",
              state: "active",
              enabled: true,
              kind: "http",
              listens: [{ port: 80, proto: "tcp" }],
              http: [{ path: "/", status: 200, body: "<!doctype html><title>Lumen Dispatch</title><script src=\"/config.js\"></script><script type=\"module\" src=\"/app.js\"></script>\n" }],
            },
          ],
          files: [
            home,
            resolv,
            { path: "/var/www/dispatch", type: "dir", mode: "0755", owner: "deploy", group: "www-data" },
            { path: "/var/www/dispatch/config.js", content: configJs, mode: "0644", owner: "deploy", group: "www-data" },
            { path: "/var/www/dispatch/shipments-panel.js", content: panelJs, mode: "0644", owner: "deploy", group: "www-data" },
          ],
        },
        {
          name: "api-01",
          users: [oncall, { name: "svc-ship", uid: 994, home: "/nonexistent", shell: "/usr/sbin/nologin" }],
          groups: [...baseGroups, { name: "svc-ship", gid: 994 }],
          interfaces: [lo, { name: "eth0", address: "10.20.1.20/16" }],
          processes: [sshd],
          services: [
            {
              name: "shipments-api",
              description: "Lumen shipments API",
              execUser: "svc-ship",
              command: "/usr/bin/node /opt/shipments-api/server.js",
              state: "active",
              enabled: true,
              listens: [
                { port: 9090, proto: "tcp" },
                { port: 9091, proto: "tcp" },
              ],
              http: [
                { path: "/v1/shipments", status: 200, body: "{\"depot\":\"ORD\",\"shipments\":[{\"id\":\"LMN30051200\",\"status\":\"in_transit\"}]}\n" },
                { path: "/health", status: 200, body: "{\"status\":\"ok\",\"version\":\"5.0.0\"}\n" },
                { path: "/metrics", status: 200, body: "shipments_api_requests_total 18231\n" },
              ],
              journal: [
                "Mar 08 14:02:11 api-01 systemd[1]: Started shipments-api.service - Lumen shipments API.",
                "Mar 08 14:02:12 api-01 node[3120]: shipments-api 5.0.0 listening on 0.0.0.0:9090 (admin on 0.0.0.0:9091)",
              ],
            },
          ],
          files: [
            home,
            resolv,
            { path: "/etc/shipments-api", type: "dir", mode: "0755" },
            { path: "/etc/shipments-api/server.yaml", content: serverYaml, mode: "0644" },
            { path: "/opt/shipments-api", type: "dir", mode: "0755" },
            { path: "/opt/shipments-api/RELEASE-5.0.0.txt", content: releaseNotes, mode: "0644" },
          ],
          firewall: {
            enabled: true,
            defaultInbound: "deny",
            rules: [
              { action: "allow", port: 22, proto: "tcp", from: "10.20.0.0/16" },
              { action: "allow", port: 8080, proto: "tcp", from: "10.20.0.0/16" },
              { action: "allow", port: 9090, proto: "tcp", from: "10.20.1.10/32" },
            ],
          },
        },
        {
          name: "dns-01",
          users: [oncall],
          groups: baseGroups,
          interfaces: [lo, { name: "eth0", address: "10.20.0.53/16" }],
          processes: [sshd],
          services: [{ name: "named", description: "BIND Domain Name Server", command: "/usr/sbin/named -f -u bind", state: "active", enabled: true, kind: "dns", execUser: "bind" }],
          files: [home],
          dnsZones: {
            "dispatch.lumen.internal": "10.20.1.10",
            "web-01.lumen.internal": "10.20.1.10",
            "api-01.lumen.internal": "10.20.1.20",
            "ops-ws.lumen.internal": "10.20.5.15",
          },
        },
      ],
    },
    checks: [
      {
        id: "browser-gets-shipments",
        name: "A browser on ops-ws, using the deployed config.js, gets HTTP 200 from the API",
        assert: { type: "command_output", host: "ops-ws", user: "oncall", run: browserFetch, pattern: "^200$" },
        feedback: {
          what: "Taking apiBase from web-01's /var/www/dispatch/config.js and requesting `<apiBase>/shipments` from ops-ws does not return HTTP 200.",
          why: "This is exactly what every dispatcher's browser does. A local edit on one laptop, or a test from web-01, does not fix it for them.",
          next: "Check both layers from ops-ws: is apiBase on web-01 using the port the API actually listens on (`ss -tlnp` on api-01)? Then try `curl -v` against that URL from ops-ws: refused points to the port, a timeout points to the firewall.",
        },
      },
      {
        id: "clients-reach-api-port",
        name: "Client networks can reach api-01 on TCP 9090",
        assert: {
          type: "all",
          of: [
            { type: "reachable", from: "ops-ws", to: "api-01", port: 9090, expect: true },
            { type: "reachable", from: "web-01", to: "api-01", port: 9090, expect: true },
          ],
        },
        feedback: {
          what: "ops-ws (a dispatcher machine) or web-01 cannot open a TCP connection to api-01:9090.",
          why: "The browser connects to the API directly from the user's machine. The existing rule only admitted web-01, so every dispatcher's connection was silently dropped.",
          next: "On api-01, read `sudo ufw status numbered`. Allow 9090/tcp from the client network named in the brief (10.20.0.0/16), not from a single host.",
        },
      },
      {
        id: "admin-port-closed",
        name: "The admin port 9091 is still blocked for clients",
        assert: {
          type: "all",
          of: [
            { type: "reachable", from: "ops-ws", to: "api-01", port: 9091, expect: false },
            { type: "reachable", from: "web-01", to: "api-01", port: 9091, expect: false },
          ],
        },
        feedback: {
          what: "api-01's admin/metrics port 9091 is reachable from client machines.",
          why: "The admin listener exposes debug endpoints. Disabling the firewall or switching it to default-allow fixes the dashboard but opens everything else on the host.",
          next: "Keep ufw enabled with default deny (`sudo ufw enable`, `sudo ufw default deny incoming`) and add a rule for 9090 only.",
        },
      },
      {
        id: "stale-rule-removed",
        name: "No firewall rule still allows the retired port 8080",
        assert: {
          type: "command_output",
          host: "api-01",
          user: "oncall",
          run: "sudo ufw status",
          pattern: "^(?![\\s\\S]*\\b8080\\b)[\\s\\S]*Status: active",
          flags: "",
        },
        feedback: {
          what: "`sudo ufw status` on api-01 still lists a rule for port 8080 (or the firewall is inactive).",
          why: "Release notes reserve 8080 for the upcoming sidecar proxy. A leftover allow rule would expose it to the whole network the day it starts listening.",
          next: "List rules with `sudo ufw status numbered` and delete the 8080 rule, either by number or with `sudo ufw delete allow from 10.20.0.0/16 to any port 8080 proto tcp`.",
        },
      },
    ],
    solution: [
      "cat ~/incident/dashboard-console.log",
      "ssh api-01",
      "cat /opt/shipments-api/RELEASE-5.0.0.txt",
      "sudo ss -tlnp",
      "curl -s http://localhost:9090/health",
      "sudo ufw status numbered",
      "sudo ufw allow from 10.20.0.0/16 to any port 9090 proto tcp",
      "sudo ufw delete allow from 10.20.1.10/32 to any port 9090 proto tcp",
      "sudo ufw delete allow from 10.20.0.0/16 to any port 8080 proto tcp",
      "sudo ufw status numbered",
      "exit",
      "ssh web-01",
      "cat /var/www/dispatch/config.js",
      "sudo sed -i 's#api-01.lumen.internal:8080/v1#api-01.lumen.internal:9090/v1#' /var/www/dispatch/config.js",
      "grep apiBase /var/www/dispatch/config.js",
      "exit",
      "curl -s -o /dev/null -w '%{http_code}\\n' 'http://api-01.lumen.internal:9090/v1/shipments?depot=ORD'",
      "nc -zv api-01.lumen.internal 9091",
    ],
    wrongSolutions: [
      {
        label: "Fixes config.js but only allows 9090 from web-01 (the server, not the browsers)",
        steps: [
          "ssh web-01",
          "sudo sed -i 's#:8080/v1#:9090/v1#' /var/www/dispatch/config.js",
          "exit",
          "ssh api-01",
          "sudo ufw delete allow from 10.20.0.0/16 to any port 8080 proto tcp",
          "exit",
        ],
      },
      {
        label: "Disables the firewall to make the timeout go away",
        steps: [
          "ssh web-01",
          "sudo sed -i 's#:8080/v1#:9090/v1#' /var/www/dispatch/config.js",
          "exit",
          "ssh api-01",
          "sudo ufw disable",
          "exit",
        ],
      },
      {
        label: "Opens the firewall correctly but leaves the deployed config on port 8080",
        steps: [
          "ssh api-01",
          "sudo ufw allow from 10.20.0.0/16 to any port 9090 proto tcp",
          "sudo ufw delete allow from 10.20.0.0/16 to any port 8080 proto tcp",
          "exit",
        ],
      },
      {
        label: "Fixes both but leaves the stale 8080 allow rule in place",
        steps: [
          "ssh web-01",
          "sudo sed -i 's#:8080/v1#:9090/v1#' /var/www/dispatch/config.js",
          "exit",
          "ssh api-01",
          "sudo ufw allow from 10.20.0.0/16 to any port 9090 proto tcp",
          "exit",
        ],
      },
    ],
    starterCommands: [
      "cat ~/incident/dashboard-console.log",
      "curl -v http://api-01.lumen.internal:8080/v1/shipments",
      "curl -v --max-time 5 http://api-01.lumen.internal:9090/v1/shipments",
      "ssh api-01",
    ],
  },
  successCriteria: [
    "From ops-ws, the API URL in web-01's deployed config.js returns HTTP 200",
    "Both ops-ws and web-01 can open TCP 9090 on api-01",
    "Port 9091 on api-01 stays unreachable from clients (firewall still default-deny)",
    "No firewall rule mentions the retired port 8080",
  ],
  hints: [
    "Compare the two errors in the console export. What does \"refused\" tell you that \"timed out\" does not? Reproduce both from ops-ws with `curl -v`.",
    "Refused on 8080: on api-01, `sudo ss -tlnp` shows what is really listening, and the release notes explain the move. Timed out on 9090: the service is listening, so look at what sits in front of it: `sudo ufw status numbered`.",
    "Who opens the connection to the API, web-01 or the dispatcher's browser? Compare that with the `From` column of the 9090 rule.",
    "On api-01: `sudo ufw allow from 10.20.0.0/16 to any port 9090 proto tcp`, then delete the old 8080 rule (and the now-redundant web-01-only rule) with `sudo ufw delete allow from ... to any port ... proto tcp`. On web-01: change apiBase in /var/www/dispatch/config.js to port 9090 (for example with `sudo sed -i`). Re-test from ops-ws.",
  ],
  questions: [
    {
      id: "refused-to-timeout",
      kind: "mcq",
      prompt:
        "Aiko changed apiBase from :8080 to :9090 and the error changed from `ERR_CONNECTION_REFUSED` to `ERR_CONNECTION_TIMED_OUT`. What does that change tell you?",
      options: [
        "Her edit made things worse, so 8080 is the right port after all",
        "9090 is the right port (something listens there), but packets to it are being dropped before they reach the service, most likely by a firewall",
        "DNS now resolves api-01 to a different address",
        "The API is overloaded and responding slowly",
      ],
      answer: 1,
      explanation:
        "Refused means the host answered and nothing was listening on 8080. A connect timeout means no answer came back at all, which is the signature of a default-deny firewall dropping the SYN. A slow API would accept the connection first and then time out on the response.",
    },
    {
      id: "why-web-01-rule-failed",
      kind: "explain",
      prompt:
        "The firewall already had `9090/tcp ALLOW IN 10.20.1.10` (web-01). Explain to Sam why that rule did not help the dispatchers, and what the correct rule is.",
      explanation:
        "The key idea is where the fetch() call originates: in the browser on each dispatcher's machine, so the API sees their addresses, not web-01's.",
      concepts: [
        { label: "the JavaScript runs in the user's browser", anyOf: ["browser", "client side", "client-side", "runs on the user", "dispatcher's machine", "dispatchers' machines", "their machine", "laptop", "workstation"] },
        { label: "connections come from client addresses, not web-01", anyOf: ["not web-01", "not from web-01", "source address", "source ip", "client address", "client network", "client ip", "from the dispatchers", "directly to api-01", "directly to the api", "10.20.5"] },
        { label: "the rule only allowed one host", anyOf: ["only web-01", "only allowed web-01", "single host", "one host", "10.20.1.10", "/32"] },
        { label: "allow 9090 from the client network", anyOf: ["10.20.0.0/16", "client network", "office network", "whole network", "allow from 10.20"] },
      ],
      minConcepts: 3,
      modelAnswer:
        "The dashboard's JavaScript runs in each dispatcher's browser, so fetch() opens the connection from their machine (for example 10.20.5.15) directly to api-01:9090. web-01 only serves the files and never relays these requests. The rule allowed 9090 from a single host, 10.20.1.10, so every dispatcher's connection fell through to the default deny and timed out. The correct rule allows 9090/tcp from the client network, 10.20.0.0/16, while 9091 stays blocked.",
    },
    {
      id: "predict-curl-exit",
      kind: "mcq",
      prompt: "Before any fix, which output do you expect from ops-ws?",
      code: "curl -s -o /dev/null -w '%{http_code}' http://api-01.lumen.internal:9091/metrics; echo \" exit=$?\"",
      codeLanguage: "bash",
      options: [
        "`200 exit=0`, because the admin listener is up",
        "` exit=7` (connection refused)",
        "` exit=28` (timed out), because no rule admits 9091 and the default is deny",
        "` exit=6` (could not resolve host)",
      ],
      answer: 2,
      explanation:
        "Something listens on 9091, but no ufw rule allows it and the default inbound policy is deny, so the SYN is dropped and curl gives up with exit 28. That is the behaviour you want to keep after your fix.",
    },
  ],
  debrief: {
    solution: `Two faults from one half-finished change: shipments-api 5.0 moved from 8080 to 9090.

**1. Wrong port in the deployed config (refused).** \`/var/www/dispatch/config.js\` on web-01 still said \`:8080\`. On api-01, \`sudo ss -tlnp\` showed listeners on 9090 and 9091 only, so 8080 refused. Fix the file that is actually served:

\`\`\`bash
sudo sed -i 's#api-01.lumen.internal:8080/v1#api-01.lumen.internal:9090/v1#' /var/www/dispatch/config.js
\`\`\`

**2. Firewall admitted the wrong source (timed out).** api-01 is default-deny. The 9090 rule allowed only \`10.20.1.10\` (web-01), but the requests come from the dispatchers' browsers. Allow the client network, and remove the stale and redundant rules:

\`\`\`bash
sudo ufw allow from 10.20.0.0/16 to any port 9090 proto tcp
sudo ufw delete allow from 10.20.1.10/32 to any port 9090 proto tcp
sudo ufw delete allow from 10.20.0.0/16 to any port 8080 proto tcp
\`\`\`

**Verify like a user:** from ops-ws, \`curl\` the URL from the deployed config (200), and \`nc -zv api-01.lumen.internal 9091\` should still time out.`,
    commonMistakes: [
      "Testing from web-01 and declaring it fixed. web-01 was already allowed; dispatchers were not.",
      "Running `ufw disable` (or `default allow`) to get rid of the timeout. That also exposes the 9091 admin listener.",
      "Editing a local copy of config.js in the browser or on a laptop instead of the file web-01 serves.",
      "Moving the API back to 8080 to avoid touching the firewall, which undoes a deliberate platform change.",
      "Leaving the 8080 allow rule behind, so whatever listens on 8080 next is exposed automatically.",
    ],
    realWorld:
      "Port moves are classic two-team changes: the service team changes the listener, and the client configuration and firewall policy belong to someone else. A release checklist that lists every consumer and every firewall rule tied to the old port prevents this. When debugging, the refused/timeout distinction saves a lot of time, and so does remembering that single-page apps make their API calls from the user's network, which also matters for CORS, VPN users and split-horizon DNS.",
  },
  review: [
    {
      id: "cap-refused-vs-timeout",
      skill: "net.ports",
      variants: [
        {
          id: "cap-refused-vs-timeout-a",
          kind: "mcq",
          prompt: "`curl http://geo-01:7000/` fails immediately with `curl: (7) Failed to connect ... Connection refused`. What is the most likely cause?",
          options: [
            "A firewall is silently dropping the packets",
            "Nothing is listening on port 7000 on geo-01 (wrong port or the service is down)",
            "geo-01 does not resolve",
            "The service is slow to respond",
          ],
          answer: 1,
          explanation: "A refusal is an active answer from the host: the TCP port is closed. Check `ss -tlnp` on the host and the URL's port.",
        },
        {
          id: "cap-refused-vs-timeout-b",
          kind: "mcq",
          prompt: "`nc -zv rates-01 8200` hangs and then prints `Connection timed out`. `ss -tlnp` on rates-01 shows a listener on 0.0.0.0:8200. What should you check next?",
          options: [
            "Whether the service is running",
            "The firewall rules on rates-01 (or on the path) for 8200 from your address",
            "The application's log level",
            "Whether port 8200 is above 1024",
          ],
          answer: 1,
          explanation: "The service is listening, yet no answer came back. Packets are being dropped, usually by a firewall that does not admit your source address.",
        },
      ],
    },
    {
      id: "cap-browser-source-address",
      skill: "js.fetch",
      variants: [
        {
          id: "cap-browser-source-address-a",
          kind: "mcq",
          prompt:
            "A single-page app is served by `web-02` (10.20.1.12). Its JavaScript calls `fetch(\"http://pricing-01:8800/quote\")`. Users are on 10.20.40.0/24. Which firewall rule on pricing-01 lets the app work?",
          options: [
            "Allow 8800/tcp from 10.20.1.12",
            "Allow 8800/tcp from 10.20.40.0/24",
            "Allow 80/tcp from 10.20.40.0/24 on web-02",
            "No rule is needed because web-02 proxies the call",
          ],
          answer: 1,
          explanation: "fetch() runs in the user's browser, so pricing-01 sees connections from 10.20.40.0/24. web-02 only served the files.",
        },
        {
          id: "cap-browser-source-address-b",
          kind: "mcq",
          prompt:
            "The dispatch dashboard works when Aiko tests from web-01 with curl, but every dispatcher's browser times out calling the API directly. What is the most likely explanation?",
          options: [
            "The dispatchers use an older browser",
            "The API firewall admits web-01's address but not the dispatchers' network, and the browser connects from the dispatcher's machine",
            "web-01 caches the API responses",
            "The API only supports curl's User-Agent",
          ],
          answer: 1,
          explanation: "curl on web-01 connects from web-01. The browser connects from the user's machine. A rule that only admits web-01 explains the difference.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev moves the lab's syslog collector on `gw-01` from UDP 514 to UDP 6514. Switches in the 192.168.50.0/24 lab send logs to it. After the change, no logs arrive. `ss -ulnp` on gw-01 shows the collector on 0.0.0.0:6514, and `sudo ufw status` shows `514/udp ALLOW IN 192.168.50.0/24` and default deny.",
    question: {
      id: "transfer-syslog-port",
      kind: "mcq",
      prompt: "Which two changes complete the move?",
      options: [
        "Restart the collector and reboot the switches",
        "Point the switches at port 6514, allow 6514/udp from 192.168.50.0/24 on gw-01, and remove the old 514 rule",
        "Disable ufw on gw-01 so any port works",
        "Allow 6514/udp from gw-01's own address",
      ],
      answer: 1,
      explanation:
        "As with the dashboard, both the client configuration (the switches' target port) and the firewall (the new port from the clients' network) must follow the move. Then clean up the stale rule.",
    },
  },
  refresher: {
    body: `Two connection errors, two different layers:

- **Refused**: the host answered "nothing here". The port is wrong or the service is down. Check the URL and \`ss -tlnp\`.
- **Timed out**: nothing answered. Packets were dropped, usually by a firewall. Check \`ufw status\` on the target.

Browser JavaScript calls APIs **from the user's machine**, so firewall rules must allow the users' network, not the web server that served the page.`,
    practice: {
      id: "refresher-timeout-layer",
      kind: "mcq",
      prompt: "A browser shows `ERR_CONNECTION_TIMED_OUT` calling an API that is running and listening. What is the first thing to check?",
      options: ["The API's source code", "Firewall rules for that port from the user's network", "The browser's cache", "The API's log level"],
      answer: 1,
      explanation: "Running and listening plus a timeout means packets are dropped on the way. Check the firewall for the user's source network first.",
    },
  },
};
