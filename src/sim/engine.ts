/**
 * Deterministic Linux + networking simulator. Pure TypeScript: no Node/DOM APIs,
 * no wall clock, no randomness. The same scenario + event log always yields the
 * same state, so the server can replay a learner's session and grade it.
 */
import { SimScenarioSchema, type ExecResult, type SimEvent, type SimScenario } from "./schema";
import { Core } from "./core";
import { FsError, ERRNO_MSG } from "./fs";
import { parse, ParseError } from "./shell/parser";
import { ExitSig, LimitError, RunContext, Shell } from "./shell/interpreter";
import { buildState, credFor, getUser, makeSession } from "./state";
import { COMMANDS, BUILTIN_NAMES } from "./commands/registry";
import { BufferWriter, InStream, type Cred, type HostState, type SimState } from "./types";
import { joinPath, normalizePath, tildify } from "./util";

/** Max characters of stdout returned by a single exec(). */
export const MAX_STDOUT = 20_000;

/** JSON-serializable deep state. */
export type SimSnapshot = SimState;

export class Simulation {
  /** @internal */
  core: Core;

  constructor(scenario: SimScenario) {
    const parsed = SimScenarioSchema.parse(scenario);
    this.core = new Core(buildState(parsed));
  }

  /** @internal raw mutable state (used by evaluate.ts). */
  get state(): SimState {
    return this.core.state;
  }

  get history(): string[] {
    return [...this.core.state.history];
  }
  get cwd(): string {
    return this.core.session().cwd;
  }
  get currentHost(): string {
    return this.core.session().host;
  }
  get currentUser(): string {
    return this.core.session().user;
  }
  /** Epoch seconds of the simulated clock. */
  get clock(): number {
    return this.core.state.clock;
  }

  /** @internal */
  host(name?: string): HostState {
    return this.core.host(name ?? this.currentHost);
  }

  private cred(): Cred {
    const s = this.core.session();
    return credFor(this.core.host(s.host), s.user);
  }

  prompt(): string {
    const s = this.core.session();
    const home = getUser(this.core.host(s.host), s.user)?.home ?? "";
    return `${s.user}@${s.host}:${tildify(s.cwd, home)}${s.user === "root" ? "#" : "$"}`;
  }

  /** Execute one line typed at the prompt. Advances the clock by 1 second. */
  exec(line: string): ExecResult {
    const st = this.core.state;
    st.clock += 1;
    if (line.trim() !== "") st.history.push(line);
    const out = new BufferWriter();
    const err = new BufferWriter();
    const rc = new RunContext(this.core);
    const session = this.core.session();
    let code: number;
    let node;
    try {
      node = parse(line);
    } catch (e) {
      if (e instanceof ParseError) {
        st.lastExit = 2;
        return { stdout: "", stderr: `bash: ${e.message}\n`, exitCode: 2 };
      }
      throw e;
    }
    const shell = new Shell(rc, session, this.cred(), [], "bash", 0);
    shell.lastExit = st.lastExit;
    try {
      code = shell.run(node, { stdin: InStream.empty(), out, err, tty: true });
    } catch (e) {
      if (e instanceof ExitSig) {
        code = e.code;
        if (st.sessions.length > 1) {
          const popped = st.sessions.pop()!;
          out.write(popped.kind === "ssh" ? `logout\nConnection to ${popped.host} closed.\n` : "logout\n");
        } else {
          out.write("logout\n");
          err.write("(this is the top-level session of the lab; it stays open)\n");
        }
      } else if (e instanceof LimitError) {
        err.write(`bash: ${e.message}\n`);
        code = 124;
      } else if (e instanceof RangeError) {
        err.write("bash: maximum recursion depth exceeded\n");
        code = 1;
      } else {
        // never crash the terminal: report and keep the session usable
        err.write(`bash: internal simulator error: ${e instanceof Error ? e.message : String(e)}\n`);
        code = 1;
      }
    }
    st.lastExit = code;
    let stdout = out.buf;
    if (stdout.length > MAX_STDOUT || out.truncated) {
      const extra = stdout.length - MAX_STDOUT;
      stdout = stdout.slice(0, MAX_STDOUT) + `\n... [output truncated: ${extra > 0 ? extra + " more characters" : "too much output"}]\n`;
    }
    let stderr = err.buf;
    if (stderr.length > MAX_STDOUT) stderr = stderr.slice(0, MAX_STDOUT) + "\n... [error output truncated]\n";
    const res: ExecResult = { stdout, stderr, exitCode: code };
    if (rc.unsupported) res.unsupported = true;
    if (rc.clear) res.clear = true;
    return res;
  }

  /** Save a file from the editor as the current user (respects permissions). */
  writeFile(path: string, content: string): { ok: boolean; error?: string } {
    const s = this.core.session();
    const fs = this.core.fs(s.host);
    try {
      fs.writeFile(normalizePath(path, s.cwd), content, this.cred(), { umask: s.umask });
      return { ok: true };
    } catch (e) {
      if (e instanceof FsError) return { ok: false, error: `${path}: ${ERRNO_MSG[e.errno]}` };
      throw e;
    }
  }

  /** Read a file as the current user; null if missing or not readable. */
  readFile(path: string): string | null {
    const s = this.core.session();
    try {
      return this.core.fs(s.host).readFile(normalizePath(path, s.cwd), this.cred());
    } catch {
      return null;
    }
  }

  snapshot(): SimSnapshot {
    return JSON.parse(JSON.stringify(this.core.state)) as SimSnapshot;
  }

  static fromSnapshot(snap: SimSnapshot): Simulation {
    if (!snap || snap.version !== 1) throw new Error("unsupported simulator snapshot");
    const sim = Object.create(Simulation.prototype) as Simulation;
    sim.core = new Core(JSON.parse(JSON.stringify(snap)) as SimState);
    return sim;
  }

  clone(): Simulation {
    return Simulation.fromSnapshot(this.snapshot());
  }

  /** Restore the scenario's initial state. */
  reset(): void {
    this.core.state = buildState(this.core.state.scenario);
  }

  applyEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.t === "cmd") this.exec(ev.line);
      else if (ev.t === "write") this.writeFile(ev.path, ev.content);
      else if (ev.t === "reset") this.reset();
    }
  }

  /** Start a fresh session (used by graders): replaces the session stack. */
  /** @internal */
  setSession(host: string, user: string, cwd?: string): void {
    const h = this.core.host(host);
    this.core.state.sessions = [makeSession(h, user, cwd, "login")];
  }

  /**
   * Tab completion for the last word of `partial`. Returns full replacement
   * words (commands, or paths with a trailing "/" for directories).
   */
  complete(partial: string): string[] {
    const m = /(?:^|[\s|;&<>(])([^\s|;&<>()]*)$/.exec(partial);
    const word = m ? m[1] : "";
    const before = partial.slice(0, partial.length - word.length);
    const firstWord = /^\s*$|[|;&(]\s*$|(?:&&|\|\||sudo)\s+$/.test(before);
    const s = this.core.session();
    if (firstWord && !word.includes("/")) {
      const names = new Set([...Object.keys(COMMANDS), ...BUILTIN_NAMES, ...Object.keys(s.functions)]);
      return [...names].filter((n) => n.startsWith(word)).sort();
    }
    const fs = this.core.fs(s.host);
    const slash = word.lastIndexOf("/");
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : "";
    const prefix = slash >= 0 ? word.slice(slash + 1) : word;
    const home = s.vars.HOME ?? "/";
    const dirAbs = normalizePath(dirPart.startsWith("~") ? home + dirPart.slice(1) : dirPart || ".", s.cwd);
    let names: string[];
    try {
      names = fs.readdir(dirAbs, this.cred()).names;
    } catch {
      return [];
    }
    return names
      .filter((n) => n.startsWith(prefix) && (prefix.startsWith(".") || !n.startsWith(".")))
      .map((n) => {
        const r = fs.tryResolve(joinPath(dirAbs, n), null, true);
        return dirPart + n + (r?.node.type === "dir" ? "/" : "");
      })
      .sort();
  }
}
