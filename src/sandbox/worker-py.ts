/// <reference lib="webworker" />
import { runPython, type PyodideLike } from "./python-runtime";
import type { RunRequest } from "./types";

declare const __PYODIDE_URL__: string;
declare function loadPyodide(opts: { indexURL: string }): Promise<PyodideLike>;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
let ready: Promise<PyodideLike> | null = null;

function boot() {
  ready ??= (async () => {
    (self as unknown as { importScripts: (u: string) => void }).importScripts(__PYODIDE_URL__ + "pyodide.js");
    const py = await loadPyodide({ indexURL: __PYODIDE_URL__ });
    post({ type: "ready" });
    return py;
  })();
  ready.catch((err) => post({ type: "boot-error", message: String(err) }));
  return ready;
}

self.onmessage = async (e: MessageEvent<{ type: "boot" } | { type: "run"; req: RunRequest }>) => {
  const msg = e.data;
  if (msg.type === "boot") {
    await boot().catch(() => {});
    return;
  }
  const py = await boot();
  post({ type: "started" });
  post({ type: "result", result: runPython(py, msg.req) });
};
