import type { MissionInput } from "@/content/schema";
import { OPS, SEGMENTS, WWW_USER, dispatchNginx, dnsServer, gateway, resolvConf } from "./lab";

const routerNote = `Office router replacement (CHG-4466) - Dev Okafor
------------------------------------------------
Old router rtr-old (192.168.50.254) was removed on 2026-11-04.
New router gw-01 is 192.168.50.1 on the office segment and 10.20.1.1 on the
server segment, with IP forwarding enabled. DHCP clients were moved over.
Statically configured hosts must be updated by hand:
  - ops-ws (office)     default gateway -> 192.168.50.1
Server segment hosts use 10.20.1.1 as their gateway.
`;

export const netRoutingGateway: MissionInput = {
  slug: "net-routing-gateway",
  version: 1,
  track: "networking",
  tier: "intermediate",
  order: 3,
  title: "The new router works for everyone except us",
  summary:
    "After the office router was replaced, ops-ws can't reach any server, and once that is fixed the reports server still times out. Trace the path hop by hop, fix the default gateway, and repair the missing return route.",
  minutes: 35,
  assessmentTypes: ["configure-system", "interpret-output", "order-steps"],
  skills: ["net.routing", "net.path-tracing"],
  appliesSkills: ["net.subnetting", "net.troubleshooting"],
  prerequisites: ["net-dhcp-lease"],
  brief: {
    from: "Dev Okafor, Network engineer",
    channel: "#netops",
    body: `We swapped the Atlanta office router yesterday (notes in \`~/router-change.txt\`). Laptops on DHCP are fine, but **ops-ws** has a static config and can't reach a single server this morning. I'm stuck in a vendor call.

Also: Sam says the **reports** dashboard (\`https://reports.lumen.internal/\`, on reports-01) has been timing out from the office since the change — although Priya can open it from web-01 on the server segment.

These may or may not be the same problem. Please trace the path, fix whatever's wrong on whichever hosts, and leave everything using the new router.`,
  },
  objectives: [
    "Explain how a host chooses a route: longest matching prefix, falling back to the default route",
    "Use `ip route`, `ip route get` and `traceroute` to see where packets are sent and where they stop",
    "Fix a default gateway that points at a host that no longer exists",
    "Recognise and repair a missing return route on the far end",
  ],
  concept: {
    title: "Routing is decided hop by hop — in both directions",
    body: `For each packet, a host looks up the destination in its routing table and picks the **most specific matching route** (longest prefix). The **default route** (\`0.0.0.0/0\`) matches everything and is used only if nothing more specific does.

\`\`\`
$ ip route
default via 192.168.50.1 dev eth0                  # everything else -> gateway
192.168.50.0/24 dev eth0 scope link                # local subnet, direct
$ ip route get 10.20.1.10
10.20.1.10 via 192.168.50.1 dev eth0 src 192.168.50.23
\`\`\`

The gateway must be a live router on a directly connected subnet. A router with **IP forwarding** passes the packet to its next hop, and so on, until the destination's own subnet is reached.

Every connection also needs a **return path**: the server's reply is routed by the *server's* table. If the server has no route back to the client's network, the request arrives but the reply goes nowhere — the client sees a **timeout**, not an error.

\`traceroute -n\` shows each router that answers along the way. Where the hops turn into \`* * *\`, either a hop can't forward further or replies can't come back — check routing tables on both sides of that point.`,
  },
  workedExample: {
    title: "Worked example: depot scanners can't reach the inventory API",
    body: `Scanner hub \`hub-05\` (192.168.70.15/24) can't reach \`inv-01\` (10.20.3.40).

**1. Where would hub-05 send it?**
\`\`\`
$ ip route get 10.20.3.40
10.20.3.40 via 192.168.70.1 dev eth0 src 192.168.70.15
$ ping -c 1 192.168.70.1        # depot router answers
\`\`\`

**2. Trace the path:**
\`\`\`
$ traceroute -n 10.20.3.40
 1  192.168.70.1   0.6 ms ...
 2  * * *
 3  * * *
\`\`\`
The first router answers; nothing beyond it does.

**3. Check the far end.** On inv-01 (via its console):
\`\`\`
$ ip route
10.20.3.0/24 dev eth0 proto kernel scope link src 10.20.3.40
\`\`\`
No default route and no route to 192.168.70.0/24: inv-01 receives the scanner's packets but can't send replies.

**4. Fix the return path** and retest from the hub:
\`\`\`
inv-01$ sudo ip route add default via 10.20.3.1
hub-05$ traceroute -n 10.20.3.40     # now completes in 2 hops
\`\`\``,
  },
  simulationNote:
    "Routing tables, forwarding on gw-01, return paths and traceroute are simulated. There is no ARP cache to inspect, no ICMP redirect, and route changes made with `ip route` are not persisted to netplan.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T08:50:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24" }],
          routes: [{ destination: "default", via: "192.168.50.254", dev: "eth0" }],
          files: [resolvConf("10.20.1.53"), { path: "/home/ops/router-change.txt", content: routerNote, owner: "ops", group: "ops" }],
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
          name: "reports-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.60/24" }],
          routes: [{ destination: "10.20.0.0/16", via: "10.20.1.1", dev: "eth0" }],
          files: [resolvConf("10.20.1.53")],
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
              http: [{ path: "/", status: 200, body: "<html><title>Lumen Reports</title><body>On-time delivery: 96.2%</body></html>\n" }],
            },
          ],
        },
      ],
      segments: SEGMENTS,
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "ops-ws-default-gw",
        name: "ops-ws's default route uses the new router 192.168.50.1",
        assert: { type: "route", host: "ops-ws", destination: "default", via: "192.168.50.1", expect: true },
        feedback: {
          what: "ops-ws has no default route via 192.168.50.1.",
          why: "Its default route still points at (or lacks) a gateway. 192.168.50.254 was the old router and no longer exists, so everything off the office subnet is sent into the void. A route for just 10.20.1.0/24 would leave every other network broken.",
          next: "Run `ip route`, then `sudo ip route replace default via 192.168.50.1`. Confirm with `ip route get 10.20.1.10`.",
        },
      },
      {
        id: "dispatch-from-office",
        name: "The dispatch dashboard loads from ops-ws",
        assert: { type: "http_status", from: "ops-ws", url: "http://dispatch.lumen.internal/", status: 200 },
        feedback: {
          what: "http://dispatch.lumen.internal/ does not return 200 from ops-ws.",
          why: "web-01 has a correct default route, so once ops-ws sends via the right gateway this should work. If it doesn't, the outbound path is still broken.",
          next: "Check `ip route get 10.20.1.10` and `traceroute -n 10.20.1.10` from ops-ws.",
        },
      },
      {
        id: "reports-from-office",
        name: "https://reports.lumen.internal/ loads from ops-ws",
        assert: { type: "http_status", from: "ops-ws", url: "https://reports.lumen.internal/", status: 200 },
        feedback: {
          what: "From ops-ws, https://reports.lumen.internal/ still fails (usually a timeout).",
          why: "A timeout while other servers on the same segment work points at the return path: reports-01 receives the request but has no route back to 192.168.50.0/24.",
          next: "Get onto reports-01 from the server segment (e.g. `ssh web-01`, then `ssh reports-01`), run `ip route`, and add a route back via the server gateway 10.20.1.1.",
        },
      },
    ],
    solution: [
      "ip route",
      "ping -c 1 192.168.50.254",
      "ping -c 1 192.168.50.1",
      "sudo ip route replace default via 192.168.50.1",
      "ip route get 10.20.1.10",
      "curl -I http://dispatch.lumen.internal/",
      "traceroute -n 10.20.1.60",
      "ssh web-01",
      "ssh reports-01",
      "ip route",
      "sudo ip route add default via 10.20.1.1",
      "exit",
      "exit",
      "traceroute -n 10.20.1.60",
      "curl -I https://reports.lumen.internal/",
    ],
    wrongSolutions: [
      { label: "Fixes ops-ws's gateway only", steps: ["sudo ip route replace default via 192.168.50.1"] },
      {
        label: "Adds a server-segment route on ops-ws instead of fixing the default",
        steps: ["sudo ip route add 10.20.1.0/24 via 192.168.50.1", "ssh web-01", "ssh reports-01", "sudo ip route add default via 10.20.1.1", "exit", "exit"],
      },
      {
        label: "Points reports-01's return route at web-01, which doesn't forward",
        steps: ["sudo ip route replace default via 192.168.50.1", "ssh web-01", "ssh reports-01", "sudo ip route add default via 10.20.1.10", "exit", "exit"],
      },
      { label: "Uses the router's server-side address as ops-ws's gateway", steps: ["sudo ip route replace default via 10.20.1.1"] },
    ],
    starterCommands: ["ip route", "ip route get 10.20.1.10", "ping -c 1 192.168.50.1", "traceroute -n 10.20.1.10"],
  },
  successCriteria: [
    "ops-ws's default route goes via 192.168.50.1",
    "http://dispatch.lumen.internal/ returns 200 from ops-ws",
    "https://reports.lumen.internal/ returns 200 from ops-ws",
  ],
  hints: [
    "Start with `ip route` on ops-ws and `~/router-change.txt`. Which gateway does the default route use, and does that host still exist? (`ping -c 1` it.)",
    "Replace the default route: `sudo ip route replace default via 192.168.50.1`. Then check the dispatch dashboard and the reports server separately.",
    "If reports still times out, `traceroute -n 10.20.1.60`: the router answers but reports-01 doesn't. Requests arrive — so how would reports-01 send the reply back to 192.168.50.23? You can reach reports-01 from the server segment: `ssh web-01`, then `ssh reports-01`.",
    "reports-01 only has `10.20.0.0/16 via 10.20.1.1` — nothing for 192.168.50.0/24. Add `sudo ip route add default via 10.20.1.1` (or a specific `192.168.50.0/24 via 10.20.1.1`) on reports-01, exit both sessions, and re-test with curl.",
  ],
  questions: [
    {
      id: "interpret-trace-return",
      kind: "mcq",
      prompt: "After fixing ops-ws's gateway, this trace to reports-01 appeared. What is the most likely cause?",
      code: "$ traceroute -n 10.20.1.60\ntraceroute to 10.20.1.60 (10.20.1.60), 30 hops max, 60 byte packets\n 1  192.168.50.1  0.555 ms  0.601 ms  0.586 ms\n 2  * * *\n 3  * * *\n 4  * * *",
      codeLanguage: "text",
      options: [
        "gw-01 has IP forwarding disabled",
        "reports-01 receives the probes but has no route back to 192.168.50.0/24",
        "DNS resolves reports.lumen.internal to the wrong address",
        "ops-ws's default gateway is still wrong",
      ],
      answer: 1,
      explanation:
        "Hop 1 answering proves ops-ws's gateway is correct. web-01 on the same segment works, so gw-01 forwards fine. The trace was run by IP, so DNS isn't involved. That leaves reports-01's replies, which need a route back to the office.",
    },
    {
      id: "longest-prefix",
      kind: "mcq",
      prompt: "A host has `default via 10.20.1.1` and `10.20.2.0/24 via 10.20.1.254`. Where does it send a packet for 10.20.2.30?",
      options: ["10.20.1.1, because default routes win", "10.20.1.254, because the /24 is the most specific match", "Directly on the local link", "It drops it: two routes match"],
      answer: 1,
      explanation: "Both routes match, but the /24 is longer (more specific) than the /0 default, so it wins.",
    },
    {
      id: "order-path-debug",
      kind: "order",
      prompt: "Order these steps for debugging \"client times out reaching a server in another subnet\".",
      items: [
        "Check the client's route to the server (`ip route get <server>`)",
        "Ping the client's gateway",
        "Traceroute to the server to see the last hop that answers",
        "Check the server's routing table for a route back to the client's network",
        "Fix the broken direction and re-test end to end",
      ],
      explanation: "Verify the outbound side first (route, first hop), find where the path stops, then check the return path at the far end before fixing and re-testing.",
    },
  ],
  debrief: {
    solution: `Two independent faults, one per direction:

\`\`\`
ops-ws$ ip route
default via 192.168.50.254 dev eth0 proto static     <- old router, gone
ops-ws$ sudo ip route replace default via 192.168.50.1
ops-ws$ curl -I http://dispatch.lumen.internal/        # 200 - outbound fixed

ops-ws$ traceroute -n 10.20.1.60                       # hop 1 answers, then * * *
web-01$ ssh reports-01
reports-01$ ip route
10.20.0.0/16 via 10.20.1.1 dev eth0 proto static      <- no way back to 192.168.50.0/24
reports-01$ sudo ip route add default via 10.20.1.1
ops-ws$ curl -I https://reports.lumen.internal/        # 200
\`\`\`

The reports problem had existed before the router change — but the old router also NAT-ed office traffic, which hid it. Once office addresses arrived unchanged, reports-01's incomplete table showed.`,
    commonMistakes: [
      "Adding a route for one server subnet on ops-ws instead of fixing the default route, leaving every other destination broken.",
      "Stopping after the first fix because one service works, without re-testing the other reported symptom.",
      "Using the router's far-side address (10.20.1.1) as ops-ws's gateway — a gateway must be on the host's own subnet.",
      "Pointing a return route at an ordinary server (web-01) that doesn't forward packets.",
    ],
    realWorld:
      "Missing return routes are common with multi-homed servers, VPNs and hand-built \"minimal\" routing tables; asymmetric routing also confuses stateful firewalls. Cloud networks express the same idea as route tables per subnet. In production you would fix the netplan/route config so it survives a reboot, and `mtr` combines ping and traceroute for a live view of where loss starts.",
  },
  review: [
    {
      id: "net-default-route",
      skill: "net.routing",
      variants: [
        {
          id: "net-default-route-a",
          kind: "short",
          prompt: "Write the command that replaces a host's default route so it uses gateway 192.168.50.1.",
          accept: ["sudo ip route replace default via 192.168.50.1", "ip route replace default via 192.168.50.1"],
          acceptPatterns: ["^(sudo\\s+)?ip\\s+r(oute)?\\s+(replace|change)\\s+(default|0\\.0\\.0\\.0/0)\\s+via\\s+192\\.168\\.50\\.1(\\s+dev\\s+\\S+)?$"],
          explanation: "`ip route replace` swaps the existing default route in one step; `del` followed by `add` also works.",
        },
        {
          id: "net-default-route-b",
          kind: "short",
          prompt: "Write the command that adds a default route via 10.20.1.1 on a server that has none.",
          accept: ["sudo ip route add default via 10.20.1.1", "ip route add default via 10.20.1.1"],
          acceptPatterns: ["^(sudo\\s+)?ip\\s+r(oute)?\\s+add\\s+(default|0\\.0\\.0\\.0/0)\\s+via\\s+10\\.20\\.1\\.1(\\s+dev\\s+\\S+)?$"],
          explanation: "`ip route add default via <gateway>`; the gateway must be on a connected subnet.",
        },
      ],
    },
    {
      id: "net-route-choice",
      skill: "net.routing",
      variants: [
        {
          id: "net-route-choice-a",
          kind: "mcq",
          prompt: "Routes: `default via 10.0.0.1`, `10.20.0.0/16 via 10.0.0.2`, `10.20.5.0/24 via 10.0.0.3`. Which gateway is used for 10.20.5.9?",
          options: ["10.0.0.1", "10.0.0.2", "10.0.0.3", "All three in turn"],
          answer: 2,
          explanation: "All three match; /24 is the longest prefix.",
        },
        {
          id: "net-route-choice-b",
          kind: "mcq",
          prompt: "Same routes. Which gateway is used for 10.20.9.9?",
          options: ["10.0.0.1", "10.0.0.2", "10.0.0.3", "None"],
          answer: 1,
          explanation: "The /24 doesn't match 10.20.9.9; the /16 does, and it beats the default.",
        },
      ],
    },
    {
      id: "net-trace-reading",
      skill: "net.path-tracing",
      variants: [
        {
          id: "net-trace-reading-a",
          kind: "mcq",
          prompt: "`traceroute -n 10.20.2.30` shows hop 1 `10.20.1.1`, then `* * *` for every hop. Web servers on 10.20.2.0/24 work fine from the same client. What do you check?",
          options: ["The client's default route", "The routing table on 10.20.2.30 (return path)", "DNS", "The client's interface"],
          answer: 1,
          explanation: "The first hop and other destinations behind it work, so the outbound path is fine; the target itself likely can't route replies back.",
        },
        {
          id: "net-trace-reading-b",
          kind: "mcq",
          prompt: "`ping 10.20.1.10` prints `From 192.168.50.23 icmp_seq=1 Destination Host Unreachable` (192.168.50.23 is the client itself). The client's default route is `via 192.168.50.254`. What does that suggest?",
          options: [
            "10.20.1.10 is down",
            "The gateway 192.168.50.254 doesn't answer on the local link",
            "A firewall on 10.20.1.10 rejects ICMP",
            "The route to 10.20.1.10 is too specific",
          ],
          answer: 1,
          explanation: "The error comes from the client itself: it couldn't deliver to its next hop. Check whether the gateway exists.",
        },
        {
          id: "net-trace-reading-c",
          kind: "short",
          prompt: "Which `ip` command shows the exact route, gateway and source address a host would use to reach 10.20.1.60?",
          accept: ["ip route get 10.20.1.60", "ip r get 10.20.1.60", "ip ro get 10.20.1.60"],
          explanation: "`ip route get <dst>` runs the route lookup and prints the chosen gateway, device and source address.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "A VPN concentrator `vpn-01` (10.20.1.70) hands remote staff addresses in 10.80.0.0/24. Remote users can reach web-01 and reports-01, but not db-01 (10.20.2.30), which sits behind gw-01 on the data segment. gw-01's table has routes for 10.20.1.0/24 and 10.20.2.0/24 and a default route to the internet edge.",
    question: {
      id: "transfer-vpn-return",
      kind: "mcq",
      prompt: "What is the most likely missing piece?",
      options: [
        "A DNS record for db-01",
        "A route on gw-01 for 10.80.0.0/24 via 10.20.1.70, so db-01's replies reach the VPN",
        "A default route on the remote users' laptops",
        "A larger prefix on db-01",
      ],
      answer: 1,
      explanation:
        "Replies from db-01 go to its gateway gw-01, which knows nothing about 10.80.0.0/24 and sends them to the internet edge. Servers on 10.20.1.0/24 may have worked because of other routing; the return path through gw-01 needs a route to the VPN pool.",
    },
  },
  refresher: {
    body: `A host picks the **most specific** matching route; the **default route** catches everything else and must point at a live router on the host's own subnet. \`ip route\` lists routes; \`ip route get <ip>\` shows the one actually chosen.

Every connection needs routes **both ways**. If the first hop answers in \`traceroute\` but the target never does, check whether the target can route its replies back to the client's network.`,
    practice: {
      id: "refresher-route-get",
      kind: "mcq",
      prompt: "Which command tells you which gateway a host will use for 10.20.1.10?",
      options: ["ip -br link", "ip route get 10.20.1.10", "dig 10.20.1.10", "ss -ltn"],
      answer: 1,
      explanation: "`ip route get` performs the route lookup for that destination.",
    },
  },
};
