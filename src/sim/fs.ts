/**
 * Virtual filesystem with real Unix permission semantics.
 * Nodes live in a flat record keyed by absolute normalized path.
 */
import type { Cred, FsNode, HostState } from "./types";
import { basename, dirname, joinPath, normalizePath } from "./util";

export type Errno =
  | "ENOENT"
  | "EACCES"
  | "ENOTDIR"
  | "EISDIR"
  | "EEXIST"
  | "ENOTEMPTY"
  | "EPERM"
  | "ELOOP"
  | "EINVAL"
  | "EBUSY";

export const ERRNO_MSG: Record<Errno, string> = {
  ENOENT: "No such file or directory",
  EACCES: "Permission denied",
  ENOTDIR: "Not a directory",
  EISDIR: "Is a directory",
  EEXIST: "File exists",
  ENOTEMPTY: "Directory not empty",
  EPERM: "Operation not permitted",
  ELOOP: "Too many levels of symbolic links",
  EINVAL: "Invalid argument",
  EBUSY: "Device or resource busy",
};

export const ERRNO_NUM: Record<Errno, number> = {
  EPERM: 1, ENOENT: 2, EACCES: 13, EBUSY: 16, EEXIST: 17, ENOTDIR: 20, EISDIR: 21, EINVAL: 22, ENOTEMPTY: 39, ELOOP: 40,
};

export class FsError extends Error {
  constructor(
    public errno: Errno,
    public path: string,
    /** For EACCES: the directory/file whose permission was missing. */
    public deniedAt?: string,
    public deniedBit?: "r" | "w" | "x",
  ) {
    super(`${path}: ${ERRNO_MSG[errno]}`);
  }
}

export const R = 4;
export const W = 2;
export const X = 1;
const BIT_NAME: Record<number, "r" | "w" | "x"> = { 4: "r", 2: "w", 1: "x" };

/** Which permission class applies to cred for node: "u" | "g" | "o". */
export function permClass(node: FsNode, cred: Cred): "u" | "g" | "o" {
  if (node.owner === cred.user) return "u";
  if (cred.groups.includes(node.group)) return "g";
  return "o";
}

export function hasPerm(node: FsNode, cred: Cred, bit: number): boolean {
  if (cred.uid === 0) {
    if (bit === X && node.type === "file") return (node.mode & 0o111) !== 0;
    return true;
  }
  const cls = permClass(node, cred);
  const shift = cls === "u" ? 6 : cls === "g" ? 3 : 0;
  return ((node.mode >> shift) & bit) !== 0;
}

export interface Resolved {
  path: string;
  node: FsNode;
}

export const DEFAULT_UMASK = 0o022;

/** Filesystem operations bound to one host. All paths must be absolute. */
export class Fs {
  constructor(
    public host: HostState,
    private now: () => number,
  ) {}

  get nodes(): Record<string, FsNode> {
    return this.host.fs;
  }

  /** Group for a new entry: the parent's group if the parent is setgid, else the creator's primary group. */
  newGroup(path: string, owner: string, cred: Cred | null): string {
    const parent = this.nodes[dirname(path)];
    if (parent && parent.type === "dir" && parent.mode & 0o2000) return parent.group;
    return cred ? this.primaryGroup(owner) : "root";
  }

  primaryGroup(user: string): string {
    const g = this.host.groups.find((x) => x.name === user);
    if (g) return g.name;
    const u = this.host.users.find((x) => x.name === user);
    return u?.groups[0] ?? user;
  }

  /**
   * Resolve a path, following symlinks. If cred is given, checks search (x)
   * permission on every directory traversed.
   */
  resolve(path: string, cred: Cred | null, followLast = true, depth = 0): Resolved {
    if (depth > 40) throw new FsError("ELOOP", path);
    const abs = normalizePath(path);
    const comps = abs.split("/").filter(Boolean);
    let cur = "/";
    const root = this.nodes["/"];
    if (!root) throw new FsError("ENOENT", path);
    for (let i = 0; i < comps.length; i++) {
      const curNode = this.nodes[cur];
      if (!curNode || curNode.type !== "dir") throw new FsError("ENOTDIR", path);
      if (cred && !hasPerm(curNode, cred, X)) throw new FsError("EACCES", path, cur, "x");
      const next = joinPath(cur, comps[i]);
      const node = this.nodes[next];
      const last = i === comps.length - 1;
      if (!node) throw new FsError("ENOENT", path);
      if (node.type === "symlink" && (!last || followLast)) {
        const tgt = node.target ?? "";
        const rest = comps.slice(i + 1).join("/");
        const base = tgt.startsWith("/") ? tgt : joinPath(cur, tgt);
        return this.resolve(normalizePath(rest ? base + "/" + rest : base), cred, followLast, depth + 1);
      }
      if (!last && node.type !== "dir") throw new FsError("ENOTDIR", path);
      cur = next;
    }
    return { path: cur, node: this.nodes[cur] };
  }

  tryResolve(path: string, cred: Cred | null, followLast = true): Resolved | null {
    try {
      return this.resolve(path, cred, followLast);
    } catch {
      return null;
    }
  }

  exists(path: string, followLast = true): boolean {
    return this.tryResolve(path, null, followLast) !== null;
  }

  /** Resolve the parent directory of a path that may not exist yet. */
  resolveParent(path: string, cred: Cred | null): { dir: Resolved; name: string; path: string } {
    const abs = normalizePath(path);
    if (abs === "/") throw new FsError("EEXIST", path);
    const parent = this.resolve(dirname(abs), cred, true);
    if (parent.node.type !== "dir") throw new FsError("ENOTDIR", path);
    if (cred && !hasPerm(parent.node, cred, X)) throw new FsError("EACCES", path, parent.path, "x");
    const name = basename(abs);
    return { dir: parent, name, path: joinPath(parent.path, name) };
  }

  /** Full access check including traversal of every parent. */
  access(path: string, cred: Cred, bit: number): void {
    const r = this.resolve(path, cred, true);
    if (!hasPerm(r.node, cred, bit)) throw new FsError("EACCES", path, r.path, BIT_NAME[bit]);
  }

  canAccess(path: string, cred: Cred, bit: number): boolean {
    try {
      this.access(path, cred, bit);
      return true;
    } catch {
      return false;
    }
  }

  stat(path: string, cred: Cred | null, follow = true): Resolved {
    return this.resolve(path, cred, follow);
  }

  readFile(path: string, cred: Cred | null): string {
    const r = this.resolve(path, cred, true);
    if (r.node.type === "dir") throw new FsError("EISDIR", path);
    if (cred && !hasPerm(r.node, cred, R)) throw new FsError("EACCES", path, r.path, "r");
    return r.node.content;
  }

  /** Check that we could open `path` for writing (creating if needed). Returns real path. */
  checkWritable(path: string, cred: Cred | null): string {
    const existing = this.tryResolve(path, cred, true);
    if (existing) {
      if (existing.node.type === "dir") throw new FsError("EISDIR", path);
      if (cred && !hasPerm(existing.node, cred, W)) throw new FsError("EACCES", path, existing.path, "w");
      return existing.path;
    }
    // may still be a dangling symlink: write through it
    const lnk = this.tryResolve(path, null, false);
    let target = path;
    if (lnk && lnk.node.type === "symlink") {
      const t = lnk.node.target ?? "";
      target = t.startsWith("/") ? t : joinPath(dirname(lnk.path), t);
    }
    const { dir, path: real } = this.resolveParent(target, cred);
    if (cred && !hasPerm(dir.node, cred, W)) throw new FsError("EACCES", path, dir.path, "w");
    return real;
  }

  writeFile(path: string, content: string, cred: Cred | null, opts: { append?: boolean; umask?: number; mode?: number } = {}): string {
    const real = this.checkWritable(path, cred);
    const node = this.nodes[real];
    if (node) {
      node.content = opts.append ? node.content + content : content;
      node.mtime = this.now();
    } else {
      const mode = opts.mode ?? 0o666 & ~(opts.umask ?? DEFAULT_UMASK);
      const owner = cred ? cred.user : "root";
      this.nodes[real] = {
        type: "file",
        content,
        mode,
        owner,
        group: this.newGroup(real, owner, cred),
        mtime: this.now(),
      };
    }
    return real;
  }

  mkdir(path: string, cred: Cred | null, opts: { umask?: number; mode?: number } = {}): string {
    if (this.tryResolve(path, null, false)) throw new FsError("EEXIST", path);
    const { dir, path: real } = this.resolveParent(path, cred);
    if (cred && !hasPerm(dir.node, cred, W)) throw new FsError("EACCES", path, dir.path, "w");
    const owner = cred ? cred.user : "root";
    // a setgid parent directory passes its setgid bit on to new subdirectories
    const sgid = dir.node.mode & 0o2000;
    this.nodes[real] = {
      type: "dir",
      content: "",
      mode: (opts.mode ?? 0o777 & ~(opts.umask ?? DEFAULT_UMASK)) | sgid,
      owner,
      group: this.newGroup(real, owner, cred),
      mtime: this.now(),
    };
    return real;
  }

  symlink(target: string, path: string, cred: Cred | null): void {
    if (this.tryResolve(path, null, false)) throw new FsError("EEXIST", path);
    const { dir, path: real } = this.resolveParent(path, cred);
    if (cred && !hasPerm(dir.node, cred, W)) throw new FsError("EACCES", path, dir.path, "w");
    const owner = cred ? cred.user : "root";
    this.nodes[real] = { type: "symlink", content: "", target, mode: 0o777, owner, group: this.newGroup(real, owner, cred), mtime: this.now() };
  }

  children(dirPath: string): string[] {
    const prefix = dirPath === "/" ? "/" : dirPath + "/";
    const out: string[] = [];
    for (const k of Object.keys(this.nodes)) {
      if (k !== "/" && k.startsWith(prefix) && !k.slice(prefix.length).includes("/")) out.push(k.slice(prefix.length));
    }
    return out.sort();
  }

  /** List a directory: requires r on the directory (and x on parents). */
  readdir(path: string, cred: Cred | null): { path: string; names: string[] } {
    const r = this.resolve(path, cred, true);
    if (r.node.type !== "dir") throw new FsError("ENOTDIR", path);
    if (cred && !hasPerm(r.node, cred, R)) throw new FsError("EACCES", path, r.path, "r");
    return { path: r.path, names: this.children(r.path) };
  }

  /** Check permission to remove/create an entry in its parent (w+x, sticky bit). */
  private checkUnlinkPerm(path: string, cred: Cred | null): { real: string; node: FsNode } {
    const abs = normalizePath(path);
    const parent = this.resolve(dirname(abs), cred, true);
    const real = joinPath(parent.path, basename(abs));
    const node = this.nodes[real];
    if (!node) throw new FsError("ENOENT", path);
    if (cred) {
      if (!hasPerm(parent.node, cred, X)) throw new FsError("EACCES", path, parent.path, "x");
      if (!hasPerm(parent.node, cred, W)) throw new FsError("EACCES", path, parent.path, "w");
      if (cred.uid !== 0 && parent.node.mode & 0o1000 && node.owner !== cred.user && parent.node.owner !== cred.user) {
        throw new FsError("EPERM", path);
      }
    }
    return { real, node };
  }

  unlink(path: string, cred: Cred | null): void {
    const { real, node } = this.checkUnlinkPerm(path, cred);
    if (node.type === "dir") throw new FsError("EISDIR", path);
    delete this.nodes[real];
  }

  rmdir(path: string, cred: Cred | null): void {
    const { real, node } = this.checkUnlinkPerm(path, cred);
    if (node.type !== "dir") throw new FsError("ENOTDIR", path);
    if (real === "/") throw new FsError("EBUSY", path);
    if (this.children(real).length) throw new FsError("ENOTEMPTY", path);
    delete this.nodes[real];
  }

  /** Recursive removal; reports errors through onError and continues. */
  removeTree(path: string, cred: Cred | null, onError: (e: FsError) => void): boolean {
    const abs = normalizePath(path);
    const parent = this.tryResolve(dirname(abs), null, true);
    const real = parent ? joinPath(parent.path, basename(abs)) : abs;
    const node = this.nodes[real];
    if (!node) {
      onError(new FsError("ENOENT", path));
      return false;
    }
    if (node.type !== "dir") {
      try {
        this.unlink(real, cred);
        return true;
      } catch (e) {
        if (e instanceof FsError) onError(new FsError(e.errno, path, e.deniedAt, e.deniedBit));
        return false;
      }
    }
    let ok = true;
    if (cred && !(hasPerm(node, cred, R) && hasPerm(node, cred, X) && hasPerm(node, cred, W))) {
      if (this.children(real).length) {
        onError(new FsError("EACCES", path, real));
        return false;
      }
    }
    for (const c of this.children(real)) {
      const childPath = path.replace(/\/+$/, "") + "/" + c;
      if (!this.removeTree(joinPath(real, c), cred, (e) => onError(new FsError(e.errno, e.path === joinPath(real, c) ? childPath : e.path, e.deniedAt)))) ok = false;
    }
    if (!ok) return false;
    try {
      this.rmdir(real, cred);
      return true;
    } catch (e) {
      if (e instanceof FsError) onError(new FsError(e.errno, path, e.deniedAt));
      return false;
    }
  }

  rename(src: string, dst: string, cred: Cred | null): void {
    const s = this.checkUnlinkPerm(src, cred);
    const dstAbs = normalizePath(dst);
    const { dir, path: realDst } = this.resolveParent(dstAbs, cred);
    if (cred && !hasPerm(dir.node, cred, W)) throw new FsError("EACCES", dst, dir.path, "w");
    if (realDst === s.real) return;
    if (s.node.type === "dir" && (realDst + "/").startsWith(s.real + "/")) throw new FsError("EINVAL", dst);
    const existing = this.nodes[realDst];
    if (existing) {
      if (existing.type === "dir" && s.node.type !== "dir") throw new FsError("EISDIR", dst);
      if (existing.type === "dir" && this.children(realDst).length) throw new FsError("ENOTEMPTY", dst);
      delete this.nodes[realDst];
    }
    const moves: [string, FsNode][] = [];
    for (const k of Object.keys(this.nodes)) {
      if (k === s.real || k.startsWith(s.real + "/")) moves.push([k, this.nodes[k]]);
    }
    for (const [k] of moves) delete this.nodes[k];
    for (const [k, n] of moves) this.nodes[realDst + k.slice(s.real.length)] = n;
  }

  chmod(path: string, mode: number, cred: Cred | null): void {
    const r = this.resolve(path, cred, true);
    if (cred && cred.uid !== 0 && r.node.owner !== cred.user) throw new FsError("EPERM", path);
    r.node.mode = mode & 0o7777;
  }

  /** Walk a subtree (real paths), depth-first, sorted. */
  walk(root: string): string[] {
    const out: string[] = [root];
    const node = this.nodes[root];
    if (node?.type === "dir") for (const c of this.children(root)) out.push(...this.walk(joinPath(root, c)));
    return out;
  }

  /** Total bytes under a path (for du). */
  usage(root: string): number {
    let total = 0;
    for (const p of this.walk(root)) {
      const n = this.nodes[p];
      total += n.type === "dir" ? 4096 : Math.max(4096, Math.ceil(n.content.length / 4096) * 4096);
    }
    return total;
  }
}

/** Parse an octal mode string like "0644" or "755". */
export function parseOctal(s: string): number {
  return parseInt(s, 8);
}
