import type { MissionInput } from "@/content/schema";
import { OPS, SEGMENTS, WWW_USER, dispatchNginx, dnsServer, gateway, resolvConf } from "./lab";

export const netLayeredTriage: MissionInput = {
  slug: "net-layered-triage",
  version: 1,
  track: "networking",
  tier: "beginner",
  order: 1,
  title: "\"The internet is down\" at one desk",
  summary:
    "Every site fails on the Atlanta ops workstation while everyone else is fine. Work up the TCP/IP layers from the link to the application, find the lowest broken layer, and fix it.",
  minutes: 20,
  assessmentTypes: ["configure-system", "order-steps", "interpret-output"],
  skills: ["net.tcpip-model", "net.troubleshooting"],
  prerequisites: [],
  brief: {
    from: "Aiko Tanaka, Frontend engineer",
    channel: "#it-help",
    body: `The dispatch dashboard won't load on **ops-ws** (the shared workstation by the Atlanta dock office). The browser says it "can't find" \`dispatch.lumen.internal\`, so I assume DNS is broken? Everyone else on the office network has the dashboard open, so it's just this machine.

Facilities moved the desk this morning and re-plugged everything. The night shift starts at 18:00 and they need this workstation for load assignments.

You have a shell on ops-ws as \`ops\` (with sudo). Please find what's actually wrong rather than guessing — Dev asked that we stop "fixing" DNS when DNS isn't the problem.`,
  },
  objectives: [
    "Name the TCP/IP layers and the tool that tests each one",
    "Work bottom-up: link, address, local gateway, name resolution, application",
    "Recognise that a lower-layer failure makes every higher layer look broken",
    "Repair the lowest failing layer and confirm the original symptom is gone",
  ],
  concept: {
    title: "Each layer depends on the one below it",
    body: `The TCP/IP model groups networking into four layers. Each one only works if everything beneath it works:

| Layer | Job | Quick test |
| --- | --- | --- |
| Link | Interface up, cable/Wi-Fi connected | \`ip -br link\` (UP / DOWN) |
| Internet (IP) | Address, subnet, routes, gateway | \`ip -br addr\`, \`ip route\`, \`ping <gateway>\` |
| Transport | TCP/UDP ports, connections | \`nc -zv host port\`, \`ss -ltn\` |
| Application | DNS, HTTP, SSH … | \`dig\`, \`curl -v\` |

A browser error is reported at the **top** of the stack, but it is often caused much lower. "Could not resolve host" only tells you the DNS query got no answer — the query may never have left the machine.

So diagnose **bottom-up** (or split in the middle and move towards the failure): find the *lowest* layer that fails and fix that first. Everything above it will often recover on its own. Changing DNS settings when the link is down wastes time and leaves a second, real misconfiguration behind.`,
  },
  workedExample: {
    title: "Worked example: a label printer that \"stopped printing\"",
    body: `A depot label printer at \`192.168.70.40\` stopped receiving jobs from \`pack-ws-02\`. The print queue says "printer offline".

**1. Link** — on pack-ws-02: \`ip -br link\` shows \`eth0 UP\`. Fine.

**2. IP** — \`ip -br addr\` shows \`192.168.70.12/24\`; \`ip route\` has \`default via 192.168.70.1\`. \`ping -c 2 192.168.70.1\` replies. Local networking works.

**3. Reach the target** — \`ping -c 2 192.168.70.40\` replies too, so the printer is on the network.

**4. Transport** — printers accept jobs on TCP 9100. \`nc -zv 192.168.70.40 9100\` says *Connection refused*: the printer is reachable but nothing is listening on that port.

**5. Conclusion** — the network is fine; the printer's raw-printing service was disabled after a firmware update. Re-enable it on the printer's admin page and retest with \`nc\`.

Note the order: each step was only meaningful because the one before it passed.`,
  },
  simulationNote:
    "The lab simulates interfaces, routing, DNS and HTTP between fictional hosts. Physical cabling is modelled only as an interface being UP or DOWN; there are no link lights, Wi-Fi radios or NetworkManager here, so you bring the link up with `ip link set`.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T16:40:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [OPS],
          interfaces: [{ name: "eth0", address: "192.168.50.23/24", up: false }],
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
          services: [dispatchNginx],
        },
      ],
      segments: SEGMENTS,
      start: { host: "ops-ws", user: "ops" },
    },
    checks: [
      {
        id: "link-up",
        name: "ops-ws eth0 is up with its office address",
        assert: { type: "interface", host: "ops-ws", name: "eth0", address: "192.168.50.23/24", up: true },
        feedback: {
          what: "eth0 on ops-ws is still DOWN, or no longer has its address 192.168.50.23/24.",
          why: "With the link down the host has no usable route at all, so every higher layer — DNS included — fails before a packet is sent.",
          next: "Run `ip -br link` and `ip -br addr`. If eth0 shows DOWN, bring it up with `sudo ip link set eth0 up` and keep the existing address.",
        },
      },
      {
        id: "gateway-ping",
        name: "ops-ws can reach its default gateway",
        assert: { type: "reachable", from: "ops-ws", to: "192.168.50.1", expect: true },
        feedback: {
          what: "ops-ws cannot ping its gateway 192.168.50.1.",
          why: "The gateway is the first hop for everything outside the office subnet, including the DNS server and web-01. If it is unreachable, nothing else can work.",
          next: "Check the lower layers first: is eth0 UP, and is its address in 192.168.50.0/24?",
        },
      },
      {
        id: "dashboard-by-name",
        name: "The dispatch dashboard loads by name",
        assert: { type: "http_status", from: "ops-ws", url: "http://dispatch.lumen.internal/", status: 200 },
        feedback: {
          what: "`curl http://dispatch.lumen.internal/` from ops-ws still does not return HTTP 200.",
          why: "This is the symptom Aiko reported; the fix is only done when the original request works end to end.",
          next: "Retest with `curl -I http://dispatch.lumen.internal/`. If it still fails, note the exact error and move up one layer at a time (ping the gateway, then `dig dispatch.lumen.internal`).",
        },
      },
    ],
    solution: ["ip -br link", "sudo ip link set eth0 up", "ping -c 2 192.168.50.1", "dig +short dispatch.lumen.internal", "curl -I http://dispatch.lumen.internal/"],
    wrongSolutions: [
      { label: "Changes the DNS server because the browser mentioned the name", steps: ["echo 'nameserver 10.20.1.1' | sudo tee /etc/resolv.conf"] },
      { label: "Adds a default route while the link is still down", steps: ["sudo ip route add default via 192.168.50.1 dev eth0"] },
      { label: "Assigns a different address instead of bringing the link up", steps: ["sudo ip addr add 192.168.50.99/24 dev eth0"] },
    ],
    starterCommands: ["curl -I http://dispatch.lumen.internal/", "ip -br link", "ip -br addr", "ip route"],
  },
  successCriteria: [
    "eth0 on ops-ws is UP and still has 192.168.50.23/24",
    "ops-ws can ping its default gateway 192.168.50.1",
    "http://dispatch.lumen.internal/ returns HTTP 200 from ops-ws",
  ],
  hints: [
    "Ignore the browser's wording for a moment. Start at the bottom of the stack: is the network interface itself up?",
    "`ip -br link` lists each interface with its state. Anything other than `lo` that says DOWN can't send packets at all.",
    "Notice that even `ping 192.168.50.1` (the gateway, on the same subnet) says \"Network is unreachable\". That error is generated locally — the host has no usable route because its only interface is down.",
    "Bring the interface up with `sudo ip link set eth0 up`, then re-run your tests upwards: `ping -c 2 192.168.50.1`, `dig dispatch.lumen.internal`, `curl -I http://dispatch.lumen.internal/`.",
  ],
  questions: [
    {
      id: "order-layered-checks",
      kind: "order",
      prompt: "Put these checks in bottom-up order for a host that \"can't open a website\".",
      items: [
        "Is the interface UP? (`ip -br link`)",
        "Does it have the right address and a default route? (`ip -br addr`, `ip route`)",
        "Can it reach its default gateway? (`ping <gateway>`)",
        "Does the name resolve? (`dig <name>`)",
        "Does the web server answer on its port? (`curl -I http://<name>/`)",
      ],
      explanation:
        "Each check depends on the ones before it: no link means no IP traffic, no route means no path to the gateway, no gateway means no DNS server, and without DNS curl has no address to connect to.",
    },
    {
      id: "interpret-unreachable",
      kind: "mcq",
      prompt: "Before the fix, what did `ping -c 1 192.168.50.1` tell you?",
      code: "$ ping -c 1 192.168.50.1\nping: connect: Network is unreachable",
      codeLanguage: "text",
      options: [
        "The gateway is switched off",
        "The local host has no usable route to that address, so it never sent the packet",
        "DNS is misconfigured",
        "A firewall on the gateway dropped the ping",
      ],
      answer: 1,
      explanation:
        "\"Network is unreachable\" is reported by the local kernel when no route matches the destination. Here the only interface was down, so not even the directly connected subnet had a route. A switched-off gateway or a firewall would show timeouts or \"Destination Host Unreachable\" instead.",
    },
    {
      id: "explain-why-not-dns",
      kind: "explain",
      prompt: "Aiko thought DNS was broken because the browser said it \"can't find\" the name. Explain to her why DNS was not the root cause.",
      concepts: [
        { label: "The link / interface was down (lower layer)", anyOf: ["link", "interface", "eth0", "down", "lower layer", "layer 1", "layer 2", "cable"] },
        { label: "The DNS query could not leave the machine", anyOf: ["never left", "could not reach", "couldn't reach", "no route", "unreachable", "could not be sent", "never sent", "no packets"] },
        { label: "Higher layers depend on lower layers", anyOf: ["depend", "depends", "everything above", "higher layer", "bottom-up", "bottom up", "on top of"] },
      ],
      minConcepts: 2,
      explanation:
        "The name error is a symptom: DNS is an application-layer service that needs working link and IP layers underneath.",
      modelAnswer:
        "The browser reports the first thing that failed from its point of view, which was the name lookup. But the eth0 interface was down, so the machine had no route and the DNS query was never sent to the DNS server at all. DNS depends on the link and IP layers underneath it; once the interface was brought up, name resolution worked without any DNS change.",
    },
  ],
  debrief: {
    solution: `Working bottom-up:

\`\`\`
$ ip -br link
lo     UNKNOWN  ...
eth0   DOWN     ...          <- the lowest broken layer
$ sudo ip link set eth0 up
$ ping -c 2 192.168.50.1     # gateway answers
$ dig +short dispatch.lumen.internal
10.20.1.10
$ curl -I http://dispatch.lumen.internal/
HTTP/1.1 200 OK
\`\`\`

The interface came back with its existing static address and default route, so nothing else needed changing. The original symptom ("can't find dispatch.lumen.internal") disappeared because the DNS query could finally leave the machine.`,
    commonMistakes: [
      "Editing /etc/resolv.conf because the error message mentioned a name — this leaves a wrong DNS setting behind once the real fault is fixed.",
      "Adding routes or new addresses while the interface is down; nothing on a down interface is usable.",
      "Stopping after the first command succeeds instead of re-testing the original request end to end.",
    ],
    realWorld:
      "On real desktops a DOWN link usually means an unplugged or faulty cable, a disabled switch port, or a NIC disabled in NetworkManager — check link lights and `ip -br link` before anything else. Help-desk runbooks at most companies start with exactly this ladder (link, IP, gateway, DNS, application) because it turns vague reports like \"the internet is down\" into one specific failing layer.",
  },
  review: [
    {
      id: "net-layer-of-symptom",
      skill: "net.tcpip-model",
      variants: [
        {
          id: "net-layer-of-symptom-a",
          kind: "mcq",
          prompt: "`ip -br link` shows `eth0 DOWN`. Which TCP/IP layer is failing?",
          options: ["Link", "Internet (IP)", "Transport", "Application"],
          answer: 0,
          explanation: "Interface state is the link layer: without it no IP packet can be sent.",
        },
        {
          id: "net-layer-of-symptom-b",
          kind: "mcq",
          prompt: "`ping 10.20.1.20` works but `nc -zv 10.20.1.20 8080` says \"Connection refused\". Which layer is the problem at?",
          options: ["Link", "Internet (IP)", "Transport (nothing listening on the port)", "DNS"],
          answer: 2,
          explanation: "IP reachability is proven by ping; the refusal comes from the host's TCP stack because no socket listens on 8080.",
        },
        {
          id: "net-layer-of-symptom-c",
          kind: "mcq",
          prompt: "`curl http://10.20.1.10/` returns 200 but `curl http://dispatch.lumen.internal/` says \"Could not resolve host\". Which layer is failing?",
          options: ["Link", "Internet (IP)", "Transport", "Application (name resolution)"],
          answer: 3,
          explanation: "Everything up to HTTP works by IP; only the name lookup (an application-layer service) fails.",
        },
      ],
    },
    {
      id: "net-bottom-up-order",
      skill: "net.troubleshooting",
      variants: [
        {
          id: "net-bottom-up-order-a",
          kind: "order",
          prompt: "A laptop can't reach `api.lumen.internal:8080`. Order the checks bottom-up.",
          items: ["ip -br link", "ip -br addr and ip route", "ping the default gateway", "dig api.lumen.internal", "nc -zv api.lumen.internal 8080"],
          explanation: "Link, then IP configuration, then the first hop, then name resolution, then the transport port.",
        },
        {
          id: "net-bottom-up-order-b",
          kind: "mcq",
          prompt: "A host can't ping its own default gateway on the same subnet. What should you check next?",
          options: ["The DNS server", "The web server's logs", "The interface state and address on the host", "The TLS certificate"],
          answer: 2,
          explanation: "If the first hop fails, the problem is at or below the host's IP configuration; nothing higher can be the cause.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Marco reports that the shipment-export job on `batch-02` fails with `curl: (6) Could not resolve host: api.lumen.internal`. You run `ping -c1 10.20.1.1` on batch-02 (its gateway) and get `ping: connect: Network is unreachable`.",
    question: {
      id: "transfer-batch-unreachable",
      kind: "mcq",
      prompt: "What do you investigate first?",
      options: [
        "The DNS records for api.lumen.internal",
        "batch-02's interface state, address and routes",
        "The API service logs on api-01",
        "The TLS certificate on api.lumen.internal",
      ],
      answer: 1,
      explanation:
        "The host can't even reach its gateway, and the error is generated locally. The DNS error is a downstream symptom; start with `ip -br link`, `ip -br addr` and `ip route` on batch-02.",
    },
  },
  refresher: {
    body: `Networks are built in layers: **link** (is the interface up?), **IP** (address, routes, gateway), **transport** (TCP/UDP ports) and **application** (DNS, HTTP). Each layer needs the ones below it.

When something "doesn't work", test from the bottom up — \`ip -br link\`, \`ip -br addr\`, \`ping <gateway>\`, \`dig <name>\`, \`curl\` — and stop at the first failure. That is the layer to fix; errors reported higher up are usually just consequences.`,
    practice: {
      id: "refresher-lowest-layer",
      kind: "mcq",
      prompt: "Which command checks the lowest layer?",
      options: ["curl -I http://web-01/", "dig web-01.lumen.internal", "ip -br link", "nc -zv web-01 80"],
      answer: 2,
      explanation: "`ip -br link` shows whether interfaces are UP — the link layer that everything else depends on.",
    },
  },
};
