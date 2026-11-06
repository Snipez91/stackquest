import Link from "next/link";
import { ArrowRight, Compass, Repeat, Target } from "lucide-react";
import { missionsForTrack, tracks } from "@/content";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { goalsWithProgress, recentActivity } from "@/server/leaderboard";
import { continueTarget, dueCount, learningMeasures, masteryMap, missionStatuses, skillsNeedingPractice, trackSkillAverage, xpSummary } from "@/server/views";
import { Card, EmptyState, MasteryMeter, PageHeader, Progress, Stat, TierBadge, TrackPill, TRACK_META } from "@/components/ui";
import { ActivityFeed } from "@/components/team/activity-feed";
import { Orbit } from "@/components/orbit";
import type { TrackId } from "@/content/schema";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const sp = await searchParams;
  const { user, team } = await requireContext();
  const db = await getDb();
  const [target, due, measures, mmap, needs, xp, { status }, feed, goals] = await Promise.all([
    continueTarget(db, user.id, team.id, user.preferredTrack),
    dueCount(db, user.id, team.id, user.timezone),
    learningMeasures(db, user.id, team.id),
    masteryMap(db, user.id, team.id),
    skillsNeedingPractice(db, user.id, team.id, user.timezone, 5),
    xpSummary(db, user.id, team.id),
    missionStatuses(db, user.id, team.id),
    recentActivity(db, user.id, team.id, 8),
    goalsWithProgress(db, user.id, team.id),
  ]);
  const first = user.displayName.replace(/\(.*\)/, "").trim().split(" ")[0];
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      {sp.joined && (
        <p role="status" className="rounded-lg border border-success/50 bg-success/10 px-3 py-2 text-sm">
          You joined <strong>{team.name}</strong>. Welcome aboard.
        </p>
      )}
      <PageHeader title={`Hi ${first}`} description="Here's what to do next. Reviews first if any are due — they take a few minutes and protect what you've learned." />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {!user.onboardedAt && measures.completion.done === 0 ? (
          <Card className="neon relative overflow-hidden p-6">
            <Orbit className="absolute -top-10 -right-10 hidden h-64 w-64 opacity-70 sm:block" />
            <p className="hud flex items-center gap-1.5 !text-primary">
              <Compass size={14} aria-hidden /> Start here
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Take the 4-minute skill check</h2>
            <p className="mt-1 max-w-lg text-sm text-muted">Twelve quick questions across the four tracks. We&apos;ll recommend where to start and let you skip beginner missions you already know. No score is shared with your team.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/onboarding" className="btn-primary">
                Start the skill check <ArrowRight size={15} aria-hidden />
              </Link>
              {target && (
                <Link href={`/missions/${target.mission.slug}`} className="btn-secondary">
                  Skip — start {target.mission.title}
                </Link>
              )}
            </div>
          </Card>
        ) : target ? (
          <Card className="neon relative overflow-hidden p-6">
            <Orbit color={TRACK_META[target.mission.track].color} className="absolute -top-10 -right-10 hidden h-64 w-64 opacity-70 sm:block" />
            <p className="hud">{target.reason}</p>
            <h2 className="mt-2 text-2xl font-semibold">{target.mission.title}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <TrackPill track={target.mission.track} />
              <TierBadge tier={target.mission.tier} />
              <span className="text-xs text-faint">~{target.mission.minutes} min</span>
            </div>
            <p className="relative mt-2 max-w-lg text-sm text-muted">{target.mission.summary}</p>
            <Link href={`/missions/${target.mission.slug}`} className="btn-primary mt-4">
              {target.inProgress ? "Continue mission" : "Start mission"} <ArrowRight size={15} aria-hidden />
            </Link>
          </Card>
        ) : (
          <Card className="p-6">
            <h2 className="text-xl font-semibold">You&apos;ve completed every available mission</h2>
            <p className="mt-1 text-sm text-muted">Keep up your reviews, try a race, or help teammates in chat.</p>
          </Card>
        )}

        <Card className="flex flex-col p-6">
          <p className="hud flex items-center gap-1.5">
            <Repeat size={14} aria-hidden /> Spaced review
          </p>
          <p className="text-gradient mt-2 font-[family-name:var(--font-display)] text-5xl font-semibold tabular-nums">{due}</p>
          <p className="text-sm text-muted">{due === 1 ? "item due today" : "items due today"}</p>
          <p className="mt-2 text-xs text-faint">Mixed across tracks. Answer from memory first — the explanation comes after.</p>
          <Link href="/review" className={due ? "btn-primary mt-auto self-start" : "btn-secondary mt-auto self-start"}>
            {due ? "Start reviews" : "Open review queue"}
          </Link>
        </Card>
      </div>

      <section aria-labelledby="measures-h">
        <h2 id="measures-h" className="sr-only">Your progress</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={`Level ${xp.level}`} value={`${xp.total} XP`} hint={<Progress value={xp.current} max={xp.next} label={`${xp.current} of ${xp.next} XP to level ${xp.level + 1}`} className="mt-1.5" />} />
          <Stat label="Missions completed" value={`${measures.completion.done}/${measures.completion.total}`} hint="Completion" />
          <Stat label="Solved independently" value={pct(measures.independent.done, measures.independent.of)} hint={`${measures.independent.done} of ${measures.independent.of} completed`} />
          <Stat label="Delayed recall" value={pct(measures.delayedRecall.passed, measures.delayedRecall.of)} hint={measures.delayedRecall.of ? `${measures.delayedRecall.passed} of ${measures.delayedRecall.of} reviews after 3+ days` : "No delayed reviews yet"} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Learning paths</h2>
            <Link href="/paths" className="text-sm text-primary underline-offset-2 hover:underline">
              Open map
            </Link>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {tracks.map((t) => {
              const ms = missionsForTrack(t.id);
              const done = ms.filter((m) => status.get(m.slug) === "completed").length;
              return (
                <li key={t.id}>
                  <Link href={`/paths/${t.id}`} className="group block rounded-xl border border-border bg-surface-2/50 p-3 transition-all hover:-translate-y-0.5 hover:border-border-strong" style={{ ["--tc" as string]: TRACK_META[t.id].color }}>
                    <div className="flex items-center justify-between">
                      <TrackPill track={t.id} />
                      <span className="text-xs text-muted tabular-nums">
                        {done}/{ms.length}
                      </span>
                    </div>
                    <Progress value={done} max={ms.length || 1} label={`${t.name}: ${done} of ${ms.length} missions`} className="mt-2.5" color={TRACK_META[t.id].color} />
                    {t.id !== "capstone" && (
                      <div className="mt-2.5">
                        <MasteryMeter score={trackSkillAverage(mmap, t.id as TrackId)} compact />
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Target size={16} aria-hidden /> Skills needing practice
          </h2>
          {needs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing flagged yet. As you complete missions and reviews, skills that slip will show up here with a suggested next step.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {needs.map((n) => (
                <li key={n.skillId} className="rounded-lg border border-border bg-surface-2 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{n.skillName}</span>
                    <span className={`text-[11px] ${TRACK_META[n.track].text}`}>{TRACK_META[n.track].label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{n.reason}</p>
                  <div className="mt-1.5 flex gap-3 text-xs">
                    <Link href="/review" className="text-primary hover:underline">
                      Review
                    </Link>
                    {n.missionSlug && (
                      <Link href={`/missions/${n.missionSlug}`} className="text-primary hover:underline">
                        Practise the mission again
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Team activity</h2>
            <Link href="/team" className="text-sm text-primary underline-offset-2 hover:underline">
              Team progress
            </Link>
          </div>
          <ActivityFeed initial={feed.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} />
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">This week&apos;s team goals</h2>
          {goals.goals.length === 0 ? (
            <EmptyState title="No goals set" body="Team admins can set cooperative weekly goals on the Team page." />
          ) : (
            <ul className="mt-3 space-y-3">
              {goals.goals.map((g) => (
                <li key={g.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{g.title}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {g.value}/{g.target} {g.done && "· done"}
                    </span>
                  </div>
                  <Progress value={g.value} max={g.target} label={`${g.title}: ${g.value} of ${g.target}`} className="mt-1.5" color={g.done ? "var(--success)" : undefined} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
