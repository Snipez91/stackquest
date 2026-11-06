/**
 * Hard execution time limit: post a job to a worker and terminate the worker
 * if no result arrives in time. Terminating is the only reliable way to stop
 * an infinite loop in learner code. Used by the sandbox frame; unit-tested
 * with Node worker_threads.
 */
export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onResult(cb: (data: unknown) => void): () => void;
  onError(cb: (message: string) => void): () => void;
}

export type WatchdogOutcome<T> = { kind: "result"; data: T } | { kind: "timeout" } | { kind: "crash"; message: string };

export function runWithWatchdog<T>(
  w: WorkerLike,
  msg: unknown,
  timeoutMs: number,
  opts: { isResult?: (d: unknown) => boolean; startTimerOn?: (d: unknown) => boolean; terminateAfter?: boolean } = {},
): Promise<WatchdogOutcome<T>> {
  const isResult = opts.isResult ?? (() => true);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = (o: WatchdogOutcome<T>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      offR();
      offE();
      if (o.kind !== "result" || opts.terminateAfter) w.terminate();
      resolve(o);
    };
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    };
    const offR = w.onResult((d) => {
      if (opts.startTimerOn?.(d)) start();
      else if (isResult(d)) finish({ kind: "result", data: d as T });
    });
    const offE = w.onError((m) => finish({ kind: "crash", message: m }));
    if (!opts.startTimerOn) start();
    w.postMessage(msg);
  });
}

/** Adapts a browser Worker. */
export function wrapWebWorker(w: Worker): WorkerLike {
  return {
    postMessage: (m) => w.postMessage(m),
    terminate: () => w.terminate(),
    onResult(cb) {
      const h = (e: MessageEvent) => cb(e.data);
      w.addEventListener("message", h);
      return () => w.removeEventListener("message", h);
    },
    onError(cb) {
      const h = (e: ErrorEvent) => {
        e.preventDefault();
        cb(e.message || "The runtime crashed.");
      };
      w.addEventListener("error", h);
      return () => w.removeEventListener("error", h);
    },
  };
}
