"use client";

import { useEffect, useRef, useState } from "react";
import type { Simulation } from "@/sim";
import { cn } from "@/lib/cn";

export type TermLine = { kind: "cmd" | "out" | "err" | "info"; text: string; prompt?: string; unsupported?: boolean };

/**
 * Terminal for the simulated lab. Output is a live log region for screen
 * readers; history (↑/↓), Tab completion and Ctrl+L work like a real shell.
 */
export function Terminal({
  sim,
  lines,
  setLines,
  onCommand,
  starterCommands,
  disabled,
}: {
  sim: Simulation;
  lines: TermLine[];
  setLines: (fn: (l: TermLine[]) => TermLine[]) => void;
  onCommand: (line: string) => void;
  starterCommands: string[];
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [suggest, setSuggest] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(() => sim.prompt());

  useEffect(() => {
    setPrompt(sim.prompt());
  }, [sim, lines]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  const run = (line: string) => {
    const p = sim.prompt();
    if (!line.trim()) {
      setLines((l) => [...l, { kind: "cmd", text: "", prompt: p }]);
      return;
    }
    const r = sim.exec(line);
    onCommand(line);
    if (r.clear) {
      setLines(() => []);
    } else {
      setLines((l) => {
        const next: TermLine[] = [...l, { kind: "cmd", text: line, prompt: p }];
        if (r.stdout) next.push({ kind: "out", text: r.stdout.replace(/\n$/, "") });
        if (r.stderr) next.push({ kind: "err", text: r.stderr.replace(/\n$/, ""), unsupported: r.unsupported });
        return next.slice(-600);
      });
    }
    setPrompt(sim.prompt());
    setInput("");
    setHistIdx(null);
    setSuggest([]);
  };

  const history = sim.history;

  return (
    <div className="flex h-full min-h-0 flex-col bg-code font-mono text-[13px]" onClick={() => inputRef.current?.focus()}>
      <div ref={logRef} role="log" aria-live="polite" aria-label="Terminal output" className="min-h-0 flex-1 overflow-y-auto px-3 py-2 leading-relaxed">
        {lines.length === 0 && <p className="text-faint">Simulated shell. Type <span className="text-text">help</span> to list supported commands.</p>}
        {lines.map((l, i) =>
          l.kind === "cmd" ? (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="text-lx">{l.prompt}</span> <span className="text-text">{l.text}</span>
            </div>
          ) : (
            <div key={i} className={cn("whitespace-pre-wrap break-all", l.kind === "err" ? "text-danger" : l.kind === "info" ? "text-primary" : "text-text/90")}>
              {l.unsupported && <span className="mr-1 rounded bg-warning/20 px-1 text-[11px] text-warning">not simulated</span>}
              {l.text}
            </div>
          ),
        )}
      </div>
      {suggest.length > 1 && (
        <div className="border-t border-border px-3 py-1 text-xs text-muted" aria-live="polite">
          {suggest.join("   ")}
        </div>
      )}
      <form
        className="flex items-center gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) run(input);
        }}
      >
        <label htmlFor="term-input" className="shrink-0 text-lx">
          {prompt}
          <span className="sr-only"> command</span>
        </label>
        <input
          id="term-input"
          ref={inputRef}
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-text outline-none"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby="term-help"
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (!history.length) return;
              const i = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
              setHistIdx(i);
              setInput(history[i]);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (histIdx === null) return;
              const i = histIdx + 1;
              if (i >= history.length) {
                setHistIdx(null);
                setInput("");
              } else {
                setHistIdx(i);
                setInput(history[i]);
              }
            } else if (e.key === "Tab" && input.trim()) {
              e.preventDefault();
              const opts = sim.complete(input);
              if (opts.length === 1) {
                setInput(opts[0]);
                setSuggest([]);
              } else setSuggest(opts.slice(0, 30).map((o) => o.split(/\s+/).pop() ?? o));
            } else if (e.key === "l" && e.ctrlKey) {
              e.preventDefault();
              setLines(() => []);
            }
          }}
        />
      </form>
      <p id="term-help" className="sr-only">
        Up and down arrows recall previous commands. Tab completes commands and paths when you have typed something; otherwise Tab moves focus.
      </p>
      {starterCommands.length > 0 && lines.length < 2 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
          <span className="text-xs text-faint">Try:</span>
          {starterCommands.map((c) => (
            <button key={c} type="button" className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted hover:text-text" onClick={() => run(c)} disabled={disabled}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
