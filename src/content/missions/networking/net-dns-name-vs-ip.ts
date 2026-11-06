import type { MissionInput } from "@/content/schema";
import { OPS, SEGMENTS, WWW_USER, dispatchNginx, dnsServer, gateway } from "./lab";

const staleResolv = `# Static resolver config for ops-ws (this host does not use DHCP).
# Last reviewed 2025-06-12.
nameserver 10.20.1.35
search lumen.internal
`;

const migrationNote = `From: Dev Okafor
Subject: DNS migration complete

dns-old (10.20.1.35) is powered off as of 2026-11-04 22:00.
All lumen.internal records now live on dns-01 at 10.20.1.53.
DHCP clients get the new server automatically. Hosts with static
resolver config need /etc/resolv.conf updated by hand.
`;

export const netDnsNameVsIp: MissionInput = {
  slug: "net-dns-name-vs-ip",
  version: 1,
  track: "networking",
  tier: "beginner",
  order: 3,
  title: "The dashboard works by IP but not by name",
  summary:
    "ops-ws can reach the dispatch server by IP address, but every hostname fails. Prove the network path is fine, find where name resolution breaks, and fix it properly rather than with /etc/hosts.",
  minutes: 25,
  assessmentTypes: ["configure-system", "interpret-output", "explain-root-cause"],
  skills: ["net.dns"],
  appliesSkills: ["net.troubleshooting", "net.addressing"],
  prerequisites: ["net-ipv4-addressing"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#ops",
    body: `The night-shift lead says the dispatch dashboard on **ops-ws** shows "server not found" — but when Aiko typed \`http://10.20.1.10/\` into the browser it loaded fine. The shipment-export script on the same box is also failing on \`api.lumen.internal\`.

Dev finished a DNS migration last night (his note is in \`~/dns-migration.txt\`). Could you find out exactly why names fail when IPs work, fix it properly, and give me a two-sentence explanation I can paste into the incident log?

Please don't just paste addresses into /etc/hosts — last time we did that, it broke silently when web-01 moved.`,
  },
  objectives: [
    "Separate a name-resolution failure from a connectivity failure by testing with the IP address",
    "Trace how a Linux host resolves names: /etc/hosts first, then the nameservers in /etc/resolv.conf",
    "Query a specific DNS server with `dig @server` to prove which server can answer",
    "Explain why an /etc/hosts entry is a workaround rather than a fix",
  ],
  concept: {
    title: "How a hostname becomes an address",
    body: `Programs like \`curl\` and \`ping\` ask the system resolver to turn a name into an IP address before any connection is made. On a typical Linux host the resolver:

1. checks **/etc/hosts** for a static entry;
2. otherwise sends a DNS query to each \`nameserver\` listed in **/etc/resolv.conf**, in order, waiting for a timeout before trying the next;
3. appends the \`search\` domain to short names (\`api\` → \`api.lumen.internal\`).

If the nameserver is unreachable or wrong, *every* name fails — but connecting by IP still works, because no lookup happens. That contrast is the key diagnostic:

\`\`\`
curl http://10.20.1.10/            # works  -> network + web server are fine
curl http://dispatch.lumen.internal/   # fails  -> problem is name resolution
\`\`\`

Then look at which server is being asked and whether a known-good server answers:

\`\`\`
cat /etc/resolv.conf
dig dispatch.lumen.internal               # uses resolv.conf
dig @10.20.1.53 dispatch.lumen.internal   # asks one server directly
\`\`\`

\`dig\` and \`nslookup\` talk to DNS directly and **ignore /etc/hosts**, which makes them good for testing the DNS path itself.`,
  },
  workedExample: {
    title: "Worked example: a depot kiosk that can't find the label service",
    body: `Kiosk \`kiosk-12\` reports \`curl: (6) Could not resolve host: labels.lumen.test\`.

**1. Prove connectivity by IP.** The service is at 10.40.2.15:
\`\`\`
$ curl -s http://10.40.2.15/health
ok
\`\`\`
The network path and the service are fine. The problem is the name.

**2. Which server is the kiosk asking?**
\`\`\`
$ cat /etc/resolv.conf
nameserver 10.40.2.99
\`\`\`

**3. Does that server answer? Does the right one?**
\`\`\`
$ dig labels.lumen.test
;; communications error to 10.40.2.99#53: timed out
$ dig @10.40.2.53 +short labels.lumen.test
10.40.2.15
\`\`\`
10.40.2.99 doesn't respond; 10.40.2.53 knows the record.

**4. Fix the resolver config**, then re-test with the original command:
\`\`\`
$ sudo sed -i 's/10.40.2.99/10.40.2.53/' /etc/resolv.conf
$ curl -s http://labels.lumen.test/health
ok
\`\`\`

The kiosk now uses DNS for every name, so future moves of the label service need no changes on the kiosk.`,
  },
  simulationNote:
    "DNS servers here answer A records from a fixed zone; there is no caching daemon (systemd-resolved) and no AAAA/MX records. /etc/hosts and /etc/resolv.conf behave like glibc's resolver: hosts file first, then each nameserver in order.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T19:05:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.1", dev: "eth0" }],
          files: [
            { path: "/etc/resolv.conf", content: staleResolv },
            { path: "/home/ops/dns-migration.txt", content: migrationNote, owner: "ops", group: "ops" },
          ],
        },
        gateway(),
        dnsServer(),
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          services: [dispatchNginx],
        },
        {
          name: "api-01",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "10.20.1.20/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          services: [
            {
              name: "tracking-api",
              execUser: "root",
              command: "/opt/tracking-api/bin/tracking-api --port 8080",
              state: "active",
              enabled: true,
              kind: "http",
              listens: [{ port: 8080, proto: "tcp" }],
              http: [{ path: "/health", status: 200, body: "{\"status\":\"ok\"}\n" }],
            },
          ],
        },
      ],
      segments: SEGMENTS,
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "dispatch-resolves",
        name: "dispatch.lumen.internal resolves to 10.20.1.10 on ops-ws",
        assert: { type: "resolves", from: "ops-ws", name: "dispatch.lumen.internal", ip: "10.20.1.10", expect: true },
        feedback: {
          what: "ops-ws still cannot resolve dispatch.lumen.internal to 10.20.1.10.",
          why: "Until the name resolves, the browser and every script on ops-ws fail before they connect.",
          next: "Look at /etc/resolv.conf and compare it with ~/dns-migration.txt. Check which server answers with `dig @10.20.1.53 dispatch.lumen.internal`.",
        },
      },
      {
        id: "dashboard-by-name",
        name: "The dashboard loads by name from ops-ws",
        assert: { type: "http_status", from: "ops-ws", url: "http://dispatch.lumen.internal/", status: 200 },
        feedback: {
          what: "`curl http://dispatch.lumen.internal/` from ops-ws does not return HTTP 200.",
          why: "This is the night shift's actual symptom.",
          next: "Once the name resolves, re-run `curl -I http://dispatch.lumen.internal/`. If resolution works but curl fails, note the new error — it points to a different layer.",
        },
      },
      {
        id: "dns-path-fixed",
        name: "Other names work through DNS and the dead resolver is gone",
        assert: {
          type: "all",
          of: [
            { type: "resolves", from: "ops-ws", name: "api.lumen.internal", ip: "10.20.1.20", expect: true },
            { type: "command_output", host: "ops-ws", run: "dig +short dispatch.lumen.internal", pattern: "^10\\.20\\.1\\.10$" },
            { type: "file_not_matches", host: "ops-ws", path: "/etc/resolv.conf", pattern: "^\\s*nameserver\\s+10\\.20\\.1\\.35\\b" },
          ],
        },
        feedback: {
          what: "Name resolution on ops-ws still doesn't work through DNS for every name, or /etc/resolv.conf still lists the decommissioned server 10.20.1.35.",
          why: "An /etc/hosts entry fixes one name on one machine and silently goes stale when the server moves; the export script needs api.lumen.internal too. A dead nameserver left at the top of resolv.conf makes every lookup wait for a timeout first.",
          next: "Point /etc/resolv.conf at dns-01 (10.20.1.53) instead of 10.20.1.35, e.g. `sudo sed -i 's/10.20.1.35/10.20.1.53/' /etc/resolv.conf`, then check `dig +short api.lumen.internal`.",
        },
      },
    ],
    solution: [
      "curl -s -o /dev/null -w '%{http_code}\\n' http://10.20.1.10/",
      "cat /etc/resolv.conf",
      "dig dispatch.lumen.internal",
      "dig @10.20.1.53 +short dispatch.lumen.internal",
      "sudo sed -i 's/10.20.1.35/10.20.1.53/' /etc/resolv.conf",
      "dig +short api.lumen.internal",
      "curl -I http://dispatch.lumen.internal/",
    ],
    wrongSolutions: [
      {
        label: "Hard-codes the dashboard in /etc/hosts",
        steps: ["echo '10.20.1.10 dispatch.lumen.internal' | sudo tee -a /etc/hosts"],
      },
      {
        label: "Hard-codes both names in /etc/hosts and leaves resolv.conf alone",
        steps: ["echo '10.20.1.10 dispatch.lumen.internal' | sudo tee -a /etc/hosts", "echo '10.20.1.20 api.lumen.internal' | sudo tee -a /etc/hosts"],
      },
      {
        label: "Points the resolver at the gateway, which doesn't run DNS",
        steps: ["sudo sed -i 's/10.20.1.35/192.168.50.1/' /etc/resolv.conf"],
      },
    ],
    starterCommands: ["curl -I http://dispatch.lumen.internal/", "curl -I http://10.20.1.10/", "cat /etc/resolv.conf", "dig dispatch.lumen.internal"],
  },
  successCriteria: [
    "dispatch.lumen.internal resolves to 10.20.1.10 on ops-ws",
    "http://dispatch.lumen.internal/ returns HTTP 200 from ops-ws",
    "Other lumen.internal names resolve through DNS, and the decommissioned resolver is no longer configured",
  ],
  hints: [
    "First prove the network path: does the dashboard load with `curl -I http://10.20.1.10/`? If yes, routing and the web server are fine and only the name lookup is failing.",
    "`cat /etc/resolv.conf` shows which DNS server ops-ws asks. Compare it with `~/dns-migration.txt`.",
    "`dig dispatch.lumen.internal` (uses resolv.conf) times out, while `dig @10.20.1.53 dispatch.lumen.internal` answers. The host is asking a server that no longer exists.",
    "Replace 10.20.1.35 with 10.20.1.53 in /etc/resolv.conf: `sudo sed -i 's/10.20.1.35/10.20.1.53/' /etc/resolv.conf`. Then re-test `dig +short api.lumen.internal` and `curl -I http://dispatch.lumen.internal/`.",
  ],
  questions: [
    {
      id: "interpret-dig-timeout",
      kind: "mcq",
      prompt: "Before the fix, what did this output tell you?",
      code: "$ dig dispatch.lumen.internal\n;; communications error to 10.20.1.35#53: timed out\n\n; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>> dispatch.lumen.internal\n;; global options: +cmd\n;; no servers could be reached",
      codeLanguage: "text",
      options: [
        "The record dispatch.lumen.internal does not exist",
        "The configured nameserver never answered, so no record was looked up at all",
        "web-01 is down",
        "dig needs root to run",
      ],
      answer: 1,
      explanation:
        "A timeout means no DNS server replied. A missing record would come back quickly with status NXDOMAIN from a working server. web-01's state is irrelevant to a lookup.",
    },
    {
      id: "explain-hosts-workaround",
      kind: "explain",
      prompt: "For Sam's incident log: explain the root cause, and why adding `10.20.1.10 dispatch.lumen.internal` to /etc/hosts would only have been a workaround.",
      concepts: [
        { label: "resolv.conf pointed at the old / decommissioned nameserver", anyOf: ["resolv.conf", "nameserver", "10.20.1.35", "old dns", "old server", "decommissioned", "dns-old", "wrong dns server", "stale"] },
        { label: "IP connectivity was fine; only resolution failed", anyOf: ["by ip", "ip address worked", "ip works", "connectivity was fine", "network was fine", "only resolution", "only dns", "only the name"] },
        { label: "/etc/hosts is per-host and static, goes stale", anyOf: ["stale", "static", "hard-coded", "hardcoded", "one machine", "per host", "per-host", "only that name", "out of date", "moves", "changes", "bypass"] },
      ],
      minConcepts: 2,
      explanation:
        "The resolver config was the fault; /etc/hosts would hide it for one name on one machine and break again when addresses change.",
      modelAnswer:
        "Root cause: after the DNS migration, ops-ws's static /etc/resolv.conf still pointed at the decommissioned nameserver 10.20.1.35, so every lookup timed out, while connecting by IP worked because no DNS was involved. An /etc/hosts entry would be a hard-coded, per-host workaround: it fixes only that one name on that one machine, bypasses DNS, and silently goes stale when web-01 moves. We pointed resolv.conf at dns-01 (10.20.1.53) instead.",
    },
    {
      id: "predict-hosts-vs-dig",
      kind: "mcq",
      prompt: "Suppose you had only added `10.20.1.10 dispatch.lumen.internal` to /etc/hosts. Which command would still fail?",
      options: ["curl http://dispatch.lumen.internal/", "ping dispatch.lumen.internal", "dig dispatch.lumen.internal", "getent hosts dispatch.lumen.internal"],
      answer: 2,
      explanation:
        "curl, ping and getent use the system resolver, which reads /etc/hosts first. dig queries the DNS server directly and ignores /etc/hosts, so it would still time out — a quick way to spot a hosts-file workaround.",
    },
  ],
  debrief: {
    solution: `\`\`\`
$ curl -s -o /dev/null -w '%{http_code}\\n' http://10.20.1.10/
200                                     # path + web server OK
$ cat /etc/resolv.conf
nameserver 10.20.1.35                   # dns-old, powered off
$ dig dispatch.lumen.internal           # timed out
$ dig @10.20.1.53 +short dispatch.lumen.internal
10.20.1.10                              # dns-01 has the record
$ sudo sed -i 's/10.20.1.35/10.20.1.53/' /etc/resolv.conf
$ curl -I http://dispatch.lumen.internal/
HTTP/1.1 200 OK
\`\`\`

The IP test isolated the problem to name resolution; \`dig @server\` proved which server could answer. Fixing resolv.conf repaired *every* name — dispatch, api, and anything added later — because ops-ws now asks the authoritative server.

**Why not /etc/hosts?** It would make \`curl\` work for the one name you add, but it bypasses DNS, has to be maintained on every machine, and becomes silently wrong the day the address changes. It's acceptable only as a short, documented emergency workaround with a ticket to remove it.`,
    commonMistakes: [
      "Adding /etc/hosts entries: the dashboard works, but api.lumen.internal and every future name still fail, and the entry goes stale when web-01 moves.",
      "Appending the new nameserver below the dead one: lookups work but each one first waits for the old server to time out.",
      "Pointing resolv.conf at the gateway or another host that doesn't run a DNS server.",
      "Concluding the record is missing from a timeout — a missing record returns NXDOMAIN quickly; a timeout means no server answered.",
    ],
    realWorld:
      "On many Linux desktops /etc/resolv.conf is generated (systemd-resolved, NetworkManager, DHCP), so the durable fix is in that layer's config — `resolvectl status` shows the real upstream servers. During DNS migrations, teams keep the old resolver's IP answering (or alias it to the new server) for a while precisely because statically configured hosts like this one are easy to miss.",
  },
  review: [
    {
      id: "net-ip-vs-name",
      skill: "net.dns",
      variants: [
        {
          id: "net-ip-vs-name-a",
          kind: "mcq",
          prompt: "`curl http://10.20.1.20:8080/health` works; `curl http://api.lumen.internal:8080/health` says \"Could not resolve host\". Where is the problem?",
          options: ["Routing", "The API service", "Name resolution (DNS or resolver config)", "The firewall on api-01"],
          answer: 2,
          explanation: "The IP request proves routing, firewall and service are fine; only the lookup fails.",
        },
        {
          id: "net-ip-vs-name-b",
          kind: "mcq",
          prompt: "`ping 10.20.1.60` replies, `ping reports.lumen.internal` prints \"Temporary failure in name resolution\". What do you check first?",
          options: ["/etc/resolv.conf and whether its nameserver answers", "The reports server's disk space", "The default route", "The interface MTU"],
          answer: 0,
          explanation: "\"Temporary failure\" means no nameserver answered; check which servers resolv.conf lists and query them with dig.",
        },
      ],
    },
    {
      id: "net-dig-at-server",
      skill: "net.dns",
      variants: [
        {
          id: "net-dig-at-server-a",
          kind: "short",
          prompt: "Write the `dig` command that asks the server 10.20.1.53 directly for `api.lumen.internal` and prints only the address.",
          accept: ["dig @10.20.1.53 +short api.lumen.internal", "dig +short @10.20.1.53 api.lumen.internal", "dig @10.20.1.53 api.lumen.internal +short"],
          acceptPatterns: ["^dig\\s+(?=.*@10\\.20\\.1\\.53)(?=.*\\+short)(?=.*\\bapi\\.lumen\\.internal\\b).*$"],
          explanation: "`@server` picks the server, `+short` prints just the answer; argument order doesn't matter.",
        },
        {
          id: "net-dig-at-server-b",
          kind: "mcq",
          prompt: "You added `10.20.1.99 web-01.lumen.internal` to /etc/hosts as a test. Which command shows what the DNS server itself says?",
          options: ["getent hosts web-01.lumen.internal", "ping web-01.lumen.internal", "dig web-01.lumen.internal", "curl web-01.lumen.internal"],
          answer: 2,
          explanation: "dig queries DNS directly and ignores /etc/hosts; the others use the system resolver, which reads /etc/hosts first.",
        },
        {
          id: "net-dig-at-server-c",
          kind: "mcq",
          prompt: "`dig @10.20.1.53 shipments.lumen.internal` quickly returns `status: NXDOMAIN`. What does that mean?",
          options: ["The server is unreachable", "The server answered: it has no such record", "The client's resolv.conf is wrong", "UDP is blocked"],
          answer: 1,
          explanation: "NXDOMAIN is an answer from a working server saying the name doesn't exist. Unreachable servers produce timeouts.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Marco's container on `batch-03` can `curl http://10.20.1.20:8080/health` but `curl http://api.lumen.internal:8080/health` fails. Inside the container, /etc/resolv.conf lists `nameserver 127.0.0.11`, and `dig @10.20.1.53 +short api.lumen.internal` returns 10.20.1.20.",
    question: {
      id: "transfer-container-dns",
      kind: "mcq",
      prompt: "What does this tell you?",
      options: [
        "api-01 is down",
        "The container's resolver (127.0.0.11) is not answering or forwarding correctly; dns-01 itself is fine",
        "The record for api.lumen.internal is missing",
        "Routing from batch-03 is broken",
      ],
      answer: 1,
      explanation:
        "By-IP works (path is fine) and the authoritative server answers when asked directly, so the failure is in the resolver the container is configured to use.",
    },
  },
  refresher: {
    body: `Before connecting to a name, a host must resolve it: first **/etc/hosts**, then the DNS servers in **/etc/resolv.conf**. If the IP works but the name doesn't, the network is fine and resolution is broken.

Check \`cat /etc/resolv.conf\`, then \`dig name\` (uses that config) and \`dig @known-good-server name\`. Fix the resolver config rather than adding /etc/hosts entries, which only patch one name on one machine.`,
    practice: {
      id: "refresher-resolv-file",
      kind: "short",
      prompt: "Which file lists the DNS servers a Linux host queries?",
      accept: ["/etc/resolv.conf", "resolv.conf"],
      explanation: "/etc/resolv.conf holds the `nameserver` lines (and the search domain).",
    },
  },
};
