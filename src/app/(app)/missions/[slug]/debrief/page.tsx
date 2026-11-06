import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { CalendarClock, Check, Repeat, Sparkles, TriangleAlert } from "lucide-react";
import { getMission, getSkill, missionsForTrack } from "@/content";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { attempts, mastery, reviewStates, xpEvents } from "@/server/db/schema";
import { completedSlugs } from "@/server/learning";
import { Card, Markdown, MasteryMeter, PageHeader, TierBadge, TrackPill } from "@/components/ui";
import { achievementById } from "@/lib/achievements";
import { achievements } from "@/server/db/schema";

export const metadata = { title: "Mission debrief" };

export default async function DebriefPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ attempt?: string }> }) {
  const { slug } = await params;
  const { attempt: attemptId } = await searchParams;
  const ctx = await requireContext();
  const mission = getMission(slug);
  if (!mission) notFound();
  const db = await getDb();

  const conds = [eq(attempts.userId, ctx.user.id), eq(attempts.teamId, ctx.team.id), eq(attempts.missionSlug, slug), eq(attempts.status, "completed")];
  if (attemptId && /^[0-9a-f-]{36}$/.test(attemptId)) conds.push(eq(attempts.id, attemptId));
  const [attempt] = await db.select().from(attempts).where(and(...conds)).orderBy(desc(attempts.completedAt)).limit(1);
  if (!attempt) redirect(`/missions/${slug}`);

  const [xp, skillRows, reviews, recentAch] = await Promise.all([
    db
      .select()
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, ctx.user.id), eq(xpEvents.teamId, ctx.team.id), or(eq(xpEvents.idempotencyKey, `mission:${slug}`), eq(xpEvents.idempotencyKey, `mission-independent:${slug}`), like(xpEvents.idempotencyKey, `q:${slug}:%`)))),
    db.select().from(mastery).where(and(eq(mastery.userId, ctx.user.id), eq(mastery.teamId, ctx.team.id), inArray(mastery.skillId, [...mission.skills, ...mission.appliesSkills]))),
    db.select().from(reviewStates).where(and(eq(reviewStates.userId, ctx.user.id), eq(reviewStates.teamId, ctx.team.id), eq(reviewStates.missionSlug, slug))),
    db.select().from(achievements).where(and(eq(achievements.userId, ctx.user.id), eq(achievements.teamId, ctx.team.id))),
  ]);
  const totalXp = xp.reduce((s, x) => s + x.amount, 0);
  const done = await completedSlugs(db, ctx.user.id, ctx.team.id);
  const next = missionsForTrack(mission.track).find((m) => !done.has(m.slug) && m.prerequisites.every((p) => done.has(p)));
  const freshAch = recentAch.filter((a) => attempt.completedAt && Math.abs(a.earnedAt.getTime() - attempt.completedAt.getTime()) < 60_000);
  const questionResults = Object.entries(attempt.questionResults ?? {});
  const firstTry = questionResults.filter(([, r]) => r.correct && r.tries === 1).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <TrackPill track={mission.track} />
            <TierBadge tier={mission.tier} />
          </div>
        }
        title={`Debrief: ${mission.title}`}
        description={attempt.independent ? "Completed independently — strong evidence for your mastery estimate." : "Completed with support. That's real progress; an independent solve or successful reviews later will strengthen the estimate."}
        actions={
          <>
            <Link href="/review" className="btn-secondary">
              <Repeat size={15} aria-hidden /> Review queue
            </Link>
            {next ? (
              <Link href={`/missions/${next.slug}`} className="btn-primary">
                Next: {next.title}
              </Link>
            ) : (
              <Link href="/paths" className="btn-primary">
                Choose the next path
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted">XP from this mission</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">+{totalXp}</p>
          <p className="mt-0.5 text-xs text-faint">{totalXp === 0 ? "Practice run — XP was awarded on your first completion." : "Mission XP is awarded once; reviews earn more later."}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">How you solved it</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold">
            {attempt.independent ? <Check size={18} aria-hidden className="text-success" /> : <Sparkles size={18} aria-hidden className="text-primary" />}
            {attempt.independent ? "Independently" : "With support"}
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {attempt.hintsUsed} hint{attempt.hintsUsed === 1 ? "" : "s"} · {attempt.submissions} check run{attempt.submissions === 1 ? "" : "s"}
            {attempt.solutionViewed ? " · solution viewed" : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Questions</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {firstTry}/{mission.questions.length}
          </p>
          <p className="mt-0.5 text-xs text-faint">answered correctly on the first try</p>
        </Card>
      </div>

      {freshAch.length > 0 && (
        <Card className="border-js/40 p-4">
          <p className="text-sm font-semibold">Achievement{freshAch.length > 1 ? "s" : ""} earned</p>
          <ul className="mt-1 text-sm text-muted">
            {freshAch.map((a) => (
              <li key={a.achievementId}>
                <strong className="text-text">{achievementById(a.achievementId)?.name}</strong> — {achievementById(a.achievementId)?.description}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Solution walkthrough</h2>
            <Markdown source={mission.debrief.solution} className="mt-2" />
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <TriangleAlert size={16} aria-hidden className="text-warning" /> Common mistakes
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              {mission.debrief.commonMistakes.map((m) => (
                <li key={m} className="flex gap-2">
                  <span aria-hidden className="text-warning">•</span>
                  {m}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">On real systems</h2>
            <Markdown source={mission.debrief.realWorld} className="mt-2" />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Skills — mastery estimate</h2>
            <p className="mt-1 text-xs text-faint">A learning estimate from your evidence so far, not a certification.</p>
            <ul className="mt-3 space-y-3">
              {[...mission.skills, ...mission.appliesSkills].map((s) => {
                const row = skillRows.find((r) => r.skillId === s);
                return (
                  <li key={s}>
                    <p className="mb-1 text-sm">{getSkill(s)?.name ?? s}</p>
                    <MasteryMeter score={row?.score ?? 0} />
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <CalendarClock size={16} aria-hidden /> Coming back to this
            </h2>
            <p className="mt-1 text-sm text-muted">Recalling something after a gap is what makes it stick. These are scheduled for you:</p>
            <ul className="mt-3 space-y-2 text-sm">
              {reviews
                .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
                .map((r) => (
                  <li key={r.itemId} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5">
                    <span>{r.kind === "transfer" ? "Transfer challenge (new context)" : `Review: ${getSkill(r.skillId)?.name ?? r.skillId}`}</span>
                    <time className="shrink-0 text-xs text-muted" dateTime={r.dueOn}>
                      {r.retiredAt ? "done" : r.dueOn}
                    </time>
                  </li>
                ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Talk it through</h2>
            <p className="mt-1 text-sm text-muted">Compare approaches with teammates in this mission&apos;s thread. Wrap answers in ||spoilers||.</p>
            <Link href={`/chat?mission=${slug}`} className="btn-secondary mt-3">
              Open mission thread
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
