/** Executes the shell AST against the simulated system. */
import type { Node, Redirect, Word, WordPart } from "./ast";
import { parse, parseHeredocBody, parseWordString, ParseError } from "./parser";
import { ArithError, evalArith } from "./arith";
import { evalDbracket, evalTest, TestError, type DTok, type FileTest } from "./testexpr";
import type { Core } from "../core";
import { Fs, FsError, ERRNO_MSG, hasPerm, R, W, X } from "../fs";
import { BufferWriter, InStream, NullWriter, type Cred, type ShellEnv, type Writer } from "../types";
import type { CmdCtx, IO, ShellApi } from "../commands/types";
import { COMMANDS, BUILTIN_NAMES } from "../commands/registry";
import { COMMAND_PATHS } from "../commands/paths";
import { copyEnv, credFor, getUser } from "../state";
import { escapeGlob, globMatch, globToRegexSrc, hasGlob, isIdent, joinPath, normalizePath, safeRegex, unescapeGlob } from "../util";

export const MAX_STEPS = 10_000;

export class ExitSig {
  constructor(public code: number) {}
}
class ReturnSig {
  constructor(public code: number) {}
}
class BreakSig {
  constructor(public n: number) {}
}
class ContinueSig {
  constructor(public n: number) {}
}
export class LimitError extends Error {}
/** Fatal expansion error (e.g. ${x:?msg}, bad arithmetic): aborts the current command. */
class ExpandError extends Error {
  constructor(message: string, public code = 1) {
    super(message);
  }
}

/** Per-exec() shared run state (statement budget, flags). */
export class RunContext {
  steps = 0;
  unsupported = false;
  clear = false;
  bgWarned = false;
  nesting = 0;
  constructor(public core: Core) {}
}

interface Field {
  s: string;
  pat: string;
  glob: boolean;
  keep: boolean;
}

const ASSIGN_BUILTINS = new Set(["export", "local", "declare", "typeset", "readonly"]);
const SUDO_OK_BUILTINS = new Set(["echo", "printf", "test", "[", "true", "false", "pwd", "kill"]);

export { copyEnv };

export class Shell implements ShellApi {
  lastExit = 0;
  private localFrames: Map<string, string | undefined>[] = [];
  private bashRematch: string[] = [];

  constructor(
    public rc: RunContext,
    public env: ShellEnv,
    public cred: Cred,
    public positional: string[] = [],
    public argv0 = "bash",
    public depth = 0,
  ) {}

  get core(): Core {
    return this.rc.core;
  }

  // ------------------------------------------------------------ ShellApi
  markUnsupported(): void {
    this.rc.unsupported = true;
  }
  markClear(): void {
    this.rc.clear = true;
  }
  isBuiltin(name: string): boolean {
    return BUILTIN_NAMES.has(name);
  }
  isFunction(name: string): boolean {
    return name in this.env.functions;
  }

  runArgv(argv: string[], io: IO, cred: Cred): number {
    return this.dispatch(argv, io, cred, true);
  }

  runSource(src: string, io: IO, opts: { env: ShellEnv; cred: Cred; argv0: string; args: string[] }): number {
    if (this.depth > 20) {
      io.err.write("bash: maximum nesting level exceeded\n");
      return 1;
    }
    const sh = new Shell(this.rc, opts.env, opts.cred, opts.args, opts.argv0, this.depth + 1);
    let node: Node;
    try {
      node = parse(src);
    } catch (e) {
      if (e instanceof ParseError) {
        io.err.write(`${opts.argv0}: line ${e.line}: ${e.message}\n`);
        return 2;
      }
      throw e;
    }
    try {
      return sh.run(node, io);
    } catch (e) {
      if (e instanceof ExitSig) return e.code;
      if (e instanceof ReturnSig) return e.code;
      throw e;
    }
  }

  runScriptFile(path: string, args: string[], io: IO, cred: Cred, argv0: string): number {
    const fs = this.fs();
    let content: string;
    try {
      content = fs.readFile(normalizePath(path, this.env.cwd), cred);
    } catch (e) {
      if (e instanceof FsError) {
        io.err.write(`bash: ${path}: ${ERRNO_MSG[e.errno]}\n`);
        return e.errno === "ENOENT" ? 127 : 126;
      }
      throw e;
    }
    return this.runSource(content, io, { env: this.childEnv(true, cred), cred, argv0, args });
  }

  /** Environment for a child process: exported vars only, no functions. */
  childEnv(exportOnly: boolean, cred: Cred): ShellEnv {
    const e = copyEnv(this.env);
    if (exportOnly) {
      const vars: Record<string, string> = {};
      for (const k of e.exported) if (k in e.vars) vars[k] = e.vars[k];
      e.vars = vars;
      e.functions = {};
    }
    if (cred.user !== e.user) {
      const u = getUser(this.host(), cred.user);
      e.user = cred.user;
      e.vars.USER = cred.user;
      e.vars.LOGNAME = cred.user;
      e.vars.HOME = u?.home ?? "/";
      for (const k of ["USER", "LOGNAME", "HOME"]) if (!e.exported.includes(k)) e.exported.push(k);
    }
    return e;
  }

  // ------------------------------------------------------------ helpers
  host() {
    return this.core.host(this.env.host);
  }
  fs(): Fs {
    return this.core.fs(this.env.host);
  }
  step(): void {
    if (++this.rc.steps > MAX_STEPS) throw new LimitError(`script exceeded execution limit (${MAX_STEPS} statements)`);
  }

  getVar(name: string): string | undefined {
    switch (name) {
      case "?": return String(this.lastExit);
      case "#": return String(this.positional.length);
      case "@": case "*": return this.positional.join(" ");
      case "0": return this.argv0;
      case "$": return "4242";
      case "!": return "";
      case "-": return "hB";
      case "RANDOM": return String(this.core.random());
      case "UID": return String(this.cred.uid);
      case "EUID": return String(this.cred.uid);
      case "PWD": return this.env.cwd;
      case "OLDPWD": return this.env.oldpwd;
      case "BASH_REMATCH": return this.bashRematch[0] ?? "";
    }
    if (/^\d+$/.test(name)) {
      const i = parseInt(name, 10);
      return i === 0 ? this.argv0 : this.positional[i - 1];
    }
    return this.env.vars[name];
  }

  setVar(name: string, value: string): void {
    if (name === "PWD") this.env.cwd = normalizePath(value, this.env.cwd);
    this.env.vars[name] = value;
  }

  exportedEnv(cred: Cred): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of this.env.exported) if (k in this.env.vars) out[k] = this.env.vars[k];
    out.PWD = this.env.cwd;
    if (cred.user !== this.env.user) {
      out.USER = cred.user;
      out.LOGNAME = cred.user;
      out.HOME = getUser(this.host(), cred.user)?.home ?? "/";
      out.SUDO_USER = this.env.user;
    }
    return out;
  }

  // ------------------------------------------------------------ execution
  run(node: Node, io: IO): number {
    const code = this.exec(node, io);
    this.lastExit = code;
    return code;
  }

  private exec(node: Node, io: IO): number {
    switch (node.k) {
      case "simple":
        return this.execSimple(node, io);
      case "list": {
        let c = 0;
        for (const it of node.items) {
          c = this.exec(it, io);
          this.lastExit = c;
        }
        return c;
      }
      case "andor": {
        let c = this.exec(node.first, io);
        this.lastExit = c;
        for (const r of node.rest) {
          if ((r.op === "&&" && c === 0) || (r.op === "||" && c !== 0)) {
            c = this.exec(r.node, io);
            this.lastExit = c;
          }
        }
        return c;
      }
      case "pipeline":
        return this.execPipeline(node.cmds, node.negate, io);
      case "background":
        if (!this.rc.bgWarned) io.err.write("bash: background jobs (&) are not supported in this simulation; running in the foreground\n");
        this.rc.bgWarned = true;
        this.rc.unsupported = true;
        return this.exec(node.body, io);
      case "func":
        this.env.functions[node.name] = node.body;
        return 0;
      case "if":
        return this.withRedirs(node.redirs, io, (io2) => {
          for (const cl of node.clauses) {
            const c = this.exec(cl.cond, io2);
            this.lastExit = c;
            if (c === 0) return this.exec(cl.body, io2);
          }
          return node.else ? this.exec(node.else, io2) : 0;
        });
      case "for":
        return this.withRedirs(node.redirs, io, (io2) => {
          const items = node.items ? this.expandWords(node.items, io2.err) : [...this.positional];
          let c = 0;
          for (const it of items) {
            this.step();
            this.setVar(node.var, it);
            try {
              c = this.exec(node.body, io2);
              this.lastExit = c;
            } catch (e) {
              if (e instanceof BreakSig) {
                if (e.n > 1) throw new BreakSig(e.n - 1);
                break;
              }
              if (e instanceof ContinueSig) {
                if (e.n > 1) throw new ContinueSig(e.n - 1);
                continue;
              }
              throw e;
            }
          }
          return c;
        });
      case "while":
        return this.withRedirs(node.redirs, io, (io2) => {
          let c = 0;
          while (true) {
            this.step();
            const cond = this.exec(node.cond, io2);
            this.lastExit = cond;
            if ((cond === 0) === node.until) break;
            try {
              c = this.exec(node.body, io2);
              this.lastExit = c;
            } catch (e) {
              if (e instanceof BreakSig) {
                if (e.n > 1) throw new BreakSig(e.n - 1);
                break;
              }
              if (e instanceof ContinueSig) {
                if (e.n > 1) throw new ContinueSig(e.n - 1);
                continue;
              }
              throw e;
            }
          }
          return c;
        });
      case "case":
        return this.withRedirs(node.redirs, io, (io2) => {
          const w = this.expandNoSplit(node.word, io2.err);
          for (const it of node.items) {
            for (const p of it.patterns) {
              const f = this.expandPattern(p, io2.err);
              if (globMatch(f, w)) return it.body ? this.exec(it.body, io2) : 0;
            }
          }
          return 0;
        });
      case "group":
        return this.withRedirs(node.redirs, io, (io2) => this.exec(node.body, io2));
      case "subshell":
        return this.withRedirs(node.redirs, io, (io2) => this.subshell((sh) => sh.exec(node.body, io2)));
      case "arith":
        return this.withRedirs(node.redirs, io, (io2) => {
          this.step();
          try {
            const v = evalArith(this.expandArithSrc(node.src, io2.err), (n) => this.getVar(n), (n, v) => this.setVar(n, v));
            return v !== 0 ? 0 : 1;
          } catch (e) {
            if (e instanceof ArithError) {
              io2.err.write(`bash: ((: ${node.src}: ${e.message}\n`);
              return 1;
            }
            throw e;
          }
        });
      case "dbracket":
        return this.withRedirs(node.redirs, io, (io2) => {
          this.step();
          const toks: DTok[] = node.words.map((w) => {
            const f = this.expandFieldsRaw(w, io2.err, false)[0] ?? { s: "", pat: "", glob: false, keep: true };
            const quoted = w.parts.some((p) => p.t !== "lit" || p.q);
            return { s: f.s, pat: f.pat, quoted: quoted && !/^(==|=|!=|=~|&&|\|\||!|\(|\)|<|>)$/.test(w.raw) };
          });
          try {
            return evalDbracket(toks, this.fileTest(this.cred), (m) => (this.bashRematch = m));
          } catch (e) {
            if (e instanceof TestError) {
              io2.err.write(`bash: ${e.message}\n`);
              return 2;
            }
            throw e;
          }
        });
    }
  }

  private subshell(f: (sh: Shell) => number): number {
    if (++this.rc.nesting > 150) {
      this.rc.nesting = 0;
      throw new LimitError("maximum nesting depth exceeded (runaway recursion?)");
    }
    try {
      return this.subshellInner(f);
    } finally {
      this.rc.nesting = Math.max(0, this.rc.nesting - 1);
    }
  }

  private subshellInner(f: (sh: Shell) => number): number {
    const sh = new Shell(this.rc, copyEnv(this.env), this.cred, [...this.positional], this.argv0, this.depth + 1);
    sh.lastExit = this.lastExit;
    try {
      return f(sh);
    } catch (e) {
      if (e instanceof ExitSig) return e.code;
      throw e;
    }
  }

  private execPipeline(cmds: Node[], negate: boolean, io: IO): number {
    let code = 0;
    if (cmds.length === 1) code = this.exec(cmds[0], io);
    else {
      let input = io.stdin;
      for (let i = 0; i < cmds.length; i++) {
        const last = i === cmds.length - 1;
        const out = last ? io.out : new BufferWriter();
        const stageIo: IO = { stdin: input, out, err: io.err, tty: last ? io.tty : false };
        code = this.subshell((sh) => sh.exec(cmds[i], stageIo));
        if (!last) input = new InStream((out as BufferWriter).buf);
      }
    }
    return negate ? (code === 0 ? 1 : 0) : code;
  }

  // ------------------------------------------------------------ redirections
  private withRedirs(redirs: Redirect[], io: IO, f: (io: IO) => number): number {
    if (!redirs.length) return f(io);
    const r = this.openRedirs(redirs, io);
    if (!r) return 1;
    try {
      return f(r.io);
    } finally {
      r.flush();
    }
  }

  /** Returns null after printing an error if a redirect could not be opened. */
  private openRedirs(redirs: Redirect[], io: IO): { io: IO; flush: () => void } | null {
    const fds: Record<number, Writer | InStream> = { 0: io.stdin, 1: io.out, 2: io.err };
    let tty = io.tty;
    const pending: { path: string; buf: BufferWriter }[] = [];
    const fs = this.fs();
    const openOut = (target: string, append: boolean): Writer | null => {
      if (target === "/dev/null") return NullWriter;
      if (target === "/dev/stdout") return io.out;
      if (target === "/dev/stderr") return io.err;
      const p = normalizePath(target, this.env.cwd);
      try {
        const real = fs.checkWritable(p, this.cred);
        if (!append || !fs.exists(real)) fs.writeFile(real, "", this.cred, { umask: this.env.umask });
        const buf = new BufferWriter();
        pending.push({ path: real, buf });
        return buf;
      } catch (e) {
        if (e instanceof FsError) {
          io.err.write(`bash: ${target}: ${ERRNO_MSG[e.errno]}\n`);
          return null;
        }
        throw e;
      }
    };
    const flush = () => {
      for (const p of pending) if (p.buf.buf) fs.writeFile(p.path, p.buf.buf, null, { append: true });
    };
    for (const r of redirs) {
      if (r.op === "<<") {
        const body = r.heredoc!.quoted ? r.heredoc!.body : this.expandParts(parseHeredocBody(r.heredoc!.body), io.err);
        fds[r.fd] = new InStream(body);
        continue;
      }
      const target = r.target ? this.expandNoSplit(r.target, io.err) : "";
      if (r.op === "<<<") {
        fds[r.fd] = new InStream(target + "\n");
        continue;
      }
      if (r.op === "<") {
        if (target === "/dev/null") {
          fds[r.fd] = new InStream("");
          continue;
        }
        try {
          fds[r.fd] = new InStream(fs.readFile(normalizePath(target, this.env.cwd), this.cred));
        } catch (e) {
          if (e instanceof FsError) {
            io.err.write(`bash: ${target}: ${ERRNO_MSG[e.errno]}\n`);
            flush();
            return null;
          }
          throw e;
        }
        continue;
      }
      if (r.op === ">&" || r.op === "<&") {
        if (target === "-") continue;
        const src = parseInt(target, 10);
        if (!(src in fds)) {
          io.err.write(`bash: ${target}: Bad file descriptor\n`);
          return null;
        }
        fds[r.fd] = fds[src];
        if (r.fd === 1) tty = tty && src === 1;
        continue;
      }
      if (r.op === "&>" || r.op === "&>>") {
        const w = openOut(target, r.op === "&>>");
        if (!w) return null;
        fds[1] = w;
        fds[2] = w;
        tty = false;
        continue;
      }
      const w = openOut(target, r.op === ">>");
      if (!w) {
        flush();
        return null;
      }
      fds[r.fd] = w;
      if (r.fd === 1) tty = false;
    }
    const asWriter = (x: Writer | InStream | undefined, d: Writer): Writer => (x && !(x instanceof InStream) ? x : d);
    const stdin = fds[0] instanceof InStream ? fds[0] : io.stdin;
    return { io: { stdin, out: asWriter(fds[1], io.out), err: asWriter(fds[2], io.err), tty }, flush };
  }

  // ------------------------------------------------------------ simple commands
  private execSimple(n: Extract<Node, { k: "simple" }>, io: IO): number {
    this.step();
    let argv: string[];
    const assigns: [string, string, boolean][] = [];
    try {
      const first = n.words.length ? this.expandNoSplit(n.words[0], io.err) : "";
      if (ASSIGN_BUILTINS.has(first)) {
        argv = [first];
        for (const w of n.words.slice(1)) {
          const p0 = w.parts[0];
          if (p0 && p0.t === "lit" && !p0.q && /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(p0.v)) argv.push(this.expandNoSplit(w, io.err));
          else argv.push(...this.expandWord(w, io.err));
        }
      } else argv = this.expandWords(n.words, io.err);
      for (const a of n.assigns) assigns.push([a.name, this.expandNoSplit(a.value, io.err), a.append]);
    } catch (e) {
      if (e instanceof ExpandError) {
        io.err.write(e.message + "\n");
        return e.code;
      }
      throw e;
    }
    if (!argv.length) {
      for (const [k, v, app] of assigns) this.setVar(k, app ? (this.env.vars[k] ?? "") + v : v);
      const r = n.redirs.length ? this.openRedirs(n.redirs, io) : null;
      if (n.redirs.length && !r) return 1;
      r?.flush();
      return this.lastExit;
    }
    const r = this.openRedirs(n.redirs, io);
    if (!r) return 1;
    const saved: [string, string | undefined, boolean][] = [];
    for (const [k, v, app] of assigns) {
      saved.push([k, this.env.vars[k], this.env.exported.includes(k)]);
      this.env.vars[k] = app ? (this.env.vars[k] ?? "") + v : v;
      if (!this.env.exported.includes(k)) this.env.exported.push(k);
    }
    try {
      return this.dispatch(argv, r.io, this.cred, false);
    } finally {
      r.flush();
      for (const [k, v, wasExp] of saved.reverse()) {
        if (v === undefined) delete this.env.vars[k];
        else this.env.vars[k] = v;
        if (!wasExp) this.env.exported = this.env.exported.filter((x) => x !== k);
      }
    }
  }

  private dispatch(argv: string[], io: IO, cred: Cred, externalOnly: boolean): number {
    const name = argv[0];
    const disabled = this.core.state.scenario.disabledCommands;
    if (disabled.includes(name)) {
      io.err.write(`${name}: command disabled in this scenario\n`);
      this.rc.unsupported = true;
      return 127;
    }
    if (!externalOnly && name in this.env.functions) return this.callFunction(name, argv.slice(1), io);
    if (!externalOnly || SUDO_OK_BUILTINS.has(name)) {
      const b = this.builtin(name, argv, io, cred);
      if (b !== null) return b;
    } else if (BUILTIN_NAMES.has(name)) {
      io.err.write(`sudo: ${name}: command not found\n`);
      return 1;
    }
    if (name.includes("/")) return this.execPath(name, argv, io, cred);
    const fn = COMMANDS[name];
    if (fn) return fn(this.makeCtx(name, argv.slice(1), io, cred));
    io.err.write(`${name}: command not supported in this simulation (try 'help')\n`);
    this.rc.unsupported = true;
    return 127;
  }

  makeCtx(name: string, args: string[], io: IO, cred: Cred): CmdCtx {
    const host = this.host();
    return {
      name,
      args,
      io,
      cred,
      core: this.core,
      host,
      fs: this.fs(),
      cwd: this.env.cwd,
      env: this.exportedEnv(cred),
      umask: this.env.umask,
      shell: this,
      out: (s) => io.out.write(s),
      err: (s) => io.err.write(s),
      abs: (p) => normalizePath(p, this.env.cwd),
      fsErr: (e, arg, prefix) => {
        if (e instanceof FsError) {
          io.err.write(`${prefix ?? name}: ${arg}: ${ERRNO_MSG[e.errno]}\n`);
          return 1;
        }
        throw e;
      },
      unsupported: (msg, code = 2) => {
        io.err.write(msg + "\n");
        this.rc.unsupported = true;
        return code;
      },
    };
  }

  private execPath(name: string, argv: string[], io: IO, cred: Cred): number {
    const fs = this.fs();
    const p = normalizePath(name, this.env.cwd);
    let res;
    try {
      res = fs.resolve(p, cred, true);
    } catch (e) {
      if (e instanceof FsError) {
        io.err.write(`bash: ${name}: ${ERRNO_MSG[e.errno]}\n`);
        return e.errno === "ENOENT" || e.errno === "ENOTDIR" ? 127 : 126;
      }
      throw e;
    }
    if (res.node.type === "dir") {
      io.err.write(`bash: ${name}: Is a directory\n`);
      return 126;
    }
    if (!hasPerm(res.node, cred, X)) {
      io.err.write(`bash: ${name}: Permission denied\n`);
      return 126;
    }
    const content = res.node.content;
    if (content.startsWith("\x7fELF ")) {
      const cmd = content.slice(5).trim();
      const fn = COMMANDS[cmd];
      if (fn) return fn(this.makeCtx(cmd, argv.slice(1), io, cred));
      if (BUILTIN_NAMES.has(cmd)) return this.builtin(cmd, [cmd, ...argv.slice(1)], io, cred) ?? 0;
      io.err.write(`${name}: binary not supported in this simulation\n`);
      this.rc.unsupported = true;
      return 127;
    }
    if (!hasPerm(res.node, cred, R)) {
      io.err.write(`bash: ${name}: Permission denied\n`);
      return 126;
    }
    const firstLine = content.split("\n")[0];
    if (firstLine.startsWith("#!")) {
      const parts = firstLine.slice(2).replace(/^[ \t]+|[ \t]+$/g, "").split(/[ \t]+/);
      let interp = parts[0];
      const okInterps = ["/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh", "/bin/dash", "/usr/bin/dash"];
      if (interp === "/usr/bin/env" || interp === "/bin/env") interp = parts[1] ?? "";
      const base = interp.split("/").pop() ?? "";
      if (!okInterps.includes(interp) && !["bash", "sh", "dash"].includes(interp)) {
        const known = ["python", "python3", "perl", "ruby", "node", "zsh"];
        if (known.some((k) => base === k || base.startsWith(k))) {
          io.err.write(`bash: ${name}: interpreter '${interp}' is not supported in this simulation (only shell scripts run)\n`);
          this.rc.unsupported = true;
          return 127;
        }
        io.err.write(`bash: ${name}: ${interp}: bad interpreter: No such file or directory\n`);
        return 126;
      }
    }
    return this.runSource(content, io, { env: this.childEnv(true, cred), cred, argv0: name, args: argv.slice(1) });
  }

  private callFunction(name: string, args: string[], io: IO): number {
    if (this.localFrames.length > 100 || this.rc.nesting > 150) throw new LimitError(`${name}: maximum function nesting level exceeded (100)`);
    const savedPos = this.positional;
    this.positional = args;
    const frame = new Map<string, string | undefined>();
    this.localFrames.push(frame);
    try {
      return this.exec(this.env.functions[name] as Node, io);
    } catch (e) {
      if (e instanceof ReturnSig) return e.code;
      throw e;
    } finally {
      this.positional = savedPos;
      this.localFrames.pop();
      for (const [k, v] of frame) {
        if (v === undefined) delete this.env.vars[k];
        else this.env.vars[k] = v;
      }
    }
  }

  fileTest(cred: Cred): FileTest {
    const fs = this.fs();
    return (op, path) => {
      const p = normalizePath(path, this.env.cwd);
      if (op === "-L" || op === "-h") return fs.tryResolve(p, cred, false)?.node.type === "symlink";
      const r = fs.tryResolve(p, cred, true);
      if (!r) return false;
      switch (op) {
        case "-e": return true;
        case "-f": return r.node.type === "file";
        case "-d": return r.node.type === "dir";
        case "-s": return r.node.type === "dir" || r.node.content.length > 0;
        case "-r": return hasPerm(r.node, cred, R);
        case "-w": return hasPerm(r.node, cred, W);
        case "-x": return hasPerm(r.node, cred, X);
        case "-O": return r.node.owner === cred.user;
        case "-G": return cred.groups.includes(r.node.group);
        case "-u": return (r.node.mode & 0o4000) !== 0;
        case "-g": return (r.node.mode & 0o2000) !== 0;
        case "-k": return (r.node.mode & 0o1000) !== 0;
        default: return false;
      }
    };
  }

  // ------------------------------------------------------------ builtins
  /** Returns null if `name` is not a builtin. */
  private builtin(name: string, argv: string[], io: IO, cred: Cred): number | null {
    const args = argv.slice(1);
    const err = (s: string) => io.err.write(s);
    switch (name) {
      case ":":
      case "true":
        return 0;
      case "false":
        return 1;
      case "exit":
      case "logout": {
        const c = args[0] !== undefined ? parseInt(args[0], 10) : this.lastExit;
        if (args[0] !== undefined && !Number.isFinite(c)) {
          err(`bash: exit: ${args[0]}: numeric argument required\n`);
          throw new ExitSig(2);
        }
        throw new ExitSig(((c % 256) + 256) % 256);
      }
      case "return": {
        if (!this.localFrames.length && this.depth === 0) {
          err("bash: return: can only `return' from a function or sourced script\n");
          return 1;
        }
        throw new ReturnSig(args[0] !== undefined ? parseInt(args[0], 10) & 255 : this.lastExit);
      }
      case "break":
      case "continue": {
        const nlev = args[0] ? Math.max(1, parseInt(args[0], 10) || 1) : 1;
        throw name === "break" ? new BreakSig(nlev) : new ContinueSig(nlev);
      }
      case "cd":
        return this.cd(args, io, cred);
      case "pwd":
        io.out.write(this.env.cwd + "\n");
        return 0;
      case "export": {
        if (!args.length || args[0] === "-p") {
          for (const k of [...this.env.exported].sort()) if (k in this.env.vars) io.out.write(`declare -x ${k}="${this.env.vars[k]}"\n`);
          return 0;
        }
        let code = 0;
        for (const a of args) {
          if (a === "-n") continue;
          const eq = a.indexOf("=");
          const k = eq >= 0 ? a.slice(0, eq) : a;
          if (!isIdent(k)) {
            err(`bash: export: \`${a}': not a valid identifier\n`);
            code = 1;
            continue;
          }
          if (eq >= 0) this.setVar(k, a.slice(eq + 1));
          if (!this.env.exported.includes(k)) this.env.exported.push(k);
        }
        return code;
      }
      case "unset": {
        for (const a of args) {
          if (a === "-v" || a === "-f") continue;
          if (args.includes("-f")) delete this.env.functions[a];
          else {
            delete this.env.vars[a];
            this.env.exported = this.env.exported.filter((x) => x !== a);
          }
        }
        return 0;
      }
      case "local":
      case "declare":
      case "typeset":
      case "readonly": {
        if (name === "local" && !this.localFrames.length) {
          err("bash: local: can only be used in a function\n");
          return 1;
        }
        const frame = this.localFrames[this.localFrames.length - 1];
        let exportIt = false;
        for (const a of args) {
          if (a.startsWith("-")) {
            if (a.includes("x")) exportIt = true;
            continue;
          }
          const eq = a.indexOf("=");
          const k = eq >= 0 ? a.slice(0, eq) : a;
          if (!isIdent(k)) {
            err(`bash: ${name}: \`${a}': not a valid identifier\n`);
            return 1;
          }
          if (frame && name !== "readonly" && !frame.has(k)) frame.set(k, this.env.vars[k]);
          if (eq >= 0) this.setVar(k, a.slice(eq + 1));
          else if (!(k in this.env.vars)) this.setVar(k, "");
          if (exportIt && !this.env.exported.includes(k)) this.env.exported.push(k);
        }
        return 0;
      }
      case "read":
        return this.read(args, io);
      case "shift": {
        const k = args[0] ? parseInt(args[0], 10) : 1;
        if (k > this.positional.length) return 1;
        this.positional = this.positional.slice(k);
        return 0;
      }
      case "set": {
        if (args[0] === "--") {
          this.positional = args.slice(1);
          return 0;
        }
        if (!args.length) {
          for (const k of Object.keys(this.env.vars).sort()) io.out.write(`${k}=${this.env.vars[k]}\n`);
          return 0;
        }
        if (args.every((a) => /^[-+][euxo]+$/.test(a) || a === "pipefail")) {
          err("bash: set: shell options (-e, -u, -x, -o) are accepted but ignored in this simulation\n");
          return 0;
        }
        this.positional = args;
        return 0;
      }
      case "source":
      case ".": {
        if (!args[0]) {
          err(`bash: ${name}: filename argument required\n`);
          return 2;
        }
        let content: string;
        try {
          content = this.fs().readFile(normalizePath(args[0], this.env.cwd), cred);
        } catch (e) {
          if (e instanceof FsError) {
            err(`bash: ${args[0]}: ${ERRNO_MSG[e.errno]}\n`);
            return 1;
          }
          throw e;
        }
        let node: Node;
        try {
          node = parse(content);
        } catch (e) {
          if (e instanceof ParseError) {
            err(`${args[0]}: line ${e.line}: ${e.message}\n`);
            return 2;
          }
          throw e;
        }
        const savedPos = this.positional;
        if (args.length > 1) this.positional = args.slice(1);
        this.localFrames.push(new Map());
        try {
          return this.exec(node, io);
        } catch (e) {
          if (e instanceof ReturnSig) return e.code;
          throw e;
        } finally {
          this.localFrames.pop();
          this.positional = savedPos;
        }
      }
      case "eval": {
        const src = args.join(" ");
        let node: Node;
        try {
          node = parse(src);
        } catch (e) {
          if (e instanceof ParseError) {
            err(`bash: eval: line ${e.line}: ${e.message}\n`);
            return 2;
          }
          throw e;
        }
        return this.exec(node, io);
      }
      case "umask": {
        if (!args.length) {
          io.out.write(this.env.umask.toString(8).padStart(4, "0") + "\n");
          return 0;
        }
        if (!/^[0-7]{1,4}$/.test(args[0])) {
          err(`bash: umask: ${args[0]}: octal number out of range (symbolic umask is not supported in this simulation)\n`);
          return 1;
        }
        this.env.umask = parseInt(args[0], 8);
        return 0;
      }
      case "type": {
        let code = 0;
        for (const a of args.filter((x) => !x.startsWith("-"))) {
          if (a in this.env.functions) io.out.write(`${a} is a function\n`);
          else if (BUILTIN_NAMES.has(a)) io.out.write(`${a} is a shell builtin\n`);
          else if (["if", "then", "else", "fi", "for", "while", "do", "done", "case", "esac"].includes(a)) io.out.write(`${a} is a shell keyword\n`);
          else if (COMMANDS[a]) io.out.write(`${a} is ${pathOf(a)}\n`);
          else {
            err(`bash: type: ${a}: not found\n`);
            code = 1;
          }
        }
        return code;
      }
      case "command": {
        if (args[0] === "-v") {
          let code = 0;
          for (const a of args.slice(1)) {
            if (a in this.env.functions || BUILTIN_NAMES.has(a)) io.out.write(a + "\n");
            else if (COMMANDS[a]) io.out.write(pathOf(a) + "\n");
            else code = 1;
          }
          return code;
        }
        if (!args.length) return 0;
        return this.dispatch(args, io, cred, false);
      }
      case "history": {
        const st = this.core.state;
        if (args[0] === "-c") {
          st.history = [];
          return 0;
        }
        const n = args[0] ? parseInt(args[0], 10) : st.history.length;
        const start = Math.max(0, st.history.length - (Number.isFinite(n) ? n : st.history.length));
        for (let i = start; i < st.history.length; i++) io.out.write(`${String(i + 1).padStart(5)}  ${st.history[i]}\n`);
        return 0;
      }
      case "alias":
      case "unalias":
        err(`bash: ${name}: aliases are not supported in this simulation (try a function: name() { ...; })\n`);
        this.rc.unsupported = true;
        return 1;
      case "exec":
        if (!args.length) return 0;
        return this.dispatch(args, io, cred, false);
      case "wait":
        return 0;
      case "jobs":
      case "fg":
      case "bg":
        err(`bash: ${name}: job control is not supported in this simulation\n`);
        this.rc.unsupported = true;
        return 1;
      case "let": {
        let v = 0;
        try {
          for (const a of args) v = evalArith(a, (n) => this.getVar(n), (n, x) => this.setVar(n, x));
        } catch (e) {
          if (e instanceof ArithError) {
            err(`bash: let: ${e.message}\n`);
            return 1;
          }
          throw e;
        }
        return v !== 0 ? 0 : 1;
      }
      case "test":
      case "[": {
        let targs = args;
        if (name === "[") {
          if (targs[targs.length - 1] !== "]") {
            err("bash: [: missing `]'\n");
            return 2;
          }
          targs = targs.slice(0, -1);
        }
        try {
          return evalTest(targs, this.fileTest(cred), `bash: ${name}`);
        } catch (e) {
          if (e instanceof TestError) {
            err(`${e.message}\n`);
            return 2;
          }
          throw e;
        }
      }
      case "sudo":
        return this.sudo(args, io, cred);
    }
    return null;
  }

  private cd(args: string[], io: IO, cred: Cred): number {
    const a = args.filter((x) => x !== "-L" && x !== "-P");
    if (a.length > 1) {
      io.err.write("bash: cd: too many arguments\n");
      return 1;
    }
    let target = a[0] ?? this.env.vars.HOME ?? "/";
    if (target === "-") {
      target = this.env.oldpwd;
      io.out.write(target + "\n");
    }
    const p = normalizePath(target, this.env.cwd);
    const fs = this.fs();
    try {
      const r = fs.resolve(p, cred, true);
      if (r.node.type !== "dir") {
        io.err.write(`bash: cd: ${target}: Not a directory\n`);
        return 1;
      }
      if (!hasPerm(r.node, cred, X)) {
        io.err.write(`bash: cd: ${target}: Permission denied\n`);
        return 1;
      }
    } catch (e) {
      if (e instanceof FsError) {
        io.err.write(`bash: cd: ${target}: ${ERRNO_MSG[e.errno]}\n`);
        return 1;
      }
      throw e;
    }
    this.env.oldpwd = this.env.cwd;
    this.env.cwd = p;
    this.env.vars.PWD = p;
    this.env.vars.OLDPWD = this.env.oldpwd;
    return 0;
  }

  private read(args: string[], io: IO): number {
    let raw = false;
    const names: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-r") raw = true;
      else if (a === "-p") io.err.write(args[++i] ?? "");
      else if (a === "-s") continue;
      else if (a === "-t" || a === "-n" || a === "-d" || a === "-a") {
        io.err.write(`bash: read: option ${a} is not supported in this simulation\n`);
        this.rc.unsupported = true;
        return 2;
      } else names.push(a);
    }
    let line = io.stdin.readLine();
    if (line === null) {
      for (const n of names) this.setVar(n, "");
      return 1;
    }
    if (!raw) {
      while (line.endsWith("\\")) {
        const next = io.stdin.readLine();
        line = line.slice(0, -1) + (next ?? "");
        if (next === null) break;
      }
      line = line.replace(/\\(.)/g, "$1");
    }
    if (!names.length) {
      this.setVar("REPLY", line);
      return 0;
    }
    const ifs = this.env.vars.IFS ?? " \t\n";
    const ws = ifs.replace(/[^ \t\n]/g, "");
    let rest = ws ? line.replace(new RegExp(`^[${escapeCls(ws)}]+|[${escapeCls(ws)}]+$`, "g"), "") : line;
    for (let i = 0; i < names.length; i++) {
      if (i === names.length - 1) {
        this.setVar(names[i], rest);
        break;
      }
      const m = new RegExp(`^([^${escapeCls(ifs)}]*)[${escapeCls(ifs)}]+`).exec(rest);
      if (!m) {
        this.setVar(names[i], rest);
        rest = "";
        continue;
      }
      this.setVar(names[i], m[1]);
      rest = rest.slice(m[0].length);
      if (ws) rest = rest.replace(new RegExp(`^[${escapeCls(ws)}]+`), "");
    }
    return 0;
  }

  private sudo(args: string[], io: IO, cred: Cred): number {
    const host = this.host();
    let target = "root";
    let i = 0;
    let login = false;
    let shellMode = false;
    while (i < args.length && args[i].startsWith("-")) {
      const a = args[i];
      if (a === "--") {
        i++;
        break;
      }
      if (a === "-u") target = args[++i] ?? "root";
      else if (a.startsWith("-u") && a.length > 2) target = a.slice(2);
      else if (a === "-i") login = true;
      else if (a === "-s") shellMode = true;
      else if (a === "-E" || a === "-H" || a === "-n" || a === "-S") {
        /* accepted */
      } else if (a === "-l") {
        io.out.write(`User ${cred.user} may run the following commands on ${host.name}:\n    (ALL : ALL) ALL\n`);
        return 0;
      } else {
        io.err.write(`sudo: option '${a}' is not supported in this simulation\n`);
        this.rc.unsupported = true;
        return 1;
      }
      i++;
    }
    const allowed = cred.uid === 0 || cred.groups.includes("sudo") || cred.groups.includes("wheel") || cred.groups.includes("admin");
    if (!allowed) {
      io.err.write(`${cred.user} is not in the sudoers file.  This incident will be reported.\n`);
      return 1;
    }
    if (!getUser(host, target)) {
      io.err.write(`sudo: unknown user ${target}\n`);
      return 1;
    }
    const tcred = credFor(host, target);
    const rest = args.slice(i);
    if (login || shellMode) {
      if (rest.length) return this.runSource(rest.join(" "), io, { env: this.childEnv(true, tcred), cred: tcred, argv0: "bash", args: [] });
      return this.dispatch(["su", "-", target], io, credFor(host, "root"), true);
    }
    if (!rest.length) {
      io.err.write("usage: sudo [-u user] [-i | -s] command [args...]\n");
      return 1;
    }
    return this.dispatch(rest, io, tcred, true);
  }

  // ------------------------------------------------------------ expansion
  expandWords(words: Word[], err: Writer): string[] {
    const out: string[] = [];
    for (const w of words) for (const b of braceExpand(w)) out.push(...this.expandWord(b, err));
    return out;
  }

  expandWord(w: Word, err: Writer): string[] {
    const fields = this.expandFieldsRaw(w, err, true);
    const out: string[] = [];
    for (const f of fields) {
      if (f.glob) {
        const m = this.glob(f.pat);
        if (m.length) {
          out.push(...m);
          continue;
        }
      }
      out.push(f.s);
    }
    return out;
  }

  expandNoSplit(w: Word, err: Writer): string {
    return this.expandFieldsRaw(w, err, false).map((f) => f.s).join(" ");
  }

  /** Expand as a glob pattern (quoted parts escaped) for case / [[ == ]]. */
  expandPattern(w: Word, err: Writer): string {
    return this.expandFieldsRaw(w, err, false).map((f) => f.pat).join(" ");
  }

  private expandParts(parts: WordPart[], err: Writer): string {
    return this.expandFieldsRaw({ parts, raw: "" }, err, false).map((f) => f.s).join(" ");
  }

  expandFieldsRaw(w: Word, err: Writer, split: boolean): Field[] {
    type Seg = { text: string; quoted: boolean; split: boolean } | { brk: true };
    const segs: Seg[] = [];
    for (const p of w.parts) {
      switch (p.t) {
        case "lit":
          segs.push({ text: p.v, quoted: p.q, split: false });
          break;
        case "tilde": {
          let home: string | undefined;
          if (!p.user) home = this.env.vars.HOME;
          else home = getUser(this.host(), p.user)?.home;
          segs.push({ text: home ?? "~" + p.user, quoted: true, split: false });
          break;
        }
        case "param": {
          if (p.name === "@" && p.q && !p.op) {
            if (this.positional.length === 0) {
              segs.push({ brk: true });
              segs.push({ brk: true });
              break;
            }
            this.positional.forEach((a, i) => {
              if (i > 0) segs.push({ brk: true });
              segs.push({ text: a, quoted: true, split: false });
            });
            break;
          }
          const v = this.paramValue(p, err);
          segs.push({ text: v, quoted: p.q, split: !p.q });
          break;
        }
        case "cmd": {
          const v = this.cmdSub(p.src, err);
          segs.push({ text: v, quoted: p.q, split: !p.q });
          break;
        }
        case "arith": {
          let v: number;
          try {
            v = evalArith(this.expandArithSrc(p.src, err), (n) => this.getVar(n), (n, x) => this.setVar(n, x));
          } catch (e) {
            if (e instanceof ArithError) throw new ExpandError(`bash: ${p.src}: ${e.message}`);
            throw e;
          }
          segs.push({ text: String(v), quoted: p.q, split: !p.q });
          break;
        }
      }
    }
    const fields: Field[] = [];
    let cur: Field | null = null;
    const nf = (): Field => ({ s: "", pat: "", glob: false, keep: false });
    const append = (text: string, quoted: boolean) => {
      cur ??= nf();
      cur.s += text;
      cur.pat += quoted ? escapeGlob(text) : text;
      if (quoted) cur.keep = true;
      else if (hasGlob(text)) cur.glob = true;
    };
    let atEmpty = 0;
    for (const sg of segs) {
      if ("brk" in sg) {
        atEmpty++;
        if (cur) {
          fields.push(cur);
          cur = null;
        }
        continue;
      }
      if (sg.split && split) {
        const ifs = this.env.vars.IFS ?? " \t\n";
        if (ifs === "") {
          append(sg.text, false);
          continue;
        }
        const re = new RegExp(`[${escapeCls(ifs)}]+`);
        const pieces = sg.text.split(re);
        pieces.forEach((piece, idx) => {
          if (idx > 0 && cur) {
            fields.push(cur);
            cur = null;
          }
          if (piece !== "") append(piece, false);
        });
        continue;
      }
      if (sg.split && !split) {
        cur ??= nf();
        cur.s += sg.text;
        cur.pat += sg.text;
        continue;
      }
      append(sg.text, sg.quoted);
    }
    if (cur) fields.push(cur);
    const out = fields.filter((f) => f.s !== "" || f.keep);
    if (!split) return out.length ? out : [{ s: "", pat: "", glob: false, keep: true }];
    void atEmpty;
    return out;
  }

  private expandArithSrc(src: string, err: Writer): string {
    if (!src.includes("$")) return src;
    const w = parseWordStringSafe(src);
    return this.expandParts(w, err);
  }

  private paramValue(p: Extract<WordPart, { t: "param" }>, err: Writer): string {
    const name = p.name;
    const v = this.getVar(name);
    const set = v !== undefined && !(name === "@" || name === "*" ? this.positional.length === 0 : false);
    const argStr = () => (p.arg ? this.expandParts(p.arg, err) : "");
    switch (p.op) {
      case undefined:
        return v ?? "";
      case "^^":
        return (v ?? "").toUpperCase();
      case ",,":
        return (v ?? "").toLowerCase();
      case "^":
        return (v ?? "").charAt(0).toUpperCase() + (v ?? "").slice(1);
      case ",":
        return (v ?? "").charAt(0).toLowerCase() + (v ?? "").slice(1);
      case "len":
        if (name === "@" || name === "*" || name === "#") return String(this.positional.length);
        return String((v ?? "").length);
      case ":-":
        return set && v !== "" ? v! : argStr();
      case "-":
        return set ? v! : argStr();
      case ":=":
      case "=": {
        if (p.op === ":=" ? !set || v === "" : !set) {
          const a = argStr();
          this.setVar(name, a);
          return a;
        }
        return v!;
      }
      case ":+":
        return set && v !== "" ? argStr() : "";
      case "+":
        return set ? argStr() : "";
      case ":?":
      case "?":
        if (p.op === ":?" ? !set || v === "" : !set) throw new ExpandError(`bash: ${name}: ${argStr() || "parameter null or not set"}`);
        return v!;
      case "#":
      case "##":
      case "%":
      case "%%": {
        const s = v ?? "";
        const pat = p.arg ? this.expandFieldsRaw({ parts: p.arg, raw: "" }, err, false).map((f) => f.pat).join("") : "";
        const re = safeRegex("^" + globToRegexSrc(pat, false) + "$");
        if (!re) return s;
        if (p.op === "#") {
          for (let i = 0; i <= s.length; i++) if (re.test(s.slice(0, i))) return s.slice(i);
        } else if (p.op === "##") {
          for (let i = s.length; i >= 0; i--) if (re.test(s.slice(0, i))) return s.slice(i);
        } else if (p.op === "%") {
          for (let i = s.length; i >= 0; i--) if (re.test(s.slice(i))) return s.slice(0, i);
        } else {
          for (let i = 0; i <= s.length; i++) if (re.test(s.slice(i))) return s.slice(0, i);
        }
        return s;
      }
      case "/":
      case "//": {
        const s = v ?? "";
        const pat = p.arg ? this.expandFieldsRaw({ parts: p.arg, raw: "" }, err, false).map((f) => f.pat).join("") : "";
        const rep = p.arg2 ? this.expandParts(p.arg2, err) : "";
        if (!pat) return s;
        const re = safeRegex(globToRegexSrc(pat, false), p.op === "//" ? "g" : "");
        return re ? s.replace(re, () => rep) : s;
      }
    }
    return v ?? "";
  }

  private cmdSub(src: string, err: Writer): string {
    let node: Node;
    try {
      node = parse(src);
    } catch (e) {
      if (e instanceof ParseError) {
        err.write(`bash: command substitution: ${e.message}\n`);
        this.lastExit = 2;
        return "";
      }
      throw e;
    }
    const out = new BufferWriter();
    const code = this.subshell((sh) => sh.run(node, { stdin: InStream.empty(), out, err, tty: false }));
    this.lastExit = code;
    return out.buf.replace(/\n+$/, "");
  }

  /** Expand a glob pattern (with backslash escapes) against the filesystem. */
  glob(pattern: string): string[] {
    const fs = this.fs();
    const absolute = pattern.startsWith("/");
    const segs = pattern.split("/").filter((s, i) => s !== "" || i === 0);
    let entries: { real: string; disp: string }[] = [{ real: absolute ? "/" : this.env.cwd, disp: absolute ? "/" : "" }];
    const startIdx = absolute ? 1 : 0;
    for (let i = startIdx; i < segs.length; i++) {
      const seg = segs[i];
      if (seg === "") continue;
      const next: { real: string; disp: string }[] = [];
      const sep = (d: string) => (d === "" || d.endsWith("/") ? d : d + "/");
      if (!hasGlob(seg)) {
        const lit = unescapeGlob(seg);
        for (const e of entries) next.push({ real: normalizePath(lit, e.real), disp: sep(e.disp) + lit });
      } else {
        for (const e of entries) {
          let names: string[];
          try {
            names = fs.readdir(e.real, this.cred).names;
          } catch {
            continue;
          }
          for (const n of names) {
            if (n.startsWith(".") && !seg.startsWith(".") && !seg.startsWith("\\.")) continue;
            if (globMatch(seg, n)) next.push({ real: joinPath(normalizePath(e.real), n), disp: sep(e.disp) + n });
          }
        }
      }
      entries = next;
      if (!entries.length) return [];
    }
    return entries.filter((e) => fs.tryResolve(e.real, null, false)).map((e) => e.disp + (pattern.endsWith("/") ? "/" : "")).sort();
  }
}

/** Bash brace expansion ({a,b}, {1..5}) on unquoted literal text within one word part. */
export function braceExpand(w: Word, depth = 0): Word[] {
  if (depth > 8) return [w];
  for (let pi = 0; pi < w.parts.length; pi++) {
    const p = w.parts[pi];
    if (p.t !== "lit" || p.q || !p.v.includes("{")) continue;
    const v = p.v;
    for (let i = 0; i < v.length; i++) {
      if (v[i] !== "{" || (i > 0 && v[i - 1] === "$")) continue;
      let d = 0;
      let j = i;
      const commas: number[] = [];
      for (; j < v.length; j++) {
        if (v[j] === "{") d++;
        else if (v[j] === "}") {
          d--;
          if (d === 0) break;
        } else if (v[j] === "," && d === 1) commas.push(j);
      }
      if (j >= v.length) break;
      const inner = v.slice(i + 1, j);
      let alts: string[] | null = null;
      if (commas.length) {
        alts = [];
        let start = i + 1;
        for (const c of [...commas, j]) {
          alts.push(v.slice(start, c));
          start = c + 1;
        }
      } else {
        const m = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(inner) ?? /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(inner);
        if (m) {
          alts = [];
          const isNum = /\d/.test(m[1]);
          const a = isNum ? parseInt(m[1], 10) : m[1].charCodeAt(0);
          const b = isNum ? parseInt(m[2], 10) : m[2].charCodeAt(0);
          const step = Math.max(1, Math.abs(m[3] ? parseInt(m[3], 10) : 1));
          const width = isNum && /^-?0\d/.test(m[1]) ? m[1].length : 0;
          for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? step : -step) {
            alts.push(isNum ? String(x).padStart(width, "0") : String.fromCharCode(x));
            if (alts.length > 10000) break;
          }
        }
      }
      if (!alts) continue;
      const pre = v.slice(0, i);
      const post = v.slice(j + 1);
      const out: Word[] = [];
      for (const a of alts) {
        const parts = [...w.parts];
        parts[pi] = { t: "lit", v: pre + a + post, q: false };
        out.push(...braceExpand({ parts, raw: w.raw }, depth + 1));
      }
      return out;
    }
  }
  return [w];
}

function escapeCls(s: string): string {
  return s.replace(/[\\\]\[^-]/g, "\\$&").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}

function parseWordStringSafe(src: string): WordPart[] {
  return parseWordString(src).parts;
}

export function pathOf(cmd: string): string {
  return COMMAND_PATHS[cmd] ?? `/usr/bin/${cmd}`;
}
