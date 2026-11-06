export type RunMode = "run" | "test";

export interface RunRequest {
  id: string;
  lang: "python" | "javascript";
  mode: RunMode;
  /** path -> content */
  files: Record<string, string>;
  entry: string;
  tests: { id: string; code: string }[];
  timeoutMs: number;
  /** JavaScript only: names exposed to tests. */
  exports?: string[];
  /** JavaScript only: DOM fixture markup. */
  html?: string;
}

export interface TestOutcome {
  id: string;
  pass: boolean;
  message: string;
}

export interface RunResult {
  id: string;
  status: "ok" | "error" | "timeout" | "crash";
  stdout: string;
  stderr: string;
  tests: TestOutcome[];
  durationMs: number;
  truncated: boolean;
}

export const OUTPUT_LIMIT = 20_000;

export function limitOutput(s: string): { text: string; truncated: boolean } {
  if (s.length <= OUTPUT_LIMIT) return { text: s, truncated: false };
  return { text: s.slice(0, OUTPUT_LIMIT) + `\n… output truncated at ${OUTPUT_LIMIT} characters`, truncated: true };
}
