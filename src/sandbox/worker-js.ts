/// <reference lib="webworker" />
import { runJavaScript } from "./js-runtime";
import type { RunRequest } from "./types";

// Runs inside a dedicated Worker spawned by the opaque-origin sandbox frame.
self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const result = await runJavaScript(e.data);
  (self as unknown as Worker).postMessage({ type: "result", result });
};
