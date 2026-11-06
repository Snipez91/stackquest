"use client";

import type { RunRequest, RunResult } from "./types";

/**
 * App-side handle to the sandbox frame. The iframe uses the `sandbox`
 * attribute *and* the server sends a CSP sandbox directive, so learner code
 * runs in an opaque origin with no access to cookies, storage or our APIs.
 */

type Listener = (s: { lang: "python"; state: "cold" | "loading" | "ready" | "error"; message?: string }) => void;

class SandboxClient {
  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<string, { resolve: (r: RunResult) => void; timer: ReturnType<typeof setTimeout>; req: RunRequest }>();
  private listeners = new Set<Listener>();
  pythonState: "cold" | "loading" | "ready" | "error" = "cold";
  isolationError = false;

  private ensure(): Promise<void> {
    if (this.ready && this.frame?.isConnected) return this.ready;
    this.frame?.remove();
    const f = document.createElement("iframe");
    f.src = "/sandbox.html";
    // Isolation comes from the `Content-Security-Policy: sandbox allow-scripts`
    // response header on /sandbox.html (opaque origin). We don't also set the
    // iframe sandbox attribute: it makes the request itself cross-origin, which
    // some dev servers reject. The frame verifies it is isolated before running.
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.title = "Code sandbox";
    f.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
    this.frame = f;
    this.ready = new Promise<void>((resolve) => {
      const onMsg = (e: MessageEvent) => {
        if (e.source !== f.contentWindow) return; // only our frame
        const d = e.data as { type: string; result?: RunResult; lang?: "python"; state?: SandboxClient["pythonState"]; message?: string };
        if (d.type === "frame-ready") resolve();
        if (d.type === "isolation-error") {
          this.isolationError = true;
          for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.resolve({ id: p.req.id, status: "crash", stdout: "", stderr: "The code sandbox isn't isolated (missing security header), so code execution is disabled. Ask an admin to check the deployment.", tests: p.req.tests.map((t) => ({ id: t.id, pass: false, message: "not run" })), durationMs: 0, truncated: false });
          }
          this.pending.clear();
          resolve();
        }
        if (d.type === "status" && d.lang === "python" && d.state) {
          this.pythonState = d.state;
          for (const l of this.listeners) l({ lang: "python", state: d.state, message: d.message });
        }
        if (d.type === "result" && d.result) {
          const p = this.pending.get(d.result.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(d.result.id);
            p.resolve(d.result);
          }
        }
      };
      window.addEventListener("message", onMsg);
    });
    document.body.appendChild(f);
    return this.ready;
  }

  onStatus(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  async warmPython() {
    await this.ensure();
    this.frame!.contentWindow!.postMessage({ type: "warm-python" }, "*");
  }

  /** Runs code. Never rejects; failures come back as a RunResult with a status. */
  async run(req: RunRequest): Promise<RunResult> {
    await this.ensure();
    if (this.isolationError) {
      return { id: req.id, status: "crash", stdout: "", stderr: "The code sandbox isn't isolated (missing security header), so code execution is disabled.", tests: req.tests.map((t) => ({ id: t.id, pass: false, message: "not run" })), durationMs: 0, truncated: false };
    }
    return new Promise<RunResult>((resolve) => {
      // Watchdog in case the frame itself stops responding (e.g. Pyodide download stalls).
      const budget = req.timeoutMs + (req.lang === "python" && this.pythonState !== "ready" ? 90_000 : 5_000);
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        this.hardReset();
        resolve({
          id: req.id,
          status: "timeout",
          stdout: "",
          stderr: req.lang === "python" && this.pythonState !== "ready" ? "Python didn't finish loading. Check your connection to cdn.jsdelivr.net and try again." : "The sandbox stopped responding and was restarted.",
          tests: req.tests.map((t) => ({ id: t.id, pass: false, message: "not run" })),
          durationMs: budget,
          truncated: false,
        });
      }, budget);
      this.pending.set(req.id, { resolve, timer, req });
      // Opaque-origin frame: its origin is "null", so a target origin can't be named.
      // Nothing secret is ever sent — only the learner's own code and public tests.
      this.frame!.contentWindow!.postMessage({ type: "run", req }, "*");
    });
  }

  /** Reset button: discard the Python interpreter state. */
  async reset() {
    await this.ensure();
    this.frame!.contentWindow!.postMessage({ type: "reset" }, "*");
  }

  hardReset() {
    this.frame?.remove();
    this.frame = null;
    this.ready = null;
    this.pythonState = "cold";
  }
}

let client: SandboxClient | null = null;
export function sandbox(): SandboxClient {
  client ??= new SandboxClient();
  return client;
}
