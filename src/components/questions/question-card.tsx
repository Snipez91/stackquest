"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import type { Answer } from "@/lib/grading";
import { cn } from "@/lib/cn";

export type ClientQuestion =
  | { id: string; kind: "mcq"; prompt: string; code?: string; codeLanguage?: string; options: string[] }
  | { id: string; kind: "short"; prompt: string; code?: string; codeLanguage?: string; placeholder?: string }
  | { id: string; kind: "order"; prompt: string; code?: string; codeLanguage?: string; items: string[] }
  | { id: string; kind: "explain"; prompt: string; code?: string; codeLanguage?: string; concepts: string[]; minConcepts: number };

export type GradeView = {
  correct: boolean;
  score?: number;
  feedback?: string;
  explanation?: string;
  correctAnswer?: string;
  modelAnswer?: string;
  concepts?: { label: string; found: boolean }[];
  tries?: number;
};

/**
 * One question, answered before any explanation is shown (retrieval first).
 * Ordering uses move buttons rather than drag-and-drop so it works by keyboard
 * and screen reader.
 */
export function QuestionCard({
  q,
  onSubmit,
  grade,
  disabled,
  promptHtml,
  label,
}: {
  q: ClientQuestion;
  onSubmit: (a: Answer) => Promise<void> | void;
  grade?: GradeView | null;
  disabled?: boolean;
  /** Pre-rendered prompt markdown (server-rendered). Falls back to plain text. */
  promptHtml?: string;
  label?: string;
}) {
  const id = useId();
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [order, setOrder] = useState<string[]>(q.kind === "order" ? q.items : []);
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState<string>("");

  const answer = (): Answer | null => {
    if (q.kind === "mcq") return choice === null ? null : { kind: "mcq", choice };
    if (q.kind === "short") return text.trim() ? { kind: "short", text } : null;
    if (q.kind === "order") return { kind: "order", order };
    return text.trim().length >= 10 ? { kind: "explain", text } : null;
  };
  const a = answer();
  const solved = grade?.correct;

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setMoved(`Moved "${order[i]}" to position ${j + 1} of ${order.length}.`);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!a || busy) return;
        setBusy(true);
        try {
          await onSubmit(a);
        } finally {
          setBusy(false);
        }
      }}
      aria-labelledby={`${id}-p`}
    >
      {label && <p className="text-xs font-semibold uppercase tracking-wider text-faint">{label}</p>}
      <div id={`${id}-p`} className="prose-sq">
        {promptHtml ? <div dangerouslySetInnerHTML={{ __html: promptHtml }} /> : <p className="whitespace-pre-wrap">{q.prompt}</p>}
      </div>
      {q.code && (
        <pre className="overflow-x-auto rounded-lg border border-border bg-code p-3 font-mono text-[13px] leading-snug">
          <code>{q.code}</code>
        </pre>
      )}

      {q.kind === "mcq" && (
        <fieldset disabled={disabled || solved} className="space-y-1.5">
          <legend className="sr-only">Choose one answer</legend>
          {q.options.map((o, i) => (
            <label key={i} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm", choice === i ? "border-primary bg-primary/8" : "border-border hover:bg-surface-2")}>
              <input type="radio" name={`${id}-mcq`} className="mt-0.5 accent-[var(--primary)]" checked={choice === i} onChange={() => setChoice(i)} />
              <span className="whitespace-pre-wrap">{o}</span>
            </label>
          ))}
        </fieldset>
      )}

      {q.kind === "short" && (
        <div>
          <label htmlFor={`${id}-s`} className="sr-only">Your answer</label>
          <input id={`${id}-s`} className="input font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={q.placeholder ?? "Your answer"} disabled={disabled || solved} autoComplete="off" spellCheck={false} />
        </div>
      )}

      {q.kind === "order" && (
        <div>
          <p className="mb-2 text-xs text-muted">Use the arrow buttons to put the steps in order (first at the top).</p>
          <ol className="space-y-1.5">
            {order.map((item, i) => (
              <li key={item} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm">
                <span className="w-5 text-center font-mono text-xs text-faint">{i + 1}</span>
                <span className="flex-1">{item}</span>
                <button type="button" className="btn-ghost p-1" onClick={() => move(i, -1)} disabled={i === 0 || disabled || solved} aria-label={`Move "${item}" up`}>
                  <ArrowUp size={15} aria-hidden />
                </button>
                <button type="button" className="btn-ghost p-1" onClick={() => move(i, 1)} disabled={i === order.length - 1 || disabled || solved} aria-label={`Move "${item}" down`}>
                  <ArrowDown size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <p className="sr-only" aria-live="polite">{moved}</p>
        </div>
      )}

      {q.kind === "explain" && (
        <div>
          <label htmlFor={`${id}-e`} className="sr-only">Your explanation</label>
          <textarea id={`${id}-e`} className="input min-h-[110px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Explain in your own words…" disabled={disabled || solved} />
          <p className="mt-1 text-xs text-faint">
            Checked offline for key ideas ({q.minConcepts} of: {q.concepts.join(", ")}). It&apos;s a keyword heuristic, so compare with the model answer afterwards.
          </p>
        </div>
      )}

      {!solved && (
        <button type="submit" className="btn-primary" disabled={!a || busy || disabled}>
          {busy ? "Checking…" : grade ? "Try again" : "Check answer"}
        </button>
      )}

      {grade && <GradeFeedback grade={grade} />}
    </form>
  );
}

export function GradeFeedback({ grade }: { grade: GradeView }) {
  return (
    <div role="status" className={cn("rounded-lg border p-3 text-sm", grade.correct ? "border-success/50 bg-success/8" : "border-warning/50 bg-warning/8")}>
      <p className="flex items-center gap-1.5 font-semibold">
        {grade.correct ? <Check size={16} aria-hidden className="text-success" /> : <X size={16} aria-hidden className="text-warning" />}
        {grade.correct ? "Correct" : "Not quite"}
        {!grade.correct && grade.score !== undefined && grade.score > 0 && grade.score < 1 && <span className="font-normal text-muted">({Math.round(grade.score * 100)}% there)</span>}
      </p>
      {grade.concepts && (
        <ul className="mt-2 space-y-0.5">
          {grade.concepts.map((c) => (
            <li key={c.label} className="flex items-center gap-1.5 text-xs">
              {c.found ? <Check size={13} aria-hidden className="text-success" /> : <X size={13} aria-hidden className="text-faint" />}
              <span className={c.found ? "" : "text-muted"}>{c.label}</span>
              <span className="sr-only">{c.found ? "covered" : "missing"}</span>
            </li>
          ))}
        </ul>
      )}
      {grade.feedback && !grade.correct && !grade.concepts && grade.feedback !== grade.explanation && <p className="mt-1.5 text-muted">{grade.feedback}</p>}
      {!grade.correct && !grade.explanation && <p className="mt-1.5 text-muted">Think it through once more — the explanation appears after your next try.</p>}
      {grade.explanation && <p className="mt-1.5">{grade.explanation}</p>}
      {grade.correctAnswer && !grade.correct && !grade.modelAnswer && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted">Correct answer</p>
          <p className="mt-0.5 whitespace-pre-wrap font-mono text-[13px]">{grade.correctAnswer}</p>
        </div>
      )}
      {grade.modelAnswer && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted">Model answer</p>
          <p className="mt-0.5 whitespace-pre-wrap">{grade.modelAnswer}</p>
        </div>
      )}
    </div>
  );
}
