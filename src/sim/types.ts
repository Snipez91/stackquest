/**
 * Internal (mutable, JSON-serializable) simulator state types.
 * Derived from the fixed schema in ./schema.ts.
 */
import type { z } from "zod";
import type {
  ParsedSimScenario,
  SimFirewallRuleSchema,
  SimGroupSchema,
  SimInterfaceSchema,
  SimProcessSchema,
  SimRouteSchema,
  SimServiceSchema,
  SimUserSchema,
} from "./schema";

export type SimUser = z.output<typeof SimUserSchema>;
export type SimGroup = z.output<typeof SimGroupSchema>;
export type SimProcess = z.output<typeof SimProcessSchema>;
export type SimService = z.output<typeof SimServiceSchema>;
export type SimInterface = z.output<typeof SimInterfaceSchema>;
export type SimRoute = z.output<typeof SimRouteSchema>;
export type SimFirewallRule = z.output<typeof SimFirewallRuleSchema>;

export type NodeType = "file" | "dir" | "symlink";

export interface FsNode {
  type: NodeType;
  content: string;
  target?: string;
  /** Numeric mode including special bits (e.g. 0o1777). */
  mode: number;
  owner: string;
  group: string;
  /** Epoch seconds. */
  mtime: number;
}

export interface ServiceState extends SimService {
  pid: number | null;
  activeSince: number | null;
}

export interface HostState {
  name: string;
  users: SimUser[];
  groups: SimGroup[];
  fs: Record<string, FsNode>;
  processes: SimProcess[];
  services: ServiceState[];
  interfaces: SimInterface[];
  routes: SimRoute[];
  ipForward: boolean;
  firewall: { enabled: boolean; defaultInbound: "allow" | "deny"; rules: SimFirewallRule[] };
  dnsZones: Record<string, string>;
  dhcpPool?: { range: [string, string]; prefix: number; gateway: string; dns: string };
  env: Record<string, string>;
  nextPid: number;
  /** DHCP leases handed out by this host: ip -> "host/iface". */
  leases: Record<string, string>;
}

/** A shell environment: one per interactive session, copied for subshells/scripts. */
export interface ShellEnv {
  host: string;
  user: string;
  cwd: string;
  oldpwd: string;
  vars: Record<string, string>;
  exported: string[];
  /** Function bodies (parsed AST, plain JSON). */
  functions: Record<string, unknown>;
  umask: number;
}

export interface Session extends ShellEnv {
  kind: "login" | "ssh" | "su";
}

export interface SimState {
  version: 1;
  scenario: ParsedSimScenario;
  clock: number;
  hostOrder: string[];
  hosts: Record<string, HostState>;
  sessions: Session[];
  history: string[];
  lastExit: number;
  rng: number;
}

export interface Cred {
  user: string;
  uid: number;
  groups: string[];
}

export interface Writer {
  write(s: string): void;
}

/** A readable stream with a cursor so `while read` loops consume line by line. */
export class InStream {
  constructor(
    public data: string,
    public pos = 0,
  ) {}
  readAll(): string {
    const s = this.data.slice(this.pos);
    this.pos = this.data.length;
    return s;
  }
  readLine(): string | null {
    if (this.pos >= this.data.length) return null;
    const nl = this.data.indexOf("\n", this.pos);
    let line: string;
    if (nl === -1) {
      line = this.data.slice(this.pos);
      this.pos = this.data.length;
    } else {
      line = this.data.slice(this.pos, nl);
      this.pos = nl + 1;
    }
    return line;
  }
  static empty(): InStream {
    return new InStream("");
  }
}

export class BufferWriter implements Writer {
  buf = "";
  truncated = false;
  constructor(private cap = 2_000_000) {}
  write(s: string): void {
    if (this.buf.length >= this.cap) {
      this.truncated = true;
      return;
    }
    this.buf += s;
    if (this.buf.length > this.cap) {
      this.buf = this.buf.slice(0, this.cap);
      this.truncated = true;
    }
  }
}

export const NullWriter: Writer = { write() {} };
