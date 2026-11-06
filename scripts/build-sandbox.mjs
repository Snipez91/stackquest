// Bundles the sandbox frame and its workers into a single self-contained
// public/sandbox.html (inline scripts only; the CSP forbids loading app scripts).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../node_modules/pyodide/package.json", import.meta.url)));
const PYODIDE_URL = `https://cdn.jsdelivr.net/npm/pyodide@${pkg.version}/`;

async function bundle(entry, define = {}) {
  const r = await build({ entryPoints: [entry], bundle: true, write: false, format: "iife", target: "es2022", minify: true, define, alias: { "@": "./src" } });
  return r.outputFiles[0].text;
}

const js = await bundle("src/sandbox/worker-js.ts");
const py = await bundle("src/sandbox/worker-py.ts", { __PYODIDE_URL__: JSON.stringify(PYODIDE_URL) });
const frame = await bundle("src/sandbox/frame.ts", { __JS_WORKER__: JSON.stringify(js), __PY_WORKER__: JSON.stringify(py) });

const html = `<!doctype html><html><head><meta charset="utf-8"><title>StackQuest sandbox</title></head><body><script>${frame.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
mkdirSync("public", { recursive: true }); // public/ holds only generated files, so it is not in git
writeFileSync("public/sandbox.html", html);
console.log(`sandbox.html written (${(html.length / 1024).toFixed(1)} KB, pyodide ${pkg.version})`);
