import type { MissionInput } from "@/content/schema";
import { OPS } from "./lab";

const mgmtHosts = `127.0.0.1\tlocalhost
127.0.1.1\tops-ws
# Out-of-band management network (mgmt0 on every server). Use these to log in
# even when a server's production interface is misconfigured.
10.99.0.10\tweb-01-mgmt
10.99.0.21\tapi-01-mgmt
10.99.0.22\tapi-02-mgmt
`;

const inventory = `# Lumen lab inventory - server segment 10.20.1.0/24 (gateway 10.20.1.1)
# host     role                     eth0 (production)    mgmt0
web-01     load balancer (nginx)    10.20.1.10/24        10.99.0.10/24
api-01     tracking-api node 1      10.20.1.21/24        10.99.0.21/24
api-02     tracking-api node 2      10.20.1.22/24        10.99.0.22/24
ops-ws     ops jump host            10.20.1.5/24         10.99.0.5/24
`;

const upstreamConf = `# /etc/nginx/conf.d/tracking-upstream.conf
upstream tracking_api {
    server 10.20.1.21:8080;
    server 10.20.1.22:8080;   # marked down by health checks since 07:12
}
`;

const trackingApi = {
  name: "tracking-api",
  description: "Lumen tracking API",
  execUser: "lumen",
  command: "/opt/tracking-api/bin/tracking-api --port 8080",
  state: "active" as const,
  enabled: true,
  kind: "http" as const,
  listens: [{ port: 8080, proto: "tcp" as const }],
  http: [{ path: "/health", status: 200, body: "{\"status\":\"ok\"}\n" }],
};
const LUMEN = { name: "lumen", uid: 1100, home: "/opt/tracking-api", shell: "/usr/sbin/nologin" };

export const netIpv4Addressing: MissionInput = {
  slug: "net-ipv4-addressing",
  version: 1,
  track: "networking",
  tier: "beginner",
  order: 2,
  title: "One API node fell out of the pool",
  summary:
    "After a maintenance window the load balancer marks api-02 as down. Read `ip addr` output across hosts, spot the address that doesn't belong to the subnet, and correct it.",
  minutes: 20,
  assessmentTypes: ["configure-system", "interpret-output"],
  skills: ["net.addressing"],
  appliesSkills: ["net.troubleshooting"],
  prerequisites: ["net-layered-triage"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#ops",
    body: `Since this morning's maintenance on the tracking API nodes, nginx on **web-01** has had **api-02** marked down — we're running the whole tracking API on api-01 alone, and it's at 80% CPU.

The tracking-api service on api-02 is running (I checked over the management console), so I suspect its network config. Someone re-typed the addresses from the inventory by hand.

\`~/inventory.txt\` on ops-ws has the intended addresses. Log in over the management network (\`ssh api-02-mgmt\` etc.), find what's wrong, and fix it so web-01 can reach api-02 on port 8080 again. Don't touch api-01 — it's carrying all the traffic.`,
  },
  objectives: [
    "Read an IPv4 address in CIDR notation and say which network it belongs to",
    "Compare `ip -br addr` across hosts to find the one outside the expected subnet",
    "Explain why a host outside the subnet is unreachable even on the same switch",
    "Replace an interface address with `ip addr del` / `ip addr add`",
  ],
  concept: {
    title: "An IPv4 address has a network part and a host part",
    body: `An IPv4 address is 32 bits, written as four decimal octets: \`10.20.1.22\`. The **prefix length** after the slash says how many leading bits identify the *network*:

\`\`\`
10.20.1.22/24
└─ network ─┘└ host
10.20.1   .22      network 10.20.1.0, hosts .1–.254, broadcast 10.20.1.255
\`\`\`

Two hosts can talk **directly** (on the local link, without a router) only if each one considers the other to be inside its own network. Before sending, a host checks: "is the destination inside my network?"

- **Yes** → it looks for the destination on the local link (ARP) and sends straight to it.
- **No** → it hands the packet to its default gateway, if it has one.

If one host's address is mistyped — say \`10.20.11.22/24\` instead of \`10.20.1.22/24\` — it's in a different network. Its neighbours look for \`10.20.1.22\` on the link and nobody answers ("Destination Host Unreachable"), while the mistyped host thinks its neighbours are somewhere else entirely. The cable and switch are fine; the addressing is not.

\`ip -br addr\` shows each interface's address with its prefix, which is the first thing to compare against the inventory.`,
  },
  workedExample: {
    title: "Worked example: a scanner hub that vanished",
    body: `The depot inventory says scanner hubs use \`192.168.70.0/24\`. \`hub-03\` stopped uploading.

**1. Test from a neighbour** (\`hub-01\`, \`192.168.70.11/24\`):

\`\`\`
$ ping -c 2 192.168.70.13
From 192.168.70.11 icmp_seq=1 Destination Host Unreachable
\`\`\`

The reply comes from hub-01 itself: it searched the local link for .13 and nobody answered.

**2. Look at hub-03 over its console**:

\`\`\`
$ ip -br addr
eth0   UP   192.168.7.13/24
\`\`\`

\`192.168.7.13/24\` is in network \`192.168.7.0\`, not \`192.168.70.0\` — a dropped digit.

**3. Fix and retest**:

\`\`\`
$ sudo ip addr del 192.168.7.13/24 dev eth0
$ sudo ip addr add 192.168.70.13/24 dev eth0
$ ping -c 2 192.168.70.11      # from hub-03: replies
\`\`\`

Always keep the prefix length from the inventory too; a correct address with the wrong prefix causes its own problems.`,
  },
  simulationNote:
    "Hosts, interfaces and the separate management network are simulated. Address changes made with `ip addr` take effect immediately but (as on a real server) would not survive a reboot; making them permanent in netplan is outside this lab.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T09:20:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [
            { name: "eth0", address: "10.20.1.5/24" },
            { name: "mgmt0", address: "10.99.0.5/24" },
          ],
          files: [
            { path: "/etc/hosts", content: mgmtHosts },
            { path: "/home/ops/inventory.txt", content: inventory, owner: "ops", group: "ops" },
          ],
        },
        {
          name: "web-01",
          users: [OPS],
          interfaces: [
            { name: "eth0", address: "10.20.1.10/24" },
            { name: "mgmt0", address: "10.99.0.10/24" },
          ],
          files: [{ path: "/etc/nginx/conf.d/tracking-upstream.conf", content: upstreamConf }],
        },
        {
          name: "api-01",
          users: [OPS, LUMEN],
          interfaces: [
            { name: "eth0", address: "10.20.1.21/24" },
            { name: "mgmt0", address: "10.99.0.21/24" },
          ],
          services: [trackingApi],
        },
        {
          name: "api-02",
          users: [OPS, LUMEN],
          interfaces: [
            { name: "eth0", address: "10.20.11.22/24" },
            { name: "mgmt0", address: "10.99.0.22/24" },
          ],
          services: [trackingApi],
        },
      ],
      segments: [
        { name: "servers", cidr: "10.20.1.0/24" },
        { name: "mgmt", cidr: "10.99.0.0/24" },
      ],
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "api-02-address",
        name: "api-02 eth0 has its inventory address 10.20.1.22/24",
        assert: { type: "interface", host: "api-02", name: "eth0", address: "10.20.1.22/24", up: true },
        feedback: {
          what: "api-02's eth0 does not have exactly 10.20.1.22/24.",
          why: "The inventory, the nginx upstream list and the subnet all expect 10.20.1.22 with a /24 prefix. Any other address or prefix leaves api-02 outside the pool or inconsistent with its neighbours.",
          next: "On api-02 (`ssh api-02-mgmt`), compare `ip -br addr` with ~/inventory.txt on ops-ws, then `sudo ip addr del <wrong>/24 dev eth0` and `sudo ip addr add 10.20.1.22/24 dev eth0`.",
        },
      },
      {
        id: "lb-reaches-api-02",
        name: "web-01 gets HTTP 200 from api-02's health endpoint",
        assert: { type: "http_status", from: "web-01", url: "http://10.20.1.22:8080/health", status: 200 },
        feedback: {
          what: "From web-01, `curl http://10.20.1.22:8080/health` does not return 200.",
          why: "This is exactly what nginx's health check does; until it passes, api-02 stays out of the pool.",
          next: "Test from web-01 itself: `ssh web-01-mgmt` then `ping -c 2 10.20.1.22` and `curl -s http://10.20.1.22:8080/health`.",
        },
      },
      {
        id: "api-01-untouched",
        name: "api-01 keeps 10.20.1.21/24 and stays healthy",
        assert: {
          type: "all",
          of: [
            { type: "interface", host: "api-01", name: "eth0", address: "10.20.1.21/24", up: true },
            { type: "http_status", from: "web-01", url: "http://10.20.1.21:8080/health", status: 200 },
          ],
        },
        feedback: {
          what: "api-01's address changed or its health check no longer passes from web-01.",
          why: "api-01 is carrying all tracking traffic. Two hosts with the same address, or a changed address on the healthy node, would take the whole API down.",
          next: "Leave api-01 at 10.20.1.21/24. Make sure you did not give api-02 the address 10.20.1.21.",
        },
      },
    ],
    solution: [
      "cat ~/inventory.txt",
      "ping -c 2 10.20.1.22",
      "ssh api-02-mgmt",
      "ip -br addr",
      "sudo ip addr del 10.20.11.22/24 dev eth0",
      "sudo ip addr add 10.20.1.22/24 dev eth0",
      "ping -c 2 10.20.1.10",
      "exit",
      "ssh web-01-mgmt curl -s http://10.20.1.22:8080/health",
    ],
    wrongSolutions: [
      {
        label: "Gives api-02 the same address as api-01",
        steps: ["ssh api-02-mgmt", "sudo ip addr del 10.20.11.22/24 dev eth0", "sudo ip addr add 10.20.1.21/24 dev eth0", "exit"],
      },
      {
        label: "Fixes the octet but types a /16 prefix",
        steps: ["ssh api-02-mgmt", "sudo ip addr del 10.20.11.22/24 dev eth0", "sudo ip addr add 10.20.1.22/16 dev eth0", "exit"],
      },
      {
        label: "Changes the nginx host's address instead of api-02",
        steps: ["ssh web-01-mgmt", "sudo ip addr del 10.20.1.10/24 dev eth0", "sudo ip addr add 10.20.11.10/24 dev eth0", "exit"],
      },
    ],
    starterCommands: ["cat ~/inventory.txt", "ip -br addr", "ping -c 2 10.20.1.22", "ssh api-02-mgmt"],
  },
  successCriteria: [
    "api-02's eth0 is 10.20.1.22/24, matching the inventory",
    "web-01 gets HTTP 200 from http://10.20.1.22:8080/health",
    "api-01 still has 10.20.1.21/24 and stays healthy",
  ],
  hints: [
    "Start from ops-ws: `ping -c 2 10.20.1.22`. Who sends the \"Destination Host Unreachable\" reply, and what does that say about whether anything on the link owns that address?",
    "Log in over the management network with `ssh api-02-mgmt` and run `ip -br addr`. Compare every octet and the prefix with `~/inventory.txt`.",
    "api-02's eth0 is in network 10.20.11.0/24, while its neighbours are all in 10.20.1.0/24. One mistyped digit puts it in a different network.",
    "On api-02: `sudo ip addr del 10.20.11.22/24 dev eth0` then `sudo ip addr add 10.20.1.22/24 dev eth0`. `exit`, then verify from web-01 with `ssh web-01-mgmt curl -s http://10.20.1.22:8080/health`.",
  ],
  questions: [
    {
      id: "which-host-wrong",
      kind: "short",
      prompt: "Which address was configured on api-02's eth0 before your fix (with prefix)?",
      accept: ["10.20.11.22/24"],
      acceptPatterns: ["^10\\.20\\.11\\.22\\s*/\\s*24$"],
      placeholder: "a.b.c.d/nn",
      explanation: "`ip -br addr` on api-02 showed 10.20.11.22/24 — the third octet should have been 1, as in the inventory.",
    },
    {
      id: "network-of-address",
      kind: "mcq",
      prompt: "Which network does `10.20.11.22/24` belong to?",
      options: ["10.20.1.0/24", "10.20.11.0/24", "10.20.0.0/24", "10.0.0.0/24"],
      answer: 1,
      explanation: "With /24 the first three octets are the network: 10.20.11. That is a different network from the server segment 10.20.1.0/24.",
    },
    {
      id: "interpret-unreachable-from-self",
      kind: "mcq",
      prompt: "Before the fix, ops-ws printed this. What does it mean?",
      code: "$ ping -c 2 10.20.1.22\nPING 10.20.1.22 56(84) bytes of data.\nFrom 10.20.1.5 icmp_seq=1 Destination Host Unreachable\nFrom 10.20.1.5 icmp_seq=2 Destination Host Unreachable",
      codeLanguage: "text",
      options: [
        "A router between ops-ws and api-02 rejected the packet",
        "ops-ws considered 10.20.1.22 local, asked for it on the link, and no host answered",
        "api-02's firewall blocked ICMP",
        "DNS returned the wrong address",
      ],
      answer: 1,
      explanation:
        "The reply comes from ops-ws's own address (10.20.1.5): the destination is in ops-ws's /24, so it tried to find it on the local link and got no answer. No router was involved, and a pure IP ping doesn't use DNS.",
    },
  ],
  debrief: {
    solution: `\`\`\`
ops-ws$ ping -c 2 10.20.1.22         # From 10.20.1.5 ... Destination Host Unreachable
ops-ws$ ssh api-02-mgmt              # in over the management network
api-02$ ip -br addr
eth0   UP   10.20.11.22/24           <- inventory says 10.20.1.22/24
api-02$ sudo ip addr del 10.20.11.22/24 dev eth0
api-02$ sudo ip addr add 10.20.1.22/24 dev eth0
api-02$ exit
ops-ws$ ssh web-01-mgmt curl -s http://10.20.1.22:8080/health
{"status":"ok"}
\`\`\`

One mistyped octet put api-02 in network 10.20.11.0/24. Nothing on the server segment could find it, and the load balancer's health check failed even though the service itself was healthy.`,
    commonMistakes: [
      "Copying api-01's address onto api-02, which creates a duplicate IP and can take the healthy node down too.",
      "Typing the right address with the wrong prefix (/16 instead of /24) — it may seem to work but disagrees with every neighbour about where the network ends.",
      "Assuming the service is broken because the health check fails, and restarting it, without checking basic reachability first.",
    ],
    realWorld:
      "Hand-typed addresses are a classic cause of post-maintenance outages, which is why teams template network config (netplan, cloud-init, Ansible) from a single inventory. Out-of-band management (iDRAC/iLO/IPMI, a serial console or a cloud provider's console) exists exactly for this case: getting into a server whose production network is broken.",
  },
  review: [
    {
      id: "net-network-part",
      skill: "net.addressing",
      variants: [
        {
          id: "net-network-part-a",
          kind: "short",
          prompt: "What is the network address of `10.20.4.77/24`?",
          accept: ["10.20.4.0", "10.20.4.0/24"],
          explanation: "/24 keeps the first three octets: 10.20.4, with the host part set to 0.",
        },
        {
          id: "net-network-part-b",
          kind: "short",
          prompt: "What is the network address of `192.168.50.143/24`?",
          accept: ["192.168.50.0", "192.168.50.0/24"],
          explanation: "/24 keeps 192.168.50 and zeroes the last octet.",
        },
        {
          id: "net-network-part-c",
          kind: "short",
          prompt: "What is the broadcast address of `10.20.9.40/24`?",
          accept: ["10.20.9.255"],
          explanation: "The broadcast address has all host bits set: the last octet becomes 255.",
        },
      ],
    },
    {
      id: "net-same-network",
      skill: "net.addressing",
      variants: [
        {
          id: "net-same-network-a",
          kind: "mcq",
          prompt: "Host A is `10.20.1.5/24`. Which address can A reach directly without a router?",
          options: ["10.20.11.5", "10.20.1.200", "10.21.1.5", "10.20.2.5"],
          answer: 1,
          explanation: "Only 10.20.1.200 shares the network 10.20.1.0/24.",
        },
        {
          id: "net-same-network-b",
          kind: "mcq",
          prompt: "Host A is `192.168.50.23/24`. Which address is *not* on A's local network?",
          options: ["192.168.50.1", "192.168.50.254", "192.168.5.23", "192.168.50.99"],
          answer: 2,
          explanation: "192.168.5.23 is in 192.168.5.0/24 — a different network, so A would send it to its gateway.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "A new camera at the Memphis depot gate was configured as `172.16.80.31/24`. The camera recorder is `172.16.8.10/24` and the inventory says cameras live in `172.16.8.0/24`. Both are plugged into the same switch, but the recorder shows no feed.",
    question: {
      id: "transfer-camera-address",
      kind: "mcq",
      prompt: "What is the most likely cause?",
      options: [
        "The switch port is faulty",
        "The camera's address is in network 172.16.80.0/24, not 172.16.8.0/24",
        "The recorder needs a DNS entry for the camera",
        "The camera needs a /32 prefix",
      ],
      answer: 1,
      explanation: "Same switch, different networks: 172.16.80.31 and 172.16.8.10 don't share a /24, so neither considers the other local. Fix the camera's address to 172.16.8.31/24.",
    },
  },
  refresher: {
    body: `\`10.20.1.22/24\` means: the first 24 bits (three octets, \`10.20.1\`) are the **network**, the last octet (\`22\`) is the **host**. Hosts talk directly only to addresses in the same network; everything else goes via the gateway.

A single mistyped octet moves a host into another network, so its neighbours can't find it even on the same switch. Compare \`ip -br addr\` against the inventory digit by digit, including the prefix.`,
    practice: {
      id: "refresher-same-network",
      kind: "mcq",
      prompt: "Are `10.20.1.40/24` and `10.20.1.41/24` on the same network?",
      options: ["Yes, both are in 10.20.1.0/24", "No, the last octet differs", "Only if they have the same gateway", "Only with a /32 prefix"],
      answer: 0,
      explanation: "With /24 only the first three octets define the network, and they match.",
    },
  },
};
