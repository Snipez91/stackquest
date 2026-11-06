import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getSkill, missions } from "@/content";
import type { TrackId } from "@/content/schema";
import { levelForXp, masteryBand } from "@/lib/rules";
import { localDate, weekWindow } from "@/lib/time";
import type { Db } from "./db";
import { activity, achievements, attempts, mastery, memberships, raceEntries, races, reviewLogs, skillEvidence, teamGoals, teams, users, xpEvents } from "./db/schema";
import { rowsOf } from "./errors";
import { requireMembership } from "./teams";

export type Board = "weekly" | "all-time";

export type LeaderRow = {
  rank: number;
  userId: string;
  displayName: string;
  handle: string;
  avatarHue: number;
  xp: number;
  level: number;
  /** When the learner reached this total (tie-breaker: earlier wins). */
  reachedAt: string | null;
  hidden: boolean;
};

/**
 * Rank team members by XP within a window. Ties are broken by who reached the
 * total first, then by display name, so ordering is deterministic and fair.
 * The weekly window is Monday 00:00 → next Monday 00:00 in the team's time zone.
 */
export async function leaderboard(
  db: Db,
  viewerId: string,
  teamId: string,
  opts: { board: Board; track?: TrackId; now?: Date },
): Promise<{ rows: LeaderRow[]; window: { start: Date; end: Date } | null; timezone: string }> {
  await requireMembership(db, viewerId, teamId);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  const win = opts.board === "weekly" ? weekWindow(team.timezone, opts.now ?? new Date()) : null;
  const conds = [sql`x.team_id = ${teamId}`];
  if (win) conds.push(sql`x.created_at >= ${win.start.toISOString()}::timestamptz and x.created_at < ${win.end.toISOString()}::timestamptz`);
  if (opts.track) conds.push(sql`x.track = ${opts.track}`);
  const where = sql.join(conds, sql` and `);
  const result = await db.execute(sql`
    select u.id as user_id, u.display_name, u.handle, u.avatar_hue, u.show_on_leaderboard,
           coalesce(s.xp, 0)::int as xp, s.reached_at,
           coalesce(t.total, 0)::int as total_xp
    from ${memberships} m
    join ${users} u on u.id = m.user_id
    left join (select x.user_id, sum(x.amount) as xp, max(x.created_at) as reached_at
               from ${xpEvents} x where ${where} group by x.user_id) s on s.user_id = m.user_id
    left join (select user_id, sum(amount) as total from ${xpEvents} where team_id = ${teamId} group by user_id) t on t.user_id = m.user_id
    where m.team_id = ${teamId}
    order by xp desc, s.reached_at asc nulls last, u.display_name asc, u.id asc
  `);
  const raw = rowsOf<{
    user_id: string;
    display_name: string;
    handle: string;
    avatar_hue: number;
    show_on_leaderboard: boolean;
    xp: number;
    reached_at: string | Date | null;
    total_xp: number;
  }>(result);
  let rank = 0;
  let prev: { xp: number; reached: string | null } | null = null;
  const rows: LeaderRow[] = [];
  raw.forEach((r, i) => {
    const reached = r.reached_at ? new Date(r.reached_at).toISOString() : null;
    // Members with identical XP *and* identical reach time share a rank.
    if (!prev || prev.xp !== r.xp || prev.reached !== reached) rank = i + 1;
    prev = { xp: r.xp, reached };
    const hidden = !r.show_on_leaderboard && r.user_id !== viewerId;
    rows.push({
      rank,
      userId: r.user_id,
      displayName: hidden ? "Private learner" : r.display_name,
      handle: hidden ? "" : r.handle,
      avatarHue: r.avatar_hue,
      xp: Number(r.xp),
      level: levelForXp(Number(r.total_xp)).level,
      reachedAt: reached,
      hidden,
    });
  });
  return { rows, window: win ? { start: win.start, end: win.end } : null, timezone: team.timezone };
}

/** Recognition beyond raw XP: improvement, review consistency, cross-track breadth. */
export async function recognition(db: Db, viewerId: string, teamId: string, now = new Date()) {
  await requireMembership(db, viewerId, teamId);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  const win = weekWindow(team.timezone, now);
  const improved = rowsOf<{ user_id: string; display_name: string; points: number }>(
    await db.execute(sql`
      select e.user_id, u.display_name, round(sum(e.points)::numeric, 1)::float as points
      from ${skillEvidence} e join ${users} u on u.id = e.user_id
      where e.team_id = ${teamId} and e.created_at >= ${win.start.toISOString()}::timestamptz and u.show_on_leaderboard
      group by e.user_id, u.display_name having sum(e.points) > 0
      order by points desc, u.display_name asc limit 5`),
  );
  const consistent = rowsOf<{ user_id: string; display_name: string; days: number }>(
    await db.execute(sql`
      select r.user_id, u.display_name, count(distinct (r.reviewed_at at time zone ${team.timezone})::date)::int as days
      from ${reviewLogs} r join ${users} u on u.id = r.user_id
      where r.team_id = ${teamId} and r.reviewed_at >= now() - interval '14 days' and u.show_on_leaderboard
      group by r.user_id, u.display_name
      order by days desc, u.display_name asc limit 5`),
  );
  const prof = await db
    .select({ userId: mastery.userId, skillId: mastery.skillId, name: users.displayName })
    .from(mastery)
    .innerJoin(users, eq(users.id, mastery.userId))
    .where(and(eq(mastery.teamId, teamId), gte(mastery.score, 55), eq(users.showOnLeaderboard, true)));
  const byUser = new Map<string, { name: string; tracks: Set<string> }>();
  for (const p of prof) {
    const t = getSkill(p.skillId)?.track;
    if (!t) continue;
    const e = byUser.get(p.userId) ?? { name: p.name, tracks: new Set() };
    e.tracks.add(t);
    byUser.set(p.userId, e);
  }
  const crossTrack = [...byUser.entries()]
    .map(([userId, v]) => ({ userId, displayName: v.name, tracks: v.tracks.size }))
    .filter((x) => x.tracks >= 2)
    .sort((a, b) => b.tracks - a.tracks || a.displayName.localeCompare(b.displayName))
    .slice(0, 5);
  return {
    mostImproved: improved.map((r) => ({ userId: r.user_id, displayName: r.display_name, points: Number(r.points) })),
    reviewConsistency: consistent.map((r) => ({ userId: r.user_id, displayName: r.display_name, days: Number(r.days) })),
    crossTrack,
  };
}

/** Public per-member progress (no answers, no mistakes, no hint counts). */
export async function teamProgress(db: Db, viewerId: string, teamId: string) {
  await requireMembership(db, viewerId, teamId);
  const members = await db
    .select({ userId: users.id, displayName: users.displayName, handle: users.handle, avatarHue: users.avatarHue, role: memberships.role, lastSeenAt: memberships.lastSeenAt, isDemo: users.isDemo })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId));
  const done = await db
    .selectDistinct({ userId: attempts.userId, slug: attempts.missionSlug })
    .from(attempts)
    .where(and(eq(attempts.teamId, teamId), eq(attempts.status, "completed")));
  const badges = await db.select().from(achievements).where(eq(achievements.teamId, teamId));
  const mast = await db.select({ userId: mastery.userId, skillId: mastery.skillId, score: mastery.score }).from(mastery).where(eq(mastery.teamId, teamId));
  const xp = await db
    .select({ userId: xpEvents.userId, total: sql<number>`sum(${xpEvents.amount})::int` })
    .from(xpEvents)
    .where(eq(xpEvents.teamId, teamId))
    .groupBy(xpEvents.userId);
  const tracks: TrackId[] = ["python", "linux", "javascript", "networking", "capstone"];
  return members.map((m) => {
    const mine = new Set(done.filter((d) => d.userId === m.userId).map((d) => d.slug));
    const scores = mast.filter((x) => x.userId === m.userId);
    const total = xp.find((x) => x.userId === m.userId)?.total ?? 0;
    return {
      ...m,
      xp: Number(total),
      level: levelForXp(Number(total)).level,
      completed: mine.size,
      byTrack: Object.fromEntries(
        tracks.map((t) => {
          const all = missions.filter((x) => x.track === t);
          return [t, { done: all.filter((x) => mine.has(x.slug)).length, total: all.length }];
        }),
      ) as Record<TrackId, { done: number; total: number }>,
      badges: badges.filter((b) => b.userId === m.userId).map((b) => b.achievementId),
      averageMastery: scores.length ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length) : 0,
      masteryBand: masteryBand(scores.length ? scores.reduce((s, x) => s + x.score, 0) / scores.length : 0).label,
    };
  });
}

export async function recentActivity(db: Db, viewerId: string, teamId: string, limit = 30) {
  await requireMembership(db, viewerId, teamId);
  return db
    .select({ id: activity.id, kind: activity.kind, payload: activity.payload, createdAt: activity.createdAt, userId: activity.userId, displayName: users.displayName, avatarHue: users.avatarHue })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.userId))
    .where(eq(activity.teamId, teamId))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

// ------------------------------------------------------------------ team goals

export async function goalsWithProgress(db: Db, viewerId: string, teamId: string, now = new Date()) {
  await requireMembership(db, viewerId, teamId);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  const win = weekWindow(team.timezone, now);
  const goals = await db.select().from(teamGoals).where(and(eq(teamGoals.teamId, teamId), eq(teamGoals.weekStart, win.startDay)));
  const inWeek = sql`>= ${win.start.toISOString()}::timestamptz`;
  const out = [];
  for (const g of goals) {
    let value = 0;
    if (g.metric === "missions" || g.metric === "independent") {
      const trackSlugs = g.track ? missions.filter((m) => m.track === g.track).map((m) => m.slug) : null;
      const rows = await db
        .select({ slug: attempts.missionSlug, independent: attempts.independent })
        .from(attempts)
        .where(and(eq(attempts.teamId, teamId), eq(attempts.status, "completed"), sql`${attempts.completedAt} ${inWeek}`, sql`${attempts.completedAt} < ${win.end.toISOString()}::timestamptz`));
      value = rows.filter((r) => (!trackSlugs || trackSlugs.includes(r.slug)) && (g.metric === "missions" || r.independent)).length;
    } else if (g.metric === "reviews") {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(reviewLogs)
        .where(and(eq(reviewLogs.teamId, teamId), eq(reviewLogs.correct, true), sql`${reviewLogs.reviewedAt} ${inWeek}`, sql`${reviewLogs.reviewedAt} < ${win.end.toISOString()}::timestamptz`));
      value = Number(r.n);
    } else if (g.metric === "tracks_touched") {
      const rows = await db
        .selectDistinct({ track: xpEvents.track, userId: xpEvents.userId })
        .from(xpEvents)
        .where(and(eq(xpEvents.teamId, teamId), sql`${xpEvents.createdAt} ${inWeek}`, sql`${xpEvents.track} is not null`));
      value = rows.length;
    }
    out.push({ ...g, value, done: value >= g.target });
  }
  return { goals: out, weekStart: win.startDay, weekEnd: localDate(team.timezone, new Date(win.end.getTime() - 1)) };
}

// ------------------------------------------------------------------ races

export async function raceBoard(db: Db, viewerId: string, teamId: string, raceId: string) {
  await requireMembership(db, viewerId, teamId);
  const [race] = await db.select().from(races).where(and(eq(races.id, raceId), eq(races.teamId, teamId)));
  if (!race) return null;
  const entries = await db
    .select({ userId: raceEntries.userId, displayName: users.displayName, joinedAt: raceEntries.joinedAt, finishedAt: raceEntries.finishedAt, durationMs: raceEntries.durationMs })
    .from(raceEntries)
    .innerJoin(users, eq(users.id, raceEntries.userId))
    .where(eq(raceEntries.raceId, raceId));
  entries.sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity) || a.displayName.localeCompare(b.displayName));
  return { race, entries };
}
