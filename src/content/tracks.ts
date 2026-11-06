import type { Track } from "./schema";

export const tracks: Track[] = [
  {
    id: "python",
    name: "Python",
    tagline: "Automate the boring parts of operations",
    color: "py",
    description:
      "From variables to tested automation scripts. You'll work on the log processors, report generators, and API clients that keep Lumen Logistics running.",
    coverage: {
      included: [
        "Core syntax, types, control flow, functions and collections",
        "Files, exceptions, modules and the standard library",
        "Unit testing with assert-style checks",
        "Working with JSON APIs (simulated responses)",
        "Debugging from tracebacks and practical automation",
      ],
      future: [
        "Packaging and virtual environments",
        "Concurrency (threads, asyncio)",
        "Real HTTP and database clients",
        "Type checking with mypy, larger codebases",
      ],
    },
  },
  {
    id: "linux",
    name: "Linux",
    tagline: "Operate and troubleshoot servers with confidence",
    color: "lx",
    description:
      "Navigate, inspect and repair simulated Lumen servers. Permissions, processes, services, logs and shell scripting — taught as a model of how the system works, not a list of commands.",
    coverage: {
      included: [
        "Filesystem navigation and file operations",
        "Pipes and text processing (grep, sort, uniq, cut, awk basics)",
        "Users, groups and permission semantics",
        "Processes, environment variables and signals",
        "systemd services and journal logs (simulated)",
        "Shell scripting fundamentals and systematic troubleshooting",
      ],
      future: [
        "Package management",
        "Storage, LVM and filesystems",
        "SELinux/AppArmor",
        "Containers and cgroups",
        "Real kernel and performance tooling",
      ],
    },
  },
  {
    id: "javascript",
    name: "JavaScript",
    tagline: "Build interfaces that fail gracefully",
    color: "js",
    description:
      "Fix and extend the Lumen dispatch dashboard: values, functions, objects, the DOM event model, async code and resilient API handling.",
    coverage: {
      included: [
        "Variables, types, functions, arrays and objects",
        "Scope and closures",
        "DOM events (simulated DOM subset)",
        "Promises, async/await and fetch (simulated API)",
        "Error handling, testing and debugging",
      ],
      future: [
        "Frameworks (React, Vue)",
        "Build tooling and bundlers",
        "TypeScript",
        "Browser performance and accessibility auditing",
        "Node.js servers",
      ],
    },
  },
  {
    id: "networking",
    name: "Networking",
    tagline: "Reason from packets to platforms",
    color: "net",
    description:
      "Diagnose connectivity in Lumen's private lab networks: addressing, subnets, DNS, DHCP, routing, ports, HTTP/TLS and firewalls — using a layered troubleshooting method.",
    coverage: {
      included: [
        "TCP/IP model, IPv4 addressing and subnetting",
        "DNS resolution and DHCP leases",
        "Routing and default gateways",
        "Ports, TCP vs UDP, HTTP/HTTPS",
        "TLS fundamentals (certificate reasoning, no live handshakes)",
        "Host firewalls and systematic connectivity troubleshooting",
      ],
      future: [
        "IPv6 in depth",
        "VLANs, switching and spanning tree",
        "Dynamic routing protocols (OSPF, BGP)",
        "Packet capture analysis",
        "VPNs and load balancers",
      ],
    },
  },
  {
    id: "capstone",
    name: "Capstones",
    tagline: "Cross-track incidents",
    color: "cap",
    description:
      "Multi-stage incidents that combine logs, permissions, code and network configuration. Each requires skills from several tracks, without re-teaching them.",
    coverage: {
      included: ["Cross-track investigation and repair", "Root-cause analysis write-ups"],
      future: ["Team-based live game days", "Longer multi-service outages"],
    },
  },
];
