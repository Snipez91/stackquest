import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getMission, missionsForTrack } from "@/content";
import type { Mission } from "@/content/schema";
import { correctAnswer } from "@/lib/grading";
import { addDays, localDate } from "@/lib/time";
import type { Db } from "@/server/db";
import { attempts, mastery, reviewStates, skillEvidence, xpEvents } from "@/server/db/schema";
import { answerQuestion, completeAttempt, requestHint, reviewQueue, startAttempt, submitPractical, submitReview } from "@/server/learning";
import { leaderboard } from "@/server/leaderboard";
import { acceptInvite, createInvite, createTeam } from "@/server/teams";
import { makeUser, testDb } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

const first = () => missionsForTrack("python")[0];

async function setup() {
  const u = await makeUser(db);
  const team = await createTeam(db, u.id, { name: "Learning Team", timezone: "UTC" });
  return { u, team };
}

function passingCode(m: Mission) {
  if (m.workspace.kind !== "python" && m.workspace.kind !== "javascript") throw new Error("code mission expected");
  return { kind: "code", files: m.workspace.solution, results: m.workspace.tests.map((t) => ({ id: t.id, pass: true })) };
}

async function solve(userId: string, teamId: string, m: Mission, opts: { hints?: number } = {}) {
  const a = await startAttempt(db, userId, teamId, m.slug);
  for (let i = 0; i < (opts.hints ?? 0); i++) await requestHint(db, userId, a.id, i);
  await submitPractical(db, userId, a.id, passingCode(m), `k-${a.id}`);
  for (const q of m.questions) await answerQuestion(db, userId, a.id, q.id, correctAnswer(q));
  return { attempt: a, result: await completeAttempt(db, userId, a.id) };
}

const xpTotal = async (userId: string) =>
  Number((await db.select({ t: sql<number>`coalesce(sum(amount),0)::int` }).from(xpEvents).where(eq(xpEvents.userId, userId)))[0].t);

describe("mission completion", () => {
  it("persists progress, awards XP once, and schedules reviews", async () => {
    const { u, team } = await setup();
    const m = first();
    const { result, attempt } = await solve(u.id, team.id, m);
    expect(result.firstCompletion).toBe(true);
    expect(result.independent).toBe(true);
    expect(result.xpAwarded).toBeGreaterThan(0);
    const [row] = await db.select().from(attempts).where(eq(attempts.id, attempt.id));
    expect(row.status).toBe("completed");
    const states = await db.select().from(reviewStates).where(eq(reviewStates.userId, u.id));
    expect(states.filter((s) => s.kind === "review")).toHaveLength(m.review.length);
    expect(states.every((s) => s.dueOn > localDate("UTC"))).toBe(true);
    expect(result.newAchievements).toContain("first-mission");
  });

  it("is idempotent: completing the same attempt twice awards nothing extra", async () => {
    const { u, team } = await setup();
    const { attempt } = await solve(u.id, team.id, first());
    const before = await xpTotal(u.id);
    const again = await completeAttempt(db, u.id, attempt.id);
    expect(again.alreadyCompleted).toBe(true);
    expect(await xpTotal(u.id)).toBe(before);
  });

  it("concurrent completion requests award XP exactly once", async () => {
    const { u, team } = await setup();
    const m = first();
    const a = await startAttempt(db, u.id, team.id, m.slug);
    await submitPractical(db, u.id, a.id, passingCode(m), "k1");
    for (const q of m.questions) await answerQuestion(db, u.id, a.id, q.id, correctAnswer(q));
    await Promise.all([completeAttempt(db, u.id, a.id), completeAttempt(db, u.id, a.id), completeAttempt(db, u.id, a.id)]);
    const rows = await db.select().from(xpEvents).where(and(eq(xpEvents.userId, u.id), eq(xpEvents.idempotencyKey, `mission:${m.slug}`)));
    expect(rows).toHaveLength(1);
  });

  it("prevents score farming by replaying an easy mission", async () => {
    const { u, team } = await setup();
    const m = first();
    await solve(u.id, team.id, m);
    const after1 = await xpTotal(u.id);
    for (let i = 0; i < 3; i++) {
      const { result } = await solve(u.id, team.id, m);
      expect(result.firstCompletion).toBe(false);
      expect(result.xpAwarded).toBe(0);
    }
    expect(await xpTotal(u.id)).toBe(after1);
  });

  it("requires passing checks before completion and records failures", async () => {
    const { u, team } = await setup();
    const m = first();
    const a = await startAttempt(db, u.id, team.id, m.slug);
    if (m.workspace.kind !== "python") throw new Error();
    const bad = await submitPractical(db, u.id, a.id, { kind: "code", files: {}, results: m.workspace.tests.map((t, i) => ({ id: t.id, pass: i !== 0 })) }, "bad1");
    expect(bad.passed).toBe(false);
    expect(bad.checks.find((c) => !c.pass)?.feedback?.next).toBeTruthy();
    await expect(completeAttempt(db, u.id, a.id)).rejects.toThrow(/Pass the practical/);
    // Same idempotency key returns the stored result rather than counting again.
    const dup = await submitPractical(db, u.id, a.id, passingCode(m), "bad1");
    expect(dup.passed).toBe(false);
    const [row] = await db.select().from(attempts).where(eq(attempts.id, a.id));
    expect(row.failedChecks).toBe(1);
  });

  it("grades questions on the server: wrong then right", async () => {
    const { u, team } = await setup();
    const m = first();
    const a = await startAttempt(db, u.id, team.id, m.slug);
    const q = m.questions.find((x) => x.kind === "mcq") ?? m.questions[0];
    const wrong = q.kind === "mcq" ? { kind: "mcq", choice: (q.answer + 1) % q.options.length } : q.kind === "short" ? { kind: "short", text: "definitely wrong" } : q.kind === "order" ? { kind: "order", order: [...q.items].reverse() } : { kind: "explain", text: "no idea really, sorry about that" };
    const r1 = await answerQuestion(db, u.id, a.id, q.id, wrong);
    expect(r1.correct).toBe(false);
    expect(r1.explanation).toBeUndefined(); // retrieval first: no reveal after one wrong try
    const r2 = await answerQuestion(db, u.id, a.id, q.id, correctAnswer(q));
    expect(r2.correct).toBe(true);
    expect(r2.explanation).toBeTruthy();
  });

  it("enforces prerequisites", async () => {
    const { u, team } = await setup();
    const locked = missionsForTrack("python").find((m) => m.prerequisites.length > 0)!;
    await expect(startAttempt(db, u.id, team.id, locked.slug)).rejects.toThrow(/first/);
  });

  it("keeps attempts private to their owner", async () => {
    const { u, team } = await setup();
    const { token } = await createInvite(db, u.id, team.id, { maxUses: 2 });
    const mate = await makeUser(db);
    await acceptInvite(db, mate.id, token);
    const a = await startAttempt(db, u.id, team.id, first().slug);
    await expect(requestHint(db, mate.id, a.id, 0)).rejects.toThrow(/not found/i);
    await expect(submitPractical(db, mate.id, a.id, passingCode(first()), "x")).rejects.toThrow(/not found/i);
  });
});

describe("hints and mastery", () => {
  it("hint use marks a completion as supported and yields lower mastery than an independent solve", async () => {
    const one = await setup();
    const two = await setup();
    const m = first();
    const sup = await solve(one.u.id, one.team.id, m, { hints: 2 });
    const ind = await solve(two.u.id, two.team.id, m, { hints: 1 });
    expect(sup.result.independent).toBe(false);
    expect(ind.result.independent).toBe(true);
    const ms = await db.select().from(mastery).where(eq(mastery.skillId, m.skills[0]));
    const s1 = ms.find((r) => r.userId === one.u.id)!.score;
    const s2 = ms.find((r) => r.userId === two.u.id)!.score;
    expect(s2).toBeGreaterThan(s1);
    expect(s1).toBeGreaterThan(0);
  });

  it("requires hints to be opened in order", async () => {
    const { u, team } = await setup();
    const a = await startAttempt(db, u.id, team.id, first().slug);
    await expect(requestHint(db, u.id, a.id, 2)).rejects.toThrow(/earlier hints/);
    const r = await requestHint(db, u.id, a.id, 0);
    expect(r.hintsUsed).toBe(1);
  });
});

describe("spaced review", () => {
  async function completedWithDueReviews() {
    const { u, team } = await setup();
    const m = first();
    await solve(u.id, team.id, m);
    // Pretend the mission was completed 3 days ago so reviews are due.
    const past = new Date(Date.now() - 3 * 86_400_000);
    await db.update(reviewStates).set({ dueOn: localDate("UTC"), createdAt: past }).where(eq(reviewStates.userId, u.id));
    return { u, team, m };
  }

  it("advances the stage on success and resets on failure", async () => {
    const { u, team, m } = await completedWithDueReviews();
    const q = await reviewQueue(db, u.id, team.id, "UTC");
    expect(q.items.length).toBeGreaterThan(1);
    const [i1, i2] = q.items.filter((i) => i.kind === "review");
    const ok = await submitReview(db, u.id, team.id, "UTC", i1.itemId, correctAnswer(i1.question), "confident");
    expect(ok.correct).toBe(true);
    expect(ok.stage).toBe(1);
    expect(ok.nextDue).toBe(addDays(localDate("UTC"), 3));
    expect(ok.xp).toBeGreaterThan(0);
    const wrongAnswer = i2.question.kind === "mcq" ? { kind: "mcq", choice: (i2.question.answer + 1) % i2.question.options.length } : { kind: i2.question.kind, text: "zzz wrong", order: [] };
    const bad = await submitReview(db, u.id, team.id, "UTC", i2.itemId, wrongAnswer, "okay");
    expect(bad.correct).toBe(false);
    expect(bad.stage).toBe(0);
    expect(bad.nextDue).toBe(addDays(localDate("UTC"), 1));
    expect(bad.refresher).toBeTruthy();
    const ev = await db.select().from(skillEvidence).where(and(eq(skillEvidence.userId, u.id), eq(skillEvidence.kind, "review_pass")));
    expect(ev[0].delayDays).toBe(3);
    expect(m.review.length).toBeGreaterThan(0);
  });

  it("unsure-but-correct repeats the interval", async () => {
    const { u, team } = await completedWithDueReviews();
    const [i1] = (await reviewQueue(db, u.id, team.id, "UTC")).items.filter((i) => i.kind === "review");
    const r = await submitReview(db, u.id, team.id, "UTC", i1.itemId, correctAnswer(i1.question), "unsure");
    expect(r.stage).toBe(0);
    expect(r.nextDue).toBe(addDays(localDate("UTC"), 1));
  });

  it("refuses early reviews and a second review of the same due date", async () => {
    const { u, team } = await completedWithDueReviews();
    const [i1] = (await reviewQueue(db, u.id, team.id, "UTC")).items.filter((i) => i.kind === "review");
    await submitReview(db, u.id, team.id, "UTC", i1.itemId, correctAnswer(i1.question), "okay");
    // Now due in 3 days → not due.
    await expect(submitReview(db, u.id, team.id, "UTC", i1.itemId, correctAnswer(i1.question), "okay")).rejects.toThrow(/isn't due yet/);
  });

  it("rotates to a different equivalent variant next time", async () => {
    const { u, team } = await completedWithDueReviews();
    const [i1] = (await reviewQueue(db, u.id, team.id, "UTC")).items.filter((i) => i.kind === "review");
    await submitReview(db, u.id, team.id, "UTC", i1.itemId, correctAnswer(i1.question), "okay");
    await db.update(reviewStates).set({ dueOn: localDate("UTC") }).where(and(eq(reviewStates.userId, u.id), eq(reviewStates.itemId, i1.itemId)));
    const again = (await reviewQueue(db, u.id, team.id, "UTC")).items.find((i) => i.itemId === i1.itemId)!;
    expect(again.variant).not.toBe(i1.variant);
  });

  it("interleaves tracks in the queue", async () => {
    const { u, team } = await setup();
    for (const t of ["python", "javascript"] as const) {
      const m = missionsForTrack(t)[0];
      if (m) await solve(u.id, team.id, m);
    }
    await db.update(reviewStates).set({ dueOn: localDate("UTC") }).where(eq(reviewStates.userId, u.id));
    const q = await reviewQueue(db, u.id, team.id, "UTC");
    const tracks = new Set(q.items.map((i) => i.track));
    if (tracks.size > 1) {
      for (let i = 1; i < Math.min(q.items.length, 4); i++) expect(q.items[i].track).not.toBe(q.items[i - 1].track);
    }
  });
});

describe("leaderboards", () => {
  it("ranks by XP, breaks ties by who got there first, and lists zero-XP members", async () => {
    const { u: a, team } = await setup();
    const { token } = await createInvite(db, a.id, team.id, { maxUses: 5 });
    const b = await makeUser(db);
    const c = await makeUser(db);
    await acceptInvite(db, b.id, token);
    await acceptInvite(db, c.id, token);
    const t0 = Date.now() - 60_000;
    await db.insert(xpEvents).values([
      { userId: a.id, teamId: team.id, amount: 100, reason: "t", idempotencyKey: "a1", createdAt: new Date(t0 + 2000) },
      { userId: b.id, teamId: team.id, amount: 100, reason: "t", idempotencyKey: "b1", createdAt: new Date(t0 + 1000) },
    ]);
    const lb = await leaderboard(db, a.id, team.id, { board: "all-time" });
    expect(lb.rows.map((r) => r.userId)).toEqual([b.id, a.id, c.id]);
    expect(lb.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(lb.rows[2].xp).toBe(0);
  });

  it("weekly board uses the team time zone and excludes last week", async () => {
    const u = await makeUser(db);
    const team = await createTeam(db, u.id, { name: "Tokyo Team", timezone: "Asia/Tokyo" });
    // Monday 2026-03-02 00:30 in Tokyo = Sunday 2026-03-01 15:30 UTC: belongs to the new week in Tokyo.
    const now = new Date("2026-03-04T03:00:00Z");
    await db.insert(xpEvents).values([
      { userId: u.id, teamId: team.id, amount: 50, reason: "this week", idempotencyKey: "w1", createdAt: new Date("2026-03-01T15:30:00Z") },
      { userId: u.id, teamId: team.id, amount: 70, reason: "last week", idempotencyKey: "w0", createdAt: new Date("2026-03-01T14:30:00Z") },
    ]);
    const lb = await leaderboard(db, u.id, team.id, { board: "weekly", now });
    expect(lb.rows[0].xp).toBe(50);
    const all = await leaderboard(db, u.id, team.id, { board: "all-time" });
    expect(all.rows[0].xp).toBe(120);
  });

  it("per-track board only counts that track and never leaks across teams", async () => {
    const { u, team } = await setup();
    const other = await setup();
    await db.insert(xpEvents).values([
      { userId: u.id, teamId: team.id, amount: 10, reason: "py", track: "python", idempotencyKey: "p" },
      { userId: u.id, teamId: team.id, amount: 30, reason: "lx", track: "linux", idempotencyKey: "l" },
      { userId: other.u.id, teamId: other.team.id, amount: 999, reason: "x", track: "python", idempotencyKey: "o" },
    ]);
    const lb = await leaderboard(db, u.id, team.id, { board: "all-time", track: "python" });
    expect(lb.rows).toHaveLength(1);
    expect(lb.rows[0].xp).toBe(10);
    await expect(leaderboard(db, u.id, other.team.id, { board: "all-time" })).rejects.toThrow(/not a member/);
  });

  it("reflects a completed mission", async () => {
    const { u, team } = await setup();
    const m = getMission(first().slug)!;
    const { result } = await solve(u.id, team.id, m);
    const lb = await leaderboard(db, u.id, team.id, { board: "weekly" });
    expect(lb.rows[0].xp).toBe(result.xpAwarded);
  });
});
