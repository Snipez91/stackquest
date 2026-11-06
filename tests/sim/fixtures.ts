import type { SimScenario } from "../../src/sim/schema";

/** Single host with an app service and a log file. */
export function webScenario(): SimScenario {
  return {
    hosts: [
      {
        name: "web-01",
        users: [
          { name: "dev", uid: 1000, groups: ["sudo"], home: "/home/dev" },
          { name: "intern", uid: 1002, groups: [], home: "/home/intern" },
          { name: "appsvc", uid: 1001, groups: [], home: "/srv/app", shell: "/usr/sbin/nologin" },
        ],
        files: [
          { path: "/etc/app", type: "dir", mode: "0750", owner: "root", group: "root" },
          { path: "/etc/app/app.conf", content: "listen=8080\nlog=/var/log/app\n", mode: "0640", owner: "root", group: "root" },
          { path: "/var/log/app", type: "dir", mode: "0755", owner: "root", group: "root" },
          {
            path: "/var/log/access.log",
            content: [
              "10.0.0.5 - - [02/Mar/2026:09:00:01] \"GET / HTTP/1.1\" 200 512",
              "10.0.0.7 - - [02/Mar/2026:09:00:02] \"GET /login HTTP/1.1\" 500 128",
              "10.0.0.5 - - [02/Mar/2026:09:00:03] \"POST /login HTTP/1.1\" 302 64",
              "10.0.0.9 - - [02/Mar/2026:09:00:04] \"GET /admin HTTP/1.1\" 403 256",
              "10.0.0.5 - - [02/Mar/2026:09:00:05] \"GET /api HTTP/1.1\" 500 1024",
              "10.0.0.7 - - [02/Mar/2026:09:00:06] \"GET / HTTP/1.1\" 200 512",
            ].join("\n") + "\n",
          },
          { path: "/home/dev/notes.txt", content: "remember the milk\n", owner: "dev", group: "dev" },
          { path: "/home/dev/secret.txt", content: "s3cret\n", owner: "dev", group: "dev", mode: "0600" },
          { path: "/srv/shared", type: "dir", mode: "0770", owner: "root", group: "sudo" },
          { path: "/srv/shared/plan.md", content: "plan\n", mode: "0664", owner: "root", group: "sudo" },
        ],
        services: [
          {
            name: "app",
            description: "Demo application server",
            execUser: "appsvc",
            command: "/usr/bin/app --config /etc/app/app.conf",
            requiresReadable: ["/etc/app/app.conf"],
            requiresWritable: ["/var/log/app"],
            configChecks: [{ path: "/etc/app/app.conf", pattern: "^listen=\\d+$", error: "config error: 'listen' must be a port number" }],
            listens: [{ port: 8080, proto: "tcp" }],
            http: [{ path: "/", status: 200, body: "app ok\n" }, { path: "/health", status: 200, body: "healthy\n" }],
            kind: "http",
          },
        ],
        interfaces: [{ name: "eth0", address: "10.0.0.10/24" }],
      },
    ],
    segments: [{ name: "lan", cidr: "10.0.0.0/24" }],
    start: { host: "web-01", user: "dev" },
  };
}

/**
 * Two segments joined by a router:
 *   lan 10.0.1.0/24: ws-01 (.10), laptop (dhcp), gw eth0 (.1)
 *   srv 10.0.2.0/24: gw eth1 (.1), ns-01 (.53), web-01 (.80)
 */
export function netScenario(): SimScenario {
  const dev = { name: "dev", uid: 1000, groups: ["sudo"], home: "/home/dev" };
  return {
    hosts: [
      {
        name: "ws-01",
        users: [dev],
        interfaces: [{ name: "eth0", address: "10.0.1.10/24" }],
        routes: [{ destination: "default", via: "10.0.1.1", dev: "eth0" }],
        files: [{ path: "/etc/resolv.conf", content: "nameserver 10.0.2.99\n" }],
      },
      {
        name: "gw",
        users: [dev],
        ipForward: true,
        interfaces: [
          { name: "eth0", address: "10.0.1.1/24" },
          { name: "eth1", address: "10.0.2.1/24" },
        ],
        services: [{ name: "isc-dhcp-server", execUser: "root", command: "/usr/sbin/dhcpd -f eth0", state: "active", kind: "dhcp" }],
        dhcpPool: { range: ["10.0.1.100", "10.0.1.110"], prefix: 24, gateway: "10.0.1.1", dns: "10.0.2.53" },
      },
      {
        name: "ns-01",
        users: [dev, { name: "bind", uid: 120, home: "/var/cache/bind" }],
        interfaces: [{ name: "eth0", address: "10.0.2.53/24" }],
        routes: [{ destination: "default", via: "10.0.2.1", dev: "eth0" }],
        services: [{ name: "named", execUser: "bind", command: "/usr/sbin/named -f -u bind", state: "active", kind: "dns", listens: [{ port: 53, proto: "udp" }] }],
        dnsZones: { "web.lab": "10.0.2.80", "ns.lab": "10.0.2.53" },
      },
      {
        name: "web-01",
        users: [dev, { name: "www-data", uid: 33, home: "/var/www" }],
        interfaces: [{ name: "eth0", address: "10.0.2.80/24" }],
        routes: [{ destination: "default", via: "10.0.2.1", dev: "eth0" }],
        services: [{ name: "nginx", execUser: "www-data", command: "/usr/sbin/nginx -g daemon off;", state: "active", kind: "http", listens: [{ port: 80, proto: "tcp" }], http: [{ path: "/", status: 200, body: "hello from web-01\n" }] }],
        firewall: { enabled: true, defaultInbound: "deny", rules: [{ action: "allow", port: 22, proto: "tcp", from: "any" }] },
      },
      {
        name: "laptop",
        users: [dev],
        interfaces: [{ name: "eth0", address: null, up: false, dhcp: true, segment: "lan" }],
      },
    ],
    segments: [
      { name: "lan", cidr: "10.0.1.0/24" },
      { name: "srv", cidr: "10.0.2.0/24" },
    ],
    start: { host: "ws-01", user: "dev" },
  };
}
