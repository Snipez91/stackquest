import { loadPyodide } from "pyodide";
import type { Mission } from "@/content/schema";
import { runJavaScript } from "@/sandbox/js-runtime";
import { runPython, type PyodideLike } from "@/sandbox/python-runtime";
import type { RunResult } from "@/sandbox/types";

let pyodidePromise: Promise<PyodideLike> | null = null;

export function getPyodide(): Promise<PyodideLike> {
  pyodidePromise ??= loadPyodide() as unknown as Promise<PyodideLike>;
  return pyodidePromise;
}

/** Run a code mission's checks against a set of file overrides (path -> content). */
export async function runMissionCode(mission: Mission, overrides: Record<string, string>): Promise<RunResult> {
  const ws = mission.workspace;
  if (ws.kind !== "python" && ws.kind !== "javascript") throw new Error("not a code mission");
  const files = Object.fromEntries(ws.files.map((f) => [f.path, f.content]));
  Object.assign(files, overrides);
  const req = {
    id: mission.slug,
    lang: ws.kind,
    mode: "test" as const,
    files,
    entry: ws.entry,
    tests: ws.tests.map((t) => ({ id: t.id, code: t.code })),
    timeoutMs: ws.timeoutMs,
    exports: ws.kind === "javascript" ? ws.exports : undefined,
    html: ws.kind === "javascript" ? ws.html : undefined,
  };
  if (ws.kind === "python") return runPython(await getPyodide(), req);
  return runJavaScript(req);
}
