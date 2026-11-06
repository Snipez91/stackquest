/**
 * Shared building blocks for the networking lab scenarios. All hosts, names and
 * networks are fictional (Lumen Logistics lab: 192.168.50.0/24 office,
 * 10.20.x.0/24 server segments, names under lumen.internal).
 */

/** The learner's account; present on every host so `ssh <host>` and `sudo` work. */
export const OPS = { name: "ops", uid: 1000, groups: ["sudo"], home: "/home/ops" };

export function resolvConf(nameserver: string, search = "lumen.internal") {
  return {
    path: "/etc/resolv.conf",
    content: `# Managed by Lumen netplan template. Local edits are allowed in the lab.\nnameserver ${nameserver}\nsearch ${search}\n`,
  };
}

/** Records served by dns-01 (10.20.1.53) in most scenarios. */
export const LUMEN_ZONE: Record<string, string> = {
  "dns-01.lumen.internal": "10.20.1.53",
  "gw-01.lumen.internal": "10.20.1.1",
  "web-01.lumen.internal": "10.20.1.10",
  "dispatch.lumen.internal": "10.20.1.10",
  "portal.lumen.internal": "10.20.1.10",
  "api-01.lumen.internal": "10.20.1.20",
  "api.lumen.internal": "10.20.1.20",
  "reports-01.lumen.internal": "10.20.1.60",
  "reports.lumen.internal": "10.20.1.60",
  "db-01.lumen.internal": "10.20.2.30",
};

export const namedService = {
  name: "named",
  description: "BIND Domain Name Server",
  execUser: "bind",
  command: "/usr/sbin/named -f -u bind",
  state: "active" as const,
  enabled: true,
  kind: "dns" as const,
};

export const BIND_USER = { name: "bind", uid: 120, home: "/var/cache/bind", shell: "/usr/sbin/nologin" };
export const WWW_USER = { name: "www-data", uid: 33, home: "/var/www", shell: "/usr/sbin/nologin" };

/** gw-01: routes between the office segment and the server segment. */
export function gateway(extraInterfaces: { name: string; address: string | null; up?: boolean }[] = []) {
  return {
    name: "gw-01",
    users: [OPS],
    ipForward: true,
    interfaces: [
      { name: "eth0", address: "192.168.50.1/24" },
      { name: "eth1", address: "10.20.1.1/24" },
      ...extraInterfaces,
    ],
  };
}

export function dnsServer(zone: Record<string, string> = LUMEN_ZONE) {
  return {
    name: "dns-01",
    users: [OPS, BIND_USER],
    interfaces: [{ name: "eth0", address: "10.20.1.53/24" }],
    routes: [{ destination: "default" as const, via: "10.20.1.1", dev: "eth0" }],
    services: [namedService],
    dnsZones: zone,
  };
}

export const dispatchNginx = {
  name: "nginx",
  description: "nginx - high performance web server",
  execUser: "www-data",
  command: "/usr/sbin/nginx -g daemon off;",
  state: "active" as const,
  enabled: true,
  kind: "http" as const,
  listens: [{ port: 80, proto: "tcp" as const }],
  http: [
    { path: "/", status: 200, body: "<html><title>Lumen Dispatch</title><body>Dispatch board: 214 active loads</body></html>\n" },
    { path: "/healthz", status: 200, body: "ok\n" },
  ],
};

export const SEGMENTS = [
  { name: "office", cidr: "192.168.50.0/24" },
  { name: "servers", cidr: "10.20.1.0/24" },
];
