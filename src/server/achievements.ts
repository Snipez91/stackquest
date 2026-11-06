import { and, eq, sql } from "drizzle-orm";
import { missions } from "@/content";
import type { Db } from "./db";
import { achievements, activity, attempts, mastery, notifications, reviewLogs, skillEvidence } from "./db/schema";
import { getSkill } from "@/content";
import { achievementById, type AchievementId } from "@/lib/achievements";
import { rowsOf } from "./errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

/** Evaluates every achievement rule and inserts newly earned ones. Returns new ids. */
export async function checkAchievements(tx: Tx, userId: string, teamId: string): Promise<AchievementId[]> {
  const have = new Set(
    (await tx.select({ id: achievements.achievementId }).from(achievements).where(and(eq(achievements.userId, userId), eq(achievements.teamId, teamId)))).map((r) => r.id),
  );
  const done = await tx
    .select({ slug: attempts.missionSlug, independent: attempts.independent })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.status, "completed")));
  const doneSlugs = new Set(done.map((d) => d.slug));
  const independentSlugs = new Set(done.filter((d) => d.independent).map((d) => d.slug));
  const doneMissions = missions.filter((m) => doneSlugs.has(m.slug));

  const evidence = await tx
    .select({ kind: skillEvidence.kind, delay: skillEvidence.delayDays })
    .from(skillEvidence)
    .where(and(eq(skillEvidence.userId, userId), eq(skillEvidence.teamId, teamId)));
  const reviewDays = rowsOf<{ n: number }>(
    await tx.execute(sql`select count(distinct (reviewed_at at time zone 'UTC')::date)::int as n from ${reviewLogs} where user_id = ${userId} and team_id = ${teamId}`),
  )[0]?.n ?? 0;
  const comeback = rowsOf<{ n: number }>(
    await tx.execute(sql`
      select count(*)::int as n from ${reviewLogs} pass
      where pass.user_id = ${userId} and pass.team_id = ${teamId} and pass.correct
        and exists (select 1 from ${reviewLogs} f where f.user_id = pass.user_id and f.team_id = pass.team_id
                    and f.item_id = pass.item_id and not f.correct and f.reviewed_at < pass.reviewed_at)`),
  )[0]?.n ?? 0;
  const proficient = await tx
    .select({ skillId: mastery.skillId })
    .from(mastery)
    .where(and(eq(mastery.userId, userId), eq(mastery.teamId, teamId), sql`${mastery.score} >= 55`));
  const proficientTracks = new Set(proficient.map((p) => getSkill(p.skillId)?.track).filter(Boolean));

  const earned: AchievementId[] = [];
  const rule = (id: AchievementId, ok: boolean) => {
    if (ok && !have.has(id)) earned.push(id);
  };
  rule("first-mission", doneSlugs.size >= 1);
  rule("independent-3", independentSlugs.size >= 3);
  rule(
    "tier-beginner",
    (["python", "linux", "javascript", "networking"] as const).some((t) => {
      const b = missions.filter((m) => m.track === t && m.tier === "beginner");
      return b.length > 0 && b.every((m) => doneSlugs.has(m.slug));
    }),
  );
  rule("track-explorer", new Set(doneMissions.filter((m) => m.track !== "capstone").map((m) => m.track)).size >= 3);
  rule("polymath", proficientTracks.size >= 4);
  rule("recall-7", evidence.some((e) => e.kind === "review_pass" && e.delay >= 7));
  rule("recall-30", evidence.some((e) => e.kind === "review_pass" && e.delay >= 30));
  rule("consistent-5", Number(reviewDays) >= 5);
  rule("comeback", Number(comeback) >= 1);
  rule("transfer-1", evidence.some((e) => e.kind === "transfer_pass"));
  rule("capstone-1", doneMissions.some((m) => m.track === "capstone"));

  if (earned.length) {
    await tx
      .insert(achievements)
      .values(earned.map((achievementId) => ({ userId, teamId, achievementId })))
      .onConflictDoNothing();
    await tx.insert(activity).values(
      earned.map((id) => ({ teamId, userId, kind: "achievement", payload: { achievement: achievementById(id)?.name ?? id, id } })),
    );
    await tx.insert(notifications).values(
      earned.map((id) => ({ userId, teamId, kind: "achievement" as const, payload: { id, name: achievementById(id)?.name ?? id } })),
    );
  }
  return earned;
}
