import type { MissionInput } from "@/content/schema";
import { OPS, WWW_USER, dispatchNginx } from "./lab";

const mgmtHosts = `127.0.0.1\tlocalhost
127.0.1.1\tops-ws
# Out-of-band management network
10.99.0.10\tweb-01-mgmt
10.99.0.20\tapi-01-mgmt
10.99.0.40\tbatch-01-mgmt
10.99.0.30\tdb-01-mgmt
`;

const ticket = `CHG-4471  Re-image api-01 and batch-01 from the new "srv-base" template
Status: completed 2026-11-05 13:40 by contractor
Notes:  Template asks for "address/prefix". Entered values:
          api-01    10.20.1.20  prefix 16  gateway 10.20.1.1
          batch-01  10.20.1.40  prefix 28  gateway 10.20.1.1

Network plan (from Dev):
  10.20.1.0/24   servers   gateway 10.20.1.1   (web-01 .10, api-01 .20, batch-01 .40)
  10.20.2.0/24   data      gateway 10.20.2.1   (db-01 .30)
  gw-01 routes between them.
`;

export const netSubnetPrefix: MissionInput = {
  slug: "net-subnet-prefix",
  version: 1,
  track: "networking",
  tier: "intermediate",
  order: 1,
  title: "Two re-imaged servers, two wrong prefixes",
  summary:
    "After a re-image, api-01 can't reach the database and batch-01 can't reach anything off its own little range. Work out each host's subnet from its prefix length, explain the two opposite failures, and fix them.",
  minutes: 30,
  assessmentTypes: ["configure-system", "interpret-output", "explain-root-cause"],
  skills: ["net.subnetting"],
  appliesSkills: ["net.addressing", "net.troubleshooting"],
  prerequisites: ["net-ports-listeners"],
  brief: {
    from: "Dev Okafor, Network engineer",
    channel: "#netops",
    body: `A contractor re-imaged **api-01** and **batch-01** this afternoon (ticket in \`~/CHG-4471.txt\` on ops-ws). Since then:

- api-01 throws \`could not connect to server: No route to host\` for **db-01** (10.20.2.30), but serves web-01 fine.
- batch-01's nightly invoice export can't reach web-01 *or* db-01 — every connection fails immediately.

The addresses themselves are right. I think it's the prefix lengths the template asked for. Please confirm with the actual subnet maths, fix both hosts, and tell me why the two symptoms look different. Use the management names (\`ssh api-01-mgmt\`, \`ssh batch-01-mgmt\`).`,
  },
  objectives: [
    "Convert a prefix length into a subnet mask, network address, broadcast address and host range",
    "Predict whether a destination is on-link or must go via the gateway for a given prefix",
    "Explain why a too-long prefix and a too-short prefix fail in different ways",
    "Recognise that a default gateway outside the host's own subnet cannot be used",
  ],
  concept: {
    title: "The prefix decides what is \"local\"",
    body: `The prefix length is how many leading bits are the network. The rest are host bits; the block size is 2^(host bits).

| Prefix | Mask | Block size | Usable hosts |
| --- | --- | --- | --- |
| /16 | 255.255.0.0 | 65,536 | 65,534 |
| /24 | 255.255.255.0 | 256 | 254 |
| /28 | 255.255.255.240 | 16 | 14 |

For a /28 the last octet comes in blocks of 16: .0–.15, .16–.31, **.32–.47**, …  So \`10.20.1.40/28\` is network \`10.20.1.32\`, broadcast \`10.20.1.47\`, hosts .33–.46.

A host decides **on-link vs gateway** purely from its own prefix:

- **Prefix too short (/16 instead of /24)** — the host thinks far more addresses are local. It tries to reach \`10.20.2.30\` directly on its own link, nobody answers, and you get *No route to host* / *Destination Host Unreachable* — only for those "falsely local" destinations.
- **Prefix too long (/28 instead of /24)** — the host thinks almost nothing is local. Neighbours outside its tiny block need the gateway… but the gateway \`10.20.1.1\` is *also* outside \`10.20.1.32/28\`, so the default route is unusable: *Network is unreachable* for everything beyond .33–.46.

A gateway must always be inside the host's own subnet.`,
  },
  workedExample: {
    title: "Worked example: a depot camera network carved into /26s",
    body: `The Memphis depot uses \`172.16.8.0/24\` split into four /26 blocks (64 addresses each): .0–.63 cameras, .64–.127 scanners, .128–.191 printers, .192–.255 spare. The router has \`172.16.8.65/26\` for the scanner block.

Scanner \`172.16.8.90\` was configured as \`/24\` with gateway \`172.16.8.65\`. It can't reach the printer server at \`172.16.8.140\`.

**1. What does the scanner think?** With /24, 172.16.8.140 is "local", so it tries to reach it directly.

**2. What is true?** Printers are in a different /26 (on another VLAN behind the router). Direct delivery fails: *Destination Host Unreachable*.

**3. Correct prefix:** \`172.16.8.90/26\` → network .64, broadcast .127, hosts .65–.126. The gateway .65 is inside that range, and .140 is now correctly sent via the router.

\`\`\`
$ sudo ip addr del 172.16.8.90/24 dev eth0
$ sudo ip addr add 172.16.8.90/26 dev eth0
$ ip route get 172.16.8.140
172.16.8.140 via 172.16.8.65 dev eth0 src 172.16.8.90
\`\`\``,
  },
  simulationNote:
    "Subnets, on-link delivery and routing through gw-01 are simulated; each segment is its own L2 network. The simulator keeps a static default route even when its gateway falls outside the interface's subnet (real kernels may delete it) — either way it can't be used.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T16:10:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [
            { name: "eth0", address: "10.20.1.5/24" },
            { name: "mgmt0", address: "10.99.0.5/24" },
          ],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          files: [
            { path: "/etc/hosts", content: mgmtHosts },
            { path: "/home/ops/CHG-4471.txt", content: ticket, owner: "ops", group: "ops" },
          ],
        },
        {
          name: "gw-01",
          users: [OPS],
          ipForward: true,
          interfaces: [
            { name: "eth1", address: "10.20.1.1/24" },
            { name: "eth2", address: "10.20.2.1/24" },
          ],
        },
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [
            { name: "eth0", address: "10.20.1.10/24" },
            { name: "mgmt0", address: "10.99.0.10/24" },
          ],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          services: [dispatchNginx],
        },
        {
          name: "api-01",
          users: [OPS],
          interfaces: [
            { name: "eth0", address: "10.20.1.20/16" },
            { name: "mgmt0", address: "10.99.0.20/24" },
          ],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
        },
        {
          name: "batch-01",
          users: [OPS],
          interfaces: [
            { name: "eth0", address: "10.20.1.40/28" },
            { name: "mgmt0", address: "10.99.0.40/24" },
          ],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
        },
        {
          name: "db-01",
          users: [OPS, { name: "postgres", uid: 115, home: "/var/lib/postgresql" }],
          interfaces: [
            { name: "eth0", address: "10.20.2.30/24" },
            { name: "mgmt0", address: "10.99.0.30/24" },
          ],
          routes: [{ destination: "default", via: "10.20.2.1", dev: "eth0" }],
          services: [
            {
              name: "postgresql",
              description: "PostgreSQL RDBMS",
              execUser: "postgres",
              command: "/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main",
              state: "active",
              enabled: true,
              listens: [{ port: 5432, proto: "tcp" }],
            },
          ],
        },
      ],
      segments: [
        { name: "servers", cidr: "10.20.1.0/24" },
        { name: "data", cidr: "10.20.2.0/24" },
        { name: "mgmt", cidr: "10.99.0.0/24" },
      ],
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "api-01-prefix",
        name: "api-01 eth0 is 10.20.1.20/24",
        assert: { type: "interface", host: "api-01", name: "eth0", address: "10.20.1.20/24", up: true },
        feedback: {
          what: "api-01's eth0 is not 10.20.1.20/24.",
          why: "With /16, api-01 believes all of 10.20.0.0–10.20.255.255 is on its own link, so it never uses the gateway for the data segment. A host route can hide that, but the prefix still disagrees with the network plan and every other host.",
          next: "On api-01: `sudo ip addr del 10.20.1.20/16 dev eth0` then `sudo ip addr add 10.20.1.20/24 dev eth0`.",
        },
      },
      {
        id: "batch-01-prefix",
        name: "batch-01 eth0 is 10.20.1.40/24",
        assert: { type: "interface", host: "batch-01", name: "eth0", address: "10.20.1.40/24", up: true },
        feedback: {
          what: "batch-01's eth0 is not 10.20.1.40/24.",
          why: "With /28, batch-01's subnet is only 10.20.1.32–10.20.1.47. Its gateway 10.20.1.1 is outside that range, so the default route can't be used and almost every destination is unreachable.",
          next: "On batch-01: `sudo ip addr del 10.20.1.40/28 dev eth0` then `sudo ip addr add 10.20.1.40/24 dev eth0`. Check `ip route get 10.20.2.30` afterwards.",
        },
      },
      {
        id: "apps-reach-services",
        name: "api-01 and batch-01 reach db-01:5432, and batch-01 reaches web-01:80",
        assert: {
          type: "all",
          of: [
            { type: "reachable", from: "api-01", to: "10.20.2.30", port: 5432, expect: true },
            { type: "reachable", from: "batch-01", to: "10.20.2.30", port: 5432, expect: true },
            { type: "reachable", from: "batch-01", to: "10.20.1.10", port: 80, expect: true },
          ],
        },
        feedback: {
          what: "At least one of api-01 → db-01:5432, batch-01 → db-01:5432 or batch-01 → web-01:80 still fails.",
          why: "These are the connections the tracking API and the invoice export actually need.",
          next: "On each host, `ip route get 10.20.2.30` should show `via 10.20.1.1`, and `ip route get 10.20.1.10` should show a direct (no `via`) route. Then test with `nc -zv 10.20.2.30 5432`.",
        },
      },
    ],
    solution: [
      "cat ~/CHG-4471.txt",
      "ssh api-01-mgmt",
      "ip route get 10.20.2.30",
      "sudo ip addr del 10.20.1.20/16 dev eth0",
      "sudo ip addr add 10.20.1.20/24 dev eth0",
      "ip route get 10.20.2.30",
      "nc -zv 10.20.2.30 5432",
      "exit",
      "ssh batch-01-mgmt",
      "ip route",
      "sudo ip addr del 10.20.1.40/28 dev eth0",
      "sudo ip addr add 10.20.1.40/24 dev eth0",
      "nc -zv 10.20.2.30 5432",
      "nc -zv 10.20.1.10 80",
      "exit",
    ],
    wrongSolutions: [
      {
        label: "Adds a host route on api-01 instead of fixing its prefix",
        steps: [
          "ssh api-01-mgmt",
          "sudo ip route add 10.20.2.0/24 via 10.20.1.1",
          "exit",
          "ssh batch-01-mgmt",
          "sudo ip addr del 10.20.1.40/28 dev eth0",
          "sudo ip addr add 10.20.1.40/24 dev eth0",
          "exit",
        ],
      },
      {
        label: "Points batch-01 at a gateway inside its /28 that doesn't exist",
        steps: [
          "ssh batch-01-mgmt",
          "sudo ip route replace default via 10.20.1.33",
          "exit",
          "ssh api-01-mgmt",
          "sudo ip addr del 10.20.1.20/16 dev eth0",
          "sudo ip addr add 10.20.1.20/24 dev eth0",
          "exit",
        ],
      },
      {
        label: "Makes both hosts /16 so \"everything is local\"",
        steps: ["ssh batch-01-mgmt", "sudo ip addr del 10.20.1.40/28 dev eth0", "sudo ip addr add 10.20.1.40/16 dev eth0", "exit"],
      },
    ],
    starterCommands: ["cat ~/CHG-4471.txt", "ssh api-01-mgmt", "ip -br addr", "ip route get 10.20.2.30"],
  },
  successCriteria: [
    "api-01 has 10.20.1.20/24 and batch-01 has 10.20.1.40/24, matching the network plan",
    "api-01 and batch-01 both reach db-01 on TCP 5432",
    "batch-01 reaches web-01 on TCP 80",
  ],
  hints: [
    "Read the ticket and the network plan in `~/CHG-4471.txt`. For each host, write down the network and broadcast address its configured prefix produces.",
    "On api-01, `ip route get 10.20.2.30` shows *how* it would send to db-01. Is there a `via`? Compare with the plan, where db-01 is on a different segment behind gw-01.",
    "On batch-01, `10.20.1.40/28` covers only 10.20.1.32–10.20.1.47. Is the gateway 10.20.1.1 inside that range? What does `ip route get 10.20.1.10` say?",
    "Both hosts need /24: `sudo ip addr del 10.20.1.20/16 dev eth0 && sudo ip addr add 10.20.1.20/24 dev eth0` on api-01, and the same pattern with 10.20.1.40/28 → /24 on batch-01. Then test with `nc -zv 10.20.2.30 5432`.",
  ],
  questions: [
    {
      id: "range-of-28",
      kind: "mcq",
      prompt: "What is the usable host range of `10.20.1.40/28`?",
      options: ["10.20.1.1 – 10.20.1.254", "10.20.1.33 – 10.20.1.46", "10.20.1.40 – 10.20.1.55", "10.20.1.41 – 10.20.1.54"],
      answer: 1,
      explanation: "/28 blocks are 16 addresses: .32–.47 contains .40. Network .32 and broadcast .47 aren't usable, leaving .33–.46.",
    },
    {
      id: "hosts-in-28",
      kind: "short",
      prompt: "How many usable host addresses does a /28 subnet have?",
      accept: ["14"],
      acceptPatterns: ["^14(\\s*hosts?)?$"],
      explanation: "32 − 28 = 4 host bits → 2⁴ = 16 addresses, minus network and broadcast = 14.",
    },
    {
      id: "explain-two-symptoms",
      kind: "explain",
      prompt: "Explain to Dev why api-01 (/16) failed only for db-01 while batch-01 (/28) failed for almost everything.",
      concepts: [
        { label: "/16 is too broad: db-01 wrongly treated as on-link / local", anyOf: ["on-link", "on link", "local", "same network", "directly", "too broad", "too big", "too large", "same subnet", "without the gateway"] },
        { label: "/28 is too narrow: most destinations need the gateway", anyOf: ["too narrow", "too small", "only 14", "tiny", "32", "47", ".33", "16 addresses", "outside its subnet", "everything else"] },
        { label: "The gateway is outside the /28, so the default route can't be used", anyOf: ["gateway is outside", "gateway outside", "gateway not in", "gateway isn't in", "unreachable gateway", "default route", "can't use the gateway", "cannot use the gateway", "not inside"] },
      ],
      minConcepts: 2,
      explanation:
        "A too-short prefix makes extra destinations look local (they fail only when they are really behind a router). A too-long prefix makes most neighbours look remote, and if the gateway also falls outside, nothing off-subnet works.",
      modelAnswer:
        "api-01's /16 prefix was too broad: it treated 10.20.2.30 as on-link and tried to reach db-01 directly instead of via the gateway, so only destinations in 10.20.x outside its real /24 failed. batch-01's /28 was too narrow: its subnet was only 10.20.1.32–47, so web-01 and db-01 both needed the gateway, but the gateway 10.20.1.1 is outside the /28, so the default route could not be used and almost everything was unreachable.",
    },
  ],
  debrief: {
    solution: `\`\`\`
api-01$ ip route get 10.20.2.30
10.20.2.30 dev eth0 src 10.20.1.20           <- no "via": treated as local (/16)
api-01$ sudo ip addr del 10.20.1.20/16 dev eth0 && sudo ip addr add 10.20.1.20/24 dev eth0
api-01$ ip route get 10.20.2.30
10.20.2.30 via 10.20.1.1 dev eth0 src 10.20.1.20

batch-01$ ip route get 10.20.2.30
RTNETLINK answers: Network is unreachable    <- gateway .1 outside 10.20.1.32/28
batch-01$ sudo ip addr del 10.20.1.40/28 dev eth0 && sudo ip addr add 10.20.1.40/24 dev eth0
batch-01$ nc -zv 10.20.2.30 5432             # succeeded
\`\`\`

| Host | Configured | Network | Broadcast | Effect |
| --- | --- | --- | --- | --- |
| api-01 | 10.20.1.20/16 | 10.20.0.0 | 10.20.255.255 | db-01 looks local → direct delivery fails |
| batch-01 | 10.20.1.40/28 | 10.20.1.32 | 10.20.1.47 | gateway outside subnet → default route unusable |
| both (fixed) | /24 | 10.20.1.0 | 10.20.1.255 | matches the plan |`,
    commonMistakes: [
      "Adding a specific route on api-01 (10.20.2.0/24 via 10.20.1.1): it works by longest-prefix match, but leaves a wrong prefix that will bite with the next subnet.",
      "Choosing a \"gateway\" inside the /28 that doesn't exist, rather than fixing the prefix so the real gateway is local.",
      "Making every prefix bigger so \"everything is local\" — that is the api-01 bug again.",
      "Counting usable hosts as 2^(host bits) without subtracting the network and broadcast addresses.",
    ],
    realWorld:
      "Prefix mistakes are common in templates and cloud-init/netplan files because the field is just a number. Cloud VPCs avoid much of this with DHCP, but on-prem servers, appliances and IoT devices are configured statically. When a host fails only for *some* remote subnets, check whether its prefix makes them look local; when it fails for everything off a few neighbours, check whether its gateway is inside its subnet.",
  },
  review: [
    {
      id: "net-subnet-range",
      skill: "net.subnetting",
      variants: [
        {
          id: "net-subnet-range-a",
          kind: "mcq",
          prompt: "Which network does `192.168.50.77/27` belong to?",
          options: ["192.168.50.0", "192.168.50.64", "192.168.50.72", "192.168.50.96"],
          answer: 1,
          explanation: "/27 blocks are 32 addresses: .0, .32, .64, .96 … .77 falls in .64–.95.",
        },
        {
          id: "net-subnet-range-b",
          kind: "mcq",
          prompt: "Which network does `10.20.5.200/26` belong to?",
          options: ["10.20.5.128", "10.20.5.192", "10.20.5.200", "10.20.5.0"],
          answer: 1,
          explanation: "/26 blocks are 64 addresses: .0, .64, .128, .192. .200 falls in .192–.255.",
        },
        {
          id: "net-subnet-range-c",
          kind: "mcq",
          prompt: "What is the broadcast address of `172.16.8.20/28`?",
          options: ["172.16.8.31", "172.16.8.255", "172.16.8.15", "172.16.8.47"],
          answer: 0,
          explanation: "/28 blocks are 16: .16–.31 contains .20, so the broadcast is .31.",
        },
      ],
    },
    {
      id: "net-usable-hosts",
      skill: "net.subnetting",
      variants: [
        {
          id: "net-usable-hosts-a",
          kind: "short",
          prompt: "How many usable host addresses are in a /26?",
          accept: ["62"],
          explanation: "6 host bits → 64 addresses − network − broadcast = 62.",
        },
        {
          id: "net-usable-hosts-b",
          kind: "short",
          prompt: "How many usable host addresses are in a /29?",
          accept: ["6"],
          explanation: "3 host bits → 8 addresses − 2 = 6.",
        },
        {
          id: "net-usable-hosts-c",
          kind: "short",
          prompt: "What subnet mask (dotted decimal) corresponds to /28?",
          accept: ["255.255.255.240"],
          explanation: "28 one-bits: three octets of 255 and 11110000 = 240.",
        },
      ],
    },
    {
      id: "net-gateway-in-subnet",
      skill: "net.subnetting",
      variants: [
        {
          id: "net-gateway-in-subnet-a",
          kind: "mcq",
          prompt: "A host is `10.30.4.70/27` with gateway `10.30.4.1`. Can it use that gateway?",
          options: ["Yes", "No — 10.30.4.1 is outside 10.30.4.64/27", "Only for DNS", "Only if the gateway is also /27"],
          answer: 1,
          explanation: "10.30.4.70/27 is in .64–.95; .1 is in a different block, so the host can't reach it directly.",
        },
        {
          id: "net-gateway-in-subnet-b",
          kind: "mcq",
          prompt: "A host is `192.168.60.130/25`. Which gateway address would work?",
          options: ["192.168.60.1", "192.168.60.129", "192.168.61.1", "192.168.60.127"],
          answer: 1,
          explanation: "/25 halves the /24: .128–.255. Only .129 is inside the host's subnet (.127 is the other half's broadcast).",
        },
      ],
    },
  ],
  transfer: {
    context:
      "A new wireless access point at the Atlanta office is configured `192.168.50.200/25` with gateway `192.168.50.1`. Office clients are in `192.168.50.0/24`. The AP's management page loads from 192.168.50.210 but not from ops-ws at 192.168.50.23.",
    question: {
      id: "transfer-ap-prefix",
      kind: "mcq",
      prompt: "Why?",
      options: [
        "ops-ws needs a DNS record for the AP",
        "With /25 the AP's subnet is .128–.255: .23 looks remote and its gateway .1 is outside that subnet, so it can't reply",
        "The AP only supports HTTPS",
        "/25 is not a valid prefix",
      ],
      answer: 1,
      explanation: "The AP's prefix is too long. .210 is in its /25, but replies to .23 need the gateway, which is outside the AP's subnet. Use /24 like the rest of the office.",
    },
  },
  refresher: {
    body: `The prefix length splits an address into network bits and host bits. Block size = 2^(32 − prefix): /24 → 256, /26 → 64, /28 → 16. Find the block that contains the address: that gives the network (first) and broadcast (last) address.

A host sends directly to addresses inside its subnet and via the gateway to everything else — and the gateway itself must be inside the subnet. Too short a prefix makes remote hosts look local; too long a prefix strands the host from its gateway.`,
    practice: {
      id: "refresher-block-size",
      kind: "short",
      prompt: "How many addresses (total, including network and broadcast) are in a /28?",
      accept: ["16"],
      explanation: "32 − 28 = 4 host bits, 2⁴ = 16.",
    },
  },
};
