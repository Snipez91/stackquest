import { describe, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { runWithWatchdog, type WorkerLike } from "@/sandbox/watchdog";
import { runJavaScript } from "@/sandbox/js-runtime";
import { runPython } from "@/sandbox/python-runtime";
import { getPyodide } from "../helpers/code-runner";

function nodeWorker(src: string): WorkerLike & { exited: Promise<number> } {
  const w = new Worker(src, { eval: true });
  const exited = new Promise<number>((r) => w.once("exit", r));
  return {
    exited,
    postMessage: (m) => w.postMessage(m),
    terminate: () => void w.terminate(),
    onResult(cb) {
      w.on("message", cb);
      return () => w.off("message", cb);
    },
    onError(cb) {
      const h = (e: Error) => cb(e.message);
      w.on("error", h);
      return () => w.off("error", h);
    },
  };
}

describe("execution timeouts", () => {
  it("terminates a worker stuck in an infinite loop", async () => {
    const w = nodeWorker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', () => { while (true) {} });`);
    const t = Date.now();
    const r = await runWithWatchdog(w, { go: 1 }, 300);
    expect(r.kind).toBe("timeout");
    expect(Date.now() - t).toBeLessThan(3000);
    expect(await w.exited).toBe(1);
  });
  it("returns results from a well-behaved worker", async () => {
    const w = nodeWorker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', (m) => parentPort.postMessage({ type: 'result', v: m.n * 2 }));`);
    const r = await runWithWatchdog<{ v: number }>(w, { n: 21 }, 2000, { terminateAfter: true });
    expect(r).toEqual({ kind: "result", data: { type: "result", v: 42 } });
  });
  it("only starts the clock once execution starts (e.g. after Python loads)", async () => {
    const w = nodeWorker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', () => setTimeout(() => { parentPort.postMessage({ type: 'started' }); parentPort.postMessage({ type: 'result' }); }, 400));`);
    const r = await runWithWatchdog(w, {}, 200, { startTimerOn: (d) => (d as { type: string }).type === "started", isResult: (d) => (d as { type: string }).type === "result", terminateAfter: true });
    expect(r.kind).toBe("result");
  });
  it("reports crashes", async () => {
    const w = nodeWorker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', () => { throw new Error('boom'); });`);
    const r = await runWithWatchdog(w, {}, 2000);
    expect(r).toEqual({ kind: "crash", message: "boom" });
  });
});

describe("JavaScript runtime", () => {
  it("captures logs, limits output and shadows worker globals", async () => {
    const r = await runJavaScript({ id: "1", lang: "javascript", mode: "run", entry: "a.js", files: { "a.js": "console.log(typeof postMessage, typeof self); for (let i=0;i<5000;i++) console.log('x'.repeat(10));" }, tests: [], timeoutMs: 1000 });
    expect(r.stdout.startsWith("undefined undefined")).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(21_000);
  });
  it("blocks real network access", async () => {
    const r = await runJavaScript({ id: "2", lang: "javascript", mode: "test", entry: "a.js", exports: ["get"], files: { "a.js": "async function get(){ return fetch('https://example.com') }" }, tests: [{ id: "t", code: "await module.get();" }], timeoutMs: 1000 });
    expect(r.tests[0].pass).toBe(false);
    expect(r.tests[0].message).toMatch(/network is disabled/);
  });
});

describe("workspace reset", () => {
  it("Python runs start from a clean filesystem and fresh modules", async () => {
    const py = await getPyodide();
    const run = (files: Record<string, string>, code: string) => runPython(py, { id: "r", lang: "python", mode: "test", entry: "main.py", files, tests: [{ id: "t", code }], timeoutMs: 5000 });
    const a = await run({ "main.py": "open('scratch.txt','w').write('left over')\nCOUNT = 1\n", "helper.py": "X = 1" }, "import os; assert os.path.exists('scratch.txt')");
    expect(a.tests[0].pass).toBe(true);
    const b = await run({ "main.py": "COUNT = 2\n" }, "import os; assert not os.path.exists('scratch.txt'), 'file leaked'; assert main.COUNT == 2; import importlib.util; assert importlib.util.find_spec('helper') is None, 'module leaked'");
    expect(b.tests[0]).toMatchObject({ pass: true });
  }, 60_000);
});
