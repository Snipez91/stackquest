import { limitOutput, type RunRequest, type RunResult } from "./types";

/**
 * Python harness executed inside Pyodide (a WebAssembly CPython). It runs in a
 * Web Worker inside an opaque-origin sandbox frame in the browser, and directly
 * under Node for content validation tests. It never runs on the app server.
 */
export const PY_HARNESS = String.raw`
import sys, io, os, json, types, traceback, importlib, builtins, shutil

_LIMIT = 20000

class _Cap(io.StringIO):
    def write(self, s):
        if self.tell() > _LIMIT:
            return len(s)
        return super().write(s)

def _no_input(*a, **k):
    raise RuntimeError("input() is not available in this workspace - pass values as function arguments instead")

def _reset_dir(files):
    os.chdir("/")
    if os.path.isdir("/work"):
        shutil.rmtree("/work")
    os.makedirs("/work")
    for path, content in files.items():
        full = os.path.join("/work", path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as fh:
            fh.write(content)
    os.chdir("/work")
    if "/work" not in sys.path:
        sys.path.insert(0, "/work")
    for name in list(sys.modules):
        mod = sys.modules[name]
        f = getattr(mod, "__file__", None) or ""
        if f.startswith("/work"):
            del sys.modules[name]
    importlib.invalidate_caches()

def capture_output(fn, *args, **kwargs):
    """Call fn and return (result, printed_text)."""
    old = sys.stdout
    buf = _Cap()
    sys.stdout = buf
    try:
        result = fn(*args, **kwargs)
    finally:
        sys.stdout = old
    return result, buf.getvalue()

def _fmt_exc(e):
    tb = traceback.format_exception(type(e), e, e.__traceback__)
    lines = [l for l in "".join(tb).splitlines() if "/work/" in l or not l.startswith("  File")]
    return "\n".join(lines[-12:])

def __sq_run(req_json):
    req = json.loads(req_json)
    builtins.input = _no_input
    _reset_dir(req["files"])
    entry = req["entry"]
    modname = entry[:-3] if entry.endswith(".py") else entry
    out = _Cap(); err = _Cap()
    old_out, old_err = sys.stdout, sys.stderr
    status = "ok"
    tests = []
    sys.stdout, sys.stderr = out, err
    try:
        if req["mode"] == "run":
            try:
                import runpy
                runpy.run_path(os.path.join("/work", entry), run_name="__main__")
            except SystemExit:
                pass
            except BaseException as e:
                status = "error"
                err.write(_fmt_exc(e))
        else:
            try:
                module = importlib.import_module(modname)
            except BaseException as e:
                status = "error"
                err.write("Your code could not be loaded:\n" + _fmt_exc(e))
                module = None
            for t in req["tests"]:
                if module is None:
                    tests.append({"id": t["id"], "pass": False, "message": "not run: code failed to load"})
                    continue
                g = {"main": module, "module": module, "capture_output": capture_output, "__name__": "__sq_test__"}
                try:
                    exec(compile(t["code"], "<check " + t["id"] + ">", "exec"), g)
                    tests.append({"id": t["id"], "pass": True, "message": "passed"})
                except AssertionError as e:
                    tests.append({"id": t["id"], "pass": False, "message": str(e) or "assertion failed"})
                except BaseException as e:
                    tests.append({"id": t["id"], "pass": False, "message": type(e).__name__ + ": " + str(e)})
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return json.dumps({"status": status, "stdout": out.getvalue(), "stderr": err.getvalue(), "tests": tests})
`;

/** Minimal surface of a loaded Pyodide instance that we rely on. */
export interface PyodideLike {
  runPython(code: string): unknown;
  globals: { get(name: string): unknown };
}

let harnessLoaded = new WeakSet<object>();

export function runPython(pyodide: PyodideLike, req: RunRequest): RunResult {
  const started = performance.now();
  if (!harnessLoaded.has(pyodide as object)) {
    pyodide.runPython(PY_HARNESS);
    harnessLoaded.add(pyodide as object);
  }
  const fn = pyodide.globals.get("__sq_run") as (s: string) => string;
  const raw = JSON.parse(fn(JSON.stringify(req))) as Omit<RunResult, "id" | "durationMs" | "truncated">;
  const out = limitOutput(raw.stdout);
  const err = limitOutput(raw.stderr);
  return {
    id: req.id,
    status: raw.status,
    stdout: out.text,
    stderr: err.text,
    tests: raw.tests,
    durationMs: Math.round(performance.now() - started),
    truncated: out.truncated || err.truncated,
  };
}

/** For tests: forget which Pyodide instances have the harness loaded. */
export function resetPythonHarnessCache() {
  harnessLoaded = new WeakSet<object>();
}
