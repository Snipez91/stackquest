/**
 * Runs inside /sandbox.html, which the server sends with
 * `Content-Security-Policy: sandbox allow-scripts` (opaque origin: no cookies,
 * no storage, no access to the app) and connect-src limited to the Pyodide CDN.
 * Every run happens in a Worker that is terminated on timeout.
 */
import type { RunRequest, RunResult } from "./types";
import { runWithWatchdog, wrapWebWorker } from "./watchdog";

declare const __JS_WORKER__: string;
declare const __PY_WORKER__: string;

const jsUrl = URL.createObjectURL(new Blob([__JS_WORKER__], { type: "text/javascript" }));
const pyUrl = URL.createObjectURL(new Blob([__PY_WORKER__], { type: "text/javascript" }));

let py: Worker | null = null;
let pyState: "cold" | "loading" | "ready" | "error" = "cold";

// The frame's own origin is opaque, so its view of the parent's origin can't be
// relied on; replies contain only the results of code the parent itself sent.
function reply(msg: unknown) {
  parent.postMessage(msg, "*");
}

function pyWorker(): Worker {
  if (py) return py;
  py = new Worker(pyUrl);
  pyState = "loading";
  reply({ type: "status", lang: "python", state: pyState });
  py.addEventListener("message", (e) => {
    if (e.data?.type === "ready") {
      pyState = "ready";
      reply({ type: "status", lang: "python", state: pyState });
    }
    if (e.data?.type === "boot-error") {
      pyState = "error";
      reply({ type: "status", lang: "python", state: pyState, message: e.data.message });
      py?.terminate();
      py = null;
    }
  });
  py.postMessage({ type: "boot" });
  return py;
}

function fail(req: RunRequest, status: RunResult["status"], stderr: string): RunResult {
  return { id: req.id, status, stdout: "", stderr, tests: req.tests.map((t) => ({ id: t.id, pass: false, message: status === "timeout" ? "not finished: time limit reached" : "not run" })), durationMs: req.timeoutMs, truncated: false };
}

async function run(req: RunRequest) {
  const isPy = req.lang === "python";
  const raw = isPy ? pyWorker() : new Worker(jsUrl);
  const outcome = await runWithWatchdog<{ type: string; result: RunResult; message?: string }>(
    wrapWebWorker(raw),
    isPy ? { type: "run", req } : req,
    req.timeoutMs,
    {
      isResult: (d) => ["result", "boot-error"].includes((d as { type?: string })?.type ?? ""),
      // Python: the clock starts once the interpreter has begun executing (not while it downloads).
      startTimerOn: isPy ? (d) => (d as { type?: string })?.type === "started" : undefined,
      terminateAfter: !isPy,
    },
  );
  if (outcome.kind === "result" && outcome.data.type === "boot-error") {
    return reply({ type: "result", result: fail(req, "crash", `Python failed to load: ${outcome.data.message ?? "unknown error"}. Check your connection and try again.`) });
  }
  if (outcome.kind === "result") return reply({ type: "result", result: outcome.data.result });
  if (isPy) {
    py = null;
    pyState = "cold";
    reply({ type: "status", lang: "python", state: "cold" });
  }
  if (outcome.kind === "timeout") {
    reply({ type: "result", result: fail(req, "timeout", `Stopped after ${req.timeoutMs / 1000}s. Look for a loop that never ends or a very slow operation. The runtime was restarted.`) });
  } else {
    reply({ type: "result", result: fail(req, "crash", outcome.message) });
  }
}

// Safety net: if the sandbox CSP header was stripped (e.g. by a proxy) this
// document would share the app's origin. Refuse to execute anything then.
const isolated = self.origin === "null";

window.addEventListener("message", (e) => {
  if (!isolated) {
    reply({ type: "isolation-error" });
    return;
  }
  if (e.source !== parent) return;
  const msg = e.data as { type: string; req?: RunRequest };
  if (msg.type === "run" && msg.req) void run(msg.req);
  if (msg.type === "warm-python") pyWorker();
  if (msg.type === "reset") {
    py?.terminate();
    py = null;
    pyState = "cold";
    reply({ type: "status", lang: "python", state: "cold" });
  }
});
reply({ type: isolated ? "frame-ready" : "isolation-error" });
