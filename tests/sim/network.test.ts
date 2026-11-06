import { describe, expect, it } from "vitest";
import { Simulation, evaluateAssertion } from "../../src/sim";
import { netScenario } from "./fixtures";

describe("networking", () => {
  it("shows interfaces and routes", () => {
    const s = new Simulation(netScenario());
    const a = s.exec("ip addr show eth0").stdout;
    expect(a).toMatch(/^2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500/);
    expect(a).toContain("inet 10.0.1.10/24 brd 10.0.1.255 scope global eth0");
    expect(s.exec("ip route").stdout).toBe("default via 10.0.1.1 dev eth0 proto static\n10.0.1.0/24 dev eth0 proto kernel scope link src 10.0.1.10\n");
    expect(s.exec("ip route get 10.0.2.80").stdout).toContain("10.0.2.80 via 10.0.1.1 dev eth0 src 10.0.1.10");
  });

  it("DNS fails while IP works (wrong nameserver), then is fixed", () => {
    const s = new Simulation(netScenario());
    const byIp = s.exec("ping -c 2 10.0.2.80");
    expect(byIp.exitCode).toBe(0);
    expect(byIp.stdout).toContain("64 bytes from 10.0.2.80: icmp_seq=1 ttl=63");
    expect(byIp.stdout).toContain("2 packets transmitted, 2 received, 0% packet loss");
    const byName = s.exec("ping -c 1 web.lab");
    expect(byName.exitCode).toBe(2);
    expect(byName.stderr).toBe("ping: web.lab: Temporary failure in name resolution\n");
    expect(s.exec("nslookup web.lab").stdout).toBe(";; connection timed out; no servers could be reached\n\n");
    expect(s.exec("dig +short @10.0.2.53 web.lab").stdout).toBe("10.0.2.80\n");
    expect(evaluateAssertion(s, { type: "resolves", from: "ws-01", name: "web.lab", expect: true }).pass).toBe(false);

    s.exec("echo 'nameserver 10.0.2.53' | sudo tee /etc/resolv.conf");
    expect(s.exec("ping -c 1 web.lab").stdout).toContain("PING web.lab (10.0.2.80) 56(84) bytes of data.");
    expect(s.exec("nslookup web.lab").stdout).toBe("Server:\t\t10.0.2.53\nAddress:\t10.0.2.53#53\n\nName:\tweb.lab\nAddress: 10.0.2.80\n\n");
    expect(s.exec("host nope.lab").stdout).toBe("Host nope.lab not found: 3(NXDOMAIN)\n");
    expect(s.exec("ping -c 1 nope.lab").stderr).toBe("ping: nope.lab: Name or service not known\n");
    expect(evaluateAssertion(s, { type: "resolves", from: "ws-01", name: "web.lab", ip: "10.0.2.80", expect: true }).pass).toBe(true);

    // /etc/hosts wins for getaddrinfo but not for dig/nslookup
    s.exec("echo '10.0.2.53 web.lab' | sudo tee -a /etc/hosts");
    expect(s.exec("getent hosts web.lab").stdout).toBe("10.0.2.53       web.lab\n");
    expect(s.exec("dig +short web.lab").stdout).toBe("10.0.2.80\n");
  });

  it("DNS needs an active dns service on the nameserver", () => {
    const s = new Simulation(netScenario());
    s.exec("echo 'nameserver 10.0.2.53' | sudo tee /etc/resolv.conf");
    s.exec("ssh ns-01");
    expect(s.currentHost).toBe("ns-01");
    s.exec("sudo systemctl stop named");
    s.exec("exit");
    expect(s.currentHost).toBe("ws-01");
    expect(s.exec("ping -c1 web.lab").stderr).toBe("ping: web.lab: Temporary failure in name resolution\n");
  });

  it("missing default route: network unreachable until added", () => {
    const sc = netScenario();
    sc.hosts[0].routes = [];
    const s = new Simulation(sc);
    const r = s.exec("ping -c 1 10.0.2.80");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toBe("ping: connect: Network is unreachable\n");
    expect(s.exec("ping -c 1 10.0.1.1").exitCode).toBe(0); // same subnet still works
    expect(evaluateAssertion(s, { type: "reachable", from: "ws-01", to: "web-01", expect: true }).pass).toBe(false);
    expect(s.exec("ip route add default via 10.0.1.1").stderr).toBe("RTNETLINK answers: Operation not permitted\n");
    expect(s.exec("sudo ip route add default via 10.0.9.1").stderr).toBe("Error: Nexthop has invalid gateway.\n");
    expect(s.exec("sudo ip route add default via 10.0.1.1").exitCode).toBe(0);
    expect(s.exec("ping -c 1 10.0.2.80").exitCode).toBe(0);
    expect(evaluateAssertion(s, { type: "route", destination: "default", via: "10.0.1.1", expect: true }).pass).toBe(true);
    expect(evaluateAssertion(s, { type: "reachable", from: "ws-01", to: "web-01", expect: true }).pass).toBe(true);
    const tr = s.exec("traceroute -n 10.0.2.80").stdout;
    expect(tr).toContain(" 1  10.0.1.1 ");
    expect(tr).toContain(" 2  10.0.2.80 ");
  });

  it("return path matters: server without a route back times out", () => {
    const sc = netScenario();
    sc.hosts[3].routes = [];
    const s = new Simulation(sc);
    const r = s.exec("ping -c 2 10.0.2.80");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("2 packets transmitted, 0 received, 100% packet loss");
  });

  it("interface down / wrong address", () => {
    const s = new Simulation(netScenario());
    s.exec("sudo ip link set eth0 down");
    expect(s.exec("ping -c 1 10.0.1.1").stderr).toBe("ping: connect: Network is unreachable\n");
    s.exec("sudo ip link set dev eth0 up");
    s.exec("sudo ip addr del 10.0.1.10/24 dev eth0 && sudo ip addr add 10.0.1.20/24 dev eth0");
    expect(evaluateAssertion(s, { type: "interface", name: "eth0", address: "10.0.1.20", up: true }).pass).toBe(true);
    expect(s.exec("ping -c 1 10.0.1.99").stdout).toContain("From 10.0.1.20 icmp_seq=1 Destination Host Unreachable");
  });

  it("firewall blocks a port until ufw allows it", () => {
    const s = new Simulation(netScenario());
    s.exec("echo 'nameserver 10.0.2.53' | sudo tee /etc/resolv.conf");
    const c = s.exec("curl -s http://web.lab/");
    expect(c.exitCode).toBe(28);
    expect(s.exec("curl http://web.lab/").stderr).toBe("curl: (28) Failed to connect to web.lab port 80 after 130005 ms: Connection timed out\n");
    expect(s.exec("nc -zv web.lab 22").stderr).toBe("Connection to web.lab (10.0.2.80) 22 port [tcp/ssh] succeeded!\n");
    expect(s.exec("nc -zv 10.0.2.80 80").stderr).toBe("nc: connect to 10.0.2.80 (10.0.2.80) port 80 (tcp) timed out: Operation now in progress\n");
    expect(evaluateAssertion(s, { type: "reachable", from: "ws-01", to: "web-01", port: 80, expect: true }).detail).toBe("ws-01 -> web-01 (10.0.2.80) tcp/80: filtered (at web-01)");
    expect(s.exec("ping -c 1 web.lab").exitCode).toBe(0); // ICMP allowed like ufw's defaults

    s.exec("ssh web-01");
    expect(s.prompt()).toBe("dev@web-01:~$");
    expect(s.exec("ufw status").stderr).toBe("ERROR: You need to be root to run this script\n");
    expect(s.exec("sudo ufw status").stdout).toBe("Status: active\n\nTo                         Action      From\n--                         ------      ----\n22/tcp                     ALLOW       Anywhere\n\n");
    expect(s.exec("sudo ufw allow 80/tcp").stdout).toBe("Rule added\n");
    expect(s.exec("exit").stdout).toBe("logout\nConnection to web-01 closed.\n");
    expect(s.exec("curl -s http://web.lab/").stdout).toBe("hello from web-01\n");
    expect(s.exec("curl -I http://web.lab/").stdout).toMatch(/^HTTP\/1\.1 200 OK\nServer: nginx\n/);
    expect(evaluateAssertion(s, { type: "http_status", from: "ws-01", url: "http://web.lab/", status: 200 }).pass).toBe(true);
    expect(evaluateAssertion(s, { type: "reachable", from: "ws-01", to: "10.0.2.80", port: 80, expect: true }).pass).toBe(true);
  });

  it("ufw allow from CIDR and connection refused without listener", () => {
    const s = new Simulation(netScenario());
    s.exec("ssh web-01");
    s.exec("sudo ufw allow from 10.0.1.0/24 to any port 8080");
    s.exec("exit");
    expect(s.exec("curl http://10.0.2.80:8080/").stderr).toBe("curl: (7) Failed to connect to 10.0.2.80 port 8080 after 0 ms: Connection refused\n");
  });

  it("DHCP lease on the same segment", () => {
    const s = new Simulation(netScenario());
    s.exec("ssh gw");
    s.exec("sudo systemctl stop isc-dhcp-server");
    s.exec("exit");
    // laptop is not reachable over ssh (no address); evaluate via a session switch
    const lap = s.clone();
    lap.setSession("laptop", "dev");
    expect(lap.exec("sudo dhclient eth0").stdout).toContain("No DHCPOFFERS received.");
    const s2 = new Simulation(netScenario());
    s2.setSession("laptop", "dev");
    const r = s2.exec("sudo dhclient eth0");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("DHCPACK of 10.0.1.100 from 10.0.1.1");
    expect(s2.exec("ip -br addr show eth0").stdout).toBe("eth0             UP             10.0.1.100/24\n");
    expect(s2.exec("cat /etc/resolv.conf").stdout).toContain("nameserver 10.0.2.53");
    expect(s2.exec("ip route").stdout).toContain("default via 10.0.1.1 dev eth0 proto dhcp");
    expect(s2.exec("curl -s --max-time 2 http://web.lab/").exitCode).toBe(28); // firewall still blocks 80
    expect(s2.exec("ping -c 1 web.lab").exitCode).toBe(0);
    expect(evaluateAssertion(s2, { type: "interface", host: "laptop", name: "eth0", address: "10.0.1.100/24" }).pass).toBe(true);
  });

  it("ssh switches host and user, unknown user is denied, remote command works", () => {
    const s = new Simulation(netScenario());
    expect(s.exec("ssh root@web-01").stderr).toBe("");
    s.exec("exit");
    expect(s.exec("ssh bob@web-01").stderr).toBe("bob@web-01: Permission denied (publickey,password).\n");
    expect(s.exec("ssh web-01 hostname").stdout).toBe("web-01\n");
    expect(s.currentHost).toBe("ws-01");
    expect(s.exec("ssh nowhere").stderr).toBe("ssh: Could not resolve hostname nowhere: Temporary failure in name resolution\n");
    s.exec("ssh ns-01");
    expect(s.exec("hostname").stdout).toBe("ns-01\n");
    expect(s.exec("ss -ulnp").stdout).toContain("0.0.0.0:53");
  });
});
