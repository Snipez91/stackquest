import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getMission, getSkill, missions, reviewItemById } from "@/content";
import type { Mission } from "@/content/schema";
import { gradeQuestion, type Answer, type QuestionGrade } from "@/lib/grading";
import {
  computeMastery,
  evidencePoints,
  intervalForStage,
  interleave,
  isIndependent,
  missionXp,
  nextReviewStage,
  reviewXp,
  TRANSFER_DELAY_DAYS,
  XP_RULES,
  type Confidence,
  type EvidenceKind,
} from "@/lib/rules";
import { addDays, daysBetween, localDate } from "@/lib/time";
import { gradeEvents } from "@/sim";
import { SimEventSchema } from "@/sim/schema";
import type { Db } from "./db";
import {
  activity,
  attempts,
  diagnostics,
  mastery,
  raceEntries,
  races,
  reviewLogs,
  reviewStates,
  skillEvidence,
  submissions,
  users,
  xpEvents,
} from "./db/schema";
import { AppError, forbidden, notFound } from "./errors";
import { requireMembership } from "./teams";
import { checkAchievements } from "./achievements";
import { publish } from "./realtime";
import { enforceRateLimit, RateLimitError } from "./ratelimit";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

async function limited(db: Db, key: string, n: number, secs: number) {
  try {
    await enforceRateLimit(db, key, n, secs);
  } catch (e) {
    if (e instanceof RateLimitError) throw new AppError("rate_limited", e.message);
    throw e;
  }
}

// ------------------------------------------------------------------ progress & access

export async function completedSlugs(db: Tx, userId: string, teamId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ slug: attempts.missionSlug })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.status, "completed")));
  return new Set(rows.map((r) => r.slug));
}

/** Missions the diagnostic let this learner skip (prerequisite purposes only — no XP or mastery). */
export async function placedOutSlugs(db: Tx, userId: string): Promise<Set<string>> {
  const [d] = await db.select().from(diagnostics).where(eq(diagnostics.userId, userId)).limit(1);
  if (!d) return new Set();
  const placed = new Set<string>();
  for (const [track, r] of Object.entries(d.results)) {
    if (r.total > 0 && r.correct / r.total >= 0.75) {
      for (const m of missions) if (m.track === track && m.tier === "beginner") placed.add(m.slug);
    }
  }
  return placed;
}

export function missingPrereqs(m: Mission, satisfied: Set<string>): string[] {
  return m.prerequisites.filter((p) => !satisfied.has(p));
}

async function satisfiedSet(db: Tx, userId: string, teamId: string) {
  const [done, placed] = await Promise.all([completedSlugs(db, userId, teamId), placedOutSlugs(db, userId)]);
  return new Set([...done, ...placed]);
}

// ------------------------------------------------------------------ attempts

export type AttemptRow = typeof attempts.$inferSelect;

async function loadAttempt(db: Tx, userId: string, attemptId: string): Promise<{ attempt: AttemptRow; mission: Mission }> {
  if (!z.string().uuid().safeParse(attemptId).success) throw notFound("Attempt not found.");
  const [a] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  // Attempts are private to their owner; even teammates can't read them.
  if (!a || a.userId !== userId) throw notFound("Attempt not found.");
  await requireMembership(db as Db, userId, a.teamId);
  const mission = getMission(a.missionSlug);
  if (!mission) throw notFound("This mission is no longer published.");
  return { attempt: a, mission };
}

export async function startAttempt(db: Db, userId: string, teamId: string, slug: string, opts: { raceId?: string } = {}) {
  await requireMembership(db, userId, teamId);
  const mission = getMission(slug);
  if (!mission) throw notFound("Mission not found.");
  const missing = missingPrereqs(mission, await satisfiedSet(db, userId, teamId));
  if (missing.length) {
    throw new AppError("forbidden", `Complete ${missing.map((s) => getMission(s)?.title ?? s).join(", ")} first.`);
  }
  const [open] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.missionSlug, slug), eq(attempts.status, "in_progress")))
    .limit(1);
  if (open) return open;
  const inserted = await db
    .insert(attempts)
    .values({ userId, teamId, missionSlug: slug, missionVersion: mission.version, isRaceAttempt: !!opts.raceId })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) return inserted[0];
  // Lost a race with a concurrent start: return the row that won.
  const [again] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.missionSlug, slug), eq(attempts.status, "in_progress")))
    .limit(1);
  return again;
}

/** Flags an open attempt as a race attempt if the learner joined that live race. */
export async function markRaceAttempt(db: Db, userId: string, teamId: string, attemptId: string, raceId: string, slug: string) {
  const [entry] = await db
    .select({ id: races.id })
    .from(races)
    .innerJoin(raceEntries, and(eq(raceEntries.raceId, races.id), eq(raceEntries.userId, userId)))
    .where(and(eq(races.id, raceId), eq(races.teamId, teamId), eq(races.missionSlug, slug), gte(races.endsAt, sql`now()`)));
  if (!entry) return false;
  await db.update(attempts).set({ isRaceAttempt: true }).where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId), eq(attempts.status, "in_progress")));
  return true;
}

export async function getAttempt(db: Db, userId: string, attemptId: string) {
  return loadAttempt(db, userId, attemptId);
}

export async function latestAttempt(db: Db, userId: string, teamId: string, slug: string) {
  const [a] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.missionSlug, slug)))
    .orderBy(sql`${attempts.startedAt} desc`)
    .limit(1);
  return a ?? null;
}

/** Hints are served one at a time so usage is recorded honestly. */
export async function requestHint(db: Db, userId: string, attemptId: string, index: number) {
  const { attempt, mission } = await loadAttempt(db, userId, attemptId);
  if (!Number.isInteger(index) || index < 0 || index >= mission.hints.length) throw new AppError("bad_request", "No such hint.");
  if (index > attempt.hintsUsed) throw new AppError("bad_request", "Open the earlier hints first.");
  if (attempt.status === "in_progress" && index + 1 > attempt.hintsUsed) {
    await db.update(attempts).set({ hintsUsed: sql`greatest(${attempts.hintsUsed}, ${index + 1})` }).where(eq(attempts.id, attemptId));
  }
  return { hint: mission.hints[index], hintsUsed: Math.max(attempt.hintsUsed, index + 1), total: mission.hints.length };
}

export async function viewRefresher(db: Db, userId: string, attemptId: string) {
  const { attempt, mission } = await loadAttempt(db, userId, attemptId);
  if (attempt.status === "in_progress") await db.update(attempts).set({ refresherViewed: true }).where(eq(attempts.id, attemptId));
  return mission.refresher;
}

/** Full solution: available after completion, or after 3 failed checks (marks the attempt assisted). */
export async function revealSolution(db: Db, userId: string, attemptId: string) {
  const { attempt, mission } = await loadAttempt(db, userId, attemptId);
  if (attempt.status === "in_progress") {
    if (attempt.failedChecks < 3) throw new AppError("forbidden", "The full solution unlocks after three checked attempts. Hints are available any time.");
    await db.update(attempts).set({ solutionViewed: true }).where(eq(attempts.id, attemptId));
  }
  const ws = mission.workspace;
  return {
    explanation: mission.debrief.solution,
    files: ws.kind === "python" || ws.kind === "javascript" ? ws.solution : undefined,
    commands: ws.kind === "shell" ? ws.solution.map((s) => (typeof s === "string" ? s : `# save ${s.write} with the corrected content`)) : undefined,
  };
}

const DraftSchema = z.record(z.string(), z.unknown());

export async function saveDraft(db: Db, userId: string, attemptId: string, draft: unknown) {
  const { attempt } = await loadAttempt(db, userId, attemptId);
  const p = DraftSchema.safeParse(draft);
  if (!p.success) throw new AppError("bad_request", "Invalid draft.");
  if (JSON.stringify(p.data).length > 200_000) throw new AppError("bad_request", "Workspace is too large to save (200 KB limit).");
  if (attempt.status !== "in_progress") return;
  await db.update(attempts).set({ draft: p.data }).where(eq(attempts.id, attemptId));
}

// ------------------------------------------------------------------ practical checks

const PracticalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("code"),
    files: z.record(z.string().max(200), z.string().max(60_000)),
    results: z.array(z.object({ id: z.string(), pass: z.boolean(), message: z.string().max(2000).optional() })).max(50),
  }),
  z.object({ kind: z.literal("shell"), events: z.array(SimEventSchema).max(600) }),
]);

export type CheckResult = { id: string; name: string; pass: boolean; detail?: string; feedback?: { what: string; why: string; next: string } };

export async function submitPractical(db: Db, userId: string, attemptId: string, payload: unknown, idempotencyKey: string) {
  await limited(db, `practical:${userId}`, 60, 300);
  const { attempt, mission } = await loadAttempt(db, userId, attemptId);
  const p = PracticalSchema.safeParse(payload);
  if (!p.success) throw new AppError("bad_request", "Invalid submission.");
  if (!idempotencyKey || idempotencyKey.length > 100) throw new AppError("bad_request", "Missing idempotency key.");

  const prior = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (prior.length) return prior[0].result as { passed: boolean; checks: CheckResult[]; verifiedBy: "server" | "client"; failedChecks: number };

  const ws = mission.workspace;
  let checks: CheckResult[];
  let verifiedBy: "server" | "client";
  if (ws.kind === "shell") {
    if (p.data.kind !== "shell") throw new AppError("bad_request", "This mission expects terminal work.");
    // Server-authoritative: replay the learner's actions through the simulator.
    const { results } = gradeEvents(ws.scenario, p.data.events, ws.checks.map((c) => ({ id: c.id, assert: c.assert })));
    checks = ws.checks.map((c) => {
      const r = results.find((x) => x.id === c.id);
      return { id: c.id, name: c.name, pass: !!r?.pass, detail: r?.detail, feedback: r?.pass ? undefined : c.feedback };
    });
    verifiedBy = "server";
  } else if (ws.kind === "python" || ws.kind === "javascript") {
    if (p.data.kind !== "code") throw new AppError("bad_request", "This mission expects code.");
    const reported = new Map(p.data.results.map((r) => [r.id, r]));
    // Browser-executed: we can validate the shape, not prevent tampering (documented limit).
    checks = ws.tests.map((t) => {
      const r = reported.get(t.id);
      const pass = r?.pass === true;
      return { id: t.id, name: t.name, pass, detail: r?.message, feedback: pass ? undefined : t.feedback };
    });
    verifiedBy = "client";
  } else {
    throw new AppError("bad_request", "This mission has no practical check; answer the questions instead.");
  }
  const passed = checks.every((c) => c.pass);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(attempts)
      .set({
        submissions: sql`${attempts.submissions} + 1`,
        failedChecks: passed ? attempts.failedChecks : sql`${attempts.failedChecks} + 1`,
        lastCheckResults: checks.map((c) => ({ id: c.id, pass: c.pass, detail: c.detail })),
        // Once passed stays passed for this attempt (re-running after success is practice).
        practicalPassed: passed ? true : attempts.practicalPassed,
        practicalVerifiedBy: passed ? verifiedBy : attempts.practicalVerifiedBy,
        draft: p.data.kind === "code" ? { files: p.data.files } : { events: p.data.events },
      })
      .where(eq(attempts.id, attempt.id))
      .returning();
    const result = { passed, checks, verifiedBy, failedChecks: updated.failedChecks };
    await tx
      .insert(submissions)
      .values({ attemptId: attempt.id, userId, kind: "practical", idempotencyKey, payload: p.data, result, passed })
      .onConflictDoNothing();
    return result;
  });
}

// ------------------------------------------------------------------ questions

const AnswerSchema: z.ZodType<Answer> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mcq"), choice: z.number().int().min(0).max(10) }),
  z.object({ kind: z.literal("short"), text: z.string().max(500) }),
  z.object({ kind: z.literal("order"), order: z.array(z.string().max(500)).max(10) }),
  z.object({ kind: z.literal("explain"), text: z.string().max(4000) }),
]);

export async function answerQuestion(db: Db, userId: string, attemptId: string, questionId: string, answer: unknown) {
  await limited(db, `answer:${userId}`, 120, 300);
  const { attempt, mission } = await loadAttempt(db, userId, attemptId);
  const q = mission.questions.find((x) => x.id === questionId);
  if (!q) throw notFound("Question not found.");
  const a = AnswerSchema.safeParse(answer);
  if (!a.success) throw new AppError("bad_request", "Invalid answer.");
  const grade: QuestionGrade = gradeQuestion(q, a.data);
  const prev = attempt.questionResults?.[questionId];
  const tries = (prev?.tries ?? 0) + 1;
  const entry = { correct: grade.correct || !!prev?.correct, score: Math.max(grade.score, prev?.score ?? 0), tries };
  if (attempt.status === "in_progress") {
    await db
      .update(attempts)
      .set({ questionResults: sql`coalesce(${attempts.questionResults}, '{}'::jsonb) || ${JSON.stringify({ [questionId]: entry })}::jsonb` })
      .where(eq(attempts.id, attemptId));
  }
  // Reveal the model answer only once it's been earned or after two tries (retrieval first).
  const reveal = grade.correct || tries >= 2;
  return {
    ...grade,
    tries,
    explanation: reveal ? q.explanation : undefined,
    modelAnswer: reveal && q.kind === "explain" ? q.modelAnswer : undefined,
    correctAnswer: reveal ? describeCorrect(q) : undefined,
  };
}

function describeCorrect(q: Mission["questions"][number]): string {
  switch (q.kind) {
    case "mcq":
      return q.options[q.answer];
    case "short":
      return q.accept[0];
    case "order":
      return q.items.map((s, i) => `${i + 1}. ${s}`).join("\n");
    case "explain":
      return q.modelAnswer;
  }
}

/** A question is satisfied once answered correctly, or attempted twice (the explanation is then shown). */
function questionsSatisfied(m: Mission, results: AttemptRow["questionResults"]): { ok: boolean; pending: string[] } {
  const pending = m.questions
    .filter((q) => {
      const r = results?.[q.id];
      if (m.workspace.kind === "evidence") return !r?.correct; // questions *are* the assessment
      return !(r && (r.correct || r.tries >= 2));
    })
    .map((q) => q.id);
  return { ok: pending.length === 0, pending };
}

// ------------------------------------------------------------------ completion

async function awardXp(tx: Tx, userId: string, teamId: string, amount: number, reason: string, track: string | null, key: string): Promise<number> {
  if (amount <= 0) return 0;
  const r = await tx
    .insert(xpEvents)
    .values({ userId, teamId, amount, reason, track, idempotencyKey: key })
    .onConflictDoNothing()
    .returning({ amount: xpEvents.amount });
  return r[0]?.amount ?? 0;
}

async function addEvidence(tx: Tx, userId: string, teamId: string, skillId: string, kind: EvidenceKind, sourceKey: string, delayDays = 0) {
  await tx
    .insert(skillEvidence)
    .values({ userId, teamId, skillId, kind, points: evidencePoints(kind, delayDays), delayDays, sourceKey })
    .onConflictDoNothing();
}

export async function recomputeMastery(tx: Tx, userId: string, teamId: string, skillIds: string[]) {
  if (!skillIds.length) return;
  const rows = await tx
    .select()
    .from(skillEvidence)
    .where(and(eq(skillEvidence.userId, userId), eq(skillEvidence.teamId, teamId), inArray(skillEvidence.skillId, skillIds)))
    .orderBy(asc(skillEvidence.createdAt));
  for (const skillId of new Set(skillIds)) {
    const ev = rows.filter((r) => r.skillId === skillId);
    const m = computeMastery(ev.map((r) => ({ kind: r.kind, points: r.points, delayDays: r.delayDays })));
    const lastPracticedAt = ev.length ? ev[ev.length - 1].createdAt : null;
    await tx
      .insert(mastery)
      .values({ userId, teamId, skillId, ...m, lastPracticedAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [mastery.userId, mastery.teamId, mastery.skillId],
        set: { ...m, lastPracticedAt, updatedAt: new Date() },
      });
  }
}

export type CompletionResult = {
  alreadyCompleted: boolean;
  independent: boolean;
  xpAwarded: number;
  firstCompletion: boolean;
  newAchievements: string[];
  attemptId: string;
};

export async function completeAttempt(db: Db, userId: string, attemptId: string): Promise<CompletionResult> {
  const { attempt, mission } = await loadAttempt(db, userId, attemptId);
  if (attempt.status === "completed") {
    return { alreadyCompleted: true, independent: !!attempt.independent, xpAwarded: 0, firstCompletion: false, newAchievements: [], attemptId };
  }
  const needsPractical = mission.workspace.kind !== "evidence";
  if (needsPractical && !attempt.practicalPassed) throw new AppError("bad_request", "Pass the practical checks first.");
  const qs = questionsSatisfied(mission, attempt.questionResults);
  if (!qs.ok) throw new AppError("bad_request", "Answer the remaining mission questions first.");

  const [user] = await db.select({ tz: users.timezone, name: users.displayName }).from(users).where(eq(users.id, userId));
  const today = localDate(user.tz);
  const independent = isIndependent(attempt);
  const teamId = attempt.teamId;

  const result = await db.transaction(async (tx) => {
    // Idempotent: only the first request flips the status and proceeds.
    const flipped = await tx
      .update(attempts)
      .set({
        status: "completed",
        completedAt: new Date(),
        independent,
        durationMs: Date.now() - attempt.startedAt.getTime(),
      })
      .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")))
      .returning({ id: attempts.id });
    if (!flipped.length) return null;

    const prevCompletions = await tx
      .select({ id: attempts.id, independent: attempts.independent })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.teamId, teamId), eq(attempts.missionSlug, mission.slug), eq(attempts.status, "completed")));
    const firstCompletion = prevCompletions.length === 1;

    let xp = 0;
    // Mission XP is awarded once per learner per mission per team; repeats are practice only.
    xp += await awardXp(tx, userId, teamId, missionXp(mission.tier, mission.track, independent), `Completed ${mission.title}${independent ? " independently" : ""}`, mission.track, `mission:${mission.slug}`);
    // A later independent solve of a mission first finished with support earns the difference once.
    const earlierIndependent = prevCompletions.some((p) => p.id !== attemptId && p.independent);
    if (!firstCompletion && independent && !earlierIndependent) {
      const diff = missionXp(mission.tier, mission.track, true) - missionXp(mission.tier, mission.track, false);
      xp += await awardXp(tx, userId, teamId, diff, `Solved ${mission.title} independently`, mission.track, `mission-independent:${mission.slug}`);
    }
    for (const q of mission.questions) {
      const r = attempt.questionResults?.[q.id];
      if (r?.correct && r.tries === 1) {
        xp += await awardXp(tx, userId, teamId, XP_RULES.questionFirstTry, `Answered "${mission.title}" question first try`, mission.track, `q:${mission.slug}:${q.id}`);
      }
    }

    const kind: EvidenceKind = independent ? "independent_completion" : "assisted_completion";
    for (const s of mission.skills) await addEvidence(tx, userId, teamId, s, kind, `complete:${mission.slug}:${s}:${kind}`);
    for (const s of mission.appliesSkills) await addEvidence(tx, userId, teamId, s, "applied_in_later_mission", `applied:${mission.slug}:${s}`);
    await recomputeMastery(tx, userId, teamId, [...mission.skills, ...mission.appliesSkills]);

    // Schedule spaced reviews (first review tomorrow) and a delayed transfer challenge.
    if (mission.review.length) {
      await tx
        .insert(reviewStates)
        .values(
          mission.review.map((r) => ({ userId, teamId, itemId: r.id, skillId: r.skill, missionSlug: mission.slug, kind: "review" as const, stage: 0, dueOn: addDays(today, intervalForStage(0)) })),
        )
        .onConflictDoNothing();
    }
    await tx
      .insert(reviewStates)
      .values({ userId, teamId, itemId: `transfer:${mission.slug}`, skillId: mission.skills[0], missionSlug: mission.slug, kind: "transfer", stage: 0, dueOn: addDays(today, TRANSFER_DELAY_DAYS) })
      .onConflictDoNothing();

    if (firstCompletion) {
      await tx.insert(activity).values({
        teamId,
        userId,
        kind: "mission_completed",
        payload: { name: user.name, mission: mission.title, slug: mission.slug, track: mission.track, tier: mission.tier },
      });
    }

    // Optional race: record finish time if a live race on this mission includes the learner.
    if (attempt.isRaceAttempt) {
      const live = await tx
        .select({ id: races.id })
        .from(races)
        .innerJoin(raceEntries, and(eq(raceEntries.raceId, races.id), eq(raceEntries.userId, userId)))
        .where(and(eq(races.teamId, teamId), eq(races.missionSlug, mission.slug), lte(races.startsAt, sql`now()`), gte(races.endsAt, sql`now()`), isNull(raceEntries.finishedAt)));
      for (const r of live) {
        await tx
          .update(raceEntries)
          .set({ finishedAt: new Date(), durationMs: sql`(extract(epoch from now() - ${raceEntries.joinedAt}) * 1000)::int`, hintsUsed: attempt.hintsUsed })
          .where(and(eq(raceEntries.raceId, r.id), eq(raceEntries.userId, userId)));
      }
    }

    const newAchievements = await checkAchievements(tx, userId, teamId);
    for (const id of newAchievements) xp += await awardXp(tx, userId, teamId, XP_RULES.achievement, `Achievement: ${id}`, null, `ach:${id}`);
    return { alreadyCompleted: false, independent, xpAwarded: xp, firstCompletion, newAchievements, attemptId };
  });

  if (!result) return { alreadyCompleted: true, independent, xpAwarded: 0, firstCompletion: false, newAchievements: [], attemptId };
  if (result.firstCompletion) {
    publish({ teamId, type: "activity", data: { kind: "mission_completed", name: user.name, mission: mission.title, track: mission.track } });
  }
  for (const a of result.newAchievements) publish({ teamId, type: "activity", data: { kind: "achievement", name: user.name, achievement: a } });
  publish({ teamId, type: "leaderboard", data: {} });
  return result;
}

// ------------------------------------------------------------------ reviews

export type QueueItem = {
  itemId: string;
  kind: "review" | "transfer";
  missionSlug: string;
  missionTitle: string;
  track: string;
  skillId: string;
  skillName: string;
  dueOn: string;
  overdueDays: number;
  stage: number;
  variant: number;
  context?: string;
  question: Mission["questions"][number];
};

function resolveItem(itemId: string, kind: "review" | "transfer", variant: number) {
  if (kind === "transfer") {
    const slug = itemId.replace(/^transfer:/, "");
    const m = getMission(slug);
    if (!m) return null;
    return { mission: m, question: m.transfer.question, context: m.transfer.context, variant: 0 };
  }
  const found = reviewItemById(itemId);
  if (!found) return null;
  const v = variant % found.item.variants.length;
  return { mission: found.mission, question: found.item.variants[v], context: undefined, variant: v };
}

export async function reviewQueue(db: Db, userId: string, teamId: string, tz: string, limit = 15) {
  await requireMembership(db, userId, teamId);
  const today = localDate(tz);
  const due = await db
    .select()
    .from(reviewStates)
    .where(and(eq(reviewStates.userId, userId), eq(reviewStates.teamId, teamId), lte(reviewStates.dueOn, today), isNull(reviewStates.retiredAt)))
    .orderBy(asc(reviewStates.dueOn));
  const upcoming = await db
    .select({ dueOn: reviewStates.dueOn, n: sql<number>`count(*)::int` })
    .from(reviewStates)
    .where(and(eq(reviewStates.userId, userId), eq(reviewStates.teamId, teamId), sql`${reviewStates.dueOn} > ${today}`, isNull(reviewStates.retiredAt)))
    .groupBy(reviewStates.dueOn)
    .orderBy(asc(reviewStates.dueOn))
    .limit(14);
  const items: QueueItem[] = [];
  for (const r of due) {
    const res = resolveItem(r.itemId, r.kind, r.nextVariant);
    if (!res) continue;
    items.push({
      itemId: r.itemId,
      kind: r.kind,
      missionSlug: res.mission.slug,
      missionTitle: res.mission.title,
      track: res.mission.track,
      skillId: r.skillId,
      skillName: getSkill(r.skillId)?.name ?? r.skillId,
      dueOn: r.dueOn,
      overdueDays: daysBetween(r.dueOn, today),
      stage: r.stage,
      variant: res.variant,
      context: res.context,
      question: res.question,
    });
  }
  return { today, totalDue: items.length, items: interleave(items).slice(0, limit), upcoming };
}

export async function submitReview(
  db: Db,
  userId: string,
  teamId: string,
  tz: string,
  itemId: string,
  answer: unknown,
  confidence: Confidence,
) {
  await requireMembership(db, userId, teamId);
  await limited(db, `review:${userId}`, 120, 300);
  const a = AnswerSchema.safeParse(answer);
  if (!a.success) throw new AppError("bad_request", "Invalid answer.");
  const [state] = await db
    .select()
    .from(reviewStates)
    .where(and(eq(reviewStates.userId, userId), eq(reviewStates.teamId, teamId), eq(reviewStates.itemId, itemId)))
    .limit(1);
  if (!state || state.retiredAt) throw notFound("Review item not found.");
  const today = localDate(tz);
  if (state.dueOn > today) throw new AppError("conflict", "This review isn't due yet. Spacing it out is what makes it stick.");
  const res = resolveItem(state.itemId, state.kind, state.nextVariant);
  if (!res) throw notFound("Review content is no longer published.");
  const grade = gradeQuestion(res.question, a.data);
  const correct = grade.correct;

  // Delay = days since the learner last practised this item (or completed the mission).
  const lastPractised = state.lastReviewedAt ?? state.createdAt;
  const delayDays = Math.max(0, daysBetween(localDate(tz, lastPractised), today));

  const outcome = await db.transaction(async (tx) => {
    const stageAfter = state.kind === "transfer" ? state.stage : nextReviewStage(state.stage, correct, confidence);
    const logged = await tx
      .insert(reviewLogs)
      .values({ userId, teamId, itemId, variant: res.variant, correct, confidence, stageBefore: state.stage, stageAfter, dueOn: state.dueOn })
      .onConflictDoNothing()
      .returning({ id: reviewLogs.id });
    if (!logged.length) return { duplicate: true as const, stageAfter, nextDue: state.dueOn, xp: 0, newAchievements: [] as string[] };

    let nextDue: string;
    let retiredAt: Date | null = null;
    if (state.kind === "transfer") {
      nextDue = addDays(today, TRANSFER_DELAY_DAYS);
      if (correct) retiredAt = new Date();
    } else {
      nextDue = addDays(today, intervalForStage(stageAfter));
      // Retire after a successful review at the longest interval.
      if (correct && state.stage === 5 && stageAfter === 5 && state.reps >= 6) retiredAt = new Date();
    }
    await tx
      .update(reviewStates)
      .set({
        stage: stageAfter,
        dueOn: nextDue,
        reps: state.reps + 1,
        lapses: correct ? state.lapses : state.lapses + 1,
        nextVariant: state.nextVariant + 1,
        lastReviewedAt: new Date(),
        retiredAt,
      })
      .where(and(eq(reviewStates.userId, userId), eq(reviewStates.teamId, teamId), eq(reviewStates.itemId, itemId)));

    const kind: EvidenceKind =
      state.kind === "transfer" ? (correct ? "transfer_pass" : "transfer_fail") : correct ? "review_pass" : "review_fail";
    await addEvidence(tx, userId, teamId, state.skillId, kind, `review:${itemId}:${state.dueOn}`, delayDays);
    await recomputeMastery(tx, userId, teamId, [state.skillId]);

    let xp = 0;
    if (correct) {
      const amount = state.kind === "transfer" ? XP_RULES.transferPass : reviewXp(delayDays);
      // Daily cap on review XP (per learner's local day) prevents farming.
      const [{ earned }] = await tx
        .select({ earned: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
        .from(xpEvents)
        .where(and(eq(xpEvents.userId, userId), eq(xpEvents.teamId, teamId), sql`${xpEvents.idempotencyKey} like ${"review:%:" + today}`));
      const allowed = Math.max(0, Math.min(amount, XP_RULES.dailyReviewXpCap - Number(earned)));
      xp += await awardXp(tx, userId, teamId, allowed, state.kind === "transfer" ? "Transfer challenge" : "Spaced review", res.mission.track, `review:${itemId}:${state.dueOn}:${today}`);
    }
    const newAchievements = await checkAchievements(tx, userId, teamId);
    for (const id of newAchievements) xp += await awardXp(tx, userId, teamId, XP_RULES.achievement, `Achievement: ${id}`, null, `ach:${id}`);
    return { duplicate: false as const, stageAfter, nextDue, xp, newAchievements };
  });

  if (!outcome.duplicate) publish({ teamId, type: "leaderboard", data: {} });
  return {
    correct,
    score: grade.score,
    feedback: grade.feedback,
    concepts: grade.concepts,
    explanation: res.question.explanation,
    correctAnswer: describeCorrect(res.question),
    nextDue: outcome.nextDue,
    stage: outcome.stageAfter,
    xp: outcome.xp,
    duplicate: outcome.duplicate,
    newAchievements: outcome.newAchievements,
    refresher: correct ? undefined : res.mission.refresher,
    missionSlug: res.mission.slug,
  };
}

// ------------------------------------------------------------------ guards for routes

export function assertOwner(userId: string, ownerId: string) {
  if (userId !== ownerId) throw forbidden();
}
