"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { submitDiagnosticAction, skipOnboardingAction, type DiagnosticResult } from "@/app/actions/onboarding";
import { DONT_KNOW } from "@/content/diagnostic";
import { TrackPill } from "@/components/ui";
import { cn } from "@/lib/cn";

type Q = { id: string; track: string; prompt: string; code?: string; options: string[] };
type Interest = "python" | "linux" | "javascript" | "networking" | "unsure";

const INTERESTS: { v: Interest; label: string; blurb: string }[] = [
  { v: "python", label: "Python", blurb: "Scripts, data and automation" },
  { v: "linux", label: "Linux", blurb: "Servers, permissions, services" },
  { v: "javascript", label: "JavaScript", blurb: "Interfaces and async code" },
  { v: "networking", label: "Networking", blurb: "DNS, routing, connectivity" },
  { v: "unsure", label: "Not sure yet", blurb: "Recommend one for me" },
];

export function Diagnostic({ questions, joined }: { questions: Q[]; joined: boolean }) {
  const [step, setStep] = useState<"interest" | "quiz" | "result">("interest");
  const [interest, setInterest] = useState<Interest | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (step === "interest") {
    return (
      <div className="mx-auto max-w-2xl">
        {joined && <p role="status" className="mb-4 rounded-lg border border-success/50 bg-success/10 px-3 py-2 text-sm">You&apos;re on the team. Let&apos;s find your starting point.</p>}
        <h1 className="text-2xl font-semibold tracking-tight">What do you most want to get better at?</h1>
        <p className="mt-1 text-sm text-muted">You can switch any time and work on all four tracks. This just picks your first mission.</p>
        <fieldset className="mt-5 grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Pick a starting track</legend>
          {INTERESTS.map((o) => (
            <label key={o.v} className={cn("cursor-pointer rounded-xl border p-4", interest === o.v ? "border-primary bg-primary/8" : "border-border bg-surface hover:border-border-strong")}>
              <input type="radio" name="interest" className="sr-only" checked={interest === o.v} onChange={() => setInterest(o.v)} />
              <span className="block font-medium">{o.label}</span>
              <span className="block text-sm text-muted">{o.blurb}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={!interest} onClick={() => setStep("quiz")}>
            Continue to the 12-question check <ArrowRight size={15} aria-hidden />
          </button>
          <form action={skipOnboardingAction}>
            <button className="btn-ghost text-sm">Skip for now</button>
          </form>
        </div>
      </div>
    );
  }

  if (step === "quiz") {
    const q = questions[i];
    const chosen = answers[q.id];
    const next = async () => {
      if (i + 1 < questions.length) return setI(i + 1);
      setBusy(true);
      try {
        setResult(await submitDiagnosticAction({ interest: interest!, answers }));
        setStep("result");
      } catch {
        setError("Couldn't save your results. Try again.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>Question {i + 1} of {questions.length}</span>
          <TrackPill track={q.track} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full bg-primary transition-[width]" style={{ width: `${(i / questions.length) * 100}%` }} />
        </div>
        <div className="card mt-4 p-5">
          <p className="font-medium">{q.prompt}</p>
          {q.code && <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code p-3 font-mono text-[13px]">{q.code}</pre>}
          <fieldset className="mt-4 space-y-1.5">
            <legend className="sr-only">Answer</legend>
            {[...q.options.map((o, idx) => ({ o, idx })), { o: "I don't know yet", idx: DONT_KNOW }].map(({ o, idx }) => (
              <label key={idx} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm", chosen === idx ? "border-primary bg-primary/8" : "border-border hover:bg-surface-2", idx === DONT_KNOW && "text-muted")}>
                <input type="radio" name={q.id} checked={chosen === idx} onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))} className="accent-[var(--primary)]" />
                {o}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-between">
            <button className="btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
            <button className="btn-primary" disabled={chosen === undefined || busy} onClick={() => void next()}>
              {i + 1 < questions.length ? "Next" : busy ? "Saving…" : "See my starting point"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-faint">No feedback during the check, so it measures what you know now. Results are private to you.</p>
      </div>
    );
  }

  const r = result!;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Your starting point</h1>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {Object.entries(r.perTrack).map(([t, v]) => (
          <li key={t} className="card flex items-center justify-between p-3">
            <TrackPill track={t} />
            <span className="text-sm text-muted">
              {v.correct}/{v.total} · {v.level === "solid" ? "solid basics" : v.level === "some" ? "some experience" : "new to this"}
            </span>
          </li>
        ))}
      </ul>
      <div className="card mt-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Recommended first mission</p>
        <h2 className="mt-1 text-lg font-semibold">{r.recommended.missionTitle}</h2>
        <p className="mt-1 text-sm text-muted">{r.recommended.reason}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/missions/${r.recommended.missionSlug}`} className="btn-primary">
            Start this mission <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href="/paths" className="btn-secondary">Browse all paths</Link>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
        <p className="font-medium text-text">How a mission works</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Read the brief and the short concept explanation.</li>
          <li>Do the hands-on work in the workspace and press <strong>Check my work</strong>.</li>
          <li>Answer a couple of questions, then read the debrief.</li>
          <li>Come back for short reviews over the following days and weeks.</li>
        </ol>
      </div>
    </div>
  );
}
