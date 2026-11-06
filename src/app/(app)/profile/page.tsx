import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { skillsForTrack, tracks } from "@/content";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { MASTERY_BANDS } from "@/lib/rules";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { achievements, xpEvents } from "@/server/db/schema";
import { learningMeasures, masteryMap, skillsNeedingPractice, xpSummary } from "@/server/views";
import { Avatar, Card, MasteryMeter, PageHeader, Progress, Stat, TrackPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TrackId } from "@/content/schema";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user, team } = await requireContext();
  const db = await getDb();
  const [xp, mmap, earned, recentXp, needs, ...perTrack] = await Promise.all([
    xpSummary(db, user.id, team.id),
    masteryMap(db, user.id, team.id),
    db.select().from(achievements).where(and(eq(achievements.userId, user.id), eq(achievements.teamId, team.id))),
    db.select().from(xpEvents).where(and(eq(xpEvents.userId, user.id), eq(xpEvents.teamId, team.id))).orderBy(desc(xpEvents.createdAt)).limit(12),
    skillsNeedingPractice(db, user.id, team.id, user.timezone, 8),
    ...tracks.filter((t) => t.id !== "capstone").map((t) => learningMeasures(db, user.id, team.id, t.id)),
  ]);
  const earnedIds = new Set(earned.map((e) => e.achievementId));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Avatar name={user.displayName} hue={user.avatarHue} size={44} />}
        title={user.displayName}
        description={`@${user.handle} · ${team.name}`}
        actions={<Link href="/settings" className="btn-secondary">Settings</Link>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Level ${xp.level}`} value={`${xp.total} XP`} hint={<Progress value={xp.current} max={xp.next} label="Progress to next level" className="mt-1.5" />} />
        <Stat label="Achievements" value={`${earnedIds.size}/${ACHIEVEMENTS.length}`} />
        <Stat label="Skills Proficient+" value={[...mmap.values()].filter((m) => m.score >= 55).length} />
        <Stat label="Skills Strong" value={[...mmap.values()].filter((m) => m.score >= 80).length} hint="Needs a passed review after 7+ days" />
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">Skill mastery by track</h2>
        <p className="mt-1 text-xs text-faint">
          Learning estimates, not certifications. Bands: {MASTERY_BANDS.slice(0, 4).map((b) => `${b.label} (${b.min}+)`).join(", ")}. <Link href="/scoring" className="underline">How mastery is calculated</Link>
        </p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {tracks
            .filter((t) => t.id !== "capstone")
            .map((t, i) => {
              const m = perTrack[i];
              return (
                <section key={t.id} aria-label={`${t.name} skills`}>
                  <div className="flex items-center justify-between">
                    <TrackPill track={t.id} />
                    <span className="text-xs text-muted">
                      {m.completion.done}/{m.completion.total} done · {pct(m.independent.done, m.independent.of)} independent · {pct(m.delayedRecall.passed, m.delayedRecall.of)} delayed recall
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2.5">
                    {skillsForTrack(t.id as TrackId).map((s) => (
                      <li key={s.id}>
                        <p className="text-sm" title={s.description}>{s.name}</p>
                        <MasteryMeter score={mmap.get(s.id)?.score ?? 0} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Achievements</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ACHIEVEMENTS.map((a) => {
              const has = earnedIds.has(a.id);
              return (
                <li key={a.id} className={cn("rounded-lg border p-3", has ? "border-js/40 bg-js/5" : "border-border opacity-70")}>
                  <p className="text-sm font-medium">
                    {has ? "★ " : "☆ "}
                    {a.name}
                    <span className="sr-only">{has ? " (earned)" : " (not yet earned)"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{a.description}</p>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Skills needing practice</h2>
            {needs.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing flagged right now.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {needs.map((n) => (
                  <li key={n.skillId} className="flex justify-between gap-2">
                    <span>{n.skillName}</span>
                    <span className="text-xs text-muted">{n.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Recent XP</h2>
            {recentXp.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No XP yet — finish a mission to start.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {recentXp.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span className="truncate text-muted">{x.reason}</span>
                    <span className="shrink-0 font-mono text-xs">+{x.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
