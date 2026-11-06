/** systemd-like service lifecycle computed from state. */
import { Fs, FsError, ERRNO_MSG, ERRNO_NUM, R, W } from "./fs";
import { listeners } from "./net";
import { credFor, getUser } from "./state";
import type { HostState, ServiceState, SimState } from "./types";
import { basename, fmtJournal } from "./util";

export function findService(h: HostState, name: string): ServiceState | undefined {
  const n = name.replace(/\.service$/, "");
  return h.services.find((s) => s.name === n);
}

export function procName(s: ServiceState): string {
  return basename(s.command.trim().split(/\s+/)[0] ?? s.name);
}

function jline(state: SimState, h: HostState, who: string, msg: string): string {
  return `${fmtJournal(state.clock)} ${h.name} ${who}: ${msg}`;
}

function unitTitle(s: ServiceState): string {
  return `${s.name}.service${s.description ? " - " + s.description : ""}`;
}

/** Why the service can't start (first failing check), or null if it can. */
export function startProblem(state: SimState, h: HostState, s: ServiceState, pid: number): { line: string; status: string } | null {
  const proc = `${procName(s)}[${pid}]`;
  if (!getUser(h, s.execUser)) {
    return { line: jline(state, h, `systemd[1]`, `${s.name}.service: Failed to determine user credentials: No such process`), status: "217/USER" };
  }
  const cred = credFor(h, s.execUser);
  const fs = new Fs(h, () => state.clock);
  const describe = (e: unknown) => (e instanceof FsError ? `${ERRNO_NUM[e.errno]}: ${ERRNO_MSG[e.errno]}` : String(e));
  for (const p of s.requiresReadable) {
    try {
      fs.access(p, cred, R);
    } catch (e) {
      return { line: jline(state, h, proc, `open() "${p}" failed (${describe(e)})`), status: "1/FAILURE" };
    }
  }
  for (const p of s.requiresWritable) {
    try {
      fs.access(p, cred, W);
    } catch (e) {
      return { line: jline(state, h, proc, `open() "${p}" failed (${describe(e)})`), status: "1/FAILURE" };
    }
  }
  for (const c of s.configChecks) {
    let content: string;
    try {
      content = fs.readFile(c.path, null);
    } catch (e) {
      return { line: jline(state, h, proc, `open() "${c.path}" failed (${describe(e)})`), status: "1/FAILURE" };
    }
    let ok = false;
    try {
      ok = new RegExp(c.pattern, "m").test(content);
    } catch {
      ok = false;
    }
    if (!ok) return { line: jline(state, h, proc, c.error), status: "1/FAILURE" };
  }
  const held = listeners(h).filter((l) => l.service !== s.name);
  for (const l of s.listens) {
    const holder = held.find((x) => x.port === l.port && x.proto === l.proto);
    if (holder) return { line: jline(state, h, proc, `bind() to ${l.address ?? "0.0.0.0"}:${l.port} failed (98: Address already in use)`), status: "1/FAILURE" };
  }
  return null;
}

/** Re-read bind address / port from the service's config file (see SimServiceSchema.listenFrom). */
function applyListenFrom(state: SimState, h: HostState, s: ServiceState): void {
  const lf = s.listenFrom;
  if (!lf) return;
  let content: string;
  try {
    content = new Fs(h, () => state.clock).readFile(lf.path, null);
  } catch {
    return;
  }
  const grab = (pattern: string | undefined): string | undefined => {
    if (!pattern) return undefined;
    try {
      return new RegExp(pattern, "m").exec(content)?.[1];
    } catch {
      return undefined;
    }
  };
  const addr = grab(lf.addressPattern);
  const port = grab(lf.portPattern);
  s.listens = s.listens.map((l) => ({
    ...l,
    ...(addr !== undefined && /^(\d{1,3}\.){3}\d{1,3}$/.test(addr) ? { address: addr } : {}),
    ...(port !== undefined && /^\d{1,5}$/.test(port) ? { port: parseInt(port, 10) } : {}),
  }));
}

export type StartResult = { ok: true } | { ok: false; line: string };

export function startService(state: SimState, h: HostState, s: ServiceState): StartResult {
  if (s.state === "active") return { ok: true };
  const pid = h.nextPid;
  h.nextPid += 3;
  s.journal.push(jline(state, h, "systemd[1]", `Starting ${unitTitle(s)}...`));
  applyListenFrom(state, h, s);
  const prob = startProblem(state, h, s, pid);
  if (prob) {
    s.state = "failed";
    s.pid = null;
    s.activeSince = null;
    s.journal.push(prob.line);
    s.journal.push(jline(state, h, "systemd[1]", `${s.name}.service: Main process exited, code=exited, status=${prob.status}`));
    s.journal.push(jline(state, h, "systemd[1]", `${s.name}.service: Failed with result 'exit-code'.`));
    s.journal.push(jline(state, h, "systemd[1]", `Failed to start ${unitTitle(s)}.`));
    return { ok: false, line: prob.line };
  }
  s.state = "active";
  s.pid = pid;
  s.activeSince = state.clock;
  s.journal.push(jline(state, h, "systemd[1]", `Started ${unitTitle(s)}.`));
  return { ok: true };
}

export function stopService(state: SimState, h: HostState, s: ServiceState): void {
  if (s.state === "active") {
    s.journal.push(jline(state, h, "systemd[1]", `Stopping ${unitTitle(s)}...`));
    s.journal.push(jline(state, h, "systemd[1]", `${s.name}.service: Deactivated successfully.`));
    s.journal.push(jline(state, h, "systemd[1]", `Stopped ${unitTitle(s)}.`));
  }
  s.state = "inactive";
  s.pid = null;
  s.activeSince = null;
}

/** A signal delivered to a service's main pid. */
export function killService(state: SimState, h: HostState, s: ServiceState, sig: number): void {
  if (sig === 9) {
    s.journal.push(jline(state, h, "systemd[1]", `${s.name}.service: Main process exited, code=killed, status=9/KILL`));
    s.journal.push(jline(state, h, "systemd[1]", `${s.name}.service: Failed with result 'signal'.`));
    s.state = "failed";
  } else {
    s.journal.push(jline(state, h, "systemd[1]", `${s.name}.service: Deactivated successfully.`));
    s.state = "inactive";
  }
  s.pid = null;
  s.activeSince = null;
}
