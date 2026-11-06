/** Grading: evaluate declarative assertions against simulator state. */
import type { Assertion, SimEvent, SimScenario } from "./schema";
import { Simulation } from "./engine";
import { Fs, FsError, ERRNO_MSG, hasPerm, permClass, R, W, X } from "./fs";
import { hostAddrs, intToIp, isIp, probe, resolveName, listeners } from "./net";
import { credFor, getUser, userGroups } from "./state";
import { httpRequest } from "./commands/network";
import type { HostState } from "./types";
import { normalizePath, octal, safeRegex } from "./util";

export interface AssertionResult {
  pass: boolean;
  detail: string;
}

const BIT: Record<"r" | "w" | "x", number> = { r: R, w: W, x: X };
const VERB: Record<"r" | "w" | "x", string> = { r: "readable", w: "writable", x: "executable" };

function hostOf(sim: Simulation, name: string | undefined): HostState | null {
  const n = name ?? sim.state.scenario.start.host;
  return sim.state.hosts[n] ?? null;
}

function fsOf(sim: Simulation, h: HostState): Fs {
  return new Fs(h, () => sim.state.clock);
}

function re(pattern: string, flags?: string): RegExp | null {
  return safeRegex(pattern, (flags ?? "").replace(/[^gimsuy]/g, ""));
}

/** Explain an access check with the specific missing bit. */
export function explainAccess(h: HostState, path: string, user: string, access: "r" | "w" | "x"): AssertionResult {
  const fs = new Fs(h, () => 0);
  if (!getUser(h, user)) return { pass: false, detail: `${h.name}: user ${user} does not exist` };
  const cred = credFor(h, user);
  const abs = normalizePath(path);
  try {
    const r = fs.resolve(abs, cred, true);
    if (hasPerm(r.node, cred, BIT[access])) return { pass: true, detail: `${h.name}: ${abs} is ${VERB[access]} by ${user} (mode ${octal(r.node.mode)} ${r.node.owner}:${r.node.group})` };
    const cls = permClass(r.node, cred);
    const who = cls === "u" ? "owner" : cls === "g" ? `group ${r.node.group}` : "others";
    return {
      pass: false,
      detail: `${h.name}: ${abs} is not ${VERB[access]} by ${user} (mode ${octal(r.node.mode)} ${r.node.owner}:${r.node.group}; ${user} falls under ${who}, which lacks ${cls}+${access})`,
    };
  } catch (e) {
    if (e instanceof FsError) {
      if (e.errno === "EACCES" && e.deniedAt) {
        const d = fs.nodes[e.deniedAt];
        const cls = d ? permClass(d, cred) : "o";
        return { pass: false, detail: `${h.name}: ${abs} is not ${VERB[access]} by ${user} (directory ${e.deniedAt} lacks ${cls}+x for ${user})` };
      }
      return { pass: false, detail: `${h.name}: ${abs}: ${ERRNO_MSG[e.errno]}` };
    }
    throw e;
  }
}

function targetIp(sim: Simulation, from: HostState, to: string): { ip: string | null; note: string } {
  if (isIp(to)) return { ip: to, note: to };
  const h = sim.state.hosts[to];
  if (h) {
    const addrs = hostAddrs(h, false).map((a) => intToIp(a.ip));
    if (!addrs.length) return { ip: null, note: `${to} has no address` };
    const reachable = addrs.find((a) => probe(sim.state, from, a, "icmp").status === "ok");
    return { ip: reachable ?? addrs[0], note: `${to} (${reachable ?? addrs[0]})` };
  }
  const r = resolveName(sim.state, from, to);
  return r.ok ? { ip: r.ip, note: `${to} (${r.ip})` } : { ip: null, note: `${to} does not resolve` };
}

export function evaluateAssertion(sim: Simulation, a: Assertion): AssertionResult {
  switch (a.type) {
    case "all": {
      const rs = a.of.map((x) => evaluateAssertion(sim, x));
      const failed = rs.filter((r) => !r.pass);
      return { pass: failed.length === 0, detail: (failed.length ? failed : rs).map((r) => r.detail).join("; ") };
    }
    case "any": {
      const rs = a.of.map((x) => evaluateAssertion(sim, x));
      const ok = rs.find((r) => r.pass);
      return { pass: !!ok, detail: ok ? ok.detail : rs.map((r) => r.detail).join("; ") };
    }
    case "not": {
      const r = evaluateAssertion(sim, a.of);
      return { pass: !r.pass, detail: `not (${r.detail})` };
    }
    case "history_matches": {
      const rx = re(a.pattern, a.flags);
      const hit = rx ? sim.state.history.find((l) => rx.test(l)) : undefined;
      return { pass: !!hit, detail: hit ? `ran: ${hit}` : `no command in history matches /${a.pattern}/` };
    }
    case "command_output": {
      const c = sim.clone();
      const hostName = a.host ?? sim.state.scenario.start.host;
      if (!c.state.hosts[hostName]) return { pass: false, detail: `unknown host ${hostName}` };
      const user = a.user ?? sim.state.scenario.start.user;
      c.setSession(hostName, user, a.cwd);
      for (const s of a.setup ?? []) c.exec(s);
      const r = c.exec(a.run);
      const rx = re(a.pattern, a.flags ?? "m");
      const okOut = rx ? rx.test(r.stdout) : false;
      const okExit = a.expectExit === undefined || r.exitCode === a.expectExit;
      const shown = (r.stdout || r.stderr).trim().split("\n").slice(0, 3).join(" | ").slice(0, 200);
      return { pass: okOut && okExit, detail: `${hostName}$ ${a.run} -> exit ${r.exitCode}${shown ? `: ${shown}` : " (no output)"}` };
    }
    case "reachable": {
      const from = sim.state.hosts[a.from];
      if (!from) return { pass: false, detail: `unknown host ${a.from}` };
      const t = targetIp(sim, from, a.to);
      if (!t.ip) return { pass: a.expect === false, detail: `${a.from} -> ${t.note}` };
      const proto = a.proto ?? (a.port !== undefined ? "tcp" : "icmp");
      const p = probe(sim.state, from, t.ip, proto, a.port);
      const ok = p.status === "ok";
      const what = proto === "icmp" ? "ping" : `${proto}/${a.port}`;
      return { pass: ok === a.expect, detail: `${a.from} -> ${t.note} ${what}: ${ok ? "reachable" : p.status.replace("-", " ")}${p.at && !ok ? ` (at ${p.at})` : ""}` };
    }
    case "resolves": {
      const from = sim.state.hosts[a.from];
      if (!from) return { pass: false, detail: `unknown host ${a.from}` };
      const r = resolveName(sim.state, from, a.name);
      const ok = r.ok && (a.ip === undefined || r.ip === a.ip);
      const detail = r.ok ? `${a.from}: ${a.name} -> ${r.ip} (via ${r.via}${r.server ? " " + r.server : ""})` : `${a.from}: ${a.name} does not resolve (${r.reason}${r.server ? " from " + r.server : ""})`;
      return { pass: ok === a.expect, detail };
    }
    case "http_status": {
      const from = sim.state.hosts[a.from];
      if (!from) return { pass: false, detail: `unknown host ${a.from}` };
      const r = httpRequest(sim.state, from, a.url);
      if (!r.ok) return { pass: false, detail: `${a.from}: ${a.url} -> ${r.error}` };
      return { pass: r.status === a.status, detail: `${a.from}: ${a.url} -> HTTP ${r.status}` };
    }
  }

  const h = hostOf(sim, a.host);
  if (!h) return { pass: false, detail: `unknown host ${a.host}` };
  const fs = fsOf(sim, h);
  switch (a.type) {
    case "file_exists": {
      const r = fs.tryResolve(normalizePath(a.path), null, false);
      return { pass: !!r, detail: `${h.name}: ${a.path} ${r ? `exists (${r.node.type})` : "does not exist"}` };
    }
    case "file_absent": {
      const r = fs.tryResolve(normalizePath(a.path), null, false);
      return { pass: !r, detail: `${h.name}: ${a.path} ${r ? "still exists" : "is absent"}` };
    }
    case "file_matches":
    case "file_not_matches": {
      let content: string;
      try {
        content = fs.readFile(normalizePath(a.path), null);
      } catch {
        return { pass: false, detail: `${h.name}: ${a.path} does not exist` };
      }
      const rx = re(a.pattern, a.flags ?? "m");
      if (!rx) return { pass: false, detail: `invalid pattern /${a.pattern}/` };
      const m = rx.test(content);
      const pass = a.type === "file_matches" ? m : !m;
      return { pass, detail: `${h.name}: ${a.path} ${m ? "matches" : "does not match"} /${a.pattern}/` };
    }
    case "access":
      {
        const r = explainAccess(h, a.path, a.user, a.access);
        return { pass: r.pass === a.expect, detail: r.detail };
      }
    case "mode_max": {
      const r = fs.tryResolve(normalizePath(a.path), null, true);
      if (!r) return { pass: false, detail: `${h.name}: ${a.path} does not exist` };
      const max = parseInt(a.max, 8);
      const extra = r.node.mode & 0o7777 & ~max;
      return { pass: extra === 0, detail: `${h.name}: ${a.path} has mode ${octal(r.node.mode)}${extra ? ` (exceeds ${octal(max)} by ${octal(extra)})` : ""}` };
    }
    case "owner": {
      const r = fs.tryResolve(normalizePath(a.path), null, true);
      if (!r) return { pass: false, detail: `${h.name}: ${a.path} does not exist` };
      const pass = (a.owner === undefined || r.node.owner === a.owner) && (a.group === undefined || r.node.group === a.group);
      return { pass, detail: `${h.name}: ${a.path} is owned by ${r.node.owner}:${r.node.group}` };
    }
    case "service_state": {
      const s = h.services.find((x) => x.name === a.service.replace(/\.service$/, ""));
      if (!s) return { pass: false, detail: `${h.name}: no service ${a.service}` };
      const last = s.state === "failed" ? s.journal.filter((l) => !l.includes("systemd[1]")).slice(-1)[0] : undefined;
      return { pass: s.state === a.state, detail: `${h.name}: ${s.name} is ${s.state}${last ? ` (${last.replace(/^\w{3} \d{2} [\d:]{8} \S+ /, "")})` : ""}` };
    }
    case "service_enabled": {
      const s = h.services.find((x) => x.name === a.service.replace(/\.service$/, ""));
      if (!s) return { pass: false, detail: `${h.name}: no service ${a.service}` };
      return { pass: s.enabled === a.enabled, detail: `${h.name}: ${s.name} is ${s.enabled ? "enabled" : "disabled"}` };
    }
    case "process_running": {
      const rx = re(a.pattern);
      const cmds = [...h.processes.map((p) => p.command), ...h.services.filter((s) => s.state === "active").map((s) => s.command)];
      const hit = rx ? cmds.find((c) => rx.test(c)) : undefined;
      return { pass: !!hit === a.expect, detail: `${h.name}: ${hit ? `running: ${hit}` : `no process matches /${a.pattern}/`}` };
    }
    case "interface": {
      const i = h.interfaces.find((x) => x.name === a.name);
      if (!i) return { pass: false, detail: `${h.name}: no interface ${a.name}` };
      const addrOk = a.address === undefined || (a.address.includes("/") ? i.address === a.address : i.address?.split("/")[0] === a.address);
      const upOk = a.up === undefined || i.up === a.up;
      return { pass: addrOk && upOk, detail: `${h.name}: ${i.name} is ${i.up ? "up" : "down"}, address ${i.address ?? "none"}` };
    }
    case "route": {
      const dest = a.destination === "0.0.0.0/0" ? "default" : a.destination;
      const r = h.routes.find((x) => x.destination === dest && (a.via === undefined || x.via === a.via));
      const list = h.routes.map((x) => `${x.destination}${x.via ? " via " + x.via : ""}`).join(", ") || "none";
      return { pass: !!r === a.expect, detail: `${h.name}: routes: ${list}` };
    }
    case "user_in_group": {
      if (!getUser(h, a.user)) return { pass: a.expect === false, detail: `${h.name}: user ${a.user} does not exist` };
      const gs = userGroups(h, a.user);
      const inG = gs.includes(a.group);
      return { pass: inG === a.expect, detail: `${h.name}: ${a.user} groups: ${gs.join(" ")}` };
    }
  }
  return { pass: false, detail: "unknown assertion" };
}

export function gradeEvents(
  scenario: SimScenario,
  events: SimEvent[],
  checks: { id: string; assert: Assertion }[],
): { results: { id: string; pass: boolean; detail: string }[]; finalSim: Simulation } {
  const sim = new Simulation(scenario);
  sim.applyEvents(events);
  const results = checks.map((c) => {
    let r: AssertionResult;
    try {
      r = evaluateAssertion(sim, c.assert);
    } catch (e) {
      r = { pass: false, detail: `error evaluating check: ${(e as Error).message}` };
    }
    return { id: c.id, pass: r.pass, detail: r.detail };
  });
  return { results, finalSim: sim };
}

void listeners;
