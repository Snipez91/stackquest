import type { Tier, TrackId } from "@/content/schema";

/**
 * StackQuest's scoring, mastery and review rules in one place. These numbers
 * are shown verbatim on the "How scoring works" page, so keep the copy there
 * in sync (it reads from this module).
 */

// ------------------------------------------------------------------ XP

export const XP_RULES = {
  missionBase: { beginner: 100, intermediate: 150, advanced: 200 } as Record<Tier, number>,
  capstoneBonus: 100,
  /** Extra for solving with at most one hint and without the refresher or solution. */
  independentBonusPct: 50,
  questionFirstTry: 10,
  reviewPass: 15,
  /** Extra for recalling something you last practised 7+ days ago. */
  delayedReviewBonus: 10,
  transferPass: 40,
  achievement: 25,
  /** Per learner per local day; reviews beyond this still count for mastery, not XP. */
  dailyReviewXpCap: 200,
} as const;

export function missionXp(tier: Tier, track: TrackId, independent: boolean): number {
  const base = XP_RULES.missionBase[tier] + (track === "capstone" ? XP_RULES.capstoneBonus : 0);
  return independent ? Math.round(base * (1 + XP_RULES.independentBonusPct / 100)) : base;
}

export function reviewXp(delayDays: number): number {
  return XP_RULES.reviewPass + (delayDays >= 7 ? XP_RULES.delayedReviewBonus : 0);
}

/** Level 2 needs 200 XP; each later level needs 75 XP more than the one before (200, 275, 350, …). */
export function levelForXp(xp: number): { level: number; current: number; next: number } {
  let level = 1;
  let floor = 0;
  let step = 200;
  while (xp >= floor + step) {
    floor += step;
    level++;
    step = 200 + (level - 1) * 75;
  }
  return { level, current: xp - floor, next: step };
}

/** Independent = at most one hint, no refresher, no solution reveal. */
export function isIndependent(a: { hintsUsed: number; solutionViewed: boolean; refresherViewed: boolean }): boolean {
  return a.hintsUsed <= 1 && !a.solutionViewed && !a.refresherViewed;
}

// ------------------------------------------------------------------ mastery

export type EvidenceKind =
  | "assisted_completion"
  | "independent_completion"
  | "applied_in_later_mission"
  | "review_pass"
  | "review_fail"
  | "transfer_pass"
  | "transfer_fail";

export function evidencePoints(kind: EvidenceKind, delayDays = 0): number {
  switch (kind) {
    case "assisted_completion":
      return 15;
    case "independent_completion":
      return 25;
    case "applied_in_later_mission":
      return 10;
    case "review_pass":
      return Math.round((6 + Math.min(delayDays, 30) * 0.6) * 10) / 10;
    case "review_fail":
      return -8;
    case "transfer_pass":
      return 15;
    case "transfer_fail":
      return -5;
  }
}

export const MASTERY_CAPS = {
  /** Without any independent evidence (independent solve or passed review). */
  withoutIndependent: 45,
  /** Without a passed review at least 7 days after last practice. */
  withoutDelayedRecall: 70,
} as const;

export interface EvidenceRow {
  kind: EvidenceKind;
  points: number;
  delayDays: number;
}

export function computeMastery(rows: EvidenceRow[]): {
  score: number;
  completions: number;
  independentCompletions: number;
  delayedPasses: number;
  delayedAttempts: number;
} {
  let sum = 0;
  let completions = 0;
  let independentCompletions = 0;
  let delayedPasses = 0;
  let delayedAttempts = 0;
  let hasIndependent = false;
  for (const r of rows) {
    sum += r.points;
    if (r.kind === "assisted_completion" || r.kind === "independent_completion") completions++;
    if (r.kind === "independent_completion") {
      independentCompletions++;
      hasIndependent = true;
    }
    if (r.kind === "review_pass" || r.kind === "transfer_pass") hasIndependent = true;
    if ((r.kind === "review_pass" || r.kind === "review_fail") && r.delayDays >= 3) {
      delayedAttempts++;
      if (r.kind === "review_pass") delayedPasses++;
    }
  }
  const hasDelayed = rows.some((r) => r.kind === "review_pass" && r.delayDays >= 7);
  let cap = 100;
  if (!hasIndependent) cap = MASTERY_CAPS.withoutIndependent;
  else if (!hasDelayed) cap = MASTERY_CAPS.withoutDelayedRecall;
  const score = Math.max(0, Math.min(cap, Math.round(sum)));
  return { score, completions, independentCompletions, delayedPasses, delayedAttempts };
}

export const MASTERY_BANDS = [
  { min: 80, label: "Strong", description: "Solved independently and recalled after a week or more." },
  { min: 55, label: "Proficient", description: "Solid evidence; delayed reviews will confirm it." },
  { min: 30, label: "Developing", description: "Practised, but recall isn't established yet." },
  { min: 1, label: "Introduced", description: "Seen in a mission; keep practising." },
  { min: 0, label: "Not started", description: "No evidence yet." },
] as const;

export function masteryBand(score: number) {
  return MASTERY_BANDS.find((b) => score >= b.min) ?? MASTERY_BANDS[MASTERY_BANDS.length - 1];
}

// ------------------------------------------------------------------ spaced review

/** Days until the next review for each stage. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60] as const;
export const TRANSFER_DELAY_DAYS = 3;

export type Confidence = "unsure" | "okay" | "confident";

/**
 * Next stage after a review. Correct + confident/okay advances one stage;
 * correct but unsure repeats the current interval; incorrect resets to the
 * first interval (and the skill is flagged for a refresher).
 */
export function nextReviewStage(stage: number, correct: boolean, confidence: Confidence = "okay"): number {
  if (!correct) return 0;
  if (confidence === "unsure") return stage;
  return Math.min(stage + 1, REVIEW_INTERVALS.length - 1);
}

export function intervalForStage(stage: number): number {
  return REVIEW_INTERVALS[Math.max(0, Math.min(stage, REVIEW_INTERVALS.length - 1))];
}

/** Interleave items so consecutive cards come from different tracks where possible. */
export function interleave<T extends { track: string }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const arr = groups.get(it.track) ?? [];
    arr.push(it);
    groups.set(it.track, arr);
  }
  const out: T[] = [];
  let last = "";
  while (out.length < items.length) {
    const order = [...groups.entries()].filter(([, v]) => v.length).sort((a, b) => b[1].length - a[1].length);
    const pick = order.find(([k]) => k !== last) ?? order[0];
    out.push(pick[1].shift()!);
    last = pick[0];
  }
  return out;
}
