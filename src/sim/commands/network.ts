/** Network commands: ip, ifconfig, ping, traceroute, nslookup, dig, host, curl, wget, nc, ss, netstat, dhclient, ufw, ssh. */
import {
  activeRoutes,
  broadcastOf,
  dhcpDiscover,
  dnsQuery,
  forward,
  hostAddrs,
  intToIp,
  ipToInt,
  isIp,
  listeners,
  lookupRoute,
  parseCidr,
  probe,
  resolvConf,
  resolveName,
  reverseLookup,
  type ProbeResult,
  type Resolution,
} from "../net";
import { credFor, getUser, makeSession } from "../state";
import type { HostState, SimInterface } from "../types";
import { fmtDate, fmtIso, hash } from "../util";
import { opts } from "./files";
import type { CmdCtx, CommandFn } from "./types";

const PORT_NAMES: Record<number, string> = { 22: "ssh", 25: "smtp", 53: "domain", 67: "bootps", 80: "http", 443: "https", 3306: "mysql", 5432: "postgresql", 6379: "redis", 8080: "http-alt" };

function rtt(p: ProbeResult, seq: number, salt: string): string {
  const base = 0.03 + p.rtHops * 0.21 + (hash(salt) % 40) / 1000;
  const v = base + ((hash(salt + seq) % 25) / 1000);
  return v.toFixed(3);
}

function resolveTarget(ctx: CmdCtx, name: string): Resolution {
  return resolveName(ctx.core.state, ctx.host, name);
}

// ------------------------------------------------------------------ ip / ifconfig

function ifaceIndex(h: HostState, i: SimInterface): number {
  return h.interfaces.indexOf(i) + 1;
}

function ipAddrBlock(h: HostState, i: SimInterface, brief: boolean): string {
  const lo = i.name === "lo";
  const state = lo ? "UNKNOWN" : i.up ? "UP" : "DOWN";
  if (brief) return `${i.name.padEnd(16)} ${state.padEnd(14)} ${i.up && i.address ? i.address : ""}\n`;
  const flags = lo ? (i.up ? "LOOPBACK,UP,LOWER_UP" : "LOOPBACK") : i.up ? "BROADCAST,MULTICAST,UP,LOWER_UP" : "BROADCAST,MULTICAST";
  let s = `${ifaceIndex(h, i)}: ${i.name}: <${flags}> mtu ${lo ? 65536 : 1500} qdisc ${lo ? "noqueue" : "fq_codel"} state ${state} group default qlen 1000\n`;
  s += lo ? `    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n` : `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff\n`;
  if (i.address) {
    const c = parseCidr(i.address)!;
    s += `    inet ${i.address}${lo ? "" : ` brd ${intToIp(broadcastOf(c.ip, c.prefix))}`} scope ${lo ? "host" : "global"}${i.dhcp ? " dynamic" : ""} ${i.name}\n       valid_lft forever preferred_lft forever\n`;
  }
  return s;
}

function routeLines(h: HostState): string {
  let out = "";
  const statics = h.routes;
  const def = statics.filter((r) => r.destination === "default");
  for (const r of def) out += `default ${r.via ? `via ${r.via} ` : ""}dev ${r.dev} proto ${h.interfaces.find((i) => i.name === r.dev)?.dhcp ? "dhcp" : "static"}${h.interfaces.find((i) => i.name === r.dev && i.up) ? "" : " linkdown"}\n`;
  for (const a of hostAddrs(h, false)) {
    const net = intToIp((a.ip & (a.prefix === 0 ? 0 : (0xffffffff << (32 - a.prefix)) >>> 0)) >>> 0);
    out += `${net}/${a.prefix} dev ${a.iface} proto kernel scope link src ${intToIp(a.ip)}\n`;
  }
  for (const r of statics) if (r.destination !== "default") out += `${r.destination} ${r.via ? `via ${r.via} ` : ""}dev ${r.dev} proto static\n`;
  return out;
}

const NETLINK_EPERM = "RTNETLINK answers: Operation not permitted\n";

const ip: CommandFn = (ctx) => {
  const args = [...ctx.args];
  let brief = false;
  while (args[0]?.startsWith("-")) {
    const f = args.shift()!;
    if (f === "-br" || f === "-brief" || f === "--brief") brief = true;
    else if (f === "-4" || f === "-c" || f === "-color") continue;
    else return ctx.unsupported(`ip: option '${f}' is not supported in this simulation`);
  }
  const h = ctx.host;
  const obj = args[0] ?? "";
  const cmd = args[1] ?? "show";
  const root = ctx.cred.uid === 0;
  const findIf = (name: string | undefined) => h.interfaces.find((i) => i.name === name);
  const devArg = (from: string[]) => {
    const di = from.indexOf("dev");
    return di >= 0 ? from[di + 1] : undefined;
  };
  const isObj = (names: string[]) => names.includes(obj);
  if (isObj(["a", "addr", "address"])) {
    if (["show", "s", "list", "ls"].includes(cmd)) {
      const dev = args[2] === "dev" ? args[3] : args[2];
      if (dev && !findIf(dev)) {
        ctx.err(`Device "${dev}" does not exist.\n`);
        return 1;
      }
      for (const i of h.interfaces) if (!dev || i.name === dev) ctx.out(ipAddrBlock(h, i, brief));
      return 0;
    }
    if (cmd === "add" || cmd === "del" || cmd === "delete" || cmd === "flush") {
      if (!root) {
        ctx.err(NETLINK_EPERM);
        return 2;
      }
      const dev = devArg(args);
      const iface = findIf(dev);
      if (!iface) {
        ctx.err(dev ? `Cannot find device "${dev}"\n` : "Not enough information: \"dev\" argument is required.\n");
        return 1;
      }
      if (cmd === "flush") {
        iface.address = null;
        h.routes = h.routes.filter((r) => r.dev !== iface.name);
        return 0;
      }
      const cidr = args[2];
      const c = cidr ? parseCidr(cidr.includes("/") ? cidr : cidr + "/32") : null;
      if (!c || !cidr) {
        ctx.err(`Error: any valid prefix is expected rather than "${cidr ?? ""}".\n`);
        return 1;
      }
      const norm = `${intToIp(c.ip)}/${c.prefix}`;
      if (cmd === "add") {
        if (iface.address === norm) {
          ctx.err("RTNETLINK answers: File exists\n");
          return 2;
        }
        iface.address = norm;
        iface.dhcp = false;
        return 0;
      }
      if (iface.address !== norm && iface.address?.split("/")[0] !== intToIp(c.ip)) {
        ctx.err("RTNETLINK answers: Cannot assign requested address\n");
        return 2;
      }
      iface.address = null;
      // routes through this interface simply become inactive (no connected subnet)
      return 0;
    }
  }
  if (isObj(["l", "link"])) {
    if (["show", "s", "list", "ls"].includes(cmd)) {
      const dev = args[2] === "dev" ? args[3] : args[2];
      for (const i of h.interfaces) {
        if (dev && i.name !== dev) continue;
        if (brief) {
          ctx.out(`${i.name.padEnd(16)} ${(i.name === "lo" ? "UNKNOWN" : i.up ? "UP" : "DOWN").padEnd(14)} ${i.mac} <${i.up ? "BROADCAST,MULTICAST,UP,LOWER_UP" : "BROADCAST,MULTICAST"}>\n`);
          continue;
        }
        const block = ipAddrBlock(h, i, false).split("\n").slice(0, 2).join("\n");
        ctx.out(block + "\n");
      }
      return 0;
    }
    if (cmd === "set") {
      if (!root) {
        ctx.err(NETLINK_EPERM);
        return 2;
      }
      const rest = args.slice(2);
      const dev = rest[0] === "dev" ? rest[1] : rest[0];
      const iface = findIf(dev);
      if (!iface) {
        ctx.err(`Cannot find device "${dev ?? ""}"\n`);
        return 1;
      }
      if (rest.includes("up")) iface.up = true;
      else if (rest.includes("down")) iface.up = false;
      else return ctx.unsupported(`ip link set: only 'up' and 'down' are supported in this simulation`);
      return 0;
    }
  }
  if (isObj(["r", "route", "ro"])) {
    if (["show", "s", "list", "ls"].includes(cmd)) {
      ctx.out(routeLines(h));
      return 0;
    }
    if (cmd === "get") {
      const dst = args[2];
      if (!dst || !isIp(dst)) {
        ctx.err(`Error: inet prefix is expected rather than "${dst ?? ""}".\n`);
        return 1;
      }
      const r = lookupRoute(h, ipToInt(dst));
      if (!r) {
        ctx.err("RTNETLINK answers: Network is unreachable\n");
        return 2;
      }
      const src = hostAddrs(h, false).find((a) => a.iface === r.dev);
      ctx.out(`${dst} ${r.via !== undefined ? `via ${intToIp(r.via)} ` : ""}dev ${r.dev} src ${src ? intToIp(src.ip) : "0.0.0.0"} uid ${ctx.cred.uid}\n    cache\n`);
      return 0;
    }
    if (cmd === "add" || cmd === "del" || cmd === "delete" || cmd === "replace" || cmd === "change") {
      if (!root) {
        ctx.err(NETLINK_EPERM);
        return 2;
      }
      let dest = args[2];
      if (!dest) {
        ctx.err("Error: argument is wrong.\n");
        return 1;
      }
      if (dest === "0.0.0.0/0") dest = "default";
      if (dest !== "default") {
        const c = parseCidr(dest.includes("/") ? dest : dest + "/32");
        if (!c) {
          ctx.err(`Error: inet prefix is expected rather than "${dest}".\n`);
          return 1;
        }
        dest = `${intToIp((c.ip & (c.prefix === 0 ? 0 : (0xffffffff << (32 - c.prefix)) >>> 0)) >>> 0)}/${c.prefix}`;
      }
      const vi = args.indexOf("via");
      const via = vi >= 0 ? args[vi + 1] : undefined;
      let dev = devArg(args);
      if (cmd === "del" || cmd === "delete") {
        const idx = h.routes.findIndex((r) => r.destination === dest && (!via || r.via === via) && (!dev || r.dev === dev));
        if (idx < 0) {
          ctx.err("RTNETLINK answers: No such process\n");
          return 2;
        }
        h.routes.splice(idx, 1);
        return 0;
      }
      if (via !== undefined && !isIp(via)) {
        ctx.err(`Error: inet address is expected rather than "${via}".\n`);
        return 1;
      }
      if (via) {
        const v = ipToInt(via);
        const conn = hostAddrs(h, false).find((a) => (!dev || a.iface === dev) && ((v ^ a.ip) & (a.prefix === 0 ? 0 : (0xffffffff << (32 - a.prefix)) >>> 0)) === 0);
        if (!conn) {
          ctx.err("Error: Nexthop has invalid gateway.\n");
          return 2;
        }
        dev = conn.iface;
      }
      if (!dev) {
        ctx.err("Error: Device for nexthop is not up.\n");
        return 2;
      }
      if (!findIf(dev)) {
        ctx.err(`Cannot find device "${dev}"\n`);
        return 1;
      }
      const existing = h.routes.findIndex((r) => r.destination === dest);
      if (existing >= 0) {
        if (cmd === "add") {
          ctx.err("RTNETLINK answers: File exists\n");
          return 2;
        }
        h.routes.splice(existing, 1);
      }
      h.routes.push({ destination: dest, via, dev });
      return 0;
    }
  }
  if (isObj(["n", "neigh", "neighbor"])) {
    for (const a of hostAddrs(h, false)) {
      for (const name of ctx.core.state.hostOrder) {
        const o = ctx.core.state.hosts[name];
        if (o === h) continue;
        for (const b of hostAddrs(o, false)) {
          if (((a.ip ^ b.ip) >>> (32 - a.prefix)) === 0 && a.prefix > 0) {
            const iface = o.interfaces.find((x) => x.name === b.iface);
            ctx.out(`${intToIp(b.ip)} dev ${a.iface} lladdr ${iface?.mac} REACHABLE\n`);
          }
        }
      }
    }
    return 0;
  }
  if (!obj) {
    ctx.err("Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | route | neigh }\n");
    return 255;
  }
  return ctx.unsupported(`ip: '${args.join(" ")}' is not supported in this simulation (try ip addr, ip link set, ip route)`);
};

const ifconfig: CommandFn = (ctx) => {
  if (ctx.args.length > 1) return ctx.unsupported("ifconfig: changing interfaces with ifconfig is not supported in this simulation (use 'ip addr add' / 'ip link set')");
  const h = ctx.host;
  const sel = ctx.args[0];
  let out = "";
  for (const i of h.interfaces) {
    if (sel && i.name !== sel) continue;
    if (!sel && !i.up && !ctx.args.includes("-a")) continue;
    const lo = i.name === "lo";
    const flags = lo ? (i.up ? "73<UP,LOOPBACK,RUNNING>" : "8<LOOPBACK>") : i.up ? "4163<UP,BROADCAST,RUNNING,MULTICAST>" : "4098<BROADCAST,MULTICAST>";
    out += `${i.name}: flags=${flags}  mtu ${lo ? 65536 : 1500}\n`;
    if (i.address) {
      const c = parseCidr(i.address)!;
      const mask = intToIp(c.prefix === 0 ? 0 : (0xffffffff << (32 - c.prefix)) >>> 0);
      out += `        inet ${intToIp(c.ip)}  netmask ${mask}${lo ? "" : `  broadcast ${intToIp(broadcastOf(c.ip, c.prefix))}`}\n`;
    }
    out += lo ? "        loop  txqueuelen 1000  (Local Loopback)\n" : `        ether ${i.mac}  txqueuelen 1000  (Ethernet)\n`;
    out += "        RX packets 1024  bytes 131072 (131.0 KB)\n        TX packets 896  bytes 98304 (98.3 KB)\n\n";
  }
  if (sel && !out) {
    ctx.err(`${sel}: error fetching interface information: Device not found\n`);
    return 1;
  }
  ctx.out(out);
  return 0;
};

// ------------------------------------------------------------------ ping / traceroute

function nameErr(r: Resolution & { ok: false }): string {
  return r.reason === "nxdomain" ? "Name or service not known" : "Temporary failure in name resolution";
}

const ping: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "nq4", withArg: "cWwiIs" });
  if (!o) return 2;
  const target = o.operands[0];
  if (!target) {
    ctx.err("ping: usage error: Destination address required\n");
    return 1;
  }
  const count = o.opts.c ? parseInt(o.opts.c as string, 10) : 4;
  if (!Number.isFinite(count) || count < 1) {
    ctx.err(`ping: invalid argument: '${o.opts.c}'\n`);
    return 1;
  }
  const res = resolveTarget(ctx, target);
  if (!res.ok) {
    ctx.err(`ping: ${target}: ${nameErr(res)}\n`);
    return 2;
  }
  const dst = res.ip;
  const p = probe(ctx.core.state, ctx.host, dst, "icmp");
  if (p.status === "no-route") {
    ctx.err("ping: connect: Network is unreachable\n");
    return 2;
  }
  const label = target === dst ? dst : `${target} (${dst})`;
  ctx.out(`PING ${label} 56(84) bytes of data.\n`);
  const n = Math.min(count, 50);
  let received = 0;
  const shown = target === dst ? dst : `${target} (${dst})`;
  const lines: string[] = [];
  const times: number[] = [];
  for (let seq = 1; seq <= n; seq++) {
    if (p.status === "ok") {
      const t = rtt(p, seq, ctx.host.name + dst);
      times.push(parseFloat(t));
      received++;
      if (!o.opts.q) lines.push(`64 bytes from ${shown}: icmp_seq=${seq} ttl=${64 - Math.max(0, p.hops.length - 1)} time=${t} ms`);
    } else if (p.status === "host-unreachable") {
      if (!o.opts.q) lines.push(`From ${p.atIp ?? p.srcIp ?? "0.0.0.0"} icmp_seq=${seq} Destination Host Unreachable`);
    }
  }
  if (lines.length) ctx.out(lines.join("\n") + "\n");
  const loss = Math.round(((n - received) / n) * 100);
  const totalMs = (n - 1) * 1000 + (p.status === "ok" ? 3 : 0);
  ctx.out(`\n--- ${target} ping statistics ---\n${n} packets transmitted, ${received} received, ${p.status === "host-unreachable" ? `+${n} errors, ` : ""}${loss}% packet loss, time ${totalMs}ms\n`);
  if (received) {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    ctx.out(`rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/${((max - min) / 2).toFixed(3)} ms\n`);
  }
  return received ? 0 : 1;
};

const traceroute: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "nI4", withArg: "mqw" });
  if (!o) return 2;
  const target = o.operands[0];
  if (!target) {
    ctx.err("Usage: traceroute [ -n ] host\n");
    return 2;
  }
  const res = resolveTarget(ctx, target);
  if (!res.ok) {
    ctx.err(`${target}: ${nameErr(res)}\nCannot handle "host" cmdline arg \`${target}' on position 1 (argc 1)\n`);
    return 2;
  }
  const max = o.opts.m ? parseInt(o.opts.m as string, 10) : 30;
  const st = ctx.core.state;
  const fwd = forward(st, ctx.host, ipToInt(res.ip));
  if (!fwd.ok && fwd.reason === "no-route" && fwd.hops.length === 0) {
    ctx.err("connect: Network is unreachable\n");
    return 1;
  }
  ctx.out(`traceroute to ${target} (${res.ip}), ${max} hops max, 60 byte packets\n`);
  const p = probe(st, ctx.host, res.ip, "icmp");
  const name = (ipStr: string) => {
    if (o.opts.n) return ipStr;
    const fromHosts = Object.entries(st.hosts[ctx.host.name].fs["/etc/hosts"]?.content.split("\n") ?? []).map(([, l]) => l.trim().split(/\s+/)).find((p) => p[0] === ipStr && p[1]);
    return fromHosts ? `${fromHosts[1]} (${ipStr})` : `${ipStr} (${ipStr})`;
  };
  let hopNo = 0;
  const hops = fwd.hops;
  // a hop answers if the reply can route back to us
  for (const hop of hops) {
    hopNo++;
    const hh = st.hosts[hop.host];
    const back = forward(st, hh, ipToInt(fwd.srcIp ?? "0.0.0.0"));
    const reachedDst = hop.ip === res.ip || (fwd.ok && fwd.dstHost === hop.host && hopNo === hops.length);
    const answered = back.ok && (!reachedDst || p.status === "ok");
    if (answered) {
      const base = 0.2 + hopNo * 0.35;
      const t = [0, 1, 2].map((k) => (base + ((hash(hop.ip + k) % 90) / 1000)).toFixed(3) + " ms").join("  ");
      ctx.out(` ${String(hopNo).padStart(2)}  ${name(reachedDst ? res.ip : hop.ip)}  ${t}\n`);
    } else ctx.out(` ${String(hopNo).padStart(2)}  * * *\n`);
  }
  if (!fwd.ok || p.status !== "ok") {
    if (!fwd.ok && fwd.reason === "host-unreachable") {
      hopNo++;
      ctx.out(` ${String(hopNo).padStart(2)}  ${fwd.atIp ?? "*"}  3001.234 ms !H  3001.120 ms !H  3001.045 ms !H\n`);
      return 0;
    }
    for (let k = 0; k < 3 && hopNo < max; k++) ctx.out(` ${String(++hopNo).padStart(2)}  * * *\n`);
    if (hopNo < max) ctx.out(`    (simulation: remaining hops up to ${max} would also time out)\n`);
  }
  return 0;
};

// ------------------------------------------------------------------ DNS tools

const nslookup: CommandFn = (ctx) => {
  const [name, server] = ctx.args.filter((a) => !a.startsWith("-"));
  if (ctx.args.some((a) => a.startsWith("-") && !/^-(type|query)=a$/i.test(a))) return ctx.unsupported("nslookup: options are not supported in this simulation (A records only)");
  if (!name) return ctx.unsupported("nslookup: interactive mode is not supported in this simulation (try: nslookup NAME [SERVER])", 1);
  const st = ctx.core.state;
  const servers = server ? [server] : resolvConf(ctx.host).nameservers;
  if (!servers.length) {
    ctx.err(";; connection timed out; no servers could be reached\n\n");
    return 1;
  }
  const search = server ? [] : resolvConf(ctx.host).search;
  for (const ns of servers) {
    if (isIp(name)) {
      const pr = probe(st, ctx.host, ns, "udp", 53);
      if (pr.status !== "ok") continue;
      const rev = reverseLookup(st, pr.dstHost!, name);
      const arpa = name.split(".").reverse().join(".") + ".in-addr.arpa";
      if (rev) {
        ctx.out(`${arpa}\tname = ${rev}.\n\nAuthoritative answers can be found from:\n\n`);
        return 0;
      }
      ctx.out(`** server can't find ${arpa}: NXDOMAIN\n\n`);
      return 1;
    }
    const a = dnsQuery(st, ctx.host, ns, name, search);
    if (a.status === "timeout" || a.status === "refused") continue;
    ctx.out(`Server:\t\t${ns}\nAddress:\t${ns}#53\n\n`);
    if (a.status === "ok") {
      ctx.out(`Name:\t${a.name}\nAddress: ${a.ip}\n\n`);
      return 0;
    }
    ctx.out(`** server can't find ${name}: NXDOMAIN\n\n`);
    return 1;
  }
  ctx.out(`;; connection timed out; no servers could be reached\n\n`);
  return 1;
};

const dig: CommandFn = (ctx) => {
  let short = false;
  let server: string | undefined;
  let name: string | undefined;
  let reverse = false;
  let tcp = false;
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === "+short") short = true;
    else if (a === "+tcp" || a === "+vc") tcp = true;
    else if (a === "+notcp" || a === "+novc") tcp = false;
    else if (a.startsWith("+")) continue;
    else if (a.startsWith("@")) server = a.slice(1);
    else if (a === "-x") {
      reverse = true;
      name = ctx.args[++i];
    } else if (/^(A|IN)$/i.test(a)) continue;
    else if (/^(AAAA|MX|NS|TXT|CNAME|SOA|PTR|SRV|ANY)$/i.test(a)) return ctx.unsupported(`dig: record type ${a.toUpperCase()} is not simulated (A records only)`, 1);
    else if (a.startsWith("-")) return ctx.unsupported(`dig: option '${a}' is not supported in this simulation`, 1);
    else name = a;
  }
  if (!name) {
    ctx.err("dig: a name to look up is required in this simulation (e.g. dig example.lab)\n");
    return 1;
  }
  const st = ctx.core.state;
  const servers = server ? [server] : resolvConf(ctx.host).nameservers;
  const search = server ? [] : resolvConf(ctx.host).search;
  const header = `\n; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>> ${ctx.args.join(" ")}\n`;
  for (const ns of servers) {
    let answer: { name: string; ip: string } | null = null;
    let status = "NOERROR";
    if (reverse) {
      const pr = probe(st, ctx.host, ns, tcp ? "tcp" : "udp", 53);
      if (pr.status !== "ok") {
        if (!short) ctx.out(`;; communications error to ${ns}#53: timed out\n`);
        continue;
      }
      const rev = reverseLookup(st, pr.dstHost!, name);
      if (rev) answer = { name: name.split(".").reverse().join(".") + ".in-addr.arpa", ip: rev + "." };
      else status = "NXDOMAIN";
    } else {
      const a = dnsQuery(st, ctx.host, ns, name, [], tcp ? "tcp" : "udp");
      void search;
      if (a.status === "timeout" || a.status === "refused") {
        if (!short) ctx.out(`;; communications error to ${ns}#53: ${a.status === "refused" ? "connection refused" : "timed out"}\n`);
        continue;
      }
      if (a.status === "ok") answer = { name: a.name, ip: a.ip };
      else status = "NXDOMAIN";
    }
    if (short) {
      if (answer) ctx.out(answer.ip + "\n");
      return 0;
    }
    const qname = (reverse ? name.split(".").reverse().join(".") + ".in-addr.arpa" : name.replace(/\.$/, "")) + ".";
    let out = header + ";; global options: +cmd\n;; Got answer:\n";
    out += `;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: ${hash(name) % 65536}\n`;
    out += `;; flags: qr aa rd ra; QUERY: 1, ANSWER: ${answer ? 1 : 0}, AUTHORITY: 0, ADDITIONAL: 1\n\n`;
    out += `;; QUESTION SECTION:\n;${qname}\t\tIN\t${reverse ? "PTR" : "A"}\n\n`;
    if (answer) out += `;; ANSWER SECTION:\n${answer.name.replace(/\.$/, "")}.\t300\tIN\t${reverse ? "PTR" : "A"}\t${answer.ip}\n\n`;
    out += `;; Query time: 1 msec\n;; SERVER: ${ns}#53(${ns}) (${tcp ? "TCP" : "UDP"})\n;; WHEN: ${fmtDate(ctx.core.now())}\n;; MSG SIZE  rcvd: ${answer ? 60 : 44}\n\n`;
    ctx.out(out);
    return 0;
  }
  if (!short) ctx.out(header + ";; global options: +cmd\n;; no servers could be reached\n\n");
  return 9;
};

const host: CommandFn = (ctx) => {
  const args = ctx.args.filter((a) => a !== "-4");
  if (args.some((a) => a.startsWith("-"))) return ctx.unsupported("host: options are not supported in this simulation (A records only)");
  const [name, server] = args;
  if (!name) {
    ctx.err("Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]\n            [-R number] [-m flag] [-p port] hostname [server]\n");
    return 1;
  }
  const st = ctx.core.state;
  const rc = resolvConf(ctx.host);
  const servers = server ? [server] : rc.nameservers;
  for (const ns of servers) {
    if (isIp(name)) {
      const pr = probe(st, ctx.host, ns, "udp", 53);
      if (pr.status !== "ok") continue;
      const rev = reverseLookup(st, pr.dstHost!, name);
      const arpa = name.split(".").reverse().join(".") + ".in-addr.arpa";
      if (rev) ctx.out(`${arpa} domain name pointer ${rev}.\n`);
      else ctx.out(`Host ${arpa} not found: 3(NXDOMAIN)\n`);
      return rev ? 0 : 1;
    }
    const a = dnsQuery(st, ctx.host, ns, name, server ? [] : rc.search);
    if (a.status === "timeout" || a.status === "refused") continue;
    if (server) ctx.out(`Using domain server:\nName: ${ns}\nAddress: ${ns}#53\nAliases: \n\n`);
    if (a.status === "ok") {
      ctx.out(`${a.name} has address ${a.ip}\n`);
      return 0;
    }
    ctx.out(`Host ${name} not found: 3(NXDOMAIN)\n`);
    return 1;
  }
  ctx.out(";; connection timed out; no servers could be reached\n");
  return 1;
};

// ------------------------------------------------------------------ HTTP

export interface HttpResult {
  ok: boolean;
  /** curl exit code when !ok */
  code: number;
  error?: string;
  status?: number;
  body?: string;
  ip?: string;
  hostName?: string;
  port?: number;
  path?: string;
  server?: string;
}

const REASONS: Record<number, string> = { 200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

export function httpRequest(state: import("../types").SimState, from: HostState, url: string): HttpResult {
  const m = /^(?:(https?):\/\/)?([^/:?#]+)(?::(\d+))?([^?#]*)?(\?[^#]*)?/.exec(url);
  if (!m) return { ok: false, code: 3, error: `curl: (3) URL rejected: Malformed input to a URL function` };
  const scheme = m[1] ?? "http";
  const hostName = m[2];
  const port = m[3] ? parseInt(m[3], 10) : scheme === "https" ? 443 : 80;
  const path = m[4] || "/";
  const res = resolveName(state, from, hostName);
  if (!res.ok) return { ok: false, code: 6, error: `curl: (6) Could not resolve host: ${hostName}`, hostName, port, path };
  const p = probe(state, from, res.ip, "tcp", port);
  const fail = (code: number, why: string, ms: number) => ({ ok: false, code, error: `curl: (${code}) Failed to connect to ${hostName} port ${port} after ${ms} ms: ${why}`, ip: res.ip, hostName, port, path });
  switch (p.status) {
    case "no-route": return fail(7, "Network is unreachable", 0);
    case "host-unreachable": return fail(7, "No route to host", 3061);
    case "timeout":
    case "filtered": return { ok: false, code: 28, error: `curl: (28) Failed to connect to ${hostName} port ${port} after 130005 ms: Connection timed out`, ip: res.ip, hostName, port, path };
    case "refused": return fail(7, "Connection refused", 0);
  }
  const l = p.listener!;
  const svc = l.service ? state.hosts[p.dstHost!].services.find((s) => s.name === l.service) : undefined;
  if (!svc || (!svc.http.length && svc.kind !== "http")) return { ok: false, code: 52, error: "curl: (52) Empty reply from server", ip: res.ip, hostName, port, path };
  const entry = svc.http.find((e) => e.path === path) ?? (svc.http.length ? undefined : { status: 200, body: "" });
  const server = svc.command.split(/\s+/)[0].split("/").pop() ?? "server";
  if (!entry) return { ok: true, code: 0, status: 404, body: `<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>${server}</center>\n</body>\n</html>\n`, ip: res.ip, hostName, port, path, server };
  return { ok: true, code: 0, status: entry.status, body: entry.body, ip: res.ip, hostName, port, path, server };
}

function headers(r: HttpResult, now: number): string {
  return `HTTP/1.1 ${r.status} ${REASONS[r.status!] ?? ""}\nServer: ${r.server}\nDate: ${fmtDate(now)}\nContent-Type: text/html\nContent-Length: ${(r.body ?? "").length}\nConnection: keep-alive\n\n`;
}

const curl: CommandFn = (ctx) => {
  const o = opts(ctx, {
    flags: "IvsSLfkiO",
    withArg: "oXHdmAuw",
    long: { head: "I", verbose: "v", silent: "s", "show-error": "S", location: "L", fail: "f", insecure: "k", include: "i", "output=": "o", "request=": "X", "header=": "H", "data=": "d", "max-time=": "m", "connect-timeout=": "m", "user-agent=": "A", "write-out=": "w", "remote-name": "O" },
  });
  if (!o) return 2;
  if (o.opts.u) return ctx.unsupported("curl: authentication (-u) is not supported in this simulation", 2);
  const url = o.operands[0];
  if (!url) {
    ctx.err("curl: try 'curl --help' or 'curl --manual' for more information\n");
    return 2;
  }
  const r = httpRequest(ctx.core.state, ctx.host, url);
  const silent = !!o.opts.s && !o.opts.S;
  if (o.opts.v && r.ip) ctx.err(`*   Trying ${r.ip}:${r.port}...\n`);
  if (!r.ok) {
    if (!silent) ctx.err(r.error + "\n");
    return r.code;
  }
  const method = (o.opts.X as string) ?? (o.opts.I ? "HEAD" : o.opts.d ? "POST" : "GET");
  if (o.opts.v) ctx.err(`* Connected to ${r.hostName} (${r.ip}) port ${r.port}\n> ${method} ${r.path} HTTP/1.1\n> Host: ${r.hostName}${r.port !== 80 ? ":" + r.port : ""}\n> User-Agent: curl/8.5.0\n> Accept: */*\n>\n< ${headers(r, ctx.core.now()).trimEnd().split("\n").join("\n< ")}\n<\n`);
  if (o.opts.f && r.status! >= 400) {
    if (!silent) ctx.err(`curl: (22) The requested URL returned error: ${r.status}\n`);
    return 22;
  }
  let out = "";
  if (o.opts.I) out = headers(r, ctx.core.now());
  else {
    if (o.opts.i) out += headers(r, ctx.core.now());
    out += r.body ?? "";
  }
  const w = o.opts.w as string | undefined;
  const target = o.opts.o as string | undefined ?? (o.opts.O ? (r.path!.split("/").pop() || "index.html") : undefined);
  if (target && target !== "/dev/null") {
    try {
      ctx.fs.writeFile(ctx.abs(target), out, ctx.cred, { umask: ctx.umask });
    } catch (e) {
      ctx.err(`curl: (23) Failure writing output to destination\n`);
      void e;
      return 23;
    }
  } else if (!target) ctx.out(out);
  if (w) ctx.out(w.replace(/%\{http_code\}/g, String(r.status)).replace(/%\{remote_ip\}/g, r.ip ?? "").replace(/\\n/g, "\n"));
  return 0;
};

const wget: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "qS", withArg: "OT", long: { quiet: "q", "output-document=": "O", spider: "P" } });
  if (!o) return 2;
  const url = o.operands[0];
  if (!url) {
    ctx.err("wget: missing URL\n");
    return 1;
  }
  const r = httpRequest(ctx.core.state, ctx.host, url);
  const log = (s: string) => {
    if (!o.opts.q) ctx.err(s);
  };
  const shown = /^https?:\/\//.test(url) ? url : `http://${url}`;
  log(`--${fmtIso(ctx.core.now())}--  ${shown}\n`);
  if (!r.ok) {
    if (r.code === 6) log(`Resolving ${r.hostName}... failed: Name or service not known.\nwget: unable to resolve host address '${r.hostName}'\n`);
    else log(`Connecting to ${r.hostName} (${r.hostName})|${r.ip}|:${r.port}... failed: ${r.code === 28 ? "Connection timed out" : r.error?.includes("refused") ? "Connection refused" : "No route to host"}.\n`);
    return 4;
  }
  log(`Connecting to ${r.hostName} (${r.hostName})|${r.ip}|:${r.port}... connected.\nHTTP request sent, awaiting response... ${r.status} ${REASONS[r.status!] ?? ""}\n`);
  if (r.status! >= 400) {
    log(`${fmtDate(ctx.core.now())} ERROR ${r.status}: ${REASONS[r.status!] ?? ""}.\n`);
    return 8;
  }
  const out = (o.opts.O as string) ?? (r.path!.split("/").pop() || "index.html");
  if (out === "-") ctx.out(r.body ?? "");
  else {
    try {
      ctx.fs.writeFile(ctx.abs(out), r.body ?? "", ctx.cred, { umask: ctx.umask });
    } catch (e) {
      return ctx.fsErr(e, out, "wget");
    }
    log(`Saving to: '${out}'\n\n'${out}' saved [${(r.body ?? "").length}]\n`);
  }
  return 0;
};

// ------------------------------------------------------------------ nc / ss / netstat

const nc: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "zvunlk4", withArg: "wWp" });
  if (!o) return 2;
  if (o.opts.l) return ctx.unsupported("nc: listening mode (-l) is not supported in this simulation", 1);
  if (!o.opts.z) return ctx.unsupported("nc: only port checks (nc -z [-v] [-u] HOST PORT) are supported in this simulation", 1);
  const [target, portSpec] = o.operands;
  if (!target || !portSpec) {
    ctx.err("usage: nc [-46CDdFhklNnrStUuvZz] [-I length] [-i interval] [-M ttl]\n\t  [-m minttl] [-O length] [-P proxy_username] [-p source_port]\n\t  [-q seconds] [-s sourceaddr] [-T keyword] [-V rtable] [-W recvlimit]\n\t  [-w timeout] [-X proxy_protocol] [-x proxy_address[:port]]\n\t  [destination] [port]\n");
    return 1;
  }
  const proto = o.opts.u ? "udp" : "tcp";
  const res = resolveTarget(ctx, target);
  if (!res.ok) {
    ctx.err(`nc: getaddrinfo for host "${target}" port ${portSpec}: ${nameErr(res)}\n`);
    return 1;
  }
  const ports: number[] = [];
  const rm = /^(\d+)(?:-(\d+))?$/.exec(portSpec);
  if (!rm) {
    ctx.err(`nc: port number invalid: ${portSpec}\n`);
    return 1;
  }
  const lo = parseInt(rm[1], 10);
  const hi = rm[2] ? Math.min(parseInt(rm[2], 10), lo + 1024) : lo;
  for (let p = lo; p <= hi; p++) ports.push(p);
  let any = false;
  for (const port of ports) {
    const p = probe(ctx.core.state, ctx.host, res.ip, proto, port);
    const svc = PORT_NAMES[port] ?? "*";
    if (p.status === "ok") {
      any = true;
      if (o.opts.v) ctx.err(`Connection to ${target} (${res.ip}) ${port} port [${proto}/${svc}] succeeded!\n`);
    } else if (o.opts.v || ports.length === 1) {
      const why = p.status === "refused" ? "Connection refused" : p.status === "no-route" ? "Network is unreachable" : p.status === "host-unreachable" ? "No route to host" : null;
      if (why) ctx.err(`nc: connect to ${target} (${res.ip}) port ${port} (${proto}) failed: ${why}\n`);
      else ctx.err(`nc: connect to ${target} (${res.ip}) port ${port} (${proto}) timed out: Operation now in progress\n`);
    }
  }
  return any ? 0 : 1;
};

function socketTable(ctx: CmdCtx, netstat: boolean): number {
  const raw = ctx.args.join("").replace(/-/g, "");
  if (/[^tulnpae]/.test(raw)) return ctx.unsupported(`${ctx.name}: options other than -t -u -l -n -p -a are not supported in this simulation`);
  const tcp = raw.includes("t") || (!raw.includes("u") && !raw.includes("t"));
  const udp = raw.includes("u") || (!raw.includes("u") && !raw.includes("t"));
  const showProc = raw.includes("p");
  const numeric = raw.includes("n");
  const ls = listeners(ctx.host).filter((l) => (l.proto === "tcp" && tcp) || (l.proto === "udp" && udp));
  const procName = (cmd: string) => (cmd.split(/\s+/)[0].replace(/:$/, "").split("/").pop() ?? cmd).slice(0, 15);
  const canSee = (user: string) => ctx.cred.uid === 0 || ctx.cred.user === user;
  if (netstat) {
    let out = "Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       " + (showProc ? "PID/Program name    " : "") + "\n";
    for (const l of ls) {
      const local = `${l.address}:${numeric ? l.port : PORT_NAMES[l.port] ?? l.port}`;
      out += `${l.proto.padEnd(5)} ${"0".padStart(6)} ${"0".padStart(6)} ${local.padEnd(23)} ${"0.0.0.0:*".padEnd(23)} ${(l.proto === "tcp" ? "LISTEN" : "").padEnd(11)} ${showProc ? (canSee(l.user) ? `${l.pid}/${procName(l.command)}` : "-") : ""}\n`;
    }
    ctx.out(out);
    if (showProc && ctx.cred.uid !== 0) ctx.err("(Not all processes could be identified, non-owned process info\n will not be shown, you would have to be root to see it all.)\n");
    return 0;
  }
  let out = `Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port${showProc ? " Process" : ""}\n`;
  for (const l of ls) {
    const local = `${l.address}:${numeric ? l.port : PORT_NAMES[l.port] ?? l.port}`;
    const proc = showProc && canSee(l.user) ? ` users:(("${procName(l.command)}",pid=${l.pid},fd=${3 + (l.port % 5)}))` : "";
    out += `${l.proto.padEnd(5)} ${(l.proto === "tcp" ? "LISTEN" : "UNCONN").padEnd(6)} 0      ${(l.proto === "tcp" ? "511" : "0").padEnd(6)} ${local.padEnd(18)} ${"0.0.0.0:*".padEnd(17)}${proc}\n`;
  }
  ctx.out(out);
  return 0;
}

// ------------------------------------------------------------------ dhclient

const dhclient: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "vr1d" });
  if (!o) return 2;
  if (ctx.cred.uid !== 0) {
    ctx.err("dhclient: Can't create /var/run/dhclient.pid: Permission denied\n");
    return 1;
  }
  const h = ctx.host;
  const name = o.operands[0] ?? h.interfaces.find((i) => i.name !== "lo")?.name;
  const iface = h.interfaces.find((i) => i.name === name);
  if (!iface || iface.name === "lo") {
    ctx.err(`Cannot find device "${name ?? ""}"\n`);
    return 1;
  }
  const st = ctx.core.state;
  if (o.opts.r) {
    for (const hn of st.hostOrder) {
      const sh = st.hosts[hn];
      for (const [ipA, who] of Object.entries(sh.leases)) if (who === `${h.name}/${iface.name}`) delete sh.leases[ipA];
    }
    if (iface.dhcp) iface.address = null;
    h.routes = h.routes.filter((r) => !(r.dev === iface.name && r.destination === "default"));
    ctx.err(`Killed old client process\n`);
    return 0;
  }
  iface.up = true;
  ctx.out(`DHCPDISCOVER on ${iface.name} to 255.255.255.255 port 67 interval 3\n`);
  const offer = dhcpDiscover(st, h, iface);
  if (!offer) {
    ctx.out(`DHCPDISCOVER on ${iface.name} to 255.255.255.255 port 67 interval 7\nDHCPDISCOVER on ${iface.name} to 255.255.255.255 port 67 interval 12\nNo DHCPOFFERS received.\nNo working leases in persistent database - sleeping.\n`);
    return 2;
  }
  offer.server.leases[offer.ip] = `${h.name}/${iface.name}`;
  iface.address = `${offer.ip}/${offer.prefix}`;
  iface.dhcp = true;
  h.routes = h.routes.filter((r) => r.destination !== "default");
  h.routes.push({ destination: "default", via: offer.gateway, dev: iface.name });
  const rc = `# Generated by dhclient\nnameserver ${offer.dns}\n`;
  ctx.fs.nodes["/etc/resolv.conf"] = { type: "file", content: rc, mode: 0o644, owner: "root", group: "root", mtime: ctx.core.now() };
  ctx.out(`DHCPOFFER of ${offer.ip} from ${offer.serverIp}\nDHCPREQUEST for ${offer.ip} on ${iface.name} to 255.255.255.255 port 67\nDHCPACK of ${offer.ip} from ${offer.serverIp}\nbound to ${offer.ip} -- renewal in 1800 seconds.\n`);
  return 0;
};

// ------------------------------------------------------------------ ufw

const UFW_NAMES: Record<string, { port: number; proto: "tcp" | "udp" | "any" }> = {
  ssh: { port: 22, proto: "tcp" },
  OpenSSH: { port: 22, proto: "tcp" },
  http: { port: 80, proto: "tcp" },
  https: { port: 443, proto: "tcp" },
  dns: { port: 53, proto: "any" },
  domain: { port: 53, proto: "any" },
  "Nginx HTTP": { port: 80, proto: "tcp" },
  mysql: { port: 3306, proto: "tcp" },
  postgresql: { port: 5432, proto: "tcp" },
};

type Rule = HostState["firewall"]["rules"][number];

function ufwRuleText(r: Rule): { to: string; action: string; from: string } {
  const to = r.port !== undefined ? `${r.port}${r.proto === "any" ? "" : "/" + r.proto}` : r.proto === "any" ? "Anywhere" : `Anywhere/${r.proto}`;
  return { to, action: r.action.toUpperCase(), from: r.from === "any" ? "Anywhere" : r.from };
}

function parseUfwRule(args: string[], action: "allow" | "deny"): Rule | string {
  if (!args.length) return "ERROR: Need 'to' or 'from' clause";
  if (args[0] === "from" || args[0] === "to" || args[0] === "proto" || args[0] === "in") {
    let from: string = "any";
    let port: number | undefined;
    let proto: Rule["proto"] = "any";
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "in") continue;
      if (a === "from") from = args[++i] ?? "";
      else if (a === "to") i++;
      else if (a === "port") port = parseInt(args[++i] ?? "", 10);
      else if (a === "proto") proto = (args[++i] ?? "") as Rule["proto"];
      else return `ERROR: Wrong number of arguments`;
    }
    if (from !== "any") {
      if (isIp(from)) from = `${from}/32`;
      if (!parseCidr(from)) return `ERROR: Bad source address`;
    }
    if (port !== undefined && !Number.isFinite(port)) return "ERROR: Bad port";
    if (!["tcp", "udp", "any", "icmp"].includes(proto)) return `ERROR: Unsupported protocol '${proto}'`;
    return { action, port, proto, from: from as Rule["from"] };
  }
  const spec = args.join(" ");
  if (UFW_NAMES[spec]) return { action, port: UFW_NAMES[spec].port, proto: UFW_NAMES[spec].proto, from: "any" };
  const m = /^(\d+)(?:\/(tcp|udp))?$/.exec(spec);
  if (!m) return `ERROR: Could not find a profile matching '${spec}'`;
  return { action, port: parseInt(m[1], 10), proto: (m[2] as "tcp" | "udp") ?? "any", from: "any" };
}

const ufw: CommandFn = (ctx) => {
  if (ctx.cred.uid !== 0) {
    ctx.err("ERROR: You need to be root to run this script\n");
    return 1;
  }
  const fw = ctx.host.firewall;
  const [sub, ...rest] = ctx.args;
  switch (sub) {
    case "status": {
      if (!fw.enabled) {
        ctx.out("Status: inactive\n");
        return 0;
      }
      const numbered = rest[0] === "numbered";
      let out = "Status: active\n";
      if (rest[0] === "verbose") out += `Logging: on (low)\nDefault: ${fw.defaultInbound} (incoming), allow (outgoing), disabled (routed)\nNew profiles: skip\n`;
      if (fw.rules.length) {
        out += `\n${numbered ? "     " : ""}To                         Action      From\n${numbered ? "     " : ""}--                         ------      ----\n`;
        fw.rules.forEach((r, i) => {
          const t = ufwRuleText(r);
          out += `${numbered ? `[${String(i + 1).padStart(2)}] ` : ""}${t.to.padEnd(26)} ${(t.action + (numbered ? " IN" : "")).padEnd(11)} ${t.from}\n`;
        });
      }
      ctx.out(out + "\n");
      return 0;
    }
    case "enable":
      fw.enabled = true;
      ctx.out("Firewall is active and enabled on system startup\n");
      return 0;
    case "disable":
      fw.enabled = false;
      ctx.out("Firewall stopped and disabled on system startup\n");
      return 0;
    case "reload":
      ctx.out(fw.enabled ? "Firewall reloaded\n" : "Firewall not enabled (skipping reload)\n");
      return 0;
    case "default": {
      const [pol, dir] = rest;
      if (!["allow", "deny", "reject"].includes(pol ?? "") || (dir && dir !== "incoming" && dir !== "outgoing")) {
        ctx.err("ERROR: Unsupported policy\n");
        return 1;
      }
      if (dir === "outgoing") return ctx.unsupported("ufw: outgoing policy is not simulated (only inbound filtering)", 1);
      fw.defaultInbound = pol === "allow" ? "allow" : "deny";
      ctx.out(`Default incoming policy changed to '${pol}'\n(be sure to update your rules accordingly)\n`);
      return 0;
    }
    case "allow":
    case "deny":
    case "reject":
    case "insert": {
      let pos: number | undefined;
      let args = rest;
      let action = sub as string;
      if (sub === "insert") {
        pos = parseInt(rest[0] ?? "", 10);
        action = rest[1] ?? "";
        args = rest.slice(2);
        if (!Number.isFinite(pos) || !["allow", "deny", "reject"].includes(action)) {
          ctx.err("ERROR: Invalid position\n");
          return 1;
        }
      }
      const r = parseUfwRule(args, action === "allow" ? "allow" : "deny");
      if (typeof r === "string") {
        ctx.err(r + "\n");
        return 1;
      }
      if (fw.rules.some((x) => x.action === r.action && x.port === r.port && x.proto === r.proto && x.from === r.from)) {
        ctx.out("Skipping adding existing rule\n");
        return 0;
      }
      if (pos !== undefined) fw.rules.splice(Math.max(0, pos - 1), 0, r);
      else fw.rules.push(r);
      ctx.out(pos !== undefined ? "Rule inserted\n" : "Rule added\n");
      return 0;
    }
    case "delete": {
      if (/^\d+$/.test(rest[0] ?? "")) {
        const n = parseInt(rest[0], 10);
        if (n < 1 || n > fw.rules.length) {
          ctx.err("ERROR: Could not find rule '" + n + "'\n");
          return 1;
        }
        fw.rules.splice(n - 1, 1);
        ctx.out("Rule deleted\n");
        return 0;
      }
      const act = rest[0];
      if (act !== "allow" && act !== "deny") {
        ctx.err("ERROR: Wrong number of arguments\n");
        return 1;
      }
      const r = parseUfwRule(rest.slice(1), act);
      if (typeof r === "string") {
        ctx.err(r + "\n");
        return 1;
      }
      const idx = fw.rules.findIndex((x) => x.action === r.action && x.port === r.port && x.proto === r.proto && x.from === r.from);
      if (idx < 0) {
        ctx.out("Could not delete non-existent rule\n");
        return 0;
      }
      fw.rules.splice(idx, 1);
      ctx.out("Rule deleted\n");
      return 0;
    }
    case "reset":
      fw.rules = [];
      fw.enabled = false;
      fw.defaultInbound = "deny";
      ctx.out("Resetting all rules to installed defaults.\n");
      return 0;
    default:
      return ctx.unsupported(`ufw: '${ctx.args.join(" ")}' is not supported in this simulation (try status, enable, disable, allow, deny, delete, default)`, 1);
  }
};

// ------------------------------------------------------------------ ssh

const ssh: CommandFn = (ctx) => {
  let port = 22;
  let user: string | undefined;
  let target: string | undefined;
  const cmd: string[] = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (target !== undefined) {
      cmd.push(a);
      continue;
    }
    if (a === "-p") port = parseInt(ctx.args[++i] ?? "22", 10);
    else if (a === "-l") user = ctx.args[++i];
    else if (a === "-i" || a === "-o" || a === "-F") i++;
    else if (/^-[46tTvqCANnfx]+$/.test(a)) continue;
    else if (a.startsWith("-")) return ctx.unsupported(`ssh: option '${a}' is not supported in this simulation`, 255);
    else target = a;
  }
  if (!target) {
    ctx.err("usage: ssh [-p port] [-l login_name] [user@]hostname [command]\n");
    return 255;
  }
  if (target.includes("@")) [user, target] = [target.slice(0, target.indexOf("@")), target.slice(target.indexOf("@") + 1)];
  const loginUser = user ?? ctx.cred.user;
  const st = ctx.core.state;
  let res = resolveTarget(ctx, target);
  if (!res.ok && st.hosts[target]) {
    // treat scenario host names like ~/.ssh/config aliases
    const ip0 = hostAddrs(st.hosts[target], false)[0];
    if (ip0) res = { ok: true, ip: intToIp(ip0.ip), via: "hosts" };
  }
  if (!res.ok) {
    ctx.err(`ssh: Could not resolve hostname ${target}: ${nameErr(res)}\n`);
    return 255;
  }
  const p = probe(st, ctx.host, res.ip, "tcp", port);
  if (p.status !== "ok") {
    const why = p.status === "refused" ? "Connection refused" : p.status === "no-route" ? "Network is unreachable" : p.status === "host-unreachable" ? "No route to host" : "Connection timed out";
    ctx.err(`ssh: connect to host ${target} port ${port}: ${why}\n`);
    return 255;
  }
  const dest = st.hosts[p.dstHost!];
  if (dest === ctx.host && res.ip.startsWith("127.") && !getUser(dest, loginUser)) {
    ctx.err(`${loginUser}@${target}: Permission denied (publickey,password).\n`);
    return 255;
  }
  if (!getUser(dest, loginUser)) {
    ctx.err(`${loginUser}@${target}: Permission denied (publickey,password).\n`);
    return 255;
  }
  if (cmd.length) {
    const env = makeSession(dest, loginUser, undefined, "ssh");
    return ctx.shell.runSource(cmd.join(" "), ctx.io, { env, cred: credFor(dest, loginUser), argv0: "bash", args: [] });
  }
  ctx.out(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\nLast login: ${fmtDate(st.clock - 86400)} from ${p.srcIp}\n`);
  ctx.core.pushSession(makeSession(dest, loginUser, undefined, "ssh"));
  return 0;
};

const notSim = (what: string): CommandFn => (ctx) => ctx.unsupported(`${ctx.name}: ${what}`, 127);

export const NETWORK_COMMANDS: Record<string, CommandFn> = {
  ip,
  ifconfig,
  ping,
  traceroute,
  tracepath: traceroute,
  nslookup,
  dig,
  host,
  curl,
  wget,
  nc,
  netcat: nc,
  ss: (ctx) => socketTable(ctx, false),
  netstat: (ctx) => socketTable(ctx, true),
  dhclient,
  ufw,
  ssh,
  scp: notSim("file copy between hosts is not supported in this simulation (ssh in and recreate the file)"),
  iptables: notSim("raw iptables is not supported in this simulation (use ufw)"),
  telnet: notSim("not supported in this simulation (try nc -zv HOST PORT or curl)"),
};

void activeRoutes;
