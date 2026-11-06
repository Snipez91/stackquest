import type { MissionInput } from "@/content/schema";
import { OPS, WWW_USER, BIND_USER, LUMEN_ZONE, dispatchNginx, namedService, resolvConf } from "./lab";

const hardeningNote = `CHG-4490 dns-01 host firewall (Dev Okafor, 2026-11-05 17:30)
- ufw enabled, default deny incoming
- allowed SSH from office + server segment
- allowed DNS (53/tcp) from office + server segment
- guest Wi-Fi (192.168.60.0/24) must not query internal DNS
`;

export const netTcpUdpDns: MissionInput = {
  slug: "net-tcp-udp-dns",
  version: 1,
  track: "networking",
  tier: "advanced",
  order: 2,
  title: "DNS \"allowed\" through the firewall — but only half of it",
  summary:
    "After dns-01's firewall was hardened, every lookup times out although port 53 is \"allowed\". Prove TCP 53 works while UDP 53 is filtered, and fix the rules without opening DNS to guests.",
  minutes: 35,
  assessmentTypes: ["configure-system", "interpret-output", "explain-root-cause"],
  skills: ["net.tcp-udp"],
  appliesSkills: ["net.dns", "net.firewalls", "net.ports"],
  prerequisites: ["net-firewall-scoped-allow"],
  brief: {
    from: "Dev Okafor, Network engineer",
    channel: "#netops",
    body: `I enabled ufw on **dns-01** last night (change notes in \`~/CHG-4490.txt\`) and this morning *nothing* resolves: ops-ws, web-01, everything. But I definitely allowed port 53 from the office and the server segment, and \`nc -zv dns-01 53\` says *succeeded*!

I'm half convinced the firewall is fine and named is broken. Can you prove which it is, fix it, and keep the guest Wi-Fi (\`192.168.60.0/24\`, test laptop \`guest-lt\`) unable to query internal DNS? Please don't just turn ufw off again.`,
  },
  objectives: [
    "Contrast TCP (connection, handshake, reliable stream) with UDP (independent datagrams, no handshake)",
    "Explain why ordinary DNS queries use UDP 53 and when DNS falls back to TCP 53",
    "Use `dig` and `dig +tcp`, `nc -z` and `nc -zu` to test each protocol separately",
    "Write firewall rules for the exact protocol a service uses",
  ],
  concept: {
    title: "Same port number, two different protocols",
    body: `A port number only means something together with a transport protocol: **TCP 53** and **UDP 53** are separate doors, and firewalls filter them separately.

| | TCP | UDP |
| --- | --- | --- |
| Setup | 3-way handshake (SYN, SYN-ACK, ACK) | none — just send a datagram |
| Delivery | reliable, ordered, retransmitted | best effort; lost packets stay lost |
| "Is it open?" | handshake succeeds → open; reset → refused | no handshake, so silence is ambiguous |
| Typical use | HTTP, SSH, databases | DNS queries, DHCP, NTP, VoIP |

**DNS** sends normal queries over **UDP 53** — one small request, one small reply, no handshake cost. It uses **TCP 53** for responses too large for UDP (the server sets the *truncated* flag and the client retries over TCP) and for zone transfers. A DNS server therefore needs **both** allowed; allowing only TCP breaks almost every lookup.

Testing each protocol:

\`\`\`
dig @10.20.1.53 name          # UDP query (default)
dig +tcp @10.20.1.53 name     # same query over TCP
nc -zv 10.20.1.53 53          # TCP connect test
nc -zuv 10.20.1.53 53         # UDP "test" - see the caveat below
\`\`\`

Caveat: because UDP has no handshake, a real \`nc -zu\` often reports success even when packets are dropped. Trust an application-level answer (dig getting a reply) over a UDP port probe.`,
  },
  workedExample: {
    title: "Worked example: depot clocks drifting after a firewall change",
    body: `Time clocks at the Memphis depot sync from \`ntp-01\` (10.40.2.10). After a firewall change they drift.

**1. What does NTP use?** UDP 123.

**2. Test the service, not just the port:**
\`\`\`
clock$ ntpdate -q 10.40.2.10
no server suitable for synchronization found
clock$ nc -zv 10.40.2.10 123
nc: connect to 10.40.2.10 port 123 (tcp) failed: Connection refused
\`\`\`
The TCP test is meaningless — NTP doesn't listen on TCP at all.

**3. Look at the rules on ntp-01:**
\`\`\`
[ 1] 22/tcp    ALLOW IN  10.40.0.0/16
[ 2] 123/tcp   ALLOW IN  10.40.0.0/16       <- wrong protocol
\`\`\`

**4. Fix the protocol, keep the scope:**
\`\`\`
$ sudo ufw delete allow from 10.40.0.0/16 to any port 123 proto tcp
$ sudo ufw allow from 10.40.0.0/16 to any port 123 proto udp
clock$ ntpdate -q 10.40.2.10        # server 10.40.2.10, stratum 2 ...
\`\`\``,
  },
  simulationNote:
    "UDP and TCP are filtered independently. `dig` uses UDP unless you add `+tcp`; resolvers in this lab (getaddrinfo, ping, curl) use UDP only. Truncation and real TCP fallback are not simulated. Unlike real netcat, `nc -zu` here reports a filtered UDP port as timed out — on a real network, treat an `nc -u` success with suspicion.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-06T08:15:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53"), { path: "/home/ops/CHG-4490.txt", content: hardeningNote, owner: "ops", group: "ops" }],
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
        {
          name: "dns-01",
          users: [OPS, BIND_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.53/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("127.0.0.1")],
          services: [namedService],
          dnsZones: LUMEN_ZONE,
          firewall: {
            enabled: true,
            defaultInbound: "deny",
            rules: [
              { action: "allow", port: 22, proto: "tcp", from: "192.168.50.0/24" },
              { action: "allow", port: 22, proto: "tcp", from: "10.20.1.0/24" },
              { action: "allow", port: 53, proto: "tcp", from: "192.168.50.0/24" },
              { action: "allow", port: 53, proto: "tcp", from: "10.20.1.0/24" },
            ],
          },
        },
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53")],
          services: [dispatchNginx],
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
        id: "office-resolves",
        name: "ops-ws resolves dispatch.lumen.internal",
        assert: { type: "resolves", from: "ops-ws", name: "dispatch.lumen.internal", ip: "10.20.1.10", expect: true },
        feedback: {
          what: "ops-ws still can't resolve dispatch.lumen.internal.",
          why: "Ordinary DNS queries are UDP datagrams to port 53. A rule for 53/tcp doesn't match them, so default-deny drops every query.",
          next: "Compare `dig @10.20.1.53 dispatch.lumen.internal` with `dig +tcp @10.20.1.53 dispatch.lumen.internal`. Then on dns-01, allow UDP 53 from the office subnet.",
        },
      },
      {
        id: "servers-resolve",
        name: "web-01 resolves api.lumen.internal",
        assert: { type: "resolves", from: "web-01", name: "api.lumen.internal", ip: "10.20.1.20", expect: true },
        feedback: {
          what: "web-01 (server segment) still can't resolve api.lumen.internal.",
          why: "The server segment 10.20.1.0/24 needs UDP 53 too; fixing only the office leaves every server unable to resolve names.",
          next: "Add the matching UDP rule for 10.20.1.0/24 on dns-01. Test with `ssh web-01 dig +short api.lumen.internal`.",
        },
      },
      {
        id: "tcp-53-kept",
        name: "DNS over TCP 53 still works from the office",
        assert: { type: "reachable", from: "ops-ws", to: "10.20.1.53", port: 53, proto: "tcp", expect: true },
        feedback: {
          what: "ops-ws can no longer reach dns-01 on TCP 53.",
          why: "DNS falls back to TCP for large answers and is used for zone transfers. The TCP rules were correct; they were just not enough.",
          next: "Keep the 53/tcp rules and add 53/udp alongside them rather than replacing them.",
        },
      },
      {
        id: "guest-and-policy",
        name: "Guest Wi-Fi still can't query dns-01, and ufw keeps default-deny",
        assert: {
          type: "all",
          of: [
            { type: "reachable", from: "guest-lt", to: "10.20.1.53", port: 53, proto: "udp", expect: false },
            { type: "reachable", from: "guest-lt", to: "10.20.1.53", port: 53, proto: "tcp", expect: false },
            { type: "command_output", host: "dns-01", run: "sudo ufw status verbose", pattern: "Status: active[\\s\\S]*Default: deny \\(incoming\\)" },
          ],
        },
        feedback: {
          what: "guest-lt (192.168.60.0/24) can reach DNS on dns-01, or ufw is no longer active with default-deny.",
          why: "Internal DNS reveals every internal hostname; the guest network must not query it. `ufw allow 53`, `ufw allow 53/udp` or disabling ufw all open it to any source.",
          next: "Scope each rule: `sudo ufw allow from 192.168.50.0/24 to any port 53 proto udp` and the same for 10.20.1.0/24.",
        },
      },
    ],
    solution: [
      "cat ~/CHG-4490.txt",
      "dig @10.20.1.53 dispatch.lumen.internal",
      "dig +tcp @10.20.1.53 dispatch.lumen.internal",
      "nc -zv 10.20.1.53 53",
      "nc -zuv -w 3 10.20.1.53 53",
      "ssh 10.20.1.53",
      "sudo ss -lunp",
      "sudo ufw status numbered",
      "sudo ufw allow from 192.168.50.0/24 to any port 53 proto udp",
      "sudo ufw allow from 10.20.1.0/24 to any port 53 proto udp",
      "sudo ufw status numbered",
      "exit",
      "dig +short dispatch.lumen.internal",
      "ssh web-01 dig +short api.lumen.internal",
      "ssh guest-lt dig @10.20.1.53 dispatch.lumen.internal",
    ],
    wrongSolutions: [
      { label: "Disables the firewall", steps: ["ssh dns-01", "sudo ufw disable", "exit"] },
      { label: "Allows port 53 for any protocol from anywhere", steps: ["ssh 10.20.1.53", "sudo ufw allow 53", "exit"] },
      { label: "Allows UDP 53 from the office only", steps: ["ssh dns-01", "sudo ufw allow from 192.168.50.0/24 to any port 53 proto udp", "exit"] },
      {
        label: "Replaces the TCP rules with UDP rules",
        steps: [
          "ssh dns-01",
          "sudo ufw delete allow from 192.168.50.0/24 to any port 53 proto tcp",
          "sudo ufw delete allow from 10.20.1.0/24 to any port 53 proto tcp",
          "sudo ufw allow from 192.168.50.0/24 to any port 53 proto udp",
          "sudo ufw allow from 10.20.1.0/24 to any port 53 proto udp",
          "exit",
        ],
      },
      { label: "Opens 53/udp to everyone", steps: ["ssh dns-01", "sudo ufw allow 53/udp", "exit"] },
    ],
    starterCommands: ["cat ~/CHG-4490.txt", "dig @10.20.1.53 dispatch.lumen.internal", "dig +tcp @10.20.1.53 dispatch.lumen.internal", "nc -zv 10.20.1.53 53"],
  },
  successCriteria: [
    "ops-ws and web-01 resolve internal names through dns-01",
    "DNS over TCP 53 still works from the office",
    "guest-lt cannot reach dns-01 on UDP or TCP 53, and ufw stays active with default-deny",
  ],
  hints: [
    "Test the two protocols separately: `dig @10.20.1.53 dispatch.lumen.internal` (UDP) and `dig +tcp @10.20.1.53 dispatch.lumen.internal`. What differs?",
    "`nc -zv 10.20.1.53 53` only tests TCP. Try `nc -zuv -w 3 10.20.1.53 53` too, and compare with the change notes: which protocol was allowed?",
    "On dns-01 (`ssh 10.20.1.53` — by IP, since names don't resolve right now), `sudo ss -lunp` shows named listening on UDP 53 and `sudo ufw status numbered` shows rules only for 53/tcp. Default-deny drops the UDP queries.",
    "Add UDP rules with the same scope as the TCP ones: `sudo ufw allow from 192.168.50.0/24 to any port 53 proto udp` and `sudo ufw allow from 10.20.1.0/24 to any port 53 proto udp`. Keep the TCP rules. Verify from ops-ws, web-01 and guest-lt.",
  ],
  questions: [
    {
      id: "interpret-dig-pair",
      kind: "mcq",
      prompt: "Before the fix, these two commands ran from ops-ws. What do they prove?",
      code: "$ dig +short @10.20.1.53 dispatch.lumen.internal\n$ echo $?\n9\n$ dig +tcp +short @10.20.1.53 dispatch.lumen.internal\n10.20.1.10",
      codeLanguage: "text",
      options: [
        "named is broken",
        "The record is missing",
        "named works and has the record; UDP 53 is being dropped while TCP 53 gets through",
        "The route to dns-01 is missing",
      ],
      answer: 2,
      explanation:
        "The same query over TCP returns the right answer, so the server, the record and the route are all fine. Only the UDP query (exit 9: no reply) fails — a protocol-specific filter.",
    },
    {
      id: "nc-udp-caveat",
      kind: "mcq",
      prompt: "On a real network, `nc -zuv dns-01 53` prints \"succeeded\" even when a firewall drops UDP 53. Why?",
      options: [
        "nc always uses TCP",
        "UDP has no handshake; nc sends a datagram and, hearing nothing back, assumes the port is open",
        "DNS replies over TCP",
        "The firewall sends a fake reply",
      ],
      answer: 1,
      explanation:
        "Only an ICMP \"port unreachable\" proves a UDP port closed; silence could mean open or dropped. Test UDP services with an application-level request (dig, ntpdate) instead.",
    },
    {
      id: "explain-dns-both",
      kind: "explain",
      prompt: "Explain to Dev why `allow 53/tcp` broke DNS, and why the final rules allow both UDP and TCP 53 (and only from the two internal subnets).",
      concepts: [
        { label: "DNS queries normally use UDP", anyOf: ["udp", "datagram"] },
        { label: "TCP 53 is still needed (large/truncated answers, zone transfers)", anyOf: ["truncat", "large", "zone transfer", "fallback", "fall back", "falls back", "big responses", "axfr"] },
        { label: "Rules scoped to the office and server subnets / guest excluded", anyOf: ["192.168.50.0/24", "10.20.1.0/24", "guest", "scoped", "only from", "internal subnets", "two subnets", "192.168.60"] },
      ],
      minConcepts: 2,
      explanation: "TCP 53 and UDP 53 are filtered separately; DNS needs UDP for normal queries and TCP for large ones.",
      modelAnswer:
        "Normal DNS queries are UDP datagrams to port 53, and ufw treats UDP 53 and TCP 53 as different rules, so allowing only 53/tcp meant default-deny dropped every ordinary query — dig over TCP worked, which is why nc looked fine. TCP 53 is still needed when answers are too large or truncated and for zone transfers, so we kept it and added 53/udp. Both are scoped to 192.168.50.0/24 and 10.20.1.0/24, so the guest network still can't query internal DNS.",
    },
  ],
  debrief: {
    solution: `\`\`\`
ops-ws$ dig @10.20.1.53 dispatch.lumen.internal          # timed out   (UDP)
ops-ws$ dig +tcp @10.20.1.53 dispatch.lumen.internal     # 10.20.1.10  (TCP)
dns-01$ sudo ufw status numbered
[ 3] 53/tcp   ALLOW IN  192.168.50.0/24
[ 4] 53/tcp   ALLOW IN  10.20.1.0/24                     <- no UDP rules
dns-01$ sudo ufw allow from 192.168.50.0/24 to any port 53 proto udp
dns-01$ sudo ufw allow from 10.20.1.0/24 to any port 53 proto udp
ops-ws$ dig +short dispatch.lumen.internal               # 10.20.1.10
guest-lt$ dig @10.20.1.53 dispatch.lumen.internal        # still times out (intended)
\`\`\`

The firewall wasn't "fine" and named wasn't broken: the rule was for the wrong transport protocol. \`nc -zv\` tested TCP, which is exactly the protocol that was allowed, so it gave false reassurance.`,
    commonMistakes: [
      "Concluding the firewall is fine because `nc -zv host 53` (a TCP test) succeeds.",
      "Fixing it with `ufw allow 53` or `ufw allow 53/udp`, which also opens internal DNS to the guest network.",
      "Swapping the TCP rules for UDP ones; large responses and zone transfers then fail intermittently.",
      "Adding the UDP rule for one subnet only and not re-testing from the other.",
    ],
    realWorld:
      "The same trap appears with DHCP (UDP 67/68), NTP (UDP 123), syslog (UDP 514), WireGuard and QUIC/HTTP-3 (UDP 443). Cloud security groups and Kubernetes Services also require an explicit protocol per port. DNSSEC and large TXT records make TCP fallback more common, so \"UDP only\" DNS firewalls cause intermittent failures that are hard to trace.",
  },
  review: [
    {
      id: "net-proto-for-service",
      skill: "net.tcp-udp",
      variants: [
        {
          id: "net-proto-for-service-a",
          kind: "mcq",
          prompt: "Which transport do ordinary DNS queries use?",
          options: ["TCP 53", "UDP 53", "TCP 443", "UDP 67"],
          answer: 1,
          explanation: "Small request, small reply: UDP 53. TCP 53 is the fallback for large answers.",
        },
        {
          id: "net-proto-for-service-b",
          kind: "mcq",
          prompt: "Which of these services needs a **UDP** firewall rule?",
          options: ["SSH (22)", "PostgreSQL (5432)", "NTP (123)", "HTTPS (443) over HTTP/1.1"],
          answer: 2,
          explanation: "NTP uses UDP 123. SSH, PostgreSQL and HTTP/1.1 over TLS use TCP.",
        },
        {
          id: "net-proto-for-service-c",
          kind: "mcq",
          prompt: "Which service needs **UDP 67** on the server side?",
          options: ["DNS", "DHCP", "HTTP", "SMTP"],
          answer: 1,
          explanation: "DHCP servers listen on UDP 67 (clients on UDP 68).",
        },
      ],
    },
    {
      id: "net-tcp-vs-udp-behaviour",
      skill: "net.tcp-udp",
      variants: [
        {
          id: "net-tcp-vs-udp-behaviour-a",
          kind: "mcq",
          prompt: "Why can a TCP port check give a clear \"refused\", while a UDP check often can't?",
          options: [
            "UDP is encrypted",
            "TCP has a handshake, so a closed port answers with a reset; UDP has no handshake, so silence is ambiguous",
            "UDP ports are always open",
            "TCP is faster",
          ],
          answer: 1,
          explanation: "TCP's SYN gets SYN-ACK (open) or RST (closed). A UDP datagram may get nothing back whether it was dropped or accepted.",
        },
        {
          id: "net-tcp-vs-udp-behaviour-b",
          kind: "short",
          prompt: "Write the dig command that sends the query for `api.lumen.internal` to 10.20.1.53 over TCP instead of UDP.",
          accept: ["dig +tcp @10.20.1.53 api.lumen.internal", "dig @10.20.1.53 +tcp api.lumen.internal", "dig @10.20.1.53 api.lumen.internal +tcp"],
          acceptPatterns: ["^dig\\s+(?=.*\\+(tcp|vc)\\b)(?=.*@10\\.20\\.1\\.53)(?=.*\\bapi\\.lumen\\.internal\\b).*$"],
          explanation: "`+tcp` (or `+vc`) makes dig use TCP; comparing it with a plain dig isolates protocol-specific filtering.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "The warehouse VoIP phones register with `pbx-01` on 5060 and stream calls over a UDP port range. After a firewall change on pbx-01, phones register fine but every call has no audio. The new rules allow `5060/tcp`, `5060/udp` and `10000:20000/tcp` from the phone VLAN.",
    question: {
      id: "transfer-voip-rtp",
      kind: "mcq",
      prompt: "What is the most likely cause?",
      options: [
        "DNS for pbx-01 is wrong",
        "The media (RTP) range is UDP, but it was allowed as TCP",
        "5060 must be TCP only",
        "The phones need a default route",
      ],
      answer: 1,
      explanation: "Signalling (SIP on 5060) works; audio streams use RTP over UDP. A TCP rule for the media range never matches UDP packets.",
    },
  },
  refresher: {
    body: `TCP and UDP are separate protocols with separate port spaces: a firewall rule for 53/tcp does nothing for 53/udp. TCP sets up a connection with a handshake; UDP just sends datagrams.

DNS queries use **UDP 53**, with **TCP 53** for large answers, so DNS servers need both. Test each explicitly: \`dig @server name\` (UDP) and \`dig +tcp @server name\` (TCP).`,
    practice: {
      id: "refresher-dns-udp",
      kind: "mcq",
      prompt: "A firewall allows only TCP 53 to a DNS server. What happens to normal lookups?",
      options: ["They work", "They time out, because they are sent over UDP", "They are slower", "They return NXDOMAIN"],
      answer: 1,
      explanation: "Ordinary queries are UDP datagrams; with only TCP allowed they are dropped and the client times out.",
    },
  },
};
