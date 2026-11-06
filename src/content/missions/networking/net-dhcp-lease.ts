import type { MissionInput } from "@/content/schema";
import { OPS, WWW_USER, dispatchNginx, dnsServer, resolvConf } from "./lab";

const dhcpdConf = `# /etc/dhcp/dhcpd.conf - Atlanta office wired segment
# Copied from the Memphis depot template 2026-11-05 (CHG-4480)
default-lease-time 3600;
max-lease-time 7200;
authoritative;

subnet 192.168.5.0 netmask 255.255.255.0 {
  range 192.168.50.100 192.168.50.150;
  option routers 192.168.50.1;
  option domain-name-servers 10.20.1.53;
  option domain-name "lumen.internal";
}
`;

const dhcpDefaults = `# Defaults for isc-dhcp-server
INTERFACESv4="eth0"
INTERFACESv6=""
`;

export const netDhcpLease: MissionInput = {
  slug: "net-dhcp-lease",
  version: 1,
  track: "networking",
  tier: "intermediate",
  order: 2,
  title: "Plugged in, but no address",
  summary:
    "Laptops plugged into the Atlanta office's wired ports get no IPv4 address, so nobody can reach the label printers. Follow the DHCP exchange, fix the server on gw-01, and obtain a real lease.",
  minutes: 30,
  assessmentTypes: ["configure-system", "investigate-logs", "interpret-output"],
  skills: ["net.dhcp"],
  appliesSkills: ["net.subnetting", "net.dns"],
  prerequisites: ["net-subnet-prefix"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#netops",
    body: `Dev pushed a new DHCP config to **gw-01** this morning (copied from the Memphis depot) and is now on a flight. Since then, anything plugged into a wired port in the Atlanta packing office gets **no IPv4 address**. The label printers (e.g. \`printer-07\`, 192.168.50.40) only accept jobs from that wired office segment, so packing is printing labels by hand.

Your laptop **ops-lt** is docked at a wired port now; \`eth0\` has no address. You're still on Wi-Fi (\`wlan0\`), which reaches gw-01.

Please get DHCP on the office segment working again and prove it with a real lease on ops-lt — a static address on your laptop doesn't help the 30 packing stations.`,
  },
  objectives: [
    "Describe the DHCP exchange (DISCOVER, OFFER, REQUEST, ACK) and what a lease contains",
    "Read dhclient and dhcpd output to tell \"no server answered\" from \"server answered\"",
    "Find a DHCP server misconfiguration from its journal and config file",
    "Obtain and verify a lease: address, prefix, default gateway and DNS server",
  ],
  concept: {
    title: "DHCP: how a host gets its address",
    body: `A host with no address can't send normal unicast IP traffic, so DHCP starts with **broadcasts** on the local segment:

1. **DISCOVER** — client → 255.255.255.255: "any DHCP server here?"
2. **OFFER** — server → client: "you can have 192.168.50.100/24"
3. **REQUEST** — client: "I'll take that one"
4. **ACK** — server: "confirmed, lease for 3600 s"

The ACK carries more than an address: the **prefix**, the **default gateway** (\`option routers\`), the **DNS servers** (\`option domain-name-servers\`) and the lease time. That's why a correct lease fixes addressing, routing and DNS in one go — and a wrong DHCP config breaks all three.

Because DISCOVER is a broadcast, the server must be on the same segment (or a router must relay it), and the server must have a \`subnet\` declaration matching the network of the interface it listens on. ISC dhcpd refuses to serve an interface whose subnet it doesn't know:

\`\`\`
No subnet declaration for eth0 (192.168.50.1).
** Ignoring requests on eth0. **
\`\`\`

On the client, \`dhclient -v eth0\` shows the exchange. Repeated DISCOVERs followed by **No DHCPOFFERS received** mean no server answered — look at the server side.`,
  },
  workedExample: {
    title: "Worked example: the warehouse Wi-Fi VLAN",
    body: `Handheld scanners on the Memphis warehouse VLAN \`10.40.8.0/24\` show "no IP". The DHCP server runs on \`gw-mem\`.

**1. Client side** (a test laptop on that VLAN):
\`\`\`
$ sudo dhclient -v wlan0
DHCPDISCOVER on wlan0 to 255.255.255.255 port 67 interval 3
DHCPDISCOVER on wlan0 to 255.255.255.255 port 67 interval 7
No DHCPOFFERS received.
\`\`\`
No server answered. The client is fine; go to the server.

**2. Server side:**
\`\`\`
$ systemctl status isc-dhcp-server      # failed
$ journalctl -u isc-dhcp-server
... /etc/dhcp/dhcpd.conf line 14: expecting semicolon.
\`\`\`
\`option routers 10.40.8.1\` was missing its \`;\`.

**3. Fix, restart, retry:**
\`\`\`
$ sudo sed -i 's/option routers 10.40.8.1$/option routers 10.40.8.1;/' /etc/dhcp/dhcpd.conf
$ sudo systemctl restart isc-dhcp-server
laptop$ sudo dhclient -v wlan0
DHCPOFFER of 10.40.8.120 from 10.40.8.1
DHCPACK of 10.40.8.120 from 10.40.8.1
\`\`\`

**4. Verify the whole lease:** \`ip addr\` (address + \`dynamic\`), \`ip route\` (default via 10.40.8.1), \`cat /etc/resolv.conf\` (DNS from the lease).`,
  },
  simulationNote:
    "DHCP is simulated as an instant DISCOVER/OFFER/REQUEST/ACK on the client's segment; dhclient writes the lease's gateway and DNS server into the routing table and /etc/resolv.conf. Lease files, renewal timers and relay agents are not modelled. isc-dhcp-server checks that dhcpd.conf declares the office subnet before it will start.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-11-05T11:25:00Z",
      hosts: [
        {
          name: "ops-lt",
          users: [OPS],
          interfaces: [
            { name: "eth0", address: null, up: false, dhcp: true, segment: "office" },
            { name: "wlan0", address: "10.20.9.23/24" },
          ],
          routes: [{ destination: "default", via: "10.20.9.1", dev: "wlan0" }],
          files: [resolvConf("10.20.1.53")],
        },
        {
          name: "gw-01",
          users: [OPS],
          ipForward: true,
          interfaces: [
            { name: "eth0", address: "192.168.50.1/24" },
            { name: "eth1", address: "10.20.1.1/24" },
            { name: "eth2", address: "10.20.9.1/24" },
          ],
          files: [
            { path: "/etc/dhcp/dhcpd.conf", content: dhcpdConf },
            { path: "/etc/default/isc-dhcp-server", content: dhcpDefaults },
          ],
          services: [
            {
              name: "isc-dhcp-server",
              description: "ISC DHCP IPv4 server",
              execUser: "root",
              command: "/usr/sbin/dhcpd -4 -q -cf /etc/dhcp/dhcpd.conf eth0",
              state: "failed",
              enabled: true,
              kind: "dhcp",
              requiresReadable: ["/etc/dhcp/dhcpd.conf"],
              configChecks: [
                {
                  path: "/etc/dhcp/dhcpd.conf",
                  pattern: "^\\s*subnet\\s+192\\.168\\.50\\.0\\s+netmask\\s+255\\.255\\.255\\.0\\s*\\{",
                  error: "No subnet declaration for eth0 (192.168.50.1). ** Ignoring requests on eth0. ** Not configured to listen on any interfaces!",
                },
              ],
              journal: [
                "Nov 05 08:02:11 gw-01 systemd[1]: Starting isc-dhcp-server.service - ISC DHCP IPv4 server...",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]: Internet Systems Consortium DHCP Server 4.4.3-P1",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]: Wrote 0 leases to leases file.",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]: No subnet declaration for eth0 (192.168.50.1).",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]: ** Ignoring requests on eth0.  If this is not what",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]:    you want, please write a subnet declaration",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]:    in your dhcpd.conf file for the network segment",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]:    to which interface eth0 is attached. **",
                "Nov 05 08:02:11 gw-01 dhcpd[1840]: Not configured to listen on any interfaces!",
                "Nov 05 08:02:11 gw-01 systemd[1]: isc-dhcp-server.service: Main process exited, code=exited, status=1/FAILURE",
                "Nov 05 08:02:11 gw-01 systemd[1]: isc-dhcp-server.service: Failed with result 'exit-code'.",
                "Nov 05 08:02:11 gw-01 systemd[1]: Failed to start isc-dhcp-server.service - ISC DHCP IPv4 server.",
              ],
            },
          ],
          dhcpPool: { range: ["192.168.50.100", "192.168.50.150"], prefix: 24, gateway: "192.168.50.1", dns: "10.20.1.53" },
        },
        {
          name: "printer-07",
          users: [],
          interfaces: [{ name: "eth0", address: "192.168.50.40/24" }],
          processes: [{ pid: 300, user: "root", command: "/usr/sbin/rawprintd --port 9100", listens: [{ port: 9100, proto: "tcp" }] }],
        },
        dnsServer(),
        {
          name: "web-01",
          users: [OPS, WWW_USER],
          interfaces: [{ name: "eth0", address: "10.20.1.10/24" }],
          routes: [{ destination: "default", via: "10.20.1.1", dev: "eth0" }],
          services: [dispatchNginx],
        },
      ],
      segments: [
        { name: "office", cidr: "192.168.50.0/24" },
        { name: "servers", cidr: "10.20.1.0/24" },
        { name: "wlan", cidr: "10.20.9.0/24" },
      ],
      start: { host: "ops-lt", user: "ops" },
    },
    checks: [
      {
        id: "dhcpd-running",
        name: "isc-dhcp-server is running on gw-01",
        assert: { type: "service_state", host: "gw-01", service: "isc-dhcp-server", state: "active" },
        feedback: {
          what: "isc-dhcp-server on gw-01 is not active.",
          why: "Every wired client in the office depends on it; without it nothing on the segment gets an address, gateway or DNS server.",
          next: "On gw-01, read `journalctl -u isc-dhcp-server` and compare the `subnet` line in /etc/dhcp/dhcpd.conf with eth0's address (`ip -br addr`). Fix the file, then `sudo systemctl restart isc-dhcp-server`.",
        },
      },
      {
        id: "laptop-lease",
        name: "ops-lt eth0 holds a DHCP lease from the office pool",
        assert: {
          type: "command_output",
          host: "ops-lt",
          run: "ip addr show eth0",
          pattern: "inet 192\\.168\\.50\\.(1[0-4][0-9]|150)/24 .*dynamic",
        },
        feedback: {
          what: "ops-lt's eth0 has no dynamic address from 192.168.50.100–150.",
          why: "A lease is the proof that the DHCP server works for every station on the segment. A static address on your laptop proves nothing about the other 30 stations.",
          next: "Once the server is running, run `sudo dhclient -v eth0` on ops-lt and read the DISCOVER/OFFER/ACK lines. `ip addr show eth0` should then say `dynamic`.",
        },
      },
      {
        id: "printer-reachable",
        name: "ops-lt reaches printer-07 on TCP 9100",
        assert: { type: "reachable", from: "ops-lt", to: "192.168.50.40", port: 9100, expect: true },
        feedback: {
          what: "ops-lt cannot open TCP 9100 on printer-07 (192.168.50.40).",
          why: "The printers have no gateway configured, so they can only answer clients on the wired office segment itself.",
          next: "Check that eth0 is up with an office address (`ip -br addr`), then `nc -zv 192.168.50.40 9100`.",
        },
      },
      {
        id: "lease-dns-route",
        name: "The lease's gateway and DNS work: dispatch dashboard loads",
        assert: { type: "http_status", from: "ops-lt", url: "http://dispatch.lumen.internal/", status: 200 },
        feedback: {
          what: "After the lease, http://dispatch.lumen.internal/ doesn't return 200 from ops-lt.",
          why: "dhclient replaces the default route and /etc/resolv.conf with the lease's values; if the DHCP options were wrong, clients would get addresses but no working gateway or DNS.",
          next: "Check `ip route` (default via 192.168.50.1) and `cat /etc/resolv.conf` (nameserver 10.20.1.53), and compare with the `option` lines in dhcpd.conf.",
        },
      },
    ],
    solution: [
      "ip -br addr",
      "sudo dhclient -v eth0",
      "ssh gw-01",
      "systemctl status isc-dhcp-server",
      "journalctl -u isc-dhcp-server",
      "ip -br addr",
      "cat /etc/dhcp/dhcpd.conf",
      "sudo sed -i 's/^subnet 192.168.5.0 /subnet 192.168.50.0 /' /etc/dhcp/dhcpd.conf",
      "sudo systemctl restart isc-dhcp-server",
      "systemctl is-active isc-dhcp-server",
      "exit",
      "sudo dhclient -v eth0",
      "ip addr show eth0",
      "ip route",
      "cat /etc/resolv.conf",
      "nc -zv 192.168.50.40 9100",
    ],
    wrongSolutions: [
      {
        label: "Gives the laptop a static address and leaves DHCP broken",
        steps: ["sudo ip link set eth0 up", "sudo ip addr add 192.168.50.120/24 dev eth0"],
      },
      {
        label: "Restarts the DHCP server without fixing its config",
        steps: ["ssh gw-01", "sudo systemctl restart isc-dhcp-server", "exit", "sudo dhclient -v eth0"],
      },
      {
        label: "Fixes the config but never restarts the server",
        steps: ["ssh gw-01", "sudo sed -i 's/^subnet 192.168.5.0 /subnet 192.168.50.0 /' /etc/dhcp/dhcpd.conf", "exit", "sudo dhclient -v eth0"],
      },
    ],
    starterCommands: ["ip -br addr", "sudo dhclient -v eth0", "ssh gw-01", "journalctl -u isc-dhcp-server"],
  },
  successCriteria: [
    "isc-dhcp-server is active on gw-01",
    "ops-lt's eth0 has a dynamic address from 192.168.50.100–150",
    "ops-lt reaches printer-07 on TCP 9100",
    "http://dispatch.lumen.internal/ loads from ops-lt using the lease's gateway and DNS",
  ],
  hints: [
    "Start on the client: `sudo dhclient -v eth0`. Did any server answer the DISCOVERs? If not, the problem is on the server side.",
    "On gw-01 (`ssh gw-01`), `systemctl status isc-dhcp-server` and `journalctl -u isc-dhcp-server` say why the server isn't running. Compare its complaint with `ip -br addr` on gw-01.",
    "gw-01's eth0 is 192.168.50.1/24, but dhcpd.conf declares `subnet 192.168.5.0` — a leftover from the Memphis template. dhcpd won't serve an interface whose network it has no subnet block for.",
    "Fix the subnet line (`sudo sed -i 's/^subnet 192.168.5.0 /subnet 192.168.50.0 /' /etc/dhcp/dhcpd.conf`), `sudo systemctl restart isc-dhcp-server`, `exit`, then `sudo dhclient -v eth0` on ops-lt and check `ip addr show eth0`, `ip route` and `/etc/resolv.conf`.",
  ],
  questions: [
    {
      id: "order-dhcp-exchange",
      kind: "order",
      prompt: "Put the DHCP messages in the order they're exchanged when a client joins the network.",
      items: ["DHCPDISCOVER (client broadcast)", "DHCPOFFER (server proposes an address)", "DHCPREQUEST (client asks for that address)", "DHCPACK (server confirms the lease)"],
      explanation: "Discover, Offer, Request, Acknowledge — often remembered as DORA.",
    },
    {
      id: "interpret-no-offers",
      kind: "mcq",
      prompt: "Before the fix, ops-lt printed this. What does it tell you?",
      code: "$ sudo dhclient -v eth0\nDHCPDISCOVER on eth0 to 255.255.255.255 port 67 interval 3\nDHCPDISCOVER on eth0 to 255.255.255.255 port 67 interval 7\nDHCPDISCOVER on eth0 to 255.255.255.255 port 67 interval 12\nNo DHCPOFFERS received.",
      codeLanguage: "text",
      options: [
        "The pool is full",
        "The client sent broadcasts but no DHCP server on the segment answered",
        "The client was offered an address but rejected it",
        "DNS is not configured",
      ],
      answer: 1,
      explanation:
        "No OFFER came back at all. A full pool or a rejected offer would show OFFER/NAK lines. The next step is the server: is it running, and is it serving this segment?",
    },
    {
      id: "lease-contents",
      kind: "mcq",
      prompt: "After `dhclient` succeeded, which of these did ops-lt receive from the lease?",
      options: [
        "Only an IP address",
        "An address with prefix, a default gateway and a DNS server",
        "An address and a TLS certificate",
        "A hostname and an SSH key",
      ],
      answer: 1,
      explanation: "The ACK carried 192.168.50.x/24, `option routers 192.168.50.1` (default route) and `option domain-name-servers 10.20.1.53` (written to /etc/resolv.conf).",
    },
  ],
  debrief: {
    solution: `\`\`\`
ops-lt$ sudo dhclient -v eth0           # DISCOVER x3, No DHCPOFFERS received
gw-01$ journalctl -u isc-dhcp-server
... No subnet declaration for eth0 (192.168.50.1). ** Ignoring requests on eth0. **
gw-01$ grep ^subnet /etc/dhcp/dhcpd.conf
subnet 192.168.5.0 netmask 255.255.255.0 {      <- Memphis network, not Atlanta
gw-01$ sudo sed -i 's/^subnet 192.168.5.0 /subnet 192.168.50.0 /' /etc/dhcp/dhcpd.conf
gw-01$ sudo systemctl restart isc-dhcp-server
ops-lt$ sudo dhclient -v eth0
DHCPOFFER of 192.168.50.100 from 192.168.50.1
DHCPACK of 192.168.50.100 from 192.168.50.1
ops-lt$ ip route        # default via 192.168.50.1 dev eth0 proto dhcp
\`\`\`

The template edit changed the range, router and DNS lines but missed the \`subnet\` declaration itself. Because that network didn't match eth0, dhcpd refused to serve eth0 and then exited. Fixing one line restored addresses, routes and DNS for every station on the segment.`,
    commonMistakes: [
      "Configuring a static address on the test laptop: it reaches the printer, but every other station is still broken and the address may later collide with a lease.",
      "Restarting dhcpd repeatedly without reading the journal — the config error is deterministic.",
      "Fixing the file but forgetting to restart the service, then concluding the fix didn't work.",
      "Checking only the address after dhclient, not the gateway and DNS server the lease also delivered.",
    ],
    realWorld:
      "In production, `dhcpd -t -cf /etc/dhcp/dhcpd.conf` (or Kea's `kea-dhcp4 -t`) validates a config before it is deployed — a cheap guard against copy-paste templates. When the DHCP server lives on another subnet, routers forward DISCOVERs with a DHCP relay (`ip helper-address`), and the server picks the pool by the relay's address, so the subnet declaration still has to match.",
  },
  review: [
    {
      id: "net-dora",
      skill: "net.dhcp",
      variants: [
        {
          id: "net-dora-a",
          kind: "order",
          prompt: "Order the DHCP exchange.",
          items: ["Discover", "Offer", "Request", "Acknowledge"],
          explanation: "DORA: the client discovers, the server offers, the client requests, the server acknowledges.",
        },
        {
          id: "net-dora-b",
          kind: "mcq",
          prompt: "Why does a DHCP client send its first message to 255.255.255.255?",
          options: [
            "It is the DNS server's address",
            "It has no address yet and doesn't know the server's, so it broadcasts on the local segment",
            "Broadcasts are faster",
            "To reach the internet",
          ],
          answer: 1,
          explanation: "Without an address or a known server, a local broadcast is the only way to find one; that's also why DHCP needs a server or relay on each segment.",
        },
      ],
    },
    {
      id: "net-lease-options",
      skill: "net.dhcp",
      variants: [
        {
          id: "net-lease-options-a",
          kind: "mcq",
          prompt: "Clients get addresses from DHCP, but can't reach anything outside their subnet. Which DHCP option is most likely wrong?",
          options: ["domain-name-servers", "routers", "default-lease-time", "domain-name"],
          answer: 1,
          explanation: "`option routers` becomes the client's default gateway; if it's wrong, only on-link destinations work.",
        },
        {
          id: "net-lease-options-b",
          kind: "mcq",
          prompt: "Clients get addresses and can ping 10.20.1.10, but names don't resolve. Which DHCP option do you check?",
          options: ["routers", "domain-name-servers", "subnet-mask", "max-lease-time"],
          answer: 1,
          explanation: "`option domain-name-servers` is what dhclient writes into /etc/resolv.conf.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "A new Wi-Fi VLAN `10.20.12.0/24` was added for handheld scanners in the Atlanta warehouse. Its router interface is `10.20.12.1`, and the DHCP server is still gw-01 (on a different subnet). Scanners on the VLAN report \"No DHCPOFFERS received\", although gw-01's dhcpd.conf has a correct `subnet 10.20.12.0` block and the service is running.",
    question: {
      id: "transfer-dhcp-relay",
      kind: "mcq",
      prompt: "What is most likely missing?",
      options: [
        "A DNS record for each scanner",
        "A DHCP relay (helper) on the VLAN's router interface forwarding broadcasts to gw-01",
        "A larger range in the pool",
        "A firewall rule for TCP 67",
      ],
      answer: 1,
      explanation:
        "DISCOVERs are broadcasts and don't cross routers. A relay agent on 10.20.12.1 must forward them to the DHCP server (which uses UDP 67, not TCP).",
    },
  },
  refresher: {
    body: `DHCP hands a host its **address, prefix, default gateway and DNS servers**. The client broadcasts a DISCOVER; a server on that segment OFFERs an address; the client REQUESTs it; the server ACKs.

\`sudo dhclient -v eth0\` shows the exchange. *No DHCPOFFERS received* means no server answered — check the server: is it running, and does its config declare the subnet of the interface it serves?`,
    practice: {
      id: "refresher-no-offer",
      kind: "mcq",
      prompt: "`dhclient` shows DISCOVER three times and then \"No DHCPOFFERS received\". Where do you look next?",
      options: ["The client's /etc/resolv.conf", "The DHCP server's status and logs", "The web server", "The client's browser cache"],
      answer: 1,
      explanation: "The client did its part; nobody offered an address, so the server side is the next place to look.",
    },
  },
};
