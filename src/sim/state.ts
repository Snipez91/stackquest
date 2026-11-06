/** Build the initial mutable state from a parsed scenario, plus user helpers. */
import type { ParsedSimScenario } from "./schema";
import type { Cred, FsNode, HostState, Session, ShellEnv, SimState, SimUser } from "./types";
import { DEFAULT_UMASK } from "./fs";
import { COMMAND_PATHS } from "./commands/paths";
import { dirname, normalizePath, parseClock } from "./util";

export function getUser(host: HostState, name: string): SimUser | undefined {
  return host.users.find((u) => u.name === name);
}

export function userGroups(host: HostState, name: string): string[] {
  const u = getUser(host, name);
  if (!u) return [];
  const primary = host.groups.find((g) => g.name === name) ? name : (u.groups[0] ?? name);
  const out = [primary];
  for (const g of u.groups) if (!out.includes(g)) out.push(g);
  // also groups that list nobody but share the name
  return out;
}

export function credFor(host: HostState, name: string): Cred {
  const u = getUser(host, name);
  return { user: name, uid: u ? u.uid : 65534, groups: userGroups(host, name) };
}

export function gidOf(host: HostState, group: string): number {
  return host.groups.find((g) => g.name === group)?.gid ?? 65534;
}

export function regenAccounts(host: HostState, now: number): void {
  const passwd = host.users
    .map((u) => {
      const primary = host.groups.find((g) => g.name === u.name)?.gid ?? gidOf(host, u.groups[0] ?? u.name);
      return `${u.name}:x:${u.uid}:${primary}:${u.name === "root" ? "root" : u.name}:${u.home}:${u.shell}`;
    })
    .join("\n");
  const group = host.groups
    .map((g) => {
      const members = host.users.filter((u) => u.groups.includes(g.name) && u.name !== g.name).map((u) => u.name);
      return `${g.name}:x:${g.gid}:${members.join(",")}`;
    })
    .join("\n");
  setFile(host, "/etc/passwd", passwd + "\n", 0o644, now);
  setFile(host, "/etc/group", group + "\n", 0o644, now);
}

function setFile(host: HostState, path: string, content: string, mode: number, now: number): void {
  const n = host.fs[path];
  if (n) {
    n.content = content;
    n.mtime = now;
  } else host.fs[path] = { type: "file", content, mode, owner: "root", group: "root", mtime: now };
}

function ensureDir(fs: Record<string, FsNode>, path: string, now: number, mode = 0o755, owner = "root", group = "root"): void {
  if (path !== "/") ensureDir(fs, dirname(path), now);
  if (!fs[path]) fs[path] = { type: "dir", content: "", mode, owner, group, mtime: now };
}

export function nextFreeGid(host: HostState): number {
  let g = 1001;
  while (host.groups.some((x) => x.gid === g) || host.users.some((u) => u.uid === g)) g++;
  return g;
}

function macFor(host: string, iface: string, i: number): string {
  let h = 0;
  for (const c of host + "/" + iface) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const b = [0x52, 0x54, 0x00, (h >> 16) & 0xff, (h >> 8) & 0xff, (h + i) & 0xff];
  return b.map((x) => x.toString(16).padStart(2, "0")).join(":");
}

export function buildHost(h: ParsedSimScenario["hosts"][number], now: number): HostState {
  const users = h.users.map((u) => ({ ...u, groups: [...u.groups] }));
  if (!users.some((u) => u.name === "root")) users.unshift({ name: "root", uid: 0, groups: [], home: "/root", shell: "/bin/bash" });
  const groups = h.groups.map((g) => ({ ...g }));
  const host: HostState = {
    name: h.name,
    users,
    groups,
    fs: {},
    processes: h.processes.map((p) => ({ ...p, listens: p.listens.map((l) => ({ ...l })) })),
    services: h.services.map((s) => ({ ...JSON.parse(JSON.stringify(s)), pid: null, activeSince: null })),
    interfaces: h.interfaces.map((i, idx) => ({ ...i, mac: i.mac ?? macFor(h.name, i.name, idx) })),
    routes: h.routes.map((r) => ({ ...r })),
    ipForward: h.ipForward,
    firewall: { enabled: h.firewall.enabled, defaultInbound: h.firewall.defaultInbound, rules: h.firewall.rules.map((r) => ({ ...r })) },
    dnsZones: { ...h.dnsZones },
    dhcpPool: h.dhcpPool ? { ...h.dhcpPool, range: [h.dhcpPool.range[0], h.dhcpPool.range[1]] } : undefined,
    env: { ...h.env },
    nextPid: 1000,
    leases: {},
  };
  // groups: root, per-user private groups, referenced supplementary groups
  if (!groups.some((g) => g.name === "root")) groups.unshift({ name: "root", gid: 0 });
  for (const u of users) if (!groups.some((g) => g.name === u.name)) groups.push({ name: u.name, gid: u.uid });
  for (const u of users) for (const gn of u.groups) if (!groups.some((g) => g.name === gn)) groups.push({ name: gn, gid: nextFreeGid(host) });
  for (const f of h.files) for (const gn of [f.group]) if (!groups.some((g) => g.name === gn)) groups.push({ name: gn, gid: nextFreeGid(host) });

  if (!host.interfaces.some((i) => i.name === "lo")) host.interfaces.unshift({ name: "lo", address: "127.0.0.1/8", up: true, dhcp: false, mac: "00:00:00:00:00:00" });

  // skeleton filesystem
  const fs = host.fs;
  for (const d of ["/", "/bin", "/sbin", "/usr", "/usr/bin", "/usr/sbin", "/usr/local", "/usr/local/bin", "/lib", "/etc", "/etc/systemd", "/etc/systemd/system", "/home", "/opt", "/srv", "/var", "/var/log", "/var/lib", "/run", "/dev", "/mnt", "/proc"]) ensureDir(fs, d, now);
  ensureDir(fs, "/root", now, 0o700);
  fs["/tmp"] = { type: "dir", content: "", mode: 0o1777, owner: "root", group: "root", mtime: now };
  fs["/var/tmp"] = { type: "dir", content: "", mode: 0o1777, owner: "root", group: "root", mtime: now };
  fs["/dev/null"] = { type: "file", content: "", mode: 0o666, owner: "root", group: "root", mtime: now };
  for (const [cmd, path] of Object.entries(COMMAND_PATHS)) {
    if (!fs[path]) fs[path] = { type: "file", content: `\x7fELF ${cmd}`, mode: 0o755, owner: "root", group: "root", mtime: now };
  }
  fs["/etc/hostname"] = { type: "file", content: h.name + "\n", mode: 0o644, owner: "root", group: "root", mtime: now };
  fs["/etc/hosts"] = { type: "file", content: `127.0.0.1\tlocalhost\n127.0.1.1\t${h.name}\n`, mode: 0o644, owner: "root", group: "root", mtime: now };
  fs["/etc/os-release"] = {
    type: "file",
    content: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\n',
    mode: 0o644, owner: "root", group: "root", mtime: now,
  };
  fs["/etc/shadow"] = { type: "file", content: users.map((u) => `${u.name}:!:20000:0:99999:7:::`).join("\n") + "\n", mode: 0o640, owner: "root", group: "shadow", mtime: now };
  if (!groups.some((g) => g.name === "shadow")) groups.push({ name: "shadow", gid: 42 });
  for (const u of users) {
    if (u.name === "root") continue;
    ensureDir(fs, dirname(u.home), now);
    if (!fs[u.home]) fs[u.home] = { type: "dir", content: "", mode: 0o755, owner: u.name, group: u.name, mtime: now };
  }
  for (const s of host.services) {
    const unit = `/lib/systemd/system/${s.name}.service`;
    ensureDir(fs, "/lib/systemd/system", now);
    fs[unit] = {
      type: "file",
      content: `[Unit]\nDescription=${s.description || s.name}\n\n[Service]\nUser=${s.execUser}\nExecStart=${s.command}\n\n[Install]\nWantedBy=multi-user.target\n`,
      mode: 0o644, owner: "root", group: "root", mtime: now,
    };
  }

  // scenario files: directories first (by depth), then the rest
  const files = [...h.files].sort((a, b) => {
    const ad = a.type === "dir" ? 0 : 1;
    const bd = b.type === "dir" ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.path.split("/").length - b.path.split("/").length;
  });
  for (const f of files) {
    const path = normalizePath(f.path);
    // implicit parents inside a user's home belong to that user (like they would after mkdir -p)
    const homeOwner = users.find((u) => u.name !== "root" && u.home !== "/" && dirname(path).startsWith(u.home + "/"));
    if (homeOwner) {
      ensureDir(fs, homeOwner.home, now, 0o755, homeOwner.name, homeOwner.name);
      const rel = dirname(path).slice(homeOwner.home.length + 1).split("/");
      let cur = homeOwner.home;
      for (const seg of rel) {
        cur += "/" + seg;
        if (!fs[cur]) fs[cur] = { type: "dir", content: "", mode: 0o755, owner: homeOwner.name, group: homeOwner.name, mtime: now };
      }
    }
    ensureDir(fs, dirname(path), now);
    const defMode = f.type === "dir" ? 0o755 : f.type === "symlink" ? 0o777 : 0o644;
    fs[path] = {
      type: f.type,
      content: f.type === "file" ? (f.content ?? "") : "",
      target: f.type === "symlink" ? f.target ?? "" : undefined,
      mode: f.mode ? parseInt(f.mode, 8) : defMode,
      owner: f.owner,
      group: f.group,
      mtime: now,
    };
    if (fs[path].target === undefined) delete fs[path].target;
  }
  if (!h.files.some((f) => f.path === "/etc/passwd" || f.path === "/etc/group")) regenAccounts(host, now);

  // pids
  let maxPid = Math.max(999, ...host.processes.map((p) => p.pid));
  // implicit sshd so `ssh` works unless the scenario models ssh itself
  const modelsSsh = host.services.some((s) => s.name === "ssh" || s.name === "sshd") || host.processes.some((p) => p.listens.some((l) => l.port === 22));
  if (!modelsSsh && !host.processes.some((p) => p.pid === 812)) {
    host.processes.push({ pid: 812, user: "root", command: "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups", cpu: 0, mem: 0.1, listens: [{ port: 22, proto: "tcp" }] });
  }
  host.nextPid = maxPid + 1;
  for (const s of host.services) {
    if (s.state === "active") {
      s.pid = host.nextPid;
      host.nextPid += 7;
      s.activeSince = now - 3600;
    }
  }
  maxPid = host.nextPid;
  return host;
}

export function makeSession(host: HostState, user: string, cwd: string | undefined, kind: Session["kind"]): Session {
  const u = getUser(host, user);
  const home = u?.home ?? "/";
  const vars: Record<string, string> = {
    HOME: home,
    USER: user,
    LOGNAME: user,
    SHELL: u?.shell ?? "/bin/bash",
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    LANG: "C.UTF-8",
    TERM: "xterm-256color",
    HOSTNAME: host.name,
    ...host.env,
  };
  const dir = cwd ? normalizePath(cwd, home) : home;
  vars.PWD = dir;
  return {
    host: host.name,
    user,
    cwd: dir,
    oldpwd: dir,
    vars,
    exported: Object.keys(vars),
    functions: {},
    umask: DEFAULT_UMASK,
    kind,
  };
}

export function buildState(scenario: ParsedSimScenario): SimState {
  const now = parseClock(scenario.clock);
  const hosts: Record<string, HostState> = {};
  const hostOrder: string[] = [];
  for (const h of scenario.hosts) {
    hosts[h.name] = buildHost(h, now);
    hostOrder.push(h.name);
  }
  const startHost = hosts[scenario.start.host] ?? hosts[hostOrder[0]];
  const session = makeSession(startHost, scenario.start.user, scenario.start.cwd, "login");
  return {
    version: 1,
    scenario,
    clock: now,
    hostOrder,
    hosts,
    sessions: [session],
    history: [],
    lastExit: 0,
    rng: 12345,
  };
}

export function copyEnv(e: ShellEnv): ShellEnv {
  return { ...e, vars: { ...e.vars }, exported: [...e.exported], functions: { ...e.functions } };
}
