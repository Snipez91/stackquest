import "server-only";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { getMission, getSkill, missions, missionsForTrack, skills, tracks } from "@/content";
import type { TrackId } from "@/content/schema";
import { levelForXp } from "@/lib/rules";
import { daysBetween, localDate } from "@/lib/time";
import type { Db } from "./db";
import { attempts, diagnostics, mastery, reviewLogs, reviewStates, skillEvidence, xpEvents } from "./db/schema";
import { completedSlugs, placedOutSlugs } from "./learning";

export type MissionStatus = "completed" | "in_progress" | "available" | "locked";

export async function missionStatuses(db: Db, userId: string, teamId: string) {
  const [done, placed, open] = await Promise.all([
    completedSlugs(db, userId, teamId),
    placedOutSlugs(db, userId),
    db
      .select({ slug: attempts.missionSlug })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.status, "in_progress"), sql`(${attempts.submissions} > 0 or ${attempts.hintsUsed} > 0 or ${attempts.draft} is not null)`)),
  ]);
  const satisfied = new Set([...done, ...placed]);
  const openSet = new Set(open.map((o) => o.slug));
  const status = new Map<string, MissionStatus>();
  for (const m of missions) {
    if (done.has(m.slug)) status.set(m.slug, "completed");
    else if (!m.prerequisites.every((p) => satisfied.has(p))) status.set(m.slug, "locked");
    else if (openSet.has(m.slug)) status.set(m.slug, "in_progress");
    else status.set(m.slug, "available");
  }
  return { status, done, placed };
}

export async function masteryMap(db: Db, userId: string, teamId: string) {
  const rows = await db.select().from(mastery).where(and(eq(mastery.userId, userId), eq(mastery.teamId, teamId)));
  return new Map(rows.map((r) => [r.skillId, r]));
}

/** The three separate measures: completion, independent performance, delayed recall. */
export async function learningMeasures(db: Db, userId: string, teamId: string, track?: TrackId) {
  const done = await db
    .selectDistinct({ slug: attempts.missionSlug })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.status, "completed")));
  const independent = await db
    .selectDistinct({ slug: attempts.missionSlug })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.status, "completed"), eq(attempts.independent, true)));
  const inTrack = (slug: string) => !track || getMission(slug)?.track === track;
  const total = missions.filter((m) => !track || m.track === track).length;
  const completed = done.filter((d) => inTrack(d.slug)).length;
  const indep = independent.filter((d) => inTrack(d.slug)).length;
  const ev = await db
    .select({ kind: skillEvidence.kind, skillId: skillEvidence.skillId })
    .from(skillEvidence)
    .where(and(eq(skillEvidence.userId, userId), eq(skillEvidence.teamId, teamId), sql`${skillEvidence.delayDays} >= 3`, sql`${skillEvidence.kind} in ('review_pass','review_fail')`));
  const delayed = ev.filter((e) => !track || getSkill(e.skillId)?.track === track);
  const delayedPass = delayed.filter((e) => e.kind === "review_pass").length;
  return {
    completion: { done: completed, total },
    independent: { done: indep, of: completed },
    delayedRecall: { passed: delayedPass, of: delayed.length },
  };
}

export type PracticeNeed = { skillId: string; skillName: string; track: string; reason: string; missionSlug: string | null; priority: number };

export async function skillsNeedingPractice(db: Db, userId: string, teamId: string, tz: string, limit = 6): Promise<PracticeNeed[]> {
  const today = localDate(tz);
  const [mrows, states, lastLogs] = await Promise.all([
    db.select().from(mastery).where(and(eq(mastery.userId, userId), eq(mastery.teamId, teamId))),
    db.select().from(reviewStates).where(and(eq(reviewStates.userId, userId), eq(reviewStates.teamId, teamId), isNull(reviewStates.retiredAt))),
    db
      .select({ itemId: reviewLogs.itemId, correct: reviewLogs.correct, reviewedAt: reviewLogs.reviewedAt })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.teamId, teamId)))
      .orderBy(desc(reviewLogs.reviewedAt))
      .limit(200),
  ]);
  const needs = new Map<string, PracticeNeed>();
  const add = (skillId: string, reason: string, priority: number, missionSlug: string | null) => {
    const cur = needs.get(skillId);
    if (cur && cur.priority >= priority) return;
    const s = getSkill(skillId);
    if (!s) return;
    needs.set(skillId, { skillId, skillName: s.name, track: s.track, reason, missionSlug, priority });
  };
  const seenItem = new Set<string>();
  for (const l of lastLogs) {
    if (seenItem.has(l.itemId)) continue;
    seenItem.add(l.itemId);
    if (!l.correct) {
      const st = states.find((s) => s.itemId === l.itemId);
      if (st) add(st.skillId, "Missed in your most recent review", 3, st.missionSlug);
    }
  }
  for (const st of states) {
    const overdue = daysBetween(st.dueOn, today);
    if (overdue >= 3) add(st.skillId, `Review overdue by ${overdue} days`, 2, st.missionSlug);
  }
  for (const m of mrows) {
    const taughtIn = missions.find((x) => x.skills.includes(m.skillId))?.slug ?? null;
    if (m.completions > 0 && m.independentCompletions === 0 && m.delayedPasses === 0) add(m.skillId, "So far only completed with support", 1, taughtIn);
    else if (m.score < 30 && m.completions > 0) add(m.skillId, "Little evidence yet", 1, taughtIn);
  }
  return [...needs.values()].sort((a, b) => b.priority - a.priority || a.skillName.localeCompare(b.skillName)).slice(0, limit);
}

export async function continueTarget(db: Db, userId: string, teamId: string, preferredTrack: string | null) {
  const [open] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.status, "in_progress"), sql`(${attempts.submissions} > 0 or ${attempts.hintsUsed} > 0 or ${attempts.draft} is not null)`))
    .orderBy(desc(attempts.startedAt))
    .limit(1);
  if (open) {
    const m = getMission(open.missionSlug);
    if (m) return { mission: m, reason: "Pick up where you left off", inProgress: true };
  }
  const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.userId, userId)).limit(1);
  const { status } = await missionStatuses(db, userId, teamId);
  const order: string[] = [preferredTrack ?? diag?.recommended.track ?? "python", ...tracks.map((t) => t.id)];
  for (const t of order) {
    const next = missionsForTrack(t as TrackId).find((m) => status.get(m.slug) === "available");
    if (next) return { mission: next, reason: t === order[0] ? "Next in your chosen path" : "Next available mission", inProgress: false };
  }
  return null;
}

export async function xpSummary(db: Db, userId: string, teamId: string) {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.teamId, teamId)));
  const total = Number(r.total);
  return { total, ...levelForXp(total) };
}

export async function dueCount(db: Db, userId: string, teamId: string, tz: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewStates)
    .where(and(eq(reviewStates.userId, userId), eq(reviewStates.teamId, teamId), lte(reviewStates.dueOn, localDate(tz)), isNull(reviewStates.retiredAt)));
  return Number(r.n);
}

export function trackSkillAverage(map: Map<string, { score: number }>, track: TrackId) {
  const ss = skills.filter((s) => s.track === track);
  if (!ss.length) return 0;
  return Math.round(ss.reduce((sum, s) => sum + (map.get(s.id)?.score ?? 0), 0) / ss.length);
}
