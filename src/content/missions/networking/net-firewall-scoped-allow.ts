import type { MissionInput } from "@/content/schema";
import { OPS, WWW_USER, dnsServer, resolvConf } from "./lab";

const incidentNote = `INC-2291 (2026-10-14) - scraping of reports-01 from the guest Wi-Fi
Mitigation by Priya: added "ufw deny 443/tcp" on reports-01 as an emergency block.
Follow-up (NOT DONE): switch reports-01 to default-deny and allow only the
Atlanta office subnet 192.168.50.0/24 on 443. Guest Wi-Fi is 192.168.60.0/24
and must never reach internal dashboards.
`;

export const netFirewallScopedAllow: MissionInput = {
  slug: "net-firewall-scoped-allow",
  version: 1,
  track: "networking",
  tier: "advanced",
  order: 1,
  title: "Open the reports dashboard to the office — and only the office",
  summary:
    "reports-01's firewall blocks HTTPS from everyone after an old emergency rule. Read ufw's rule order, allow 443 narrowly from the office subnet, keep the guest network out, and don't lock yourself out.",
  minutes: 35,
  assessmentTypes: ["configure-system", "interpret-output", "explain-root-cause"],
  skills: ["net.firewalls"],
  appliesSkills: ["net.ports", "net.subnetting", "net.http"],
  prerequisites: ["net-http-maintenance-503"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#ops",
    body: `Finance can't open \`https://reports.lumen.internal/\` from the Atlanta office — the browser just spins. That's my fault: during last month's scraping incident I added an emergency \`deny 443/tcp\` on **reports-01** and never did the follow-up (see \`~/INC-2291.txt\`).

Please finish it properly: the office (\`192.168.50.0/24\`) gets HTTPS, the **guest Wi-Fi (\`192.168.60.0/24\`) must not**, and the firewall stays on with default-deny. You can test the guest side from \`guest-lt\`, a lab laptop on the guest network.

And please don't \`ufw disable\` "just to check" — that's how the scraping started.`,
  },
  objectives: [
    "Explain how a host firewall evaluates rules: first match wins, then the default policy",
    "Read `ufw status numbered` / `verbose` and predict what a given packet will hit",
    "Write a rule scoped by source subnet, port and protocol",
    "Verify a firewall change from both an allowed and a disallowed source",
  ],
  concept: {
    title: "First match wins, then the default policy",
    body: `A host firewall such as ufw checks each incoming connection against its rules **in order**. The first rule whose conditions all match — protocol, destination port, source address — decides: ALLOW or DENY. If nothing matches, the **default incoming policy** applies.

\`\`\`
$ sudo ufw status numbered
[ 1] 22/tcp      ALLOW IN    192.168.50.0/24
[ 2] 443/tcp     DENY IN     Anywhere
\`\`\`

Here, a connection to 443 from the office hits rule 2 and is denied. Adding \`ufw allow 443/tcp\` appends rule 3 — which is **never reached** for 443, because rule 2 matches first. You must delete the deny or **insert** the allow above it (\`ufw insert 1 ...\`).

Good rules are as narrow as the need:

\`\`\`
sudo ufw allow from 192.168.50.0/24 to any port 443 proto tcp
\`\`\`

With default-deny, everything not explicitly allowed is dropped, so you don't need a matching deny for the guest network.

Dropped packets get no reply, so clients see a **timeout** (not "refused"). Always test from a source that *should* work and from one that *shouldn't*; and keep your own SSH rule in place before you change policy.`,
  },
  workedExample: {
    title: "Worked example: Prometheus scraping a database exporter",
    body: `db-01 runs a metrics exporter on TCP 9187. Only the monitoring server mon-01 (10.20.1.70) should reach it.

**1. Current state:**
\`\`\`
$ sudo ufw status numbered
[ 1] 22/tcp      ALLOW IN    10.20.1.0/24
[ 2] 5432/tcp    ALLOW IN    10.20.1.0/24
Default: deny (incoming)
\`\`\`
mon-01's scrape times out: nothing matches 9187, so the default deny applies.

**2. Narrow allow:**
\`\`\`
$ sudo ufw allow from 10.20.1.70 to any port 9187 proto tcp
\`\`\`
ufw stores the single address as \`10.20.1.70/32\`.

**3. Verify both directions:**
\`\`\`
mon-01$ nc -zv db-01 9187      # succeeded
web-01$ nc -zv db-01 9187      # timed out (still denied)
\`\`\`

Not done: \`ufw allow 9187\` (opens it to everyone) or \`ufw default allow incoming\` (opens everything).`,
  },
  simulationNote:
    "ufw is simulated for inbound filtering: rules are evaluated top to bottom, then the default incoming policy; ICMP echo is allowed as in ufw's default before.rules. Outgoing/routed policies, rate limiting and logging are not modelled. https:// requests reach port 443 without a TLS handshake.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T14:20:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53"), { path: "/home/ops/INC-2291.txt", content: incidentNote, owner: "ops", group: "ops" }],
        },
        {
          name: "guest-lt",
          users: [OPS],
          interfaces: [{ name: "wlan0", address: "192.168.60.15/24" }],
          routes: [{ destination: "default", via: "192.168.60.1", dev: "wlan0" }],
          files: [resolvConf("10.20.1.53")],
        },
        {
          name: "gw-01",
          users: [OPS],
          ipForward: true,
          interfaces: [
            { name: "eth0", address: "192.168.50.1/24" },
            { name: "eth1", address: "10.20.1.1/24" },
            { name: "eth2", address: "192.168.60.1/24" },
          ],
        },
        dnsServer(),
        {
          name: "reports-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.60/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          services: [
            {
              name: "nginx",
              description: "nginx - reports dashboard",
              execUser: "www-data",
              command: "/usr/sbin/nginx -g daemon off;",
              state: "active",
              enabled: true,
              kind: "http",
              listens: [{ port: 443, proto: "tcp" }],
              http: [{ path: "/", status: 200, body: "<html><title>Lumen Reports</title><body>Q4 on-time delivery: 96.2%</body></html>\n" }],
            },
          ],
          firewall: {
            enabled: true,
            defaultInbound: "deny",
            rules: [
              { action: "allow", port: 22, proto: "tcp", from: "192.168.50.0/24" },
              { action: "allow", port: 22, proto: "tcp", from: "10.20.1.0/24" },
              { action: "deny", port: 443, proto: "tcp", from: "any" },
            ],
          },
        },
      ],
      segments: [
        { name: "office", cidr: "192.168.50.0/24" },
        { name: "guest", cidr: "192.168.60.0/24" },
        { name: "servers", cidr: "10.20.1.0/24" },
      ],
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "office-https",
        name: "https://reports.lumen.internal/ returns 200 from the office (ops-ws)",
        assert: { type: "http_status", from: "ops-ws", url: "https://reports.lumen.internal/", status: 200 },
        feedback: {
          what: "From ops-ws, https://reports.lumen.internal/ still doesn't return 200 (typically a timeout).",
          why: "A timeout to a host that answers ping usually means a firewall dropped the connection. ufw stops at the first matching rule, so an allow placed *after* the old `DENY 443/tcp` is never reached.",
          next: "On reports-01: `sudo ufw status numbered`. Delete the old deny (`sudo ufw delete deny 443/tcp`) or insert your allow above it (`sudo ufw insert 1 allow from 192.168.50.0/24 to any port 443 proto tcp`).",
        },
      },
      {
        id: "guest-blocked",
        name: "The guest network still cannot reach reports-01 on 443",
        assert: { type: "reachable", from: "guest-lt", to: "10.20.1.60", port: 443, expect: false },
        feedback: {
          what: "guest-lt (192.168.60.15) can now open TCP 443 on reports-01.",
          why: "The guest Wi-Fi is where the scraping came from. A rule for 'any' source, a too-broad subnet like 192.168.0.0/16, a default-allow policy or a disabled firewall all let it back in.",
          next: "Scope the allow to the office only: `from 192.168.50.0/24 to any port 443 proto tcp`. Check with `ssh guest-lt nc -zv 10.20.1.60 443` — it should time out.",
        },
      },
      {
        id: "firewall-default-deny",
        name: "ufw is active with default-deny incoming",
        assert: { type: "command_output", host: "reports-01", run: "sudo ufw status verbose", pattern: "Status: active[\\s\\S]*Default: deny \\(incoming\\)" },
        feedback: {
          what: "ufw on reports-01 is inactive, or the default incoming policy is no longer deny.",
          why: "Default-deny is what keeps every port you didn't think about closed. Disabling the firewall or flipping the default to allow fixes the office symptom by removing all protection.",
          next: "`sudo ufw enable` and `sudo ufw default deny incoming` if you changed them, then keep only narrow allow rules.",
        },
      },
      {
        id: "ssh-still-works",
        name: "You can still SSH to reports-01 from the office",
        assert: { type: "reachable", from: "ops-ws", to: "10.20.1.60", port: 22, expect: true },
        feedback: {
          what: "ops-ws can no longer reach reports-01 on TCP 22.",
          why: "Locking out the management path turns a firewall change into a console visit. `ufw reset` or deleting rules by number without re-checking are common ways to do it.",
          next: "Make sure `22/tcp ALLOW IN 192.168.50.0/24` is still present (`sudo ufw status numbered`).",
        },
      },
    ],
    solution: [
      "ping -c 1 reports.lumen.internal",
      "curl -I --max-time 5 https://reports.lumen.internal/",
      "ssh reports-01",
      "sudo ufw status verbose",
      "sudo ufw status numbered",
      "sudo ufw delete deny 443/tcp",
      "sudo ufw allow from 192.168.50.0/24 to any port 443 proto tcp",
      "sudo ufw status numbered",
      "exit",
      "curl -I https://reports.lumen.internal/",
      "ssh guest-lt nc -zv -w 3 10.20.1.60 443",
    ],
    wrongSolutions: [
      { label: "Disables the firewall", steps: ["ssh reports-01", "sudo ufw disable", "exit"] },
      { label: "Appends `allow 443/tcp` below the existing deny", steps: ["ssh reports-01", "sudo ufw allow 443/tcp", "exit"] },
      { label: "Deletes the deny and allows 443 from anywhere", steps: ["ssh reports-01", "sudo ufw delete deny 443/tcp", "sudo ufw allow 443/tcp", "exit"] },
      {
        label: "Allows a /16 that also covers the guest network",
        steps: ["ssh reports-01", "sudo ufw delete deny 443/tcp", "sudo ufw allow from 192.168.0.0/16 to any port 443 proto tcp", "exit"],
      },
      { label: "Switches the default policy to allow", steps: ["ssh reports-01", "sudo ufw delete deny 443/tcp", "sudo ufw default allow incoming", "exit"] },
    ],
    starterCommands: ["ping -c 1 reports.lumen.internal", "curl -I --max-time 5 https://reports.lumen.internal/", "ssh reports-01", "sudo ufw status numbered"],
  },
  successCriteria: [
    "https://reports.lumen.internal/ returns 200 from the office",
    "guest-lt (192.168.60.0/24) still cannot reach reports-01 on 443",
    "ufw stays active with default-deny incoming",
    "SSH from the office to reports-01 still works",
  ],
  hints: [
    "From ops-ws: does `ping reports.lumen.internal` work? Does curl get *refused* or *time out*? A timeout to a host that answers ping points at a filter.",
    "On reports-01, `sudo ufw status numbered` lists the rules in evaluation order. Which rule does a TCP 443 connection from 192.168.50.23 hit first?",
    "Rule 3 `443/tcp DENY IN Anywhere` matches everything to 443, so an allow added after it is never reached. Remove it (`sudo ufw delete deny 443/tcp`) — default-deny already blocks everyone you don't allow.",
    "Then add a scoped rule: `sudo ufw allow from 192.168.50.0/24 to any port 443 proto tcp`. Verify from both sides: `curl -I https://reports.lumen.internal/` on ops-ws, and `ssh guest-lt nc -zv -w 3 10.20.1.60 443` should time out.",
  ],
  questions: [
    {
      id: "predict-rule-hit",
      kind: "mcq",
      prompt: "With these rules, what happens to a connection from 192.168.50.23 to port 443?",
      code: "Status: active\nDefault: deny (incoming), allow (outgoing), disabled (routed)\n\n     To                         Action      From\n     --                         ------      ----\n[ 1] 22/tcp                     ALLOW IN    192.168.50.0/24\n[ 2] 22/tcp                     ALLOW IN    10.20.1.0/24\n[ 3] 443/tcp                    DENY IN     Anywhere\n[ 4] 443/tcp                    ALLOW IN    192.168.50.0/24",
      codeLanguage: "text",
      options: [
        "Allowed by rule 4, because allow rules take priority",
        "Denied by rule 3, because it is the first rule that matches",
        "Allowed, because the most specific source wins",
        "Denied by the default policy",
      ],
      answer: 1,
      explanation: "ufw evaluates rules top to bottom and stops at the first match. Rule 3 matches every source on 443, so rule 4 is never consulted.",
    },
    {
      id: "timeout-vs-refused-fw",
      kind: "mcq",
      prompt: "Before your fix, curl from the office timed out instead of saying \"connection refused\". Why?",
      options: [
        "nginx was not running",
        "ufw's deny silently drops the packet, so no reply (not even a reset) comes back",
        "DNS was slow",
        "The route to reports-01 was missing",
      ],
      answer: 1,
      explanation: "A dropped packet gets no answer, so the client waits for a timeout. \"Refused\" would mean the packet reached the host and nothing listened.",
    },
    {
      id: "explain-narrow-rule",
      kind: "explain",
      prompt: "Explain for the change record why `sudo ufw allow from 192.168.50.0/24 to any port 443 proto tcp` is the right fix rather than `ufw allow 443` or `ufw disable`.",
      concepts: [
        { label: "Scope to the office source subnet only", anyOf: ["192.168.50.0/24", "office subnet", "office only", "only the office", "source", "narrow", "scoped", "least privilege"] },
        { label: "Guest network / other sources stay blocked", anyOf: ["guest", "192.168.60", "scraping", "everyone else", "other sources", "anywhere else", "stay blocked", "still blocked"] },
        { label: "Default-deny keeps everything else closed / firewall stays on", anyOf: ["default deny", "default-deny", "stays on", "stays enabled", "still enabled", "everything else", "other ports", "disable"] },
      ],
      minConcepts: 2,
      explanation: "Allow exactly the traffic that's needed; rely on default-deny for the rest.",
      modelAnswer:
        "The rule allows only TCP 443 and only from the office subnet 192.168.50.0/24, which is exactly the access Finance needs (least privilege). `ufw allow 443` would also let the guest network (192.168.60.0/24) back in, which is where the scraping came from, and `ufw disable` would remove the default-deny that keeps every other port closed. The old emergency deny was removed because ufw's first match wins and it was blocking the office too.",
    },
  ],
  debrief: {
    solution: `\`\`\`
reports-01$ sudo ufw status numbered
[ 1] 22/tcp   ALLOW IN  192.168.50.0/24
[ 2] 22/tcp   ALLOW IN  10.20.1.0/24
[ 3] 443/tcp  DENY IN   Anywhere              <- first match for all HTTPS
reports-01$ sudo ufw delete deny 443/tcp
reports-01$ sudo ufw allow from 192.168.50.0/24 to any port 443 proto tcp
ops-ws$   curl -I https://reports.lumen.internal/         # 200
guest-lt$ nc -zv -w 3 10.20.1.60 443                     # timed out (good)
\`\`\`

\`sudo ufw insert 1 allow from 192.168.50.0/24 to any port 443 proto tcp\` (keeping the deny below it) is an equally valid answer. Both leave default-deny on, both keep the guest network out, and neither touches the SSH rules.`,
    commonMistakes: [
      "Running `ufw allow 443/tcp`: it's appended after the deny and never matches, so nothing changes — and if the deny is later removed, it opens 443 to everyone.",
      "Using `192.168.0.0/16` as \"the office\": it also covers the guest network 192.168.60.0/24.",
      "Disabling ufw or setting `default allow incoming` to make the symptom go away.",
      "Testing only from the allowed side; a firewall change is only verified when the disallowed source still fails.",
    ],
    realWorld:
      "Cloud security groups, Kubernetes NetworkPolicies and nftables all use the same ideas: default-deny, narrow allows by source, and explicit testing from both sides. Ordering matters in ufw, iptables and most router ACLs (first match), while AWS security groups are allow-only and order-free — know which model you are in. Emergency blocks need an owner and an expiry, or they become next month's outage.",
  },
  review: [
    {
      id: "net-first-match",
      skill: "net.firewalls",
      variants: [
        {
          id: "net-first-match-a",
          kind: "mcq",
          prompt: "Rules: `[1] 5432/tcp DENY Anywhere`, `[2] 5432/tcp ALLOW 10.20.1.0/24`. Default deny. Can api-01 (10.20.1.20) connect to 5432?",
          options: ["Yes, rule 2", "No, rule 1 matches first", "Yes, specific rules win", "Only via ICMP"],
          answer: 1,
          explanation: "First match wins: rule 1 denies all sources on 5432 before rule 2 is reached.",
        },
        {
          id: "net-first-match-b",
          kind: "mcq",
          prompt: "Rules: `[1] 80/tcp ALLOW 192.168.50.0/24`. Default deny. What happens to TCP 80 from 192.168.60.9?",
          options: ["Allowed by rule 1", "Denied by the default policy", "Refused by the web server", "Allowed because 80 is a web port"],
          answer: 1,
          explanation: "Rule 1 doesn't match that source, so the default incoming policy (deny) applies.",
        },
      ],
    },
    {
      id: "net-scoped-ufw-rule",
      skill: "net.firewalls",
      variants: [
        {
          id: "net-scoped-ufw-rule-a",
          kind: "short",
          prompt: "Write the ufw command that allows TCP 5432 only from 10.20.1.0/24.",
          accept: ["sudo ufw allow from 10.20.1.0/24 to any port 5432 proto tcp", "ufw allow from 10.20.1.0/24 to any port 5432 proto tcp"],
          acceptPatterns: ["^(sudo\\s+)?ufw\\s+allow\\s+(in\\s+)?from\\s+10\\.20\\.1\\.0/24\\s+to\\s+any\\s+port\\s+5432\\s+proto\\s+tcp$"],
          explanation: "`from <cidr> to any port <n> proto tcp` scopes the rule by source, port and protocol.",
        },
        {
          id: "net-scoped-ufw-rule-b",
          kind: "short",
          prompt: "Write the ufw command that allows TCP 9187 only from the single host 10.20.1.70.",
          accept: ["sudo ufw allow from 10.20.1.70 to any port 9187 proto tcp", "ufw allow from 10.20.1.70 to any port 9187 proto tcp", "sudo ufw allow from 10.20.1.70/32 to any port 9187 proto tcp"],
          acceptPatterns: ["^(sudo\\s+)?ufw\\s+allow\\s+(in\\s+)?from\\s+10\\.20\\.1\\.70(/32)?\\s+to\\s+any\\s+port\\s+9187\\s+proto\\s+tcp$"],
          explanation: "A single address is stored as a /32.",
        },
        {
          id: "net-scoped-ufw-rule-c",
          kind: "mcq",
          prompt: "Which source covers the office `192.168.50.0/24` but *not* the guest `192.168.60.0/24`?",
          options: ["192.168.0.0/16", "192.168.50.0/24", "192.168.48.0/20", "0.0.0.0/0"],
          answer: 1,
          explanation: "/16 and /20 (192.168.48.0–192.168.63.255) both include 192.168.60.x; only the /24 is exact.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "An AWS-style security group for `db-01` has a single inbound rule: `TCP 5432 from 0.0.0.0/0`. A new reporting job on `reports-01` (10.20.1.60) needs database access; nothing else does except `api-01` (10.20.1.20).",
    question: {
      id: "transfer-security-group",
      kind: "mcq",
      prompt: "What is the best change?",
      options: [
        "Leave it: the job works already",
        "Replace the rule with TCP 5432 from 10.20.1.20/32 and from 10.20.1.60/32",
        "Add TCP 0-65535 from 10.20.1.0/24",
        "Remove all rules so nothing is exposed",
      ],
      answer: 1,
      explanation: "0.0.0.0/0 exposes the database to every network. Allow exactly the two clients on the one port they need; removing everything breaks the API.",
    },
  },
  refresher: {
    body: `A host firewall checks rules **top to bottom; the first match decides**. If no rule matches, the **default policy** applies. With default-deny you only add narrow allows: \`ufw allow from <subnet> to any port <n> proto tcp\`.

An allow placed after a matching deny never takes effect — delete the deny or \`ufw insert 1\`. Test from a source that should work *and* one that shouldn't, and never "fix" access by disabling the firewall.`,
    practice: {
      id: "refresher-ufw-order",
      kind: "mcq",
      prompt: "In ufw, which rule decides for a packet that matches rules 2 and 4?",
      options: ["Rule 4 (the newest)", "Rule 2 (the first match)", "Whichever is an allow", "The default policy"],
      answer: 1,
      explanation: "ufw stops at the first matching rule.",
    },
  },
};
