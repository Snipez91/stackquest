/**
 * Networking computed purely from state: L2 segments, routing (longest prefix),
 * forwarding routers, firewalls, listeners, DNS resolution, DHCP.
 */
import type { HostState, SimInterface, SimState } from "./types";

// ---------------------------------------------------------------- addressing

export function ipToInt(ip: string): number {
  const p = ip.split(".").map((x) => parseInt(x, 10));
  if (p.length !== 4 || p.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return NaN;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function isIp(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && Number.isFinite(ipToInt(s));
}

export function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function parseCidr(c: string): { ip: number; prefix: number } | null {
  const [a, b] = c.split("/");
  const ip = ipToInt(a);
  const prefix = b === undefined ? 32 : parseInt(b, 10);
  if (!Number.isFinite(ip) || !Number.isFinite(prefix) || prefix < 0 || prefix > 32) return null;
  return { ip, prefix };
}

export function inSubnet(ip: number, net: number, prefix: number): boolean {
  const m = maskOf(prefix);
  return ((ip & m) >>> 0) === ((net & m) >>> 0);
}

export function networkOf(ip: number, prefix: number): number {
  return (ip & maskOf(prefix)) >>> 0;
}

export function broadcastOf(ip: number, prefix: number): number {
  return (networkOf(ip, prefix) | (~maskOf(prefix) >>> 0)) >>> 0;
}

export interface Addr {
  iface: string;
  ip: number;
  prefix: number;
}

export function hostAddrs(h: HostState, includeLo = true): Addr[] {
  const out: Addr[] = [];
  for (const i of h.interfaces) {
    if (!i.up || !i.address) continue;
    if (!includeLo && i.name === "lo") continue;
    const c = parseCidr(i.address);
    if (c) out.push({ iface: i.name, ip: c.ip, prefix: c.prefix });
  }
  return out;
}

function isLoopback(ip: number): boolean {
  return ip >>> 24 === 127;
}

export function ownsIp(h: HostState, ip: number): boolean {
  if (isLoopback(ip)) return h.interfaces.some((i) => i.name === "lo" && i.up);
  return hostAddrs(h).some((a) => a.ip === ip);
}

export function primaryIp(h: HostState): string | null {
  const a = hostAddrs(h, false)[0];
  return a ? intToIp(a.ip) : null;
}

// ---------------------------------------------------------------- routing

export interface RouteEntry {
  net: number;
  prefix: number;
  dev: string;
  via?: number;
  kind: "kernel" | "static";
  src?: number;
}

export function connectedRoutes(h: HostState): RouteEntry[] {
  return hostAddrs(h, false).map((a) => ({ net: networkOf(a.ip, a.prefix), prefix: a.prefix, dev: a.iface, kind: "kernel" as const, src: a.ip }));
}

function ifaceUp(h: HostState, dev: string): SimInterface | undefined {
  return h.interfaces.find((i) => i.name === dev && i.up && i.address);
}

export function staticRoutes(h: HostState): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const r of h.routes) {
    const c = r.destination === "default" ? { ip: 0, prefix: 0 } : parseCidr(r.destination);
    if (!c) continue;
    out.push({ net: networkOf(c.ip, c.prefix), prefix: c.prefix, dev: r.dev, via: r.via ? ipToInt(r.via) : undefined, kind: "static" });
  }
  return out;
}

/** Routes that are usable right now (device up, gateway on a connected subnet). */
export function activeRoutes(h: HostState): RouteEntry[] {
  const conn = connectedRoutes(h);
  const out = [...conn];
  for (const r of staticRoutes(h)) {
    if (!ifaceUp(h, r.dev)) continue;
    if (r.via !== undefined && !conn.some((c) => c.dev === r.dev && inSubnet(r.via!, c.net, c.prefix))) continue;
    if (r.via === undefined && conn.some((c) => c.net === r.net && c.prefix === r.prefix && c.dev === r.dev)) continue;
    out.push(r);
  }
  return out;
}

export function lookupRoute(h: HostState, dst: number): RouteEntry | null {
  let best: RouteEntry | null = null;
  for (const r of activeRoutes(h)) {
    if (!inSubnet(dst, r.net, r.prefix)) continue;
    if (!best || r.prefix > best.prefix) best = r;
  }
  return best;
}

function segmentsOf(state: SimState): { name: string; net: number; prefix: number }[] {
  const out: { name: string; net: number; prefix: number }[] = [];
  for (const s of state.scenario.segments) {
    const c = parseCidr(s.cidr);
    if (c) out.push({ name: s.name, net: networkOf(c.ip, c.prefix), prefix: c.prefix });
  }
  return out;
}

/** Is there a host with `ip` on the same L2 segment as h's interface `dev`? */
export function adjacentHost(state: SimState, h: HostState, dev: string, ip: number): HostState | null {
  const mine = hostAddrs(h, false).find((a) => a.iface === dev);
  if (!mine) return null;
  if (!inSubnet(ip, mine.ip, mine.prefix)) return null;
  const segs = segmentsOf(state);
  for (const name of state.hostOrder) {
    const other = state.hosts[name];
    for (const a of hostAddrs(other, false)) {
      if (a.ip !== ip) continue;
      if (other === h && a.iface === dev) return h;
      if (!inSubnet(mine.ip, a.ip, a.prefix)) continue;
      const sameSeg = segs.length
        ? segs.some((s) => inSubnet(mine.ip, s.net, s.prefix) && inSubnet(a.ip, s.net, s.prefix))
        : true;
      if (sameSeg) return other;
    }
  }
  return null;
}

export interface Hop {
  host: string;
  ip: string;
}

export type ForwardResult =
  | { ok: true; hops: Hop[]; dstHost: string; srcIp: string }
  | { ok: false; reason: "no-route" | "host-unreachable" | "no-forward" | "ttl"; at: string; atIp: string | null; hops: Hop[]; srcIp: string | null };

/** Forward a packet from host `src` toward `dst` hop by hop. */
export function forward(state: SimState, src: HostState, dst: number, fixedSrc?: number): ForwardResult {
  const hops: Hop[] = [];
  let cur = src;
  let srcIp: string | null = fixedSrc !== undefined ? intToIp(fixedSrc) : null;
  if (ownsIp(src, dst)) return { ok: true, hops: [], dstHost: src.name, srcIp: isLoopback(dst) ? "127.0.0.1" : intToIp(dst) };
  for (let ttl = 0; ttl < 30; ttl++) {
    const r = lookupRoute(cur, dst);
    if (!r) return { ok: false, reason: "no-route", at: cur.name, atIp: hops.length ? hops[hops.length - 1].ip : null, hops, srcIp };
    const devAddr = hostAddrs(cur, false).find((a) => a.iface === r.dev);
    if (srcIp === null && devAddr) srcIp = intToIp(devAddr.ip);
    const nh = r.via ?? dst;
    const next = adjacentHost(state, cur, r.dev, nh);
    if (!next) return { ok: false, reason: "host-unreachable", at: cur.name, atIp: devAddr ? intToIp(devAddr.ip) : null, hops, srcIp };
    hops.push({ host: next.name, ip: intToIp(nh) });
    if (ownsIp(next, dst)) return { ok: true, hops, dstHost: next.name, srcIp: srcIp ?? "0.0.0.0" };
    if (!next.ipForward) return { ok: false, reason: "no-forward", at: next.name, atIp: intToIp(nh), hops, srcIp };
    cur = next;
  }
  return { ok: false, reason: "ttl", at: cur.name, atIp: null, hops, srcIp };
}

// ---------------------------------------------------------------- listeners & firewall

export interface Listener {
  port: number;
  /** Bind address ("0.0.0.0" = all local addresses). */
  address: string;
  proto: "tcp" | "udp";
  pid: number;
  user: string;
  command: string;
  service?: string;
}

export function listeners(h: HostState): Listener[] {
  const out: Listener[] = [];
  for (const s of h.services) {
    if (s.state !== "active" || s.pid === null) continue;
    let ls = s.listens;
    if (!ls.length && s.kind === "dns") ls = [{ port: 53, proto: "udp" }, { port: 53, proto: "tcp" }];
    if (!ls.length && s.kind === "dhcp") ls = [{ port: 67, proto: "udp" }];
    if (!ls.length && s.kind === "http") ls = [{ port: 80, proto: "tcp" }];
    for (const l of ls) out.push({ port: l.port, address: (l as { address?: string }).address ?? "0.0.0.0", proto: l.proto, pid: s.pid, user: s.execUser, command: s.command, service: s.name });
  }
  for (const p of h.processes) for (const l of p.listens) out.push({ port: l.port, address: l.address ?? "0.0.0.0", proto: l.proto, pid: p.pid, user: p.user, command: p.command });
  return out;
}

export function firewallAllows(h: HostState, proto: "tcp" | "udp" | "icmp", port: number | undefined, srcIp: number): boolean {
  const fw = h.firewall;
  if (!fw.enabled) return true;
  if (isLoopback(srcIp)) return true;
  for (const r of fw.rules) {
    if (r.proto !== "any" && r.proto !== proto) continue;
    if (r.port !== undefined && (proto === "icmp" || r.port !== port)) continue;
    if (r.from !== "any") {
      const c = parseCidr(r.from);
      if (!c || !inSubnet(srcIp, c.ip, c.prefix)) continue;
    }
    return r.action === "allow";
  }
  // like ufw's before.rules: ICMP echo is accepted unless a rule says otherwise
  if (proto === "icmp") return true;
  return fw.defaultInbound === "allow";
}

/** Does a socket bound to `bind` accept a connection addressed to `dstIp`? */
export function bindAccepts(bind: string, dstIp: string): boolean {
  if (bind === "0.0.0.0" || bind === "*") return true;
  if (bind.startsWith("127.") && dstIp.startsWith("127.")) return true;
  return bind === dstIp;
}

export type ProbeStatus = "ok" | "no-route" | "host-unreachable" | "timeout" | "refused" | "filtered";

export interface ProbeResult {
  status: ProbeStatus;
  srcIp: string | null;
  dstHost: string | null;
  hops: Hop[];
  /** Where a failure was detected (host name) and the address it was reported from. */
  at?: string;
  atIp?: string | null;
  listener?: Listener;
  /** Round-trip hop count (for latency). */
  rtHops: number;
}

/** End-to-end probe: routing both ways, destination firewall, listener. */
export function probe(state: SimState, src: HostState, dstIp: string, proto: "tcp" | "udp" | "icmp", port?: number): ProbeResult {
  const dst = ipToInt(dstIp);
  if (!Number.isFinite(dst)) return { status: "no-route", srcIp: null, dstHost: null, hops: [], rtHops: 0 };
  const fwd = forward(state, src, dst);
  if (!fwd.ok) {
    const status: ProbeStatus = fwd.reason === "no-route" && fwd.hops.length === 0 ? "no-route" : fwd.reason === "host-unreachable" ? "host-unreachable" : "timeout";
    return { status, srcIp: fwd.srcIp, dstHost: null, hops: fwd.hops, at: fwd.at, atIp: fwd.atIp, rtHops: 0 };
  }
  const dh = state.hosts[fwd.dstHost];
  const srcIpN = ipToInt(fwd.srcIp);
  if (dh !== src) {
    const back = forward(state, dh, srcIpN);
    if (!back.ok) return { status: "timeout", srcIp: fwd.srcIp, dstHost: dh.name, hops: fwd.hops, at: dh.name, rtHops: 0 };
    if (!firewallAllows(dh, proto, port, srcIpN)) return { status: "filtered", srcIp: fwd.srcIp, dstHost: dh.name, hops: fwd.hops, at: dh.name, rtHops: 0 };
  }
  const rtHops = fwd.hops.length * 2;
  if (proto === "icmp") return { status: "ok", srcIp: fwd.srcIp, dstHost: dh.name, hops: fwd.hops, rtHops };
  const l = listeners(dh).find((x) => x.port === port && x.proto === proto && bindAccepts(x.address, dstIp));
  if (!l) return { status: "refused", srcIp: fwd.srcIp, dstHost: dh.name, hops: fwd.hops, at: dh.name, rtHops };
  return { status: "ok", srcIp: fwd.srcIp, dstHost: dh.name, hops: fwd.hops, listener: l, rtHops };
}

// ---------------------------------------------------------------- DNS

function rawFile(h: HostState, path: string): string | null {
  const n = h.fs[path];
  if (!n) return null;
  if (n.type === "symlink" && n.target) {
    const t = n.target.startsWith("/") ? n.target : "/etc/" + n.target;
    return h.fs[t]?.content ?? null;
  }
  return n.type === "file" ? n.content : null;
}

export function parseHostsFile(text: string): { ip: string; names: string[] }[] {
  const out: { ip: string; names: string[] }[] = [];
  for (const line of text.split("\n")) {
    const l = line.replace(/#.*/, "").trim();
    if (!l) continue;
    const [ip, ...names] = l.split(/\s+/);
    if (isIp(ip) && names.length) out.push({ ip, names: names.map((n) => n.toLowerCase()) });
  }
  return out;
}

export function lookupHostsFile(h: HostState, name: string): string | null {
  const text = rawFile(h, "/etc/hosts");
  if (!text) return null;
  const n = name.toLowerCase().replace(/\.$/, "");
  for (const e of parseHostsFile(text)) if (e.names.includes(n)) return e.ip;
  return null;
}

export function resolvConf(h: HostState): { nameservers: string[]; search: string[] } {
  const text = rawFile(h, "/etc/resolv.conf") ?? "";
  const nameservers: string[] = [];
  const search: string[] = [];
  for (const line of text.split("\n")) {
    const l = line.replace(/[#;].*/, "").trim().split(/\s+/);
    if (l[0] === "nameserver" && l[1] && isIp(l[1])) nameservers.push(l[1]);
    if ((l[0] === "search" || l[0] === "domain") && l.length > 1) search.push(...l.slice(1));
  }
  return { nameservers, search };
}

export type DnsAnswer =
  | { status: "ok"; ip: string; name: string; server: string; serverHost: string }
  | { status: "nxdomain"; server: string; serverHost: string }
  | { status: "timeout" | "refused"; server: string };

/** Query one nameserver for an A record. */
export function dnsQuery(state: SimState, from: HostState, server: string, name: string, search: string[] = [], proto: "udp" | "tcp" = "udp"): DnsAnswer {
  const pr = probe(state, from, server, proto, 53);
  if (pr.status !== "ok") return { status: pr.status === "refused" ? "refused" : "timeout", server };
  const sh = state.hosts[pr.dstHost!];
  const zones: Record<string, string> = {};
  for (const [k, v] of Object.entries(sh.dnsZones)) zones[k.toLowerCase().replace(/\.$/, "")] = v;
  const n = name.toLowerCase().replace(/\.$/, "");
  const candidates = n.includes(".") ? [n, ...search.map((s) => `${n}.${s}`)] : [...search.map((s) => `${n}.${s}`), n];
  for (const c of candidates) if (zones[c]) return { status: "ok", ip: zones[c], name: c, server, serverHost: sh.name };
  return { status: "nxdomain", server, serverHost: sh.name };
}

export function reverseLookup(state: SimState, serverHost: string, ip: string): string | null {
  const sh = state.hosts[serverHost];
  for (const [k, v] of Object.entries(sh.dnsZones)) if (v === ip) return k.replace(/\.$/, "");
  return null;
}

export type Resolution =
  | { ok: true; ip: string; via: "literal" | "hosts" | "dns"; server?: string }
  | { ok: false; reason: "nxdomain" | "timeout" | "no-nameserver"; server?: string };

/** getaddrinfo(): /etc/hosts first, then each nameserver from /etc/resolv.conf. */
export function resolveName(state: SimState, from: HostState, name: string, useHosts = true): Resolution {
  if (isIp(name)) return { ok: true, ip: name, via: "literal" };
  if (name === "localhost") return { ok: true, ip: "127.0.0.1", via: "hosts" };
  if (useHosts) {
    const ip = lookupHostsFile(from, name);
    if (ip) return { ok: true, ip, via: "hosts" };
  }
  const rc = resolvConf(from);
  if (!rc.nameservers.length) return { ok: false, reason: "no-nameserver" };
  let last: DnsAnswer | null = null;
  for (const ns of rc.nameservers.slice(0, 3)) {
    const a = dnsQuery(state, from, ns, name, rc.search);
    if (a.status === "ok") return { ok: true, ip: a.ip, via: "dns", server: ns };
    if (a.status === "nxdomain") return { ok: false, reason: "nxdomain", server: ns };
    last = a;
  }
  return { ok: false, reason: "timeout", server: last?.server };
}

/** Resolve a target that may be a scenario host name (as an ssh alias), a DNS name, or an IP. */
export function hostByIp(state: SimState, ip: string): HostState | null {
  const n = ipToInt(ip);
  for (const name of state.hostOrder) if (hostAddrs(state.hosts[name], false).some((a) => a.ip === n)) return state.hosts[name];
  return null;
}

// ---------------------------------------------------------------- DHCP

export interface DhcpOffer {
  server: HostState;
  serverIp: string;
  ip: string;
  prefix: number;
  gateway: string;
  dns: string;
}

/** Find an active DHCP server on the segment the interface is plugged into, and the first free address. */
export function dhcpDiscover(state: SimState, client: HostState, iface: SimInterface & { segment?: string }): DhcpOffer | null {
  const segs = segmentsOf(state);
  let seg = iface.segment ? segs.find((s) => s.name === iface.segment) : undefined;
  if (!seg && iface.address) {
    const c = parseCidr(iface.address);
    if (c) seg = segs.find((s) => inSubnet(c.ip, s.net, s.prefix));
  }
  for (const name of state.hostOrder) {
    const h = state.hosts[name];
    if (h === client || !h.dhcpPool) continue;
    const svc = h.services.find((s) => s.kind === "dhcp" && s.state === "active");
    if (!svc) continue;
    const pool = h.dhcpPool;
    const lo = ipToInt(pool.range[0]);
    const hi = ipToInt(pool.range[1]);
    const serverAddr = hostAddrs(h, false).find((a) => inSubnet(lo, a.ip, a.prefix));
    if (!serverAddr) continue;
    if (seg) {
      if (!inSubnet(serverAddr.ip, seg.net, seg.prefix)) continue;
    } else if (segs.length > 1) {
      // interface has no segment hint; only accept if the server's segment is unambiguous
      const own = segs.filter((s) => inSubnet(serverAddr.ip, s.net, s.prefix));
      if (own.length !== 1) continue;
    }
    if (!firewallAllows(h, "udp", 67, 0)) continue;
    const used = new Set<number>();
    for (const hn of state.hostOrder) for (const a of hostAddrs(state.hosts[hn], false)) used.add(a.ip);
    const myLease = Object.entries(h.leases).find(([, v]) => v === `${client.name}/${iface.name}`);
    if (myLease) return { server: h, serverIp: intToIp(serverAddr.ip), ip: myLease[0], prefix: pool.prefix, gateway: pool.gateway, dns: pool.dns };
    for (let ip = lo; ip <= hi; ip++) {
      if (used.has(ip) || h.leases[intToIp(ip)]) continue;
      return { server: h, serverIp: intToIp(serverAddr.ip), ip: intToIp(ip), prefix: pool.prefix, gateway: pool.gateway, dns: pool.dns };
    }
  }
  return null;
}
