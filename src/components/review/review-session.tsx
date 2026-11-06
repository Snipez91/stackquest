"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Repeat } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import type { Answer } from "@/lib/grading";
import { cn } from "@/lib/cn";
import { QuestionCard, GradeFeedback, type ClientQuestion, type GradeView } from "@/components/questions/question-card";
import { EmptyState, TrackPill } from "@/components/ui";

type Item = {
  itemId: string;
  kind: "review" | "transfer";
  missionSlug: string;
  missionTitle: string;
  track: string;
  skillName: string;
  dueOn: string;
  overdueDays: number;
  stage: number;
  context?: string;
  question: ClientQuestion;
};
type Queue = { today: string; totalDue: number; items: Item[]; upcoming: { dueOn: string; n: number }[] };
type Result = GradeView & { nextDue: string; xp: number; refresher?: { body: string }; newAchievements: string[] };

const CONF = [
  { v: "unsure", label: "Guessing / unsure" },
  { v: "okay", label: "Fairly sure" },
  { v: "confident", label: "Confident" },
] as const;

export function ReviewSession() {
  const router = useRouter();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [confidence, setConfidence] = useState<"unsure" | "okay" | "confident">("okay");
  const [result, setResult] = useState<Result | null>(null);
  const [tally, setTally] = useState({ correct: 0, total: 0, xp: 0 });

  const load = useCallback(async () => {
    try {
      setQueue(await api<Queue>("/api/review"));
      setI(0);
      setResult(null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load your reviews.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return (
      <div role="alert" className="card p-5 text-sm">
        {error}
        <button className="btn-secondary mt-3" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!queue) return <p className="text-sm text-muted" role="status">Loading reviews…</p>;

  const item = queue.items[i];
  if (!item) {
    return (
      <div className="space-y-4">
        {tally.total > 0 ? (
          <div className="card p-6">
            <h2 className="text-lg font-semibold">Session complete</h2>
            <p className="mt-1 text-sm text-muted">
              {tally.correct} of {tally.total} recalled correctly · +{tally.xp} XP. Items you missed come back tomorrow; the rest are spaced further out.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setTally({ correct: 0, total: 0, xp: 0 });
                  router.refresh();
                  void load();
                }}
              >
                Check for more
              </button>
              <Link href="/dashboard" className="btn-primary">
                Back to dashboard
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Repeat size={28} aria-hidden />}
            title="Nothing due right now"
            body="Reviews appear the day after you finish a mission, then at growing intervals (1, 3, 7, 14, 30 days). Spacing them out is what makes them stick — so there's no reviewing ahead."
            action={
              <Link href="/paths" className="btn-primary">
                Find a mission
              </Link>
            }
          />
        )}
        {queue.upcoming.length > 0 && (
          <div className="card p-5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <CalendarClock size={15} aria-hidden /> Coming up
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {queue.upcoming.map((u) => (
                <li key={u.dueOn} className="rounded-md bg-surface-2 px-2 py-1">
                  <time dateTime={u.dueOn}>{u.dueOn}</time>: {u.n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const submit = async (a: Answer) => {
    try {
      const r = await api<Result>("/api/review", { body: { itemId: item.itemId, answer: a, confidence } });
      setResult(r);
      setTally((t) => ({ correct: t.correct + (r.correct ? 1 : 0), total: t.total + 1, xp: t.xp + r.xp }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't record that review.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>
          Card {i + 1} of {queue.items.length}
          {queue.totalDue > queue.items.length && ` (${queue.totalDue} due in total)`}
        </span>
        <span>
          {tally.correct}/{tally.total} correct this session
        </span>
      </div>
      <div className="card p-5" key={item.itemId}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <TrackPill track={item.track} />
          <span className="text-xs text-muted">{item.skillName}</span>
          {item.kind === "transfer" && <span className="rounded-full border border-js/40 bg-js/10 px-2 py-0.5 text-xs text-js">Transfer challenge</span>}
          {item.overdueDays > 0 && <span className="text-xs text-faint">overdue {item.overdueDays}d</span>}
        </div>
        {item.context && <p className="mb-3 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{item.context}</p>}
        {!result ? (
          <>
            <QuestionCard q={item.question} onSubmit={submit} />
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-xs font-semibold text-muted">How sure are you? (affects when you see this again)</legend>
              <div className="flex flex-wrap gap-1.5">
                {CONF.map((c) => (
                  <label key={c.v} className={cn("cursor-pointer rounded-full border px-3 py-1 text-xs", confidence === c.v ? "border-primary bg-primary/10 text-text" : "border-border text-muted")}>
                    <input type="radio" className="sr-only" name="conf" checked={confidence === c.v} onChange={() => setConfidence(c.v)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">{item.question.prompt}</p>
            <GradeFeedback grade={result} />
            <p className="text-xs text-muted">
              Next review: <time dateTime={result.nextDue}>{result.nextDue}</time>
              {result.xp > 0 && ` · +${result.xp} XP`}
            </p>
            {result.refresher && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-semibold">Quick refresher</p>
                <p className="mt-1 whitespace-pre-wrap text-muted">{result.refresher.body}</p>
                <Link href={`/missions/${item.missionSlug}`} className="mt-2 inline-block text-primary underline">
                  Revisit “{item.missionTitle}”
                </Link>
              </div>
            )}
            <button
              className="btn-primary"
              autoFocus
              onClick={() => {
                setResult(null);
                setConfidence("okay");
                setI((n) => n + 1);
              }}
            >
              {i + 1 < queue.items.length ? "Next card" : "Finish"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
