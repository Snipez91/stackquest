/** Filesystem commands: ls, cat, head, tail, touch, mkdir, rm, cp, mv, ln, chmod, chown, find, stat, ... */
import { FsError, ERRNO_MSG, hasPerm, R, W, X, type Resolved } from "../fs";
import type { FsNode } from "../types";
import { gidOf, getUser } from "../state";
import { basename, dirname, fmtIso, fmtLsDate, globMatch, hash, humanSize, joinPath, modeString, normalizePath, octal, splitLines } from "../util";
import { parseOpts, type OptSpec, type Parsed } from "./opts";
import type { CmdCtx, CommandFn } from "./types";

/** Parse options; on failure prints an honest message and returns null. */
export function opts(ctx: CmdCtx, spec: OptSpec, args = ctx.args): Parsed | null {
  const r = parseOpts(args, spec);
  if (!r.ok) {
    if (r.missingArg) {
      ctx.err(`${ctx.name}: option requires an argument -- '${r.bad.replace(/^-+/, "")}'\n`);
      return null;
    }
    ctx.unsupported(`${ctx.name}: option '${r.bad}' is not supported in this simulation (try 'man ${ctx.name}')`);
    return null;
  }
  return r;
}

function errnoOf(e: unknown): string {
  if (e instanceof FsError) return ERRNO_MSG[e.errno];
  throw e;
}

function nodeSize(n: FsNode): number {
  if (n.type === "dir") return 4096;
  if (n.type === "symlink") return (n.target ?? "").length;
  return n.content.length;
}

function blocksK(n: FsNode): number {
  if (n.type === "symlink") return 0;
  if (n.type === "dir") return 4;
  return Math.ceil(n.content.length / 4096) * 4;
}

function sortKey(name: string): string {
  return name.replace(/^[^A-Za-z0-9]+/, "").toLowerCase() || name;
}

function columns(names: string[], width = 80): string {
  if (!names.length) return "";
  const total = names.reduce((a, n) => a + n.length + 2, 0);
  if (total <= width) return names.join("  ") + "\n";
  const w = Math.max(...names.map((n) => n.length)) + 2;
  const cols = Math.max(1, Math.floor(width / w));
  const rows = Math.ceil(names.length / cols);
  let out = "";
  for (let r = 0; r < rows; r++) {
    const line: string[] = [];
    for (let c = 0; c < cols; c++) {
      const i = c * rows + r;
      if (i < names.length) line.push(names[i].padEnd(w));
    }
    out += line.join("").trimEnd() + "\n";
  }
  return out;
}

// ------------------------------------------------------------------ ls

const ls: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "lahRd1AtrSnFig", long: { all: "a", "almost-all": "A", "human-readable": "h", recursive: "R", directory: "d" } });
  if (!o) return 2;
  if (o.opts.i || o.opts.F) return ctx.unsupported(`ls: option '-${o.opts.i ? "i" : "F"}' is not supported in this simulation`);
  const long = !!(o.opts.l || o.opts.n || o.opts.g);
  const fs = ctx.fs;
  const now = ctx.core.now();
  let code = 0;
  const operands = o.operands.length ? o.operands : ["."];

  const sortEntries = (list: { name: string; node: FsNode }[]) => {
    list.sort((a, b) => {
      if (o.opts.t) return b.node.mtime - a.node.mtime || (sortKey(a.name) < sortKey(b.name) ? -1 : 1);
      if (o.opts.S) return nodeSize(b.node) - nodeSize(a.node) || (a.name < b.name ? -1 : 1);
      const ka = sortKey(a.name);
      const kb = sortKey(b.name);
      return ka < kb ? -1 : ka > kb ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    if (o.opts.r) list.reverse();
    return list;
  };

  const fmtLong = (list: { name: string; node: FsNode }[]): string => {
    const rows = list.map(({ name, node }) => {
      const size = o.opts.h ? humanSize(nodeSize(node)) : String(nodeSize(node));
      const links = node.type === "dir" ? 2 : 1;
      const owner = o.opts.n ? String(getUser(ctx.host, node.owner)?.uid ?? node.owner) : node.owner;
      const group = o.opts.n ? String(gidOf(ctx.host, node.group)) : node.group;
      return {
        mode: modeString(node.type, node.mode),
        links: String(links),
        owner,
        group,
        size,
        date: fmtLsDate(node.mtime, now),
        name: name + (node.type === "symlink" ? ` -> ${node.target}` : ""),
      };
    });
    const w = (k: "links" | "owner" | "group" | "size") => Math.max(0, ...rows.map((r) => r[k].length));
    const wl = w("links"), wo = w("owner"), wg = w("group"), ws = w("size");
    return rows
      .map((r) => [r.mode, r.links.padStart(wl), r.owner.padEnd(wo), ...(o.opts.g ? [] : [r.group.padEnd(wg)]), r.size.padStart(ws), r.date, r.name].join(" "))
      .map((l) => l + "\n")
      .join("");
  };

  const render = (list: { name: string; node: FsNode }[], withTotal: boolean): string => {
    if (long) {
      let s = "";
      if (withTotal) {
        const t = list.reduce((a, e) => a + blocksK(e.node), 0);
        s += `total ${o.opts.h ? humanSize(t * 1024) : t}\n`;
      }
      return s + fmtLong(list);
    }
    const names = list.map((e) => e.name);
    if (ctx.io.tty && !o.opts["1"]) return columns(names);
    return names.map((n) => n + "\n").join("");
  };

  const files: { name: string; node: FsNode }[] = [];
  const dirs: { arg: string; real: string }[] = [];
  for (const arg of operands) {
    const p = ctx.abs(arg);
    let r: Resolved;
    try {
      const l = fs.resolve(p, ctx.cred, false);
      r = l.node.type === "symlink" && (!long || arg.endsWith("/")) ? fs.resolve(p, ctx.cred, true) : l;
    } catch (e) {
      ctx.err(`ls: cannot access '${arg}': ${errnoOf(e)}\n`);
      code = 2;
      continue;
    }
    if (r.node.type === "dir" && !o.opts.d) dirs.push({ arg, real: r.path });
    else files.push({ name: arg, node: r.node });
  }
  let out = "";
  if (files.length) out += render(sortEntries(files), false);
  const showHeaders = operands.length > 1 || !!o.opts.R;
  const listDir = (arg: string, real: string, first: boolean) => {
    let names: string[];
    try {
      names = fs.readdir(real, ctx.cred).names;
    } catch (e) {
      ctx.err(`ls: cannot open directory '${arg}': ${errnoOf(e)}\n`);
      code = 2;
      return;
    }
    const dirNode = fs.nodes[real];
    let entries = names.map((n) => ({ name: n, node: fs.nodes[joinPath(real, n)] }));
    if (!o.opts.a && !o.opts.A) entries = entries.filter((e) => !e.name.startsWith("."));
    if (o.opts.a) entries.push({ name: ".", node: dirNode }, { name: "..", node: fs.nodes[dirname(real)] ?? dirNode });
    sortEntries(entries);
    if (showHeaders) out += (first && !files.length ? "" : "\n") + `${arg}:\n`;
    out += render(entries, true);
    if (o.opts.R) {
      for (const e of entries) {
        if (e.node.type === "dir" && e.name !== "." && e.name !== "..") listDir(arg.replace(/\/$/, "") + "/" + e.name, joinPath(real, e.name), false);
      }
    }
  };
  dirs.forEach((d, i) => listDir(d.arg, d.real, i === 0));
  ctx.out(out);
  return code;
};

// ------------------------------------------------------------------ cat / head / tail

function readInputs(ctx: CmdCtx, files: string[], each: (name: string, content: string) => void): number {
  let code = 0;
  if (!files.length) files = ["-"];
  for (const f of files) {
    if (f === "-") {
      each("-", ctx.io.stdin.readAll());
      continue;
    }
    try {
      each(f, ctx.fs.readFile(ctx.abs(f), ctx.cred));
    } catch (e) {
      code = ctx.fsErr(e, f);
    }
  }
  return code;
}

const cat: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "nbEAsTv" });
  if (!o) return 2;
  let n = 0;
  return readInputs(ctx, o.operands, (_name, c) => {
    if (o.opts.n || o.opts.b || o.opts.E || o.opts.A) {
      const lines = c.split("\n");
      const trailing = c.endsWith("\n");
      if (trailing) lines.pop();
      ctx.out(
        lines
          .map((l) => {
            const body = o.opts.E || o.opts.A ? l + "$" : l;
            if (o.opts.b && l === "") return body;
            return o.opts.n || o.opts.b ? `${String(++n).padStart(6)}\t${body}` : body;
          })
          .join("\n") + (trailing ? "\n" : ""),
      );
    } else ctx.out(c);
  });
};

function headTail(ctx: CmdCtx, tail: boolean): number {
  const o = opts(ctx, { flags: tail ? "qvF" : "qv", withArg: "nc", numeric: true, long: { "lines=": "n", "bytes=": "c" } });
  if (!o) return 2;
  if (tail && (o.opts.f || o.opts.F)) return ctx.unsupported("tail: -f (follow) is not supported in this simulation (the log will not grow)");
  let nStr = (o.opts.n as string) ?? (o.opts["#"] as string) ?? "10";
  const bytes = o.opts.c as string | undefined;
  const fromStart = tail && nStr.startsWith("+");
  nStr = nStr.replace(/^[+]/, "");
  const neg = !tail && nStr.startsWith("-");
  const n = parseInt(nStr.replace(/^-/, ""), 10);
  if (!Number.isFinite(n)) {
    ctx.err(`${ctx.name}: invalid number of lines: '${nStr}'\n`);
    return 1;
  }
  const files = o.operands;
  return readInputs(ctx, files, (name, c) => {
    if (files.length > 1) ctx.out(`==> ${name === "-" ? "standard input" : name} <==\n`);
    if (bytes !== undefined) {
      const b = parseInt(bytes, 10);
      ctx.out(tail ? c.slice(Math.max(0, c.length - b)) : c.slice(0, b));
      return;
    }
    const lines = splitLines(c);
    let sel: string[];
    if (tail) sel = fromStart ? lines.slice(Math.max(0, n - 1)) : n === 0 ? [] : lines.slice(-n);
    else sel = neg ? lines.slice(0, Math.max(0, lines.length - n)) : lines.slice(0, n);
    const noTrailingNl = !c.endsWith("\n") && sel.length && sel[sel.length - 1] === lines[lines.length - 1];
    ctx.out(sel.join("\n") + (sel.length && !noTrailingNl ? "\n" : ""));
  });
}

// ------------------------------------------------------------------ touch / mkdir / rmdir / rm

const touch: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "camh", withArg: "dt", long: { "no-create": "c" } });
  if (!o) return 2;
  if (o.opts.d || o.opts.t) return ctx.unsupported("touch: setting explicit timestamps (-d/-t) is not supported in this simulation");
  if (!o.operands.length) {
    ctx.err("touch: missing file operand\n");
    return 1;
  }
  let code = 0;
  for (const f of o.operands) {
    const p = ctx.abs(f);
    const r = ctx.fs.tryResolve(p, ctx.cred, true);
    try {
      if (r) {
        if (r.node.owner !== ctx.cred.user && !hasPerm(r.node, ctx.cred, W)) throw new FsError("EACCES", f);
        r.node.mtime = ctx.core.now();
      } else if (!o.opts.c) ctx.fs.writeFile(p, "", ctx.cred, { umask: ctx.umask });
    } catch (e) {
      ctx.err(`touch: cannot touch '${f}': ${errnoOf(e)}\n`);
      code = 1;
    }
  }
  return code;
};

const mkdir: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "pv", withArg: "m", long: { parents: "p", verbose: "v", "mode=": "m" } });
  if (!o) return 2;
  if (!o.operands.length) {
    ctx.err("mkdir: missing operand\n");
    return 1;
  }
  let mode: number | undefined;
  if (o.opts.m) {
    const m = parseMode(o.opts.m as string, 0o777, true);
    if (m === null) {
      ctx.err(`mkdir: invalid mode '${o.opts.m}'\n`);
      return 1;
    }
    mode = m;
  }
  let code = 0;
  for (const d of o.operands) {
    const p = ctx.abs(d);
    try {
      if (o.opts.p) {
        const comps = p.split("/").filter(Boolean);
        let cur = "";
        for (let i = 0; i < comps.length; i++) {
          cur += "/" + comps[i];
          const ex = ctx.fs.tryResolve(cur, null, true);
          if (ex) {
            if (ex.node.type !== "dir") throw new FsError("ENOTDIR", d);
            continue;
          }
          ctx.fs.mkdir(cur, ctx.cred, { umask: ctx.umask, mode: i === comps.length - 1 ? mode : undefined });
          if (o.opts.v) ctx.out(`mkdir: created directory '${cur}'\n`);
        }
      } else {
        ctx.fs.mkdir(p, ctx.cred, { umask: ctx.umask, mode });
        if (o.opts.v) ctx.out(`mkdir: created directory '${d}'\n`);
      }
    } catch (e) {
      ctx.err(`mkdir: cannot create directory '${d}': ${errnoOf(e)}\n`);
      code = 1;
    }
  }
  return code;
};

const rmdir: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "pv" });
  if (!o) return 2;
  let code = 0;
  for (const d of o.operands) {
    try {
      ctx.fs.rmdir(ctx.abs(d), ctx.cred);
    } catch (e) {
      ctx.err(`rmdir: failed to remove '${d}': ${errnoOf(e)}\n`);
      code = 1;
    }
  }
  return code;
};

const rm: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "rRfvdi", long: { recursive: "r", force: "f", verbose: "v", "no-preserve-root": "P" } });
  if (!o) return 2;
  if (o.opts.i) return ctx.unsupported("rm: interactive mode (-i) is not supported in this simulation");
  const rec = !!(o.opts.r || o.opts.R);
  if (!o.operands.length && !o.opts.f) {
    ctx.err("rm: missing operand\n");
    return 1;
  }
  let code = 0;
  for (const f of o.operands) {
    const p = ctx.abs(f);
    if (p === "/" && rec) {
      ctx.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n");
      code = 1;
      continue;
    }
    const r = ctx.fs.tryResolve(p, null, false);
    if (!r) {
      if (!o.opts.f) {
        ctx.err(`rm: cannot remove '${f}': No such file or directory\n`);
        code = 1;
      }
      continue;
    }
    if (r.node.type === "dir") {
      if (!rec && !o.opts.d) {
        ctx.err(`rm: cannot remove '${f}': Is a directory\n`);
        code = 1;
        continue;
      }
      if (!rec) {
        try {
          ctx.fs.rmdir(p, ctx.cred);
        } catch (e) {
          ctx.err(`rm: cannot remove '${f}': ${errnoOf(e)}\n`);
          code = 1;
        }
        continue;
      }
      const ok = ctx.fs.removeTree(p, ctx.cred, (e) => ctx.err(`rm: cannot remove '${e.path}': ${ERRNO_MSG[e.errno]}\n`));
      if (!ok) code = 1;
      else if (o.opts.v) ctx.out(`removed directory '${f}'\n`);
      continue;
    }
    try {
      ctx.fs.unlink(p, ctx.cred);
      if (o.opts.v) ctx.out(`removed '${f}'\n`);
    } catch (e) {
      ctx.err(`rm: cannot remove '${f}': ${errnoOf(e)}\n`);
      code = 1;
    }
  }
  return code;
};

// ------------------------------------------------------------------ cp / mv / ln

const cp: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "rRapfvnuiT", long: { recursive: "r", archive: "a", preserve: "p", force: "f", verbose: "v" } });
  if (!o) return 2;
  if (o.opts.i) return ctx.unsupported("cp: interactive mode (-i) is not supported in this simulation");
  const rec = !!(o.opts.r || o.opts.R || o.opts.a);
  const preserve = !!(o.opts.p || o.opts.a);
  if (o.operands.length < 2) {
    ctx.err(o.operands.length ? `cp: missing destination file operand after '${o.operands[0]}'\n` : "cp: missing file operand\n");
    return 1;
  }
  const srcs = o.operands.slice(0, -1);
  const dstArg = o.operands[o.operands.length - 1];
  const dstAbs = ctx.abs(dstArg);
  const dstNode = ctx.fs.tryResolve(dstAbs, ctx.cred, true);
  const dstIsDir = dstNode?.node.type === "dir";
  if (srcs.length > 1 && !dstIsDir) {
    ctx.err(`cp: target '${dstArg}' is not a directory\n`);
    return 1;
  }
  let code = 0;
  const copyOne = (src: string, srcDisp: string, dst: string, dstDisp: string): void => {
    let r: Resolved;
    try {
      r = ctx.fs.resolve(src, ctx.cred, true);
    } catch (e) {
      ctx.err(`cp: cannot stat '${srcDisp}': ${errnoOf(e)}\n`);
      code = 1;
      return;
    }
    if (r.node.type === "dir") {
      if (!rec) {
        ctx.err(`cp: -r not specified; omitting directory '${srcDisp}'\n`);
        code = 1;
        return;
      }
      if ((dst + "/").startsWith(r.path + "/")) {
        ctx.err(`cp: cannot copy a directory, '${srcDisp}', into itself, '${dstDisp}'\n`);
        code = 1;
        return;
      }
      let names: string[];
      try {
        names = ctx.fs.readdir(r.path, ctx.cred).names;
      } catch (e) {
        ctx.err(`cp: cannot access '${srcDisp}': ${errnoOf(e)}\n`);
        code = 1;
        return;
      }
      if (!ctx.fs.tryResolve(dst, null, true)) {
        try {
          ctx.fs.mkdir(dst, ctx.cred, { mode: preserve ? r.node.mode : r.node.mode & ~ctx.umask });
        } catch (e) {
          ctx.err(`cp: cannot create directory '${dstDisp}': ${errnoOf(e)}\n`);
          code = 1;
          return;
        }
      }
      for (const n of names) copyOne(joinPath(r.path, n), srcDisp.replace(/\/$/, "") + "/" + n, joinPath(dst, n), dstDisp.replace(/\/$/, "") + "/" + n);
      return;
    }
    if (!hasPerm(r.node, ctx.cred, R)) {
      ctx.err(`cp: cannot open '${srcDisp}' for reading: Permission denied\n`);
      code = 1;
      return;
    }
    if (o.opts.n && ctx.fs.exists(dst)) return;
    try {
      const existed = ctx.fs.exists(dst);
      const real = ctx.fs.writeFile(dst, r.node.content, ctx.cred, { mode: r.node.mode & ~ctx.umask & 0o777 });
      const nn = ctx.fs.nodes[real];
      if (preserve) {
        nn.mode = r.node.mode;
        nn.mtime = r.node.mtime;
        if (ctx.cred.uid === 0) {
          nn.owner = r.node.owner;
          nn.group = r.node.group;
        }
      } else if (!existed) nn.mode = r.node.mode & ~ctx.umask & 0o777;
      if (o.opts.v) ctx.out(`'${srcDisp}' -> '${dstDisp}'\n`);
    } catch (e) {
      ctx.err(`cp: cannot create regular file '${dstDisp}': ${errnoOf(e)}\n`);
      code = 1;
    }
  };
  for (const s of srcs) {
    const target = dstIsDir ? joinPath(dstNode!.path, basename(ctx.abs(s))) : dstAbs;
    const disp = dstIsDir ? dstArg.replace(/\/$/, "") + "/" + basename(s) : dstArg;
    copyOne(ctx.abs(s), s, target, disp);
  }
  return code;
};

const mv: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "fvnuiT", long: { force: "f", verbose: "v" } });
  if (!o) return 2;
  if (o.opts.i) return ctx.unsupported("mv: interactive mode (-i) is not supported in this simulation");
  if (o.operands.length < 2) {
    ctx.err(o.operands.length ? `mv: missing destination file operand after '${o.operands[0]}'\n` : "mv: missing file operand\n");
    return 1;
  }
  const srcs = o.operands.slice(0, -1);
  const dstArg = o.operands[o.operands.length - 1];
  const dstAbs = ctx.abs(dstArg);
  const dstNode = ctx.fs.tryResolve(dstAbs, ctx.cred, true);
  const dstIsDir = dstNode?.node.type === "dir";
  if (srcs.length > 1 && !dstIsDir) {
    ctx.err(`mv: target '${dstArg}' is not a directory\n`);
    return 1;
  }
  let code = 0;
  for (const s of srcs) {
    const sp = ctx.abs(s);
    if (!ctx.fs.tryResolve(sp, null, false)) {
      ctx.err(`mv: cannot stat '${s}': No such file or directory\n`);
      code = 1;
      continue;
    }
    const target = dstIsDir ? joinPath(dstNode!.path, basename(sp)) : dstAbs;
    if (o.opts.n && ctx.fs.exists(target)) continue;
    try {
      ctx.fs.rename(sp, target, ctx.cred);
      if (o.opts.v) ctx.out(`renamed '${s}' -> '${dstIsDir ? dstArg.replace(/\/$/, "") + "/" + basename(s) : dstArg}'\n`);
    } catch (e) {
      ctx.err(`mv: cannot move '${s}' to '${dstArg}': ${errnoOf(e)}\n`);
      code = 1;
    }
  }
  return code;
};

const ln: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "sfnvT", long: { symbolic: "s", force: "f" } });
  if (!o) return 2;
  if (!o.opts.s) return ctx.unsupported("ln: hard links are not supported in this simulation (use ln -s for a symbolic link)");
  if (!o.operands.length) {
    ctx.err("ln: missing file operand\n");
    return 1;
  }
  const target = o.operands[0];
  let linkArg = o.operands[1] ?? basename(target);
  let linkAbs = ctx.abs(linkArg);
  const ex = ctx.fs.tryResolve(linkAbs, null, !o.opts.n);
  if (ex && ex.node.type === "dir" && o.operands[1] !== undefined && !o.opts.T) {
    linkAbs = joinPath(ex.path, basename(target));
    linkArg = linkArg.replace(/\/$/, "") + "/" + basename(target);
  }
  try {
    if (o.opts.f && ctx.fs.tryResolve(linkAbs, null, false)) ctx.fs.unlink(linkAbs, ctx.cred);
    ctx.fs.symlink(target, linkAbs, ctx.cred);
    if (o.opts.v) ctx.out(`'${linkArg}' -> '${target}'\n`);
    return 0;
  } catch (e) {
    ctx.err(`ln: failed to create symbolic link '${linkArg}': ${errnoOf(e)}\n`);
    return 1;
  }
};

// ------------------------------------------------------------------ chmod / chown / chgrp

/** Parse octal or symbolic mode relative to `cur`. Returns null if invalid. */
export function parseMode(spec: string, cur: number, isDir: boolean): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) {
    const v = parseInt(spec, 8);
    // like GNU chmod: 3-digit octal on a directory keeps setgid/sticky bits? (it clears setuid/setgid only if 5+ digits) – keep simple
    return spec.length <= 3 ? (cur & 0o7000 & (isDir ? 0o7000 : 0)) | v : v;
  }
  let mode = cur;
  for (const clause of spec.split(",")) {
    const m = /^([ugoa]*)([-+=][rwxXst]*)+$/.exec(clause);
    if (!m) return null;
    let who = m[1] || "a";
    if (who.includes("a")) who = "ugo";
    const opsRe = /([-+=])([rwxXst]*)/g;
    const opsPart = clause.slice(m[1].length);
    let om: RegExpExecArray | null;
    while ((om = opsRe.exec(opsPart))) {
      const [, op, perms] = om;
      let bits = 0;
      for (const w of who) {
        const shift = w === "u" ? 6 : w === "g" ? 3 : 0;
        for (const p of perms) {
          if (p === "r") bits |= 4 << shift;
          if (p === "w") bits |= 2 << shift;
          if (p === "x") bits |= 1 << shift;
          if (p === "X" && (isDir || cur & 0o111)) bits |= 1 << shift;
          if (p === "s" && w === "u") bits |= 0o4000;
          if (p === "s" && w === "g") bits |= 0o2000;
          if (p === "t" && w === "o") bits |= 0o1000;
        }
      }
      if (op === "+") mode |= bits;
      else if (op === "-") mode &= ~bits;
      else {
        let clear = 0;
        for (const w of who) clear |= w === "u" ? 0o4700 : w === "g" ? 0o2070 : 0o1007;
        mode = (mode & ~clear) | bits;
      }
    }
  }
  return mode & 0o7777;
}

const chmod: CommandFn = (ctx) => {
  // modes like -x or -w look like options; pull them out first
  const args = [...ctx.args];
  let modeArg: string | undefined;
  const rest: string[] = [];
  for (const a of args) {
    if (modeArg === undefined && /^[-+=][rwxXst]+$/.test(a)) modeArg = a;
    else rest.push(a);
  }
  const o = opts(ctx, { flags: "Rvcf", long: { recursive: "R", verbose: "v", changes: "c", silent: "f" } }, rest);
  if (!o) return 2;
  const operands = [...o.operands];
  if (modeArg === undefined) modeArg = operands.shift();
  if (modeArg === undefined || !operands.length) {
    ctx.err(modeArg === undefined ? "chmod: missing operand\n" : `chmod: missing operand after '${modeArg}'\n`);
    return 1;
  }
  let code = 0;
  const apply = (path: string, disp: string) => {
    let r: Resolved;
    try {
      r = ctx.fs.resolve(path, ctx.cred, true);
    } catch (e) {
      ctx.err(`chmod: cannot access '${disp}': ${errnoOf(e)}\n`);
      code = 1;
      return;
    }
    const m = parseMode(modeArg!, r.node.mode, r.node.type === "dir");
    if (m === null) {
      ctx.err(`chmod: invalid mode: '${modeArg}'\n`);
      code = 1;
      return;
    }
    try {
      const before = r.node.mode;
      ctx.fs.chmod(r.path, m, ctx.cred);
      if (o.opts.v || (o.opts.c && before !== m)) ctx.out(`mode of '${disp}' changed from ${octal(before)} (${modeString(r.node.type, before).slice(1)}) to ${octal(m)} (${modeString(r.node.type, m).slice(1)})\n`);
    } catch (e) {
      if (!o.opts.f) ctx.err(`chmod: changing permissions of '${disp}': ${errnoOf(e)}\n`);
      code = 1;
    }
    if (o.opts.R && r.node.type === "dir") {
      let names: string[] = [];
      try {
        names = ctx.fs.readdir(r.path, ctx.cred).names;
      } catch (e) {
        ctx.err(`chmod: cannot read directory '${disp}': ${errnoOf(e)}\n`);
        code = 1;
      }
      for (const n of names) {
        const cp = joinPath(r.path, n);
        if (ctx.fs.nodes[cp]?.type === "symlink") continue;
        apply(cp, disp.replace(/\/$/, "") + "/" + n);
      }
    }
  };
  for (const f of operands) apply(ctx.abs(f), f);
  return code;
};

function chownImpl(ctx: CmdCtx, isChgrp: boolean): number {
  const o = opts(ctx, { flags: "Rvhcf", long: { recursive: "R", verbose: "v" } });
  if (!o) return 2;
  const [spec, ...files] = o.operands;
  if (!spec || !files.length) {
    ctx.err(`${ctx.name}: missing operand\n`);
    return 1;
  }
  let user: string | undefined;
  let group: string | undefined;
  if (isChgrp) group = spec;
  else {
    const m = /^([^:.]*)(?:[:.](.*))?$/.exec(spec)!;
    user = m[1] || undefined;
    group = m[2];
    if (m[2] === "" && user) group = getUser(ctx.host, user) ? (ctx.host.groups.find((g) => g.name === user)?.name ?? user) : undefined;
    if (m[2] === "") group = group ?? undefined;
  }
  if (user !== undefined && !getUser(ctx.host, user) && !/^\d+$/.test(user)) {
    ctx.err(`chown: invalid user: '${spec}'\n`);
    return 1;
  }
  if (user && /^\d+$/.test(user)) user = ctx.host.users.find((u) => u.uid === parseInt(user!, 10))?.name ?? user;
  if (group !== undefined && group !== "" && !ctx.host.groups.some((g) => g.name === group)) {
    ctx.err(isChgrp ? `chgrp: invalid group: '${group}'\n` : `chown: invalid group: '${spec}'\n`);
    return 1;
  }
  let code = 0;
  const apply = (path: string, disp: string) => {
    let r: Resolved;
    try {
      r = ctx.fs.resolve(path, ctx.cred, !o.opts.h);
    } catch (e) {
      ctx.err(`${ctx.name}: cannot access '${disp}': ${errnoOf(e)}\n`);
      code = 1;
      return;
    }
    const root = ctx.cred.uid === 0;
    // chown: only root (simulation rule). chgrp: owner may switch to a group they belong to.
    const allowed = root || (isChgrp && r.node.owner === ctx.cred.user && ctx.cred.groups.includes(group!));
    if (!allowed) {
      ctx.err(`${ctx.name}: changing ${isChgrp || !user ? "group" : "ownership"} of '${disp}': Operation not permitted\n`);
      code = 1;
    } else {
      if (user) r.node.owner = user;
      if (group) r.node.group = group;
      if (o.opts.v) ctx.out(`changed ownership of '${disp}' to ${r.node.owner}:${r.node.group}\n`);
    }
    if (o.opts.R && r.node.type === "dir") {
      for (const n of ctx.fs.children(r.path)) apply(joinPath(r.path, n), disp.replace(/\/$/, "") + "/" + n);
    }
  };
  for (const f of files) apply(ctx.abs(f), f);
  return code;
}

// ------------------------------------------------------------------ stat / file

const stat: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "Lt", withArg: "c", long: { "format=": "c", dereference: "L" } });
  if (!o) return 2;
  if (!o.operands.length) {
    ctx.err("stat: missing operand\n");
    return 1;
  }
  let code = 0;
  for (const f of o.operands) {
    let r: Resolved;
    try {
      r = ctx.fs.resolve(ctx.abs(f), ctx.cred, !!o.opts.L);
    } catch (e) {
      ctx.err(`stat: cannot statx '${f}': ${errnoOf(e)}\n`);
      code = 1;
      continue;
    }
    const n = r.node;
    const uid = getUser(ctx.host, n.owner)?.uid ?? 0;
    const gid = gidOf(ctx.host, n.group);
    const typeName = n.type === "dir" ? "directory" : n.type === "symlink" ? "symbolic link" : n.content.length ? "regular file" : "regular empty file";
    const inode = (hash(ctx.host.name + r.path) % 900000) + 100000;
    if (o.opts.c) {
      const fmt = (o.opts.c as string).replace(/%([aAUGugsnFyYxXN%])/g, (_m, c: string) => {
        switch (c) {
          case "a": return (n.mode & 0o7777).toString(8);
          case "A": return modeString(n.type, n.mode);
          case "U": return n.owner;
          case "G": return n.group;
          case "u": return String(uid);
          case "g": return String(gid);
          case "s": return String(nodeSize(n));
          case "n": return f;
          case "N": return n.type === "symlink" ? `'${f}' -> '${n.target}'` : `'${f}'`;
          case "F": return typeName;
          case "y": case "x": return fmtIso(n.mtime) + ".000000000 +0000";
          case "Y": case "X": return String(n.mtime);
          default: return "%";
        }
      });
      ctx.out(fmt.replace(/\\n/g, "\n").replace(/\\t/g, "\t") + "\n");
      continue;
    }
    const ts = fmtIso(n.mtime) + ".000000000 +0000";
    ctx.out(
      `  File: ${f}${n.type === "symlink" ? ` -> ${n.target}` : ""}\n` +
        `  Size: ${String(nodeSize(n)).padEnd(10)}\tBlocks: ${String(blocksK(n) * 2).padEnd(10)} IO Block: 4096   ${typeName}\n` +
        `Device: 8,1\tInode: ${String(inode).padEnd(11)} Links: ${n.type === "dir" ? 2 : 1}\n` +
        `Access: (${octal(n.mode)}/${modeString(n.type, n.mode)})  Uid: (${String(uid).padStart(5)}/${n.owner.padStart(8)})   Gid: (${String(gid).padStart(5)}/${n.group.padStart(8)})\n` +
        `Access: ${ts}\nModify: ${ts}\nChange: ${ts}\n Birth: -\n`,
    );
  }
  return code;
};

const file: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "bLi" });
  if (!o) return 2;
  let code = 0;
  for (const f of o.operands) {
    const r = ctx.fs.tryResolve(ctx.abs(f), ctx.cred, !!o.opts.L);
    let desc: string;
    if (!r) {
      desc = `cannot open \`${f}' (No such file or directory)`;
      code = 0;
    } else if (r.node.type === "dir") desc = "directory";
    else if (r.node.type === "symlink") desc = `symbolic link to ${r.node.target}`;
    else if (!hasPerm(r.node, ctx.cred, R)) desc = `regular file, no read permission`;
    else {
      const c = r.node.content;
      if (c === "") desc = "empty";
      else if (c.startsWith("\x7fELF")) desc = "ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, stripped";
      else if (/^#!.*\b(bash)\b/.test(c)) desc = "Bourne-Again shell script, ASCII text executable";
      else if (/^#!.*\bsh\b/.test(c)) desc = "POSIX shell script, ASCII text executable";
      else if (/^#!.*python/.test(c)) desc = "Python script, ASCII text executable";
      else if (/^\s*[{[]/.test(c)) {
        try {
          JSON.parse(c);
          desc = "JSON text data";
        } catch {
          desc = "ASCII text";
        }
      } else desc = /[^\x00-\x7f]/.test(c) ? "Unicode text, UTF-8 text" : c.includes("\r\n") ? "ASCII text, with CRLF line terminators" : "ASCII text";
    }
    ctx.out(o.opts.b ? desc + "\n" : `${f}: ${desc}\n`);
  }
  return code;
};

// ------------------------------------------------------------------ find

type FindExpr =
  | { k: "and" | "or"; a: FindExpr; b: FindExpr }
  | { k: "not"; a: FindExpr }
  | { k: "test"; f: (path: string, node: FsNode, depth: number) => boolean }
  | { k: "action"; f: (path: string, node: FsNode) => boolean };

const find: CommandFn = (ctx) => {
  const args = ctx.args;
  const paths: string[] = [];
  let i = 0;
  while (i < args.length && !args[i].startsWith("-") && args[i] !== "(" && args[i] !== "!") paths.push(args[i++]);
  if (!paths.length) paths.push(".");
  let maxDepth = Infinity;
  let minDepth = 0;
  let hasAction = false;
  const pendingPlus: { argv: string[]; paths: string[] }[] = [];
  let code = 0;
  let fail: string | null = null;
  let unsup: string | null = null;
  const toks = args.slice(i);
  let p = 0;
  const need = (opt: string) => {
    const v = toks[++p];
    if (v === undefined) fail = `find: missing argument to \`${opt}'`;
    return v ?? "";
  };
  function primary(): FindExpr | null {
    const t = toks[p];
    if (t === "!" || t === "-not") {
      p++;
      const a = primary();
      return a ? { k: "not", a } : null;
    }
    if (t === "(") {
      p++;
      const e = orExpr();
      if (toks[p] !== ")") fail = "find: invalid expression; you have too many '('";
      p++;
      return e;
    }
    switch (t) {
      case "-name":
      case "-iname": {
        const pat = need(t);
        p++;
        const ci = t === "-iname";
        return { k: "test", f: (path) => globMatch(ci ? pat.toLowerCase() : pat, ci ? basename(path).toLowerCase() : basename(path)) };
      }
      case "-path":
      case "-wholename": {
        const pat = need(t);
        p++;
        return { k: "test", f: (path) => globMatch(pat, path) };
      }
      case "-type": {
        const ty = need(t);
        p++;
        if (!["f", "d", "l"].includes(ty)) {
          unsup = `find: -type ${ty} is not supported in this simulation (use f, d or l)`;
          return null;
        }
        const map: Record<string, string> = { f: "file", d: "dir", l: "symlink" };
        return { k: "test", f: (_p, n) => n.type === map[ty] };
      }
      case "-perm": {
        const spec = need(t);
        p++;
        const mode = spec.replace(/^[-/]/, "");
        const m = parseMode(mode, 0, false);
        if (m === null) {
          fail = `find: invalid mode '${spec}'`;
          return null;
        }
        if (spec.startsWith("-")) return { k: "test", f: (_p, n) => (n.mode & m) === m };
        if (spec.startsWith("/")) return { k: "test", f: (_p, n) => m === 0 || (n.mode & m) !== 0 };
        return { k: "test", f: (_p, n) => (n.mode & 0o7777) === m };
      }
      case "-user": {
        const u = need(t);
        p++;
        return { k: "test", f: (_p, n) => n.owner === u };
      }
      case "-group": {
        const g = need(t);
        p++;
        return { k: "test", f: (_p, n) => n.group === g };
      }
      case "-empty":
        p++;
        return { k: "test", f: (path, n) => (n.type === "dir" ? ctx.fs.children(realOf(path)).length === 0 : n.type === "file" && n.content === "") };
      case "-readable":
      case "-writable":
      case "-executable": {
        p++;
        const bit = t === "-readable" ? R : t === "-writable" ? W : X;
        return { k: "test", f: (_p, n) => hasPerm(n, ctx.cred, bit) };
      }
      case "-maxdepth":
        maxDepth = parseInt(need(t), 10);
        p++;
        return { k: "test", f: () => true };
      case "-mindepth":
        minDepth = parseInt(need(t), 10);
        p++;
        return { k: "test", f: () => true };
      case "-print":
        p++;
        hasAction = true;
        return { k: "action", f: (path) => (ctx.out(path + "\n"), true) };
      case "-delete":
        p++;
        hasAction = true;
        return {
          k: "action",
          f: (path, n) => {
            try {
              if (n.type === "dir") ctx.fs.rmdir(realOf(path), ctx.cred);
              else ctx.fs.unlink(realOf(path), ctx.cred);
              return true;
            } catch (e) {
              ctx.err(`find: cannot delete '${path}': ${errnoOf(e)}\n`);
              code = 1;
              return false;
            }
          },
        };
      case "-exec":
      case "-execdir":
      case "-ok": {
        if (t !== "-exec") {
          unsup = `find: ${t} is not supported in this simulation (use -exec)`;
          return null;
        }
        const argv: string[] = [];
        p++;
        while (p < toks.length && toks[p] !== ";" && toks[p] !== "+") argv.push(toks[p++]);
        if (p >= toks.length) {
          fail = "find: missing argument to `-exec'";
          return null;
        }
        const plus = toks[p] === "+";
        p++;
        hasAction = true;
        if (plus) {
          const entry = { argv, paths: [] as string[] };
          pendingPlus.push(entry);
          return { k: "action", f: (path) => (entry.paths.push(path), true) };
        }
        return { k: "action", f: (path) => ctx.shell.runArgv(argv.map((a) => a.replace(/\{\}/g, path)), ctx.io, ctx.cred) === 0 };
      }
      default:
        if (t && /^-(mtime|atime|ctime|mmin|amin|cmin|newer|size|links|inum|regex|printf|fprint|prune|xdev|mount|samefile|uid|gid|nouser|nogroup)$/.test(t)) {
          unsup = `find: ${t} is not supported in this simulation`;
          return null;
        }
        fail = t === undefined ? "find: expected an expression" : `find: unknown predicate \`${t}'`;
        return null;
    }
  }
  function andExpr(): FindExpr | null {
    let a = primary();
    while (a && p < toks.length && toks[p] !== "-o" && toks[p] !== "-or" && toks[p] !== ")") {
      if (toks[p] === "-a" || toks[p] === "-and") p++;
      const b = primary();
      if (!b) return null;
      a = { k: "and", a, b };
    }
    return a;
  }
  function orExpr(): FindExpr | null {
    let a = andExpr();
    while (a && (toks[p] === "-o" || toks[p] === "-or")) {
      p++;
      const b = andExpr();
      if (!b) return null;
      a = { k: "or", a, b };
    }
    return a;
  }
  const realMap = new Map<string, string>();
  const realOf = (disp: string) => realMap.get(disp) ?? ctx.abs(disp);
  let expr: FindExpr | null = toks.length ? orExpr() : { k: "test", f: () => true };
  if (unsup) return ctx.unsupported(unsup, 1);
  if (fail || !expr) {
    ctx.err((fail ?? "find: invalid expression") + "\n");
    return 1;
  }
  if (!hasAction) expr = { k: "and", a: expr, b: { k: "action", f: (path) => (ctx.out(path + "\n"), true) } };
  const evalE = (e: FindExpr, path: string, n: FsNode, d: number): boolean => {
    switch (e.k) {
      case "and": return evalE(e.a, path, n, d) && evalE(e.b, path, n, d);
      case "or": return evalE(e.a, path, n, d) || evalE(e.b, path, n, d);
      case "not": return !evalE(e.a, path, n, d);
      case "test": return e.f(path, n, d);
      case "action": return e.f(path, n);
    }
  };
  const visit = (disp: string, real: string, node: FsNode, depth: number) => {
    realMap.set(disp, real);
    if (depth >= minDepth) evalE(expr!, disp, node, depth);
    if (node.type !== "dir" || depth >= maxDepth) return;
    if (!ctx.fs.nodes[real]) return; // deleted
    if (!hasPerm(node, ctx.cred, R) || !hasPerm(node, ctx.cred, X)) {
      ctx.err(`find: '${disp}': Permission denied\n`);
      code = 1;
      return;
    }
    for (const c of ctx.fs.children(real)) {
      const cr = joinPath(real, c);
      const cn = ctx.fs.nodes[cr];
      if (cn) visit(disp === "/" ? "/" + c : disp.replace(/\/$/, "") + "/" + c, cr, cn, depth + 1);
    }
  };
  for (const start of paths) {
    let r: Resolved;
    try {
      r = ctx.fs.resolve(ctx.abs(start), ctx.cred, true);
    } catch (e) {
      ctx.err(`find: '${start}': ${errnoOf(e)}\n`);
      code = 1;
      continue;
    }
    visit(start, r.path, r.node, 0);
  }
  for (const pp of pendingPlus) {
    if (!pp.paths.length) continue;
    const idx = pp.argv.indexOf("{}");
    const argv = idx >= 0 ? [...pp.argv.slice(0, idx), ...pp.paths, ...pp.argv.slice(idx + 1)] : [...pp.argv, ...pp.paths];
    if (ctx.shell.runArgv(argv, ctx.io, ctx.cred) !== 0) code = 1;
  }
  return code;
};

// ------------------------------------------------------------------ du / df / tee / misc path tools

const du: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "shacb", withArg: "d", long: { summarize: "s", "human-readable": "h", "max-depth=": "d" } });
  if (!o) return 2;
  const operands = o.operands.length ? o.operands : ["."];
  const fmt = (b: number) => (o.opts.h ? humanSize(b) : String(Math.ceil(b / 1024)));
  const maxDepth = o.opts.s ? 0 : o.opts.d !== undefined ? parseInt(o.opts.d as string, 10) : Infinity;
  let code = 0;
  let grand = 0;
  for (const arg of operands) {
    const r = ctx.fs.tryResolve(ctx.abs(arg), ctx.cred, true);
    if (!r) {
      ctx.err(`du: cannot access '${arg}': No such file or directory\n`);
      code = 1;
      continue;
    }
    const walk = (real: string, disp: string, depth: number): number => {
      const n = ctx.fs.nodes[real];
      if (n.type !== "dir") {
        const sz = n.type === "symlink" ? 0 : Math.max(4096, Math.ceil(n.content.length / 4096) * 4096);
        if ((o.opts.a && depth <= maxDepth) || depth === 0) ctx.out(`${fmt(sz)}\t${disp}\n`);
        return sz;
      }
      let total = 4096;
      if (!hasPerm(n, ctx.cred, R) || !hasPerm(n, ctx.cred, X)) {
        ctx.err(`du: cannot read directory '${disp}': Permission denied\n`);
        code = 1;
      } else for (const c of ctx.fs.children(real)) total += walk(joinPath(real, c), disp.replace(/\/$/, "") + "/" + c, depth + 1);
      if (depth <= maxDepth) ctx.out(`${fmt(total)}\t${disp}\n`);
      return total;
    };
    grand += walk(r.path, arg, 0);
  }
  if (o.opts.c) ctx.out(`${fmt(grand)}\ttotal\n`);
  return code;
};

const df: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "hTTiak", long: { "human-readable": "h" } });
  if (!o) return 2;
  if (o.opts.h)
    ctx.out(
      "Filesystem      Size  Used Avail Use% Mounted on\n" +
        "tmpfs           794M  1.2M  793M   1% /run\n" +
        "/dev/sda1        48G   12G   34G  27% /\n" +
        "tmpfs           3.9G     0  3.9G   0% /dev/shm\n" +
        "/dev/sda15      105M  6.1M   99M   6% /boot/efi\n",
    );
  else
    ctx.out(
      "Filesystem     1K-blocks     Used Available Use% Mounted on\n" +
        "tmpfs             812420     1208    811212   1% /run\n" +
        "/dev/sda1       50254368 12058112  35617740  26% /\n" +
        "tmpfs            4062092        0   4062092   0% /dev/shm\n" +
        "/dev/sda15        106858     6182    100676   6% /boot/efi\n",
    );
  return 0;
};

const tee: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "ai", long: { append: "a" } });
  if (!o) return 2;
  const data = ctx.io.stdin.readAll();
  let code = 0;
  for (const f of o.operands) {
    if (f === "/dev/null") continue;
    try {
      ctx.fs.writeFile(ctx.abs(f), data, ctx.cred, { append: !!o.opts.a, umask: ctx.umask });
    } catch (e) {
      code = ctx.fsErr(e, f);
    }
  }
  ctx.out(data);
  return code;
};

const basenameCmd: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "az", withArg: "s" });
  if (!o) return 2;
  if (!o.operands.length) {
    ctx.err("basename: missing operand\n");
    return 1;
  }
  const names = o.opts.a || o.opts.s ? o.operands : [o.operands[0]];
  const suffix = (o.opts.s as string) ?? (o.opts.a ? undefined : o.operands[1]);
  for (const n of names) {
    let b = basename(n);
    if (suffix && b.endsWith(suffix) && b !== suffix) b = b.slice(0, -suffix.length);
    ctx.out(b + "\n");
  }
  return 0;
};

const dirnameCmd: CommandFn = (ctx) => {
  if (!ctx.args.length) {
    ctx.err("dirname: missing operand\n");
    return 1;
  }
  for (const a of ctx.args) ctx.out(dirname(a) + "\n");
  return 0;
};

const realpath: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "fems" });
  if (!o) return 2;
  let code = 0;
  for (const a of o.operands.length ? o.operands : ctx.name === "readlink" ? [] : ["."]) {
    if (ctx.name === "readlink" && !o.opts.f && !o.opts.e && !o.opts.m) {
      const r = ctx.fs.tryResolve(ctx.abs(a), ctx.cred, false);
      if (r?.node.type === "symlink") ctx.out(r.node.target + "\n");
      else code = 1;
      continue;
    }
    const r = ctx.fs.tryResolve(ctx.abs(a), ctx.cred, true);
    if (r) ctx.out(r.path + "\n");
    else if (o.opts.m || (ctx.name === "readlink" && o.opts.f)) {
      const parent = ctx.fs.tryResolve(dirname(ctx.abs(a)), ctx.cred, true);
      if (parent) ctx.out(joinPath(parent.path, basename(ctx.abs(a))) + "\n");
      else code = 1;
    } else {
      if (ctx.name === "realpath") ctx.err(`realpath: ${a}: No such file or directory\n`);
      code = 1;
    }
  }
  return code;
};

const pwd: CommandFn = (ctx) => {
  ctx.out(ctx.cwd + "\n");
  return 0;
};

export const FILE_COMMANDS: Record<string, CommandFn> = {
  ls,
  cat,
  less: (ctx) => cat({ ...ctx, name: "less", args: ctx.args.filter((a) => !/^-[NRSXFr]+$/.test(a)) }),
  more: (ctx) => cat({ ...ctx, name: "more", args: ctx.args.filter((a) => !a.startsWith("-")) }),
  head: (ctx) => headTail(ctx, false),
  tail: (ctx) => headTail(ctx, true),
  touch,
  mkdir,
  rmdir,
  rm,
  cp,
  mv,
  ln,
  chmod,
  chown: (ctx) => chownImpl(ctx, false),
  chgrp: (ctx) => chownImpl(ctx, true),
  stat,
  file,
  find,
  du,
  df,
  tee,
  basename: basenameCmd,
  dirname: dirnameCmd,
  realpath,
  readlink: realpath,
  pwd,
};

export { normalizePath };
