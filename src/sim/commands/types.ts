import type { Core } from "../core";
import type { Fs } from "../fs";
import type { Cred, HostState, InStream, ShellEnv, Writer } from "../types";

export interface IO {
  stdin: InStream;
  out: Writer;
  err: Writer;
  /** True when stdout goes straight to the terminal (not a pipe/file). */
  tty: boolean;
}

/** Services the shell exposes to commands that need to run other commands. */
export interface ShellApi {
  /** Run argv as an external command (no functions/builtins) with the given credentials. */
  runArgv(argv: string[], io: IO, cred: Cred): number;
  /** Run shell source in a fresh shell for env (e.g. ssh host cmd, bash -c). */
  runSource(src: string, io: IO, opts: { env: ShellEnv; cred: Cred; argv0: string; args: string[] }): number;
  /** Run a script file (bash script.sh). */
  runScriptFile(path: string, args: string[], io: IO, cred: Cred, argv0: string): number;
  env: ShellEnv;
  /** Environment a child process would get (exported vars only, no functions). */
  childEnv(exportOnly: boolean, cred: Cred): ShellEnv;
  markUnsupported(): void;
  markClear(): void;
  isBuiltin(name: string): boolean;
  isFunction(name: string): boolean;
}

export interface CmdCtx {
  name: string;
  args: string[];
  io: IO;
  cred: Cred;
  core: Core;
  host: HostState;
  fs: Fs;
  cwd: string;
  /** Exported environment as seen by this command. */
  env: Record<string, string>;
  umask: number;
  shell: ShellApi;
  out(s: string): void;
  err(s: string): void;
  /** Resolve a user-supplied path against cwd. */
  abs(p: string): string;
  /** Print a standard "cmd: arg: Message" error for an FsError (or rethrow). Returns 1. */
  fsErr(e: unknown, arg: string, prefix?: string): number;
  /** Report an unsupported command/flag honestly. */
  unsupported(msg: string, code?: number): number;
}

export type CommandFn = (ctx: CmdCtx) => number;
