import { SimDocument, domHelpers } from "./mini-dom";
import { limitOutput, type RunRequest, type RunResult, type TestOutcome } from "./types";

/**
 * Runs learner JavaScript. In the browser this executes inside a dedicated Web
 * Worker created by an opaque-origin sandbox frame (no cookies, no app origin,
 * CSP blocks network). Here we additionally shadow worker globals so learner
 * code can't post fake results by accident. A determined learner can still
 * tamper with client-side grading; the product documents this limit.
 */

type MockRoute = {
  status?: number;
  json?: unknown;
  text?: string;
  delayMs?: number;
  networkError?: boolean;
};

export interface MockFetchHandle {
  /** `body` is the JSON-parsed request body when possible; `rawBody` and `headers` are exactly what the code passed. */
  calls: { url: string; method: string; body?: unknown; rawBody?: unknown; headers?: unknown }[];
}

const SHADOWED = ["self", "globalThis", "postMessage", "importScripts", "close", "XMLHttpRequest", "WebSocket", "indexedDB", "caches"];

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

function errorText(e: unknown): string {
  if (e instanceof Error) {
    const line = e.stack?.match(/<anonymous>:(\d+):(\d+)/);
    const where = line ? ` (line ${Math.max(1, Number(line[1]) - 3)})` : "";
    return `${e.name}: ${e.message}${where}`;
  }
  return `Uncaught ${fmt(e)}`;
}

class Instance {
  logs: string[] = [];
  document: SimDocument;
  private currentFetch: (url: string, init?: { method?: string; body?: string; headers?: unknown }) => Promise<unknown>;
  module: Record<string, unknown> = {};

  constructor(private req: RunRequest) {
    this.document = new SimDocument(req.html ?? "");
    this.currentFetch = async (url: string) => {
      throw new TypeError(`Failed to fetch ${url}: the network is disabled in this sandbox (checks supply a simulated API)`);
    };
  }

  console = {
    log: (...a: unknown[]) => this.logs.push(a.map(fmt).join(" ")),
    info: (...a: unknown[]) => this.logs.push(a.map(fmt).join(" ")),
    warn: (...a: unknown[]) => this.logs.push("[warn] " + a.map(fmt).join(" ")),
    error: (...a: unknown[]) => this.logs.push("[error] " + a.map(fmt).join(" ")),
    table: (v: unknown) => this.logs.push(fmt(v)),
  };

  fetch = (url: string, init?: { method?: string; body?: string; headers?: unknown }) => this.currentFetch(String(url), init);

  mockFetch = (routes: Record<string, MockRoute | MockRoute[]>): MockFetchHandle => {
    const handle: MockFetchHandle = { calls: [] };
    const counters = new Map<string, number>();
    this.currentFetch = async (url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown = init?.body;
      try {
        body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      } catch {
        /* keep raw body */
      }
      handle.calls.push({ url, method, body, rawBody: init?.body, headers: init?.headers });
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const key = [`${method} ${path}`, `${method} ${url}`, path, url].find((k) => k in routes);
      if (!key) throw new TypeError(`Failed to fetch ${url}: no simulated route for ${method} ${path}`);
      const entry = routes[key];
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      const r = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      if (r.networkError) throw new TypeError("Failed to fetch");
      const status = r.status ?? 200;
      const text = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : "");
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : String(status),
        headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? (r.json !== undefined ? "application/json" : "text/plain") : null) },
        json: async () => {
          if (r.json === undefined) throw new SyntaxError("Unexpected token in JSON at position 0");
          return JSON.parse(JSON.stringify(r.json));
        },
        text: async () => text,
      };
    };
    return handle;
  };

  load() {
    const exportsList = this.req.exports ?? [];
    const code = (this.req.files[this.req.entry] ?? "").replace(/^\s*export\s+(default\s+)?/gm, "");
    const ret = exportsList.map((n) => `${JSON.stringify(n)}: typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ");
    const window = {
      document: this.document,
      fetch: this.fetch,
      console: this.console,
      setTimeout,
      clearTimeout,
      location: { href: "https://app.lab.test/" },
      addEventListener: () => {},
    };
    const params = ["console", "fetch", "document", "window", "require", "module", "exports", ...SHADOWED];
    const factory = new Function(...params, `"use strict";\n${code}\n;return { ${ret} };`);
    const shadow = SHADOWED.map(() => undefined);
    const requireStub = (name: string) => {
      throw new Error(`require('${name}') is not available here; everything you need is in this file`);
    };
    this.module = factory(this.console, this.fetch, this.document, window, requireStub, {}, {}, ...shadow) as Record<string, unknown>;
  }
}

function assert(cond: unknown, msg = "assertion failed") {
  if (!cond) throw new AssertionFailure(msg);
}
function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (!Object.is(actual, expected)) throw new AssertionFailure(msg ?? `expected ${fmt(expected)} but got ${fmt(actual)}`);
}
function assertDeepEqual(actual: unknown, expected: unknown, msg?: string) {
  if (stable(actual) !== stable(expected)) throw new AssertionFailure(msg ?? `expected ${stable(expected)} but got ${stable(actual)}`);
}
class AssertionFailure extends Error {
  constructor(m: string) {
    super(m);
    this.name = "AssertionFailure";
  }
}

const flush = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

export async function runJavaScript(req: RunRequest): Promise<RunResult> {
  const started = performance.now();
  let stdout = "";
  let stderr = "";
  let status: RunResult["status"] = "ok";
  const tests: TestOutcome[] = [];

  if (req.mode === "run") {
    const inst = new Instance(req);
    try {
      inst.load();
      await flush(20);
    } catch (e) {
      status = "error";
      stderr = errorText(e);
    }
    stdout = inst.logs.join("\n");
  } else {
    for (const t of req.tests) {
      const inst = new Instance(req);
      try {
        inst.load();
      } catch (e) {
        status = "error";
        stderr = "Your code could not be loaded:\n" + errorText(e);
        tests.push({ id: t.id, pass: false, message: "not run: code failed to load" });
        continue;
      }
      const captureLogs = async (fn: () => unknown) => {
        const before = inst.logs.length;
        await fn();
        return inst.logs.slice(before);
      };
      try {
        const body = new Function(
          "module", "assert", "assertEqual", "assertDeepEqual", "captureLogs", "dom", "document", "mockFetch", "files", "flush", "logs",
          `return (async () => {\n${t.code}\n})();`,
        );
        await body(inst.module, assert, assertEqual, assertDeepEqual, captureLogs, domHelpers(inst.document), inst.document, inst.mockFetch, req.files, flush, inst.logs);
        tests.push({ id: t.id, pass: true, message: "passed" });
      } catch (e) {
        tests.push({ id: t.id, pass: false, message: e instanceof AssertionFailure ? e.message : errorText(e) });
      }
      if (inst.logs.length) stdout += (stdout ? "\n" : "") + inst.logs.join("\n");
    }
  }
  const out = limitOutput(stdout);
  const err = limitOutput(stderr);
  return {
    id: req.id,
    status,
    stdout: out.text,
    stderr: err.text,
    tests,
    durationMs: Math.round(performance.now() - started),
    truncated: out.truncated || err.truncated,
  };
}
