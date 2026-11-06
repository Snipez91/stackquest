import type { Skill } from "@/content/schema";

export const networkingSkills: Skill[] = [
  {
    id: "net.tcpip-model",
    track: "networking",
    name: "TCP/IP layers",
    description: "Place a symptom in the link, internet, transport or application layer and pick the tool that tests that layer.",
  },
  {
    id: "net.addressing",
    track: "networking",
    name: "IPv4 addressing",
    description: "Read addresses in CIDR notation, tell the network part from the host part, and spot a host that is outside its expected network.",
  },
  {
    id: "net.subnetting",
    track: "networking",
    name: "Subnetting",
    description: "Work out mask, network, broadcast and host range from a prefix length, and predict on-link versus via-gateway delivery.",
  },
  {
    id: "net.dns",
    track: "networking",
    name: "DNS and name resolution",
    description: "Trace how a host resolves names (/etc/hosts, then resolv.conf nameservers), query servers directly with dig, and fix resolution properly.",
  },
  {
    id: "net.dhcp",
    track: "networking",
    name: "DHCP",
    description: "Follow the DISCOVER/OFFER/REQUEST/ACK exchange, diagnose a server that offers nothing, and verify the address, gateway and DNS in a lease.",
  },
  {
    id: "net.routing",
    track: "networking",
    name: "Routing and gateways",
    description: "Choose routes by longest prefix, fix default gateways, and make sure both directions of a connection have a route.",
  },
  {
    id: "net.path-tracing",
    track: "networking",
    name: "Path tracing",
    description: "Use ip route get and traceroute to see where packets are sent and locate the hop where a path stops.",
  },
  {
    id: "net.ports",
    track: "networking",
    name: "Ports and listeners",
    description: "Read listening sockets with ss, understand bind addresses, and interpret connection refused versus timed out.",
  },
  {
    id: "net.tcp-udp",
    track: "networking",
    name: "TCP vs UDP",
    description: "Contrast connection-oriented TCP with datagram UDP, know which services use which, and test and filter each protocol separately.",
  },
  {
    id: "net.http",
    track: "networking",
    name: "HTTP diagnostics",
    description: "Interpret HTTP status classes and headers with curl, and tell an HTTP-level error from a failure at a lower layer.",
  },
  {
    id: "net.tls",
    track: "networking",
    name: "TLS certificates",
    description: "Reason about certificate chains, validity periods and SAN names from openssl output, and fix verification failures without disabling verification.",
  },
  {
    id: "net.firewalls",
    track: "networking",
    name: "Host firewalls",
    description: "Read ufw rule order and default policy, write narrowly scoped allow rules, and verify from both allowed and disallowed sources.",
  },
  {
    id: "net.troubleshooting",
    track: "networking",
    name: "Methodical troubleshooting",
    description: "Diagnose connectivity layer by layer across hosts, fix one fault at a time, and re-test the user's original request after each change.",
  },
];
