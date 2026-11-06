/** System commands: identity, processes, services, users, env, time. */
import { credFor, getUser, gidOf, makeSession, nextFreeGid, regenAccounts, userGroups } from "../state";
import { findService, killService, procName, startService, stopService } from "../services";
import { hostAddrs, intToIp, resolveName } from "../net";
import type { HostState, ServiceState } from "../types";
import { fmtDate, fmtSystemd, hhmm, strftime } from "../util";
import { opts } from "./files";
import { COMMAND_PATHS } from "./paths";
import type { CmdCtx, CommandFn } from "./types";

// ------------------------------------------------------------------ identity

function idLine(h: HostState, user: string): string {
  const u = getUser(h, user)!;
  const gs = userGroups(h, user);
  const primary = gs[0];
  return `uid=${u.uid}(${user}) gid=${gidOf(h, primary)}(${primary}) groups=${gs.map((g) => `${gidOf(h, g)}(${g})`).join(",")}`;
}

const id: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "unGgr" });
  if (!o) return 2;
  const user = o.operands[0] ?? ctx.cred.user;
  const u = getUser(ctx.host, user);
  if (!u) {
    ctx.err(`id: '${user}': no such user\n`);
    return 1;
  }
  const gs = o.operands[0] ? userGroups(ctx.host, user) : ctx.cred.groups;
  if (o.opts.u) ctx.out((o.opts.n ? user : String(u.uid)) + "\n");
  else if (o.opts.g) ctx.out((o.opts.n ? gs[0] : String(gidOf(ctx.host, gs[0]))) + "\n");
  else if (o.opts.G) ctx.out(gs.map((g) => (o.opts.n ? g : String(gidOf(ctx.host, g)))).join(" ") + "\n");
  else ctx.out(`uid=${u.uid}(${user}) gid=${gidOf(ctx.host, gs[0])}(${gs[0]}) groups=${gs.map((g) => `${gidOf(ctx.host, g)}(${g})`).join(",")}\n`);
  return 0;
};

const whoami: CommandFn = (ctx) => {
  ctx.out(ctx.cred.user + "\n");
  return 0;
};

const groups: CommandFn = (ctx) => {
  if (!ctx.args.length) {
    ctx.out(ctx.cred.groups.join(" ") + "\n");
    return 0;
  }
  let code = 0;
  for (const u of ctx.args) {
    if (!getUser(ctx.host, u)) {
      ctx.err(`groups: '${u}': no such user\n`);
      code = 1;
      continue;
    }
    ctx.out(`${u} : ${userGroups(ctx.host, u).join(" ")}\n`);
  }
  return code;
};

// ------------------------------------------------------------------ processes

interface ProcRow {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
  tty: string;
  stat: string;
  start: string;
  service?: ServiceState;
  idx?: number;
}

function procTable(ctx: CmdCtx, includeSelf: string): ProcRow[] {
  const h = ctx.host;
  const boot = hhmm(ctx.core.state.clock - 3600 * 3);
  const rows: ProcRow[] = [{ pid: 1, ppid: 0, user: "root", cpu: 0, mem: 0.3, command: "/sbin/init", tty: "?", stat: "Ss", start: boot }];
  h.processes.forEach((p, idx) => rows.push({ pid: p.pid, ppid: 1, user: p.user, cpu: p.cpu, mem: p.mem, command: p.command, tty: "?", stat: "Ss", start: boot, idx }));
  for (const s of h.services) if (s.state === "active" && s.pid !== null) rows.push({ pid: s.pid, ppid: 1, user: s.execUser, cpu: 0.1, mem: 0.4, command: s.command, tty: "?", stat: "Ss", start: hhmm(s.activeSince ?? ctx.core.state.clock), service: s });
  const sessUser = ctx.shell.env.user;
  rows.push({ pid: 2001, ppid: 2000, user: sessUser, cpu: 0, mem: 0.1, command: "-bash", tty: "pts/0", stat: "Ss", start: hhmm(ctx.core.state.clock - 600) });
  if (includeSelf) rows.push({ pid: 2002 + (ctx.core.state.history.length % 900), ppid: 2001, user: ctx.cred.user, cpu: 0, mem: 0.1, command: includeSelf, tty: "pts/0", stat: "R+", start: hhmm(ctx.core.state.clock) });
  return rows.sort((a, b) => a.pid - b.pid);
}

const ps: CommandFn = (ctx) => {
  const args = ctx.args.join(" ");
  const bsd = /^[a-z]+$/.test(ctx.args[0] ?? "") && !ctx.args[0].startsWith("-");
  const self = `ps ${ctx.args.join(" ")}`.trim();
  if (!ctx.args.length) {
    const rows = procTable(ctx, "ps").filter((r) => r.tty === "pts/0");
    ctx.out("    PID TTY          TIME CMD\n" + rows.map((r) => `${String(r.pid).padStart(7)} ${r.tty.padEnd(8)} 00:00:00 ${r.command.replace(/^-/, "").split(" ")[0].split("/").pop()}`).join("\n") + "\n");
    return 0;
  }
  if (bsd) {
    if (!/^[auxwf]+$/.test(ctx.args[0]) || ctx.args.length > 1) return ctx.unsupported(`ps: '${args}' is not supported in this simulation (try ps aux or ps -ef)`);
    const rows = procTable(ctx, self);
    ctx.out("USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n");
    for (const r of rows) {
      const vsz = 10000 + ((r.pid * 7919) % 240000);
      const rss = 1000 + ((r.pid * 104729) % 30000);
      ctx.out(`${r.user.slice(0, 8).padEnd(8)} ${String(r.pid).padStart(7)} ${r.cpu.toFixed(1).padStart(4)} ${r.mem.toFixed(1).padStart(4)} ${String(vsz).padStart(6)} ${String(rss).padStart(5)} ${r.tty.padEnd(8)} ${r.stat.padEnd(4)} ${r.start} ${"0:00".padStart(6)} ${r.command}\n`);
    }
    return 0;
  }
  const o = opts(ctx, { flags: "efAaxlH", withArg: "upCo" });
  if (!o) return 2;
  if (o.opts.o) return ctx.unsupported("ps: -o custom formats are not supported in this simulation (try ps aux | awk ...)");
  if (o.opts.l || o.opts.H) return ctx.unsupported("ps: -l/-H are not supported in this simulation");
  let rows = procTable(ctx, self);
  if (o.opts.u) rows = rows.filter((r) => (o.opts.u as string).split(",").includes(r.user));
  if (o.opts.p) rows = rows.filter((r) => (o.opts.p as string).split(",").includes(String(r.pid)));
  if (o.opts.C) rows = rows.filter((r) => procBase(r.command) === o.opts.C);
  if (!o.opts.e && !o.opts.A && !o.opts.u && !o.opts.p && !o.opts.C) rows = rows.filter((r) => r.tty === "pts/0");
  if (o.opts.f) {
    ctx.out("UID          PID    PPID  C STIME TTY          TIME CMD\n");
    for (const r of rows) ctx.out(`${r.user.slice(0, 8).padEnd(8)} ${String(r.pid).padStart(7)} ${String(r.ppid).padStart(7)}  0 ${r.start} ${r.tty.padEnd(8)} 00:00:00 ${r.command}\n`);
  } else {
    ctx.out("    PID TTY          TIME CMD\n");
    for (const r of rows) ctx.out(`${String(r.pid).padStart(7)} ${r.tty.padEnd(8)} 00:00:00 ${procBase(r.command)}\n`);
  }
  return 0;
};

function procBase(cmd: string): string {
  const first = cmd.replace(/^-/, "").split(/\s+/)[0];
  return first.replace(/:$/, "").split("/").pop() ?? first;
}

const SIGNALS: Record<string, number> = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, USR1: 10, USR2: 12, STOP: 19, CONT: 18 };

function parseSignal(s: string): number | null {
  const u = s.toUpperCase().replace(/^SIG/, "");
  if (/^\d+$/.test(u)) return parseInt(u, 10);
  return SIGNALS[u] ?? null;
}

/** Deliver a signal to pid. Returns an error message or null. */
function deliver(ctx: CmdCtx, pid: number, sig: number): string | null {
  const h = ctx.host;
  const svc = h.services.find((s) => s.state === "active" && s.pid === pid);
  const pi = h.processes.findIndex((p) => p.pid === pid);
  const owner = svc ? svc.execUser : pi >= 0 ? h.processes[pi].user : pid === 1 ? "root" : pid === 2001 ? ctx.shell.env.user : null;
  if (owner === null) return "No such process";
  if (ctx.cred.uid !== 0 && ctx.cred.user !== owner) return "Operation not permitted";
  if (sig === 0 || sig === 18 || sig === 19 || pid === 1 || pid === 2001) return null;
  if (svc) {
    if (sig === 1 || sig === 10 || sig === 12) return null; // reload-ish: keeps running
    killService(ctx.core.state, h, svc, sig);
  } else if (pi >= 0) h.processes.splice(pi, 1);
  return null;
}

const kill: CommandFn = (ctx) => {
  let sig = 15;
  const pids: string[] = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === "-l" || a === "-L") {
      ctx.out(" 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 9) SIGKILL\t10) SIGUSR1\n12) SIGUSR2\t15) SIGTERM\t18) SIGCONT\t19) SIGSTOP\n");
      return 0;
    }
    if (a === "-s" || a === "-n") {
      const s = parseSignal(ctx.args[++i] ?? "");
      if (s === null) {
        ctx.err(`bash: kill: ${ctx.args[i]}: invalid signal specification\n`);
        return 1;
      }
      sig = s;
    } else if (a.startsWith("-") && a.length > 1 && pids.length === 0) {
      const s = parseSignal(a.slice(1));
      if (s === null) {
        ctx.err(`bash: kill: ${a.slice(1)}: invalid signal specification\n`);
        return 1;
      }
      sig = s;
    } else pids.push(a);
  }
  if (!pids.length) {
    ctx.err("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n");
    return 2;
  }
  let code = 0;
  for (const p of pids) {
    if (!/^\d+$/.test(p)) {
      ctx.err(`bash: kill: ${p}: arguments must be process or job IDs\n`);
      code = 1;
      continue;
    }
    const e = deliver(ctx, parseInt(p, 10), sig);
    if (e) {
      ctx.err(`bash: kill: (${p}) - ${e}\n`);
      code = 1;
    }
  }
  return code;
};

function matchProcs(ctx: CmdCtx, pattern: string, full: boolean, user?: string, exact?: boolean): ProcRow[] {
  let re: RegExp;
  try {
    re = new RegExp(exact ? `^(?:${pattern})$` : pattern);
  } catch {
    return [];
  }
  return procTable(ctx, "").filter((r) => r.pid !== 2001 && (!user || r.user === user) && re.test(full ? r.command : procBase(r.command)));
}

const pgrep: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "lafxc", withArg: "u", long: { "list-name": "l", "list-full": "a", full: "f", exact: "x", count: "c" } });
  if (!o) return 2;
  if (!o.operands.length && !o.opts.u) {
    ctx.err("pgrep: no matching criteria specified\n");
    return 2;
  }
  const rows = matchProcs(ctx, o.operands[0] ?? "", !!o.opts.f, o.opts.u as string | undefined, !!o.opts.x);
  if (o.opts.c) ctx.out(rows.length + "\n");
  else for (const r of rows) ctx.out(o.opts.a ? `${r.pid} ${r.command}\n` : o.opts.l ? `${r.pid} ${procBase(r.command)}\n` : `${r.pid}\n`);
  return rows.length ? 0 : 1;
};

const pkill: CommandFn = (ctx) => {
  let sig = 15;
  const rest: string[] = [];
  for (const a of ctx.args) {
    const s = /^-([A-Z]+|\d+)$/.exec(a);
    if (s && parseSignal(s[1]) !== null) sig = parseSignal(s[1])!;
    else rest.push(a);
  }
  const o = opts(ctx, { flags: "fx", withArg: "u" }, rest);
  if (!o) return 2;
  if (!o.operands.length) {
    ctx.err("pkill: no matching criteria specified\n");
    return 2;
  }
  const rows = matchProcs(ctx, o.operands[0], !!o.opts.f, o.opts.u as string | undefined, !!o.opts.x);
  let code = rows.length ? 0 : 1;
  for (const r of rows) {
    const e = deliver(ctx, r.pid, sig);
    if (e) {
      ctx.err(`pkill: killing pid ${r.pid} failed: ${e}\n`);
      code = 1;
    }
  }
  return code;
};

// ------------------------------------------------------------------ services

const AUTH = "Interactive authentication required.";

function unitName(n: string): string {
  return n.endsWith(".service") ? n : `${n}.service`;
}

function serviceStatus(ctx: CmdCtx, s: ServiceState): string {
  const now = ctx.core.now();
  const bullet = s.state === "active" ? "●" : s.state === "failed" ? "×" : "○";
  const since = s.activeSince ?? now;
  const ago = Math.max(0, now - since);
  const agoStr = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}min ago` : `${Math.floor(ago / 3600)}h ago`;
  let active: string;
  if (s.state === "active") active = `active (running) since ${fmtSystemd(since)}; ${agoStr}`;
  else if (s.state === "failed") active = `failed (Result: exit-code) since ${fmtSystemd(now)}; 0s ago`;
  else active = "inactive (dead)";
  let out = `${bullet} ${unitName(s.name)}${s.description ? " - " + s.description : ""}\n`;
  out += `     Loaded: loaded (/lib/systemd/system/${s.name}.service; ${s.enabled ? "enabled" : "disabled"}; preset: enabled)\n`;
  out += `     Active: ${active}\n`;
  if (s.state === "active" && s.pid !== null) {
    out += `   Main PID: ${s.pid} (${procName(s)})\n      Tasks: 1 (limit: 4558)\n     Memory: 4.2M\n        CPU: 21ms\n     CGroup: /system.slice/${s.name}.service\n             └─${s.pid} ${s.command}\n`;
  }
  const tail = s.journal.slice(-10);
  if (tail.length) out += "\n" + tail.join("\n") + "\n";
  return out;
}

const systemctl: CommandFn = (ctx) => {
  const args = ctx.args.filter((a) => !["--no-pager", "-l", "--full", "--quiet", "-q", "--no-legend"].includes(a));
  const quiet = ctx.args.includes("--quiet") || ctx.args.includes("-q");
  const now = args.includes("--now");
  const all = args.includes("--all") || args.includes("-a");
  const typeArg = args.find((a) => a.startsWith("--type=") || a.startsWith("-t"));
  const stateArg = args.find((a) => a.startsWith("--state="))?.slice(8);
  const pos = args.filter((a) => !a.startsWith("-"));
  const badFlag = args.find((a) => a.startsWith("-") && !["--now", "--all", "-a", "--type=service", "-t"].includes(a) && !a.startsWith("--state=") && a !== "service");
  if (badFlag && !(typeArg && badFlag === typeArg)) return ctx.unsupported(`systemctl: option '${badFlag}' is not supported in this simulation`);
  if (typeArg && typeArg !== "--type=service" && typeArg !== "-t") return ctx.unsupported(`systemctl: only --type=service units are simulated`);
  const sub = pos[0] ?? "list-units";
  const units = pos.slice(1).filter((u) => !(sub === "list-units" && u === "service"));
  const h = ctx.host;
  const root = ctx.cred.uid === 0;
  const st = ctx.core.state;
  const need = () => {
    if (!units.length) {
      ctx.err(`Too few arguments.\n`);
      return false;
    }
    return true;
  };
  const lookup = (u: string): ServiceState | null => {
    const s = findService(h, u);
    if (!s) ctx.err(`Unit ${unitName(u)} could not be found.\n`);
    return s ?? null;
  };
  switch (sub) {
    case "status": {
      if (!units.length) {
        ctx.out(`● ${h.name}\n    State: ${h.services.some((s) => s.state === "failed") ? "degraded" : "running"}\n    Units: ${h.services.length} loaded (incl. loaded aliases)\n     Jobs: 0 queued\n   Failed: ${h.services.filter((s) => s.state === "failed").length} units\n`);
        return 0;
      }
      let code = 0;
      for (const u of units) {
        const s = findService(h, u);
        if (!s) {
          ctx.err(`Unit ${unitName(u)} could not be found.\n`);
          code = 4;
          continue;
        }
        ctx.out(serviceStatus(ctx, s));
        if (s.state !== "active") code = 3;
      }
      return code;
    }
    case "start":
    case "stop":
    case "restart":
    case "reload":
    case "try-restart":
    case "reload-or-restart": {
      if (!need()) return 1;
      let code = 0;
      for (const u of units) {
        const s = findService(h, u);
        if (!root) {
          ctx.err(`Failed to ${sub} ${unitName(u)}: ${AUTH}\nSee system logs and 'systemctl status ${unitName(u)}' for details.\n`);
          code = 1;
          continue;
        }
        if (!s) {
          ctx.err(`Failed to ${sub} ${unitName(u)}: Unit ${unitName(u)} not found.\n`);
          code = 5;
          continue;
        }
        if (sub === "stop") {
          stopService(st, h, s);
          continue;
        }
        if (sub === "reload" && s.state !== "active") {
          ctx.err(`Job for ${unitName(u)} failed.\nSee "systemctl status ${unitName(u)}" and "journalctl -xeu ${unitName(u)}" for details.\n`);
          code = 1;
          continue;
        }
        if (sub === "try-restart" && s.state !== "active") continue;
        if (sub !== "start") stopService(st, h, s);
        const r = startService(st, h, s);
        if (!r.ok) {
          ctx.err(`Job for ${unitName(u)} failed because the control process exited with error code.\nSee "systemctl status ${unitName(u)}" and "journalctl -xeu ${unitName(u)}" for details.\n`);
          code = 1;
        }
      }
      return code;
    }
    case "enable":
    case "disable": {
      if (!need()) return 1;
      if (!root) {
        ctx.err(`Failed to ${sub} unit: ${AUTH}\n`);
        return 1;
      }
      let code = 0;
      for (const u of units) {
        const s = findService(h, u);
        if (!s) {
          ctx.err(`Failed to ${sub} unit: Unit file ${unitName(u)} does not exist.\n`);
          code = 1;
          continue;
        }
        const link = `/etc/systemd/system/multi-user.target.wants/${s.name}.service`;
        if (sub === "enable") {
          if (!s.enabled) ctx.err(`Created symlink ${link} → /lib/systemd/system/${s.name}.service.\n`);
          s.enabled = true;
          if (now && startService(st, h, s).ok === false) {
            ctx.err(`Job for ${unitName(u)} failed because the control process exited with error code.\nSee "systemctl status ${unitName(u)}" and "journalctl -xeu ${unitName(u)}" for details.\n`);
            code = 1;
          }
        } else {
          if (s.enabled) ctx.err(`Removed "${link}".\n`);
          s.enabled = false;
          if (now) stopService(st, h, s);
        }
      }
      return code;
    }
    case "is-active":
    case "is-enabled":
    case "is-failed": {
      if (!need()) return 1;
      let code = sub === "is-failed" ? 1 : 0;
      for (const u of units) {
        const s = findService(h, u);
        if (!s) {
          if (!quiet) ctx.out(sub === "is-enabled" ? "" : "inactive\n");
          if (sub === "is-enabled") ctx.err(`Failed to get unit file state for ${unitName(u)}: No such file or directory\n`);
          code = sub === "is-failed" ? code : sub === "is-enabled" ? 1 : 3;
          continue;
        }
        if (sub === "is-enabled") {
          if (!quiet) ctx.out((s.enabled ? "enabled" : "disabled") + "\n");
          if (!s.enabled) code = 1;
        } else {
          if (!quiet) ctx.out(s.state + "\n");
          if (sub === "is-active" && s.state !== "active") code = 3;
          if (sub === "is-failed" && s.state === "failed") code = 0;
        }
      }
      return code;
    }
    case "list-units": {
      let list = h.services;
      if (!all) list = list.filter((s) => s.state !== "inactive");
      if (stateArg) list = h.services.filter((s) => s.state === stateArg || (stateArg === "running" && s.state === "active"));
      const w = Math.max(20, ...list.map((s) => s.name.length + 9));
      let out = `  ${"UNIT".padEnd(w)} LOAD   ACTIVE   SUB     DESCRIPTION\n`;
      for (const s of list) {
        const subSt = s.state === "active" ? "running" : s.state === "failed" ? "failed" : "dead";
        out += `${s.state === "failed" ? "●" : " "} ${unitName(s.name).padEnd(w)} loaded ${s.state.padEnd(8)} ${subSt.padEnd(7)} ${s.description || s.name}\n`;
      }
      out += `\nLOAD   = Reflects whether the unit definition was properly loaded.\nACTIVE = The high-level unit activation state, i.e. generalization of SUB.\nSUB    = The low-level unit activation state, values depend on unit type.\n\n${list.length} loaded units listed.${all ? "" : " Pass --all to see loaded but inactive units, too."}\n`;
      ctx.out(out);
      return 0;
    }
    case "list-unit-files": {
      let out = "UNIT FILE                               STATE   PRESET\n";
      for (const s of h.services) out += `${unitName(s.name).padEnd(39)} ${(s.enabled ? "enabled" : "disabled").padEnd(7)} enabled\n`;
      out += `\n${h.services.length} unit files listed.\n`;
      ctx.out(out);
      return 0;
    }
    case "cat": {
      if (!need()) return 1;
      for (const u of units) {
        const s = lookup(u);
        if (!s) return 1;
        const f = ctx.fs.nodes[`/lib/systemd/system/${s.name}.service`];
        ctx.out(`# /lib/systemd/system/${s.name}.service\n${f?.content ?? ""}`);
      }
      return 0;
    }
    case "daemon-reload":
      if (!root) {
        ctx.err(`Failed to reload daemon: ${AUTH}\n`);
        return 1;
      }
      return 0;
    default:
      return ctx.unsupported(`systemctl: '${sub}' is not supported in this simulation (try status, start, stop, restart, enable, disable, is-active, list-units)`, 1);
  }
};

const service: CommandFn = (ctx) => {
  if (ctx.args[0] === "--status-all") {
    for (const s of ctx.host.services) ctx.out(` [ ${s.state === "active" ? "+" : "-"} ]  ${s.name}\n`);
    return 0;
  }
  const [name, action] = ctx.args;
  if (!name || !action) {
    ctx.err("Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]\n");
    return 1;
  }
  return systemctl({ ...ctx, name: "systemctl", args: [action, name] });
};

const journalctl: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "xefrbqak", withArg: "unpS", long: { "no-pager": "P", "unit=": "u", "lines=": "n", follow: "f", reverse: "r", "since=": "S", "until=": "U", "priority=": "p", boot: "b", "no-hostname": "H", "output=": "o" } });
  if (!o) return 2;
  if (o.opts.f) return ctx.unsupported("journalctl: -f (follow) is not supported in this simulation (logs do not grow on their own)");
  if (o.opts.S || o.opts.U || o.opts.p || o.opts.o) return ctx.unsupported(`journalctl: --since/--until/-p/-o are not supported in this simulation (try -u UNIT -n N)`);
  const privileged = ctx.cred.uid === 0 || ctx.cred.groups.some((g) => ["adm", "systemd-journal"].includes(g));
  if (!privileged) {
    ctx.out("Hint: You are currently not seeing messages from other users and the system.\n      Users in groups 'adm', 'systemd-journal' can see all messages.\n      Pass -q to turn off this notice.\n-- No entries --\n");
    return 0;
  }
  let lines: string[] = [];
  const units = o.multi.u ?? [];
  if (units.length) {
    for (const u of units) {
      const s = findService(ctx.host, u);
      if (s) lines.push(...s.journal);
    }
  } else for (const s of ctx.host.services) lines.push(...s.journal);
  if (o.opts.n !== undefined) {
    const n = parseInt(o.opts.n as string, 10);
    lines = Number.isFinite(n) ? lines.slice(-n) : lines;
  } else if (o.opts.e) lines = lines.slice(-1000);
  if (o.opts.r) lines.reverse();
  if (!lines.length) ctx.out("-- No entries --\n");
  else ctx.out(lines.join("\n") + "\n");
  return 0;
};

// ------------------------------------------------------------------ users

function requireRoot(ctx: CmdCtx, msg: string): boolean {
  if (ctx.cred.uid === 0) return true;
  ctx.err(msg);
  return false;
}

const useradd: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "mMrN", withArg: "sGgdcu", long: { "create-home": "m", "shell=": "s", "groups=": "G", "gid=": "g", "home-dir=": "d", "uid=": "u", system: "r" } });
  if (!o) return 2;
  if (!requireRoot(ctx, "useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n")) return 1;
  const name = o.operands[0];
  if (!name) {
    ctx.err("Usage: useradd [options] LOGIN\n");
    return 2;
  }
  const h = ctx.host;
  if (getUser(h, name)) {
    ctx.err(`useradd: user '${name}' already exists\n`);
    return 9;
  }
  const extra = o.opts.G ? (o.opts.G as string).split(",").filter(Boolean) : [];
  for (const g of [...extra, ...(o.opts.g ? [o.opts.g as string] : [])]) {
    if (!h.groups.some((x) => x.name === g)) {
      ctx.err(`useradd: group '${g}' does not exist\n`);
      return 6;
    }
  }
  const uid = o.opts.u ? parseInt(o.opts.u as string, 10) : Math.max(999, ...h.users.filter((u) => u.uid < 60000).map((u) => u.uid)) + 1;
  const home = (o.opts.d as string) ?? `/home/${name}`;
  h.users.push({ name, uid, groups: o.opts.g ? [o.opts.g as string, ...extra] : extra, home, shell: (o.opts.s as string) ?? "/bin/sh" });
  if (!o.opts.g && !h.groups.some((g) => g.name === name)) h.groups.push({ name, gid: h.groups.some((g) => g.gid === uid) ? nextFreeGid(h) : uid });
  if (o.opts.m && !ctx.fs.nodes[home]) ctx.fs.nodes[home] = { type: "dir", content: "", mode: 0o750, owner: name, group: o.opts.g ? (o.opts.g as string) : name, mtime: ctx.core.now() };
  regenAccounts(h, ctx.core.now());
  return 0;
};

const usermod: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "aLU", withArg: "Gsgdl", long: { append: "a", "groups=": "G", "shell=": "s" } });
  if (!o) return 2;
  if (o.opts.L || o.opts.U || o.opts.l || o.opts.d) return ctx.unsupported("usermod: only -aG, -G, -g and -s are supported in this simulation");
  if (!requireRoot(ctx, "usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.\n")) return 1;
  const name = o.operands[0];
  const h = ctx.host;
  const u = name ? getUser(h, name) : undefined;
  if (!u) {
    ctx.err(name ? `usermod: user '${name}' does not exist\n` : "Usage: usermod [options] LOGIN\n");
    return name ? 6 : 2;
  }
  if (o.opts.G !== undefined) {
    const gs = (o.opts.G as string).split(",").filter(Boolean);
    for (const g of gs) {
      if (!h.groups.some((x) => x.name === g)) {
        ctx.err(`usermod: group '${g}' does not exist\n`);
        return 6;
      }
    }
    if (o.opts.a) for (const g of gs) {
      if (!u.groups.includes(g)) u.groups.push(g);
    }
    else u.groups = gs;
  } else if (o.opts.a) {
    ctx.err("usermod: -a flag is ONLY allowed with the -G flag\n");
    return 2;
  }
  if (o.opts.g) {
    const g = o.opts.g as string;
    if (!h.groups.some((x) => x.name === g)) {
      ctx.err(`usermod: group '${g}' does not exist\n`);
      return 6;
    }
    if (!u.groups.includes(g)) u.groups.unshift(g);
  }
  if (o.opts.s) u.shell = o.opts.s as string;
  regenAccounts(h, ctx.core.now());
  return 0;
};

const groupadd: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "rf", withArg: "g" });
  if (!o) return 2;
  if (!requireRoot(ctx, "groupadd: Permission denied.\ngroupadd: cannot lock /etc/group; try again later.\n")) return 1;
  const name = o.operands[0];
  if (!name) {
    ctx.err("Usage: groupadd [options] GROUP\n");
    return 2;
  }
  if (ctx.host.groups.some((g) => g.name === name)) {
    if (o.opts.f) return 0;
    ctx.err(`groupadd: group '${name}' already exists\n`);
    return 9;
  }
  ctx.host.groups.push({ name, gid: o.opts.g ? parseInt(o.opts.g as string, 10) : nextFreeGid(ctx.host) });
  regenAccounts(ctx.host, ctx.core.now());
  return 0;
};

const gpasswd: CommandFn = (ctx) => {
  const [flag, user, group] = ctx.args;
  if ((flag !== "-a" && flag !== "-d") || !user || !group) return ctx.unsupported("gpasswd: only 'gpasswd -a USER GROUP' and 'gpasswd -d USER GROUP' are supported in this simulation");
  if (!requireRoot(ctx, "gpasswd: Permission denied.\n")) return 1;
  const u = getUser(ctx.host, user);
  if (!u) {
    ctx.err(`gpasswd: user '${user}' does not exist\n`);
    return 3;
  }
  if (!ctx.host.groups.some((g) => g.name === group)) {
    ctx.err(`gpasswd: group '${group}' does not exist in /etc/group\n`);
    return 3;
  }
  if (flag === "-a") {
    if (!u.groups.includes(group)) u.groups.push(group);
    ctx.out(`Adding user ${user} to group ${group}\n`);
  } else {
    if (!u.groups.includes(group)) {
      ctx.err(`gpasswd: user '${user}' is not a member of '${group}'\n`);
      return 3;
    }
    u.groups = u.groups.filter((g) => g !== group);
    ctx.out(`Removing user ${user} from group ${group}\n`);
  }
  regenAccounts(ctx.host, ctx.core.now());
  return 0;
};

const userdel: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "rf" });
  if (!o) return 2;
  if (!requireRoot(ctx, "userdel: Permission denied.\nuserdel: cannot lock /etc/passwd; try again later.\n")) return 1;
  const name = o.operands[0];
  const h = ctx.host;
  const u = name ? getUser(h, name) : undefined;
  if (!u) {
    ctx.err(`userdel: user '${name ?? ""}' does not exist\n`);
    return 6;
  }
  h.users = h.users.filter((x) => x !== u);
  if (o.opts.r) ctx.fs.removeTree(u.home, null, () => {});
  regenAccounts(h, ctx.core.now());
  return 0;
};

const su: CommandFn = (ctx) => {
  let login = false;
  let cmd: string | undefined;
  let target = "root";
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === "-" || a === "-l" || a === "--login") login = true;
    else if (a === "-c") cmd = ctx.args[++i];
    else if (a === "-s" || a === "-m" || a === "-p") continue;
    else if (a.startsWith("-")) return ctx.unsupported(`su: option '${a}' is not supported in this simulation`, 1);
    else target = a;
  }
  void login;
  const h = ctx.host;
  if (!getUser(h, target)) {
    ctx.err(`su: user ${target} does not exist or the user entry does not contain all the required fields\n`);
    return 1;
  }
  if (ctx.cred.uid !== 0) return ctx.unsupported("su: password authentication is not supported in this simulation (use 'sudo -i' or 'sudo su - USER')", 1);
  const cred = credFor(h, target);
  if (cmd !== undefined) {
    const env = makeSession(h, target, undefined, "su");
    return ctx.shell.runSource(cmd, ctx.io, { env, cred, argv0: "bash", args: [] });
  }
  ctx.core.pushSession(makeSession(h, target, login ? undefined : ctx.cwd, "su"));
  return 0;
};

const passwd: CommandFn = (ctx) => ctx.unsupported("passwd: changing passwords is interactive and not supported in this simulation", 1);

const getent: CommandFn = (ctx) => {
  const [db, ...keys] = ctx.args;
  const h = ctx.host;
  if (db === "passwd" || db === "group") {
    const content = ctx.fs.nodes[`/etc/${db}`]?.content ?? "";
    const lines = content.split("\n").filter(Boolean);
    const sel = keys.length ? lines.filter((l) => keys.includes(l.split(":")[0])) : lines;
    if (sel.length) ctx.out(sel.join("\n") + "\n");
    return keys.length && sel.length < keys.length ? 2 : 0;
  }
  if (db === "hosts" || db === "ahosts") {
    let code = 0;
    for (const k of keys) {
      const r = resolveForGetent(ctx, k);
      if (r) ctx.out(`${r.padEnd(15)} ${k}\n`);
      else code = 2;
    }
    void h;
    return code;
  }
  return ctx.unsupported(`getent: database '${db ?? ""}' is not supported in this simulation (passwd, group, hosts)`);
};

function resolveForGetent(ctx: CmdCtx, name: string): string | null {
  const r = resolveName(ctx.core.state, ctx.host, name);
  return r.ok ? r.ip : null;
}

// ------------------------------------------------------------------ env / misc

function shQuote(s: string): string {
  return /^[A-Za-z0-9_./=:@%+-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

const env: CommandFn = (ctx) => {
  const assigns: [string, string][] = [];
  let i = 0;
  for (; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === "-i" || a === "-u" || a === "-0") return ctx.unsupported(`env: option '${a}' is not supported in this simulation`);
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(a);
    if (!m) break;
    assigns.push([m[1], m[2]]);
  }
  const rest = ctx.args.slice(i);
  if (!rest.length) {
    const e = { ...ctx.env };
    for (const [k, v] of assigns) e[k] = v;
    ctx.out(Object.entries(e).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    return 0;
  }
  const childEnv = ctx.shell.childEnv(true, ctx.cred);
  for (const [k, v] of assigns) {
    childEnv.vars[k] = v;
    if (!childEnv.exported.includes(k)) childEnv.exported.push(k);
  }
  childEnv.functions = {};
  return ctx.shell.runSource(rest.map(shQuote).join(" "), ctx.io, { env: childEnv, cred: ctx.cred, argv0: "env", args: [] });
};

const printenv: CommandFn = (ctx) => {
  if (!ctx.args.length) {
    ctx.out(Object.entries(ctx.env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    return 0;
  }
  let code = 0;
  for (const k of ctx.args) {
    if (k in ctx.env) ctx.out(ctx.env[k] + "\n");
    else code = 1;
  }
  return code;
};

const which: CommandFn = (ctx) => {
  let code = 0;
  for (const a of ctx.args.filter((x) => !x.startsWith("-"))) {
    if (COMMAND_PATHS[a]) ctx.out(COMMAND_PATHS[a] + "\n");
    else code = 1;
  }
  return code;
};

const date: CommandFn = (ctx) => {
  const t = ctx.core.now();
  for (const a of ctx.args) {
    if (a === "-u" || a === "--utc") continue;
    if (a.startsWith("+")) {
      ctx.out(strftime(a.slice(1), t) + "\n");
      return 0;
    }
    if (a === "-I" || a === "--iso-8601") {
      ctx.out(strftime("%F", t) + "\n");
      return 0;
    }
    if (a === "-R") {
      ctx.out(strftime("%a, %d %b %Y %T +0000", t) + "\n");
      return 0;
    }
    if (a === "-s" || a === "--set") {
      ctx.err("date: cannot set date: Operation not permitted\n");
      return 1;
    }
    return ctx.unsupported(`date: option '${a}' is not supported in this simulation (try date +FORMAT)`);
  }
  ctx.out(fmtDate(t) + "\n");
  return 0;
};

const uptime: CommandFn = (ctx) => {
  if (ctx.args.includes("-p")) {
    ctx.out("up 1 week, 5 days, 3 hours, 4 minutes\n");
    return 0;
  }
  ctx.out(` ${strftime("%T", ctx.core.now())} up 12 days,  3:04,  1 user,  load average: 0.08, 0.03, 0.01\n`);
  return 0;
};

const hostname: CommandFn = (ctx) => {
  const a = ctx.args[0];
  if (!a || a === "-s" || a === "-f" || a === "--fqdn" || a === "-A") {
    ctx.out(ctx.host.name + "\n");
    return 0;
  }
  if (a === "-I" || a === "-i") {
    ctx.out(hostAddrs(ctx.host, false).map((x) => intToIp(x.ip)).join(" ") + " \n");
    return 0;
  }
  if (a.startsWith("-")) return ctx.unsupported(`hostname: option '${a}' is not supported in this simulation`);
  if (ctx.cred.uid !== 0) {
    ctx.err("hostname: you must be root to change the host name\n");
    return 1;
  }
  return ctx.unsupported("hostname: renaming hosts is not supported in this simulation", 1);
};

const uname: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "asnrvmpio", long: { all: "a", "kernel-name": "s", nodename: "n", "kernel-release": "r", machine: "m" } });
  if (!o) return 2;
  const parts = { s: "Linux", n: ctx.host.name, r: "6.8.0-45-generic", v: "#45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024", m: "x86_64", p: "x86_64", i: "x86_64", o: "GNU/Linux" };
  if (o.opts.a) {
    ctx.out(`${parts.s} ${parts.n} ${parts.r} ${parts.v} ${parts.m} ${parts.p} ${parts.i} ${parts.o}\n`);
    return 0;
  }
  const keys = (["s", "n", "r", "v", "m", "p", "i", "o"] as const).filter((k) => o.opts[k]);
  ctx.out((keys.length ? keys.map((k) => parts[k]) : [parts.s]).join(" ") + "\n");
  return 0;
};

const free: CommandFn = (ctx) => {
  if (ctx.args.includes("-h"))
    ctx.out("               total        used        free      shared  buff/cache   available\nMem:           7.8Gi       1.2Gi       4.9Gi       1.0Mi       1.9Gi       6.6Gi\nSwap:          2.0Gi          0B       2.0Gi\n");
  else ctx.out("               total        used        free      shared  buff/cache   available\nMem:         8124184     1258320     5137408        1024     1985432     6865864\nSwap:        2097148           0     2097148\n");
  return 0;
};

const who: CommandFn = (ctx) => {
  ctx.out(`${ctx.shell.env.user.padEnd(8)} pts/0        ${strftime("%F %R", ctx.core.now() - 600)} (10.0.0.1)\n`);
  return 0;
};

const sleep: CommandFn = (ctx) => {
  if (!ctx.args.length || ctx.args.some((a) => !/^\d+(\.\d+)?[smhd]?$/.test(a))) {
    ctx.err(ctx.args.length ? `sleep: invalid time interval '${ctx.args[0]}'\n` : "sleep: missing operand\n");
    return 1;
  }
  return 0;
};

const top: CommandFn = (ctx) => ctx.unsupported(`${ctx.name}: interactive process viewers are not supported in this simulation (try 'ps aux' or 'ps aux --sort' alternatives like 'ps aux | sort -k3 -nr | head')`, 1);

const clear: CommandFn = (ctx) => {
  ctx.shell.markClear();
  return 0;
};

const bash: CommandFn = (ctx) => {
  const args = ctx.args;
  let i = 0;
  while (i < args.length && args[i].startsWith("-") && args[i] !== "-c") {
    if (args[i] === "-x" || args[i] === "-e" || args[i] === "-u" || args[i] === "-l" || args[i] === "--login") {
      i++;
      continue;
    }
    if (args[i] === "-n") return ctx.unsupported(`${ctx.name}: -n (syntax check only) is not supported in this simulation`);
    return ctx.unsupported(`${ctx.name}: option '${args[i]}' is not supported in this simulation`);
  }
  if (args[i] === "-c") {
    const src = args[i + 1];
    if (src === undefined) {
      ctx.err(`${ctx.name}: -c: option requires an argument\n`);
      return 2;
    }
    const childEnv = ctx.shell.childEnv(true, ctx.cred);
    return ctx.shell.runSource(src, ctx.io, { env: childEnv, cred: ctx.cred, argv0: args[i + 2] ?? ctx.name, args: args.slice(i + 3) });
  }
  const script = args[i];
  if (script === undefined) {
    if (ctx.io.stdin.data.length > ctx.io.stdin.pos) {
      const childEnv = ctx.shell.childEnv(true, ctx.cred);
      return ctx.shell.runSource(ctx.io.stdin.readAll(), ctx.io, { env: childEnv, cred: ctx.cred, argv0: ctx.name, args: [] });
    }
    return ctx.unsupported(`${ctx.name}: nested interactive shells are not supported in this simulation (run a script with '${ctx.name} script.sh' or '${ctx.name} -c "..."')`, 1);
  }
  return ctx.shell.runScriptFile(script, args.slice(i + 1), ctx.io, ctx.cred, script);
};

const editor: CommandFn = (ctx) =>
  ctx.unsupported(`${ctx.name}: interactive editors are not available in this terminal; use the file editor panel (or echo/printf/sed/tee to edit files)`, 127);

export const SYSTEM_COMMANDS: Record<string, CommandFn> = {
  id,
  whoami,
  groups,
  ps,
  kill,
  pgrep,
  pkill,
  systemctl,
  service,
  journalctl,
  useradd,
  adduser: useradd,
  usermod,
  groupadd,
  gpasswd,
  userdel,
  su,
  passwd,
  getent,
  env,
  printenv,
  which,
  date,
  uptime,
  hostname,
  uname,
  free,
  who,
  w: who,
  sleep,
  top,
  htop: top,
  clear,
  bash,
  sh: bash,
  dash: bash,
  vi: editor,
  vim: editor,
  nano: editor,
  emacs: editor,
};

export { idLine };
