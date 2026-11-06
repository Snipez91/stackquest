import { z } from "zod";

/**
 * Data model for the Linux + networking simulator.
 *
 * A scenario describes one or more fictional lab hosts. Every observable result
 * (file reads, permission checks, service starts, ping, DNS, HTTP) is computed
 * from this state, so changes the learner makes affect later commands.
 * The simulator is deterministic: the same scenario + event log always yields
 * the same final state, which lets the server replay a submission and grade it.
 */

const octalMode = z.string().regex(/^0?[0-7]{3,4}$/, "mode must be octal like 0644");
const ipv4 = z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/);
const cidr = z.string().regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);

export const SimUserSchema = z.object({
  name: z.string(),
  uid: z.number().int(),
  groups: z.array(z.string()).default([]),
  home: z.string(),
  shell: z.string().default("/bin/bash"),
});

export const SimGroupSchema = z.object({ name: z.string(), gid: z.number().int() });

export const SimFileSchema = z.object({
  path: z.string().startsWith("/"),
  type: z.enum(["file", "dir", "symlink"]).default("file"),
  content: z.string().optional(),
  target: z.string().optional(),
  mode: octalMode.optional(),
  owner: z.string().default("root"),
  group: z.string().default("root"),
});

/**
 * A listening socket. `address` (added, optional) is the bind address: omitted or
 * "0.0.0.0" accepts connections to any local address; "127.0.0.1" only from the host itself.
 */
const ListenSchema = z.object({ port: z.number().int(), proto: z.enum(["tcp", "udp"]).default("tcp"), address: ipv4.optional() });

export const SimProcessSchema = z.object({
  pid: z.number().int(),
  user: z.string(),
  command: z.string(),
  cpu: z.number().default(0),
  mem: z.number().default(0),
  /** Optional port this process holds open (shows in `ss`, blocks other binds). */
  listens: z.array(ListenSchema).default([]),
});

export const SimServiceSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  execUser: z.string().default("root"),
  command: z.string(),
  state: z.enum(["active", "inactive", "failed"]).default("inactive"),
  enabled: z.boolean().default(false),
  /** Paths the service user must be able to read for the service to start. */
  requiresReadable: z.array(z.string()).default([]),
  /** Paths the service user must be able to write (e.g. log dir) to start. */
  requiresWritable: z.array(z.string()).default([]),
  /** Config file whose content must match these regexes to start. */
  configChecks: z
    .array(z.object({ path: z.string(), pattern: z.string(), error: z.string() }))
    .default([]),
  listens: z.array(ListenSchema).default([]),
  /** Journal lines present before the learner starts. */
  journal: z.array(z.string()).default([]),
  /** HTTP responses served when active (for curl). */
  http: z
    .array(z.object({ path: z.string().default("/"), status: z.number().int().default(200), body: z.string().default("") }))
    .default([]),
  /**
   * (Added, optional) Read the bind address / port from a config file each time the
   * service starts: regexes with one capture group, applied to `path` (multiline).
   * Overrides `address` / `port` of every entry in `listens`.
   */
  listenFrom: z
    .object({ path: z.string(), addressPattern: z.string().optional(), portPattern: z.string().optional() })
    .optional(),
  /** Role-specific behaviour: a "dns" service answers from the host's dnsZones. */
  kind: z.enum(["generic", "dns", "http", "dhcp"]).default("generic"),
});

export const SimInterfaceSchema = z.object({
  name: z.string(),
  address: cidr.nullable(),
  up: z.boolean().default(true),
  mac: z.string().optional(),
  /** If true the interface obtains its address from a DHCP server on its segment. */
  dhcp: z.boolean().default(false),
  /**
   * (Added, optional) Name of the L2 segment this interface is plugged into.
   * Only needed for interfaces without an address that use `dhclient`.
   */
  segment: z.string().optional(),
});

export const SimRouteSchema = z.object({
  destination: z.union([z.literal("default"), cidr]),
  via: ipv4.optional(),
  dev: z.string(),
});

export const SimFirewallRuleSchema = z.object({
  action: z.enum(["allow", "deny"]),
  port: z.number().int().optional(),
  proto: z.enum(["tcp", "udp", "icmp", "any"]).default("tcp"),
  from: z.union([cidr, z.literal("any")]).default("any"),
});

export const SimHostSchema = z.object({
  name: z.string(),
  users: z.array(SimUserSchema).default([]),
  groups: z.array(SimGroupSchema).default([]),
  files: z.array(SimFileSchema).default([]),
  processes: z.array(SimProcessSchema).default([]),
  services: z.array(SimServiceSchema).default([]),
  interfaces: z.array(SimInterfaceSchema).default([]),
  routes: z.array(SimRouteSchema).default([]),
  /** Hosts with ipForward act as routers between segments. */
  ipForward: z.boolean().default(false),
  firewall: z
    .object({
      enabled: z.boolean().default(false),
      defaultInbound: z.enum(["allow", "deny"]).default("allow"),
      rules: z.array(SimFirewallRuleSchema).default([]),
    })
    .default({ enabled: false, defaultInbound: "allow", rules: [] }),
  /** Authoritative records if this host runs a dns service: name -> IPv4. */
  dnsZones: z.record(z.string(), ipv4).default({}),
  /** DHCP pool if this host runs a dhcp service. */
  dhcpPool: z
    .object({ range: z.tuple([ipv4, ipv4]), prefix: z.number().int(), gateway: ipv4, dns: ipv4 })
    .optional(),
  env: z.record(z.string(), z.string()).default({}),
});

export const SimScenarioSchema = z.object({
  /** Fixed clock so output (logs, ls -l) is deterministic. */
  clock: z.string().default("2026-03-02T09:15:00Z"),
  hosts: z.array(SimHostSchema).min(1),
  /** Layer-2 segments: hosts whose interface addresses fall inside a segment can talk directly. */
  segments: z.array(z.object({ name: z.string(), cidr })).default([]),
  start: z.object({ host: z.string(), user: z.string(), cwd: z.string().optional() }),
  /** Commands the learner may need that are disabled for this scenario (shown honestly). */
  disabledCommands: z.array(z.string()).default([]),
  /** Learner-editable files shown in the workspace editor (path on start host). */
  editableFiles: z.array(z.string()).default([]),
});

export type SimScenario = z.input<typeof SimScenarioSchema>;
export type ParsedSimScenario = z.output<typeof SimScenarioSchema>;

/** Declarative assertions about the final simulator state. */
export type Assertion =
  | { type: "file_exists"; host?: string; path: string }
  | { type: "file_absent"; host?: string; path: string }
  | { type: "file_matches"; host?: string; path: string; pattern: string; flags?: string }
  | { type: "file_not_matches"; host?: string; path: string; pattern: string; flags?: string }
  /** Can `user` read/write/execute `path`, considering every parent directory? */
  | { type: "access"; host?: string; path: string; user: string; access: "r" | "w" | "x"; expect: boolean }
  | { type: "mode_max"; host?: string; path: string; max: string }
  | { type: "owner"; host?: string; path: string; owner?: string; group?: string }
  | { type: "service_state"; host?: string; service: string; state: "active" | "inactive" | "failed" }
  | { type: "service_enabled"; host?: string; service: string; enabled: boolean }
  | { type: "process_running"; host?: string; pattern: string; expect: boolean }
  | { type: "reachable"; from: string; to: string; port?: number; proto?: "tcp" | "udp" | "icmp"; expect: boolean }
  | { type: "resolves"; from: string; name: string; ip?: string; expect: boolean }
  | { type: "http_status"; from: string; url: string; status: number }
  | { type: "interface"; host?: string; name: string; address?: string; up?: boolean }
  | { type: "route"; host?: string; destination: string; via?: string; expect: boolean }
  | { type: "user_in_group"; host?: string; user: string; group: string; expect: boolean }
  /** Run a command in a throwaway copy of the final state and match stdout. */
  | {
      type: "command_output";
      host?: string;
      user?: string;
      cwd?: string;
      setup?: string[];
      run: string;
      pattern: string;
      flags?: string;
      expectExit?: number;
    }
  | { type: "history_matches"; pattern: string; flags?: string }
  | { type: "all"; of: Assertion[] }
  | { type: "any"; of: Assertion[] }
  | { type: "not"; of: Assertion };

export const AssertionSchema: z.ZodType<Assertion> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("file_exists"), host: z.string().optional(), path: z.string() }),
    z.object({ type: z.literal("file_absent"), host: z.string().optional(), path: z.string() }),
    z.object({ type: z.literal("file_matches"), host: z.string().optional(), path: z.string(), pattern: z.string(), flags: z.string().optional() }),
    z.object({ type: z.literal("file_not_matches"), host: z.string().optional(), path: z.string(), pattern: z.string(), flags: z.string().optional() }),
    z.object({ type: z.literal("access"), host: z.string().optional(), path: z.string(), user: z.string(), access: z.enum(["r", "w", "x"]), expect: z.boolean() }),
    z.object({ type: z.literal("mode_max"), host: z.string().optional(), path: z.string(), max: octalMode }),
    z.object({ type: z.literal("owner"), host: z.string().optional(), path: z.string(), owner: z.string().optional(), group: z.string().optional() }),
    z.object({ type: z.literal("service_state"), host: z.string().optional(), service: z.string(), state: z.enum(["active", "inactive", "failed"]) }),
    z.object({ type: z.literal("service_enabled"), host: z.string().optional(), service: z.string(), enabled: z.boolean() }),
    z.object({ type: z.literal("process_running"), host: z.string().optional(), pattern: z.string(), expect: z.boolean() }),
    z.object({ type: z.literal("reachable"), from: z.string(), to: z.string(), port: z.number().int().optional(), proto: z.enum(["tcp", "udp", "icmp"]).optional(), expect: z.boolean() }),
    z.object({ type: z.literal("resolves"), from: z.string(), name: z.string(), ip: z.string().optional(), expect: z.boolean() }),
    z.object({ type: z.literal("http_status"), from: z.string(), url: z.string(), status: z.number().int() }),
    z.object({ type: z.literal("interface"), host: z.string().optional(), name: z.string(), address: z.string().optional(), up: z.boolean().optional() }),
    z.object({ type: z.literal("route"), host: z.string().optional(), destination: z.string(), via: z.string().optional(), expect: z.boolean() }),
    z.object({ type: z.literal("user_in_group"), host: z.string().optional(), user: z.string(), group: z.string(), expect: z.boolean() }),
    z.object({
      type: z.literal("command_output"),
      host: z.string().optional(),
      user: z.string().optional(),
      cwd: z.string().optional(),
      setup: z.array(z.string()).optional(),
      run: z.string(),
      pattern: z.string(),
      flags: z.string().optional(),
      expectExit: z.number().int().optional(),
    }),
    z.object({ type: z.literal("history_matches"), pattern: z.string(), flags: z.string().optional() }),
    z.object({ type: z.literal("all"), of: z.array(AssertionSchema) }),
    z.object({ type: z.literal("any"), of: z.array(AssertionSchema) }),
    z.object({ type: z.literal("not"), of: AssertionSchema }),
  ]),
);

/** Everything the learner did, in order. Replayed by the server for grading. */
export const SimEventSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("cmd"), line: z.string().max(2000) }),
  z.object({ t: z.literal("write"), path: z.string().max(400), content: z.string().max(50_000) }),
  z.object({ t: z.literal("reset") }),
]);
export type SimEvent = z.infer<typeof SimEventSchema>;

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Set when the command (or a flag) is not implemented by the simulator. */
  unsupported?: boolean;
  /** Set when the screen should be cleared (`clear`). */
  clear?: boolean;
}
