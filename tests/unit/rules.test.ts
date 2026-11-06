import { describe, expect, it } from "vitest";
import { computeMastery, evidencePoints, interleave, isIndependent, levelForXp, missionXp, nextReviewStage, REVIEW_INTERVALS } from "@/lib/rules";
import { addDays, localDate, startOfLocalDay, weekWindow } from "@/lib/time";
import { gradeQuestion } from "@/lib/grading";

describe("review scheduling", () => {
  it("uses 1, 3, 7, 14, 30 day intervals and adjusts by performance", () => {
    expect(REVIEW_INTERVALS.slice(0, 5)).toEqual([1, 3, 7, 14, 30]);
    expect(nextReviewStage(0, true, "okay")).toBe(1);
    expect(nextReviewStage(2, true, "confident")).toBe(3);
    expect(nextReviewStage(2, true, "unsure")).toBe(2);
    expect(nextReviewStage(4, false)).toBe(0);
    expect(nextReviewStage(5, true)).toBe(5);
  });
  it("interleaves tracks", () => {
    const items = [..."ppppjjjl"].map((t, i) => ({ track: t, i }));
    const out = interleave(items);
    expect(out).toHaveLength(items.length);
    for (let i = 1; i < 6; i++) expect(out[i].track).not.toBe(out[i - 1].track);
  });
});

describe("mastery model", () => {
  it("caps assisted-only evidence and requires delayed recall for Strong", () => {
    const assisted = Array.from({ length: 6 }, () => ({ kind: "assisted_completion" as const, points: evidencePoints("assisted_completion"), delayDays: 0 }));
    expect(computeMastery(assisted).score).toBe(45);
    const indep = [{ kind: "independent_completion" as const, points: 25, delayDays: 0 }, ...Array.from({ length: 10 }, () => ({ kind: "review_pass" as const, points: evidencePoints("review_pass", 3), delayDays: 3 }))];
    expect(computeMastery(indep).score).toBe(70);
    const strong = [...indep, { kind: "review_pass" as const, points: evidencePoints("review_pass", 14), delayDays: 14 }];
    expect(computeMastery(strong).score).toBeGreaterThan(70);
    expect(computeMastery(strong).delayedPasses).toBe(11);
  });
  it("defines independence as ≤1 hint and no solution/refresher", () => {
    expect(isIndependent({ hintsUsed: 1, solutionViewed: false, refresherViewed: false })).toBe(true);
    expect(isIndependent({ hintsUsed: 2, solutionViewed: false, refresherViewed: false })).toBe(false);
    expect(isIndependent({ hintsUsed: 0, solutionViewed: true, refresherViewed: false })).toBe(false);
  });
  it("scores XP and levels deterministically", () => {
    expect(missionXp("beginner", "python", false)).toBe(100);
    expect(missionXp("beginner", "python", true)).toBe(150);
    expect(missionXp("advanced", "capstone", false)).toBe(300);
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(200).level).toBe(2);
    expect(levelForXp(474).level).toBe(2);
    expect(levelForXp(475).level).toBe(3);
  });
});

describe("time zones", () => {
  it("computes local dates and DST-safe week windows", () => {
    expect(localDate("America/Los_Angeles", new Date("2026-03-02T05:00:00Z"))).toBe("2026-03-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    // US DST starts 2026-03-08: Monday 2026-03-09 00:00 PDT = 07:00 UTC.
    const w = weekWindow("America/Los_Angeles", new Date("2026-03-10T12:00:00Z"));
    expect(w.startDay).toBe("2026-03-09");
    expect(w.start.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(startOfLocalDay("Asia/Kolkata", "2026-03-02").toISOString()).toBe("2026-03-01T18:30:00.000Z");
  });
});

describe("question grading", () => {
  it("accepts alternatives for short answers and scores order partially", () => {
    const short = { id: "s", kind: "short" as const, prompt: "p", explanation: "e", accept: ["chmod 640"], acceptPatterns: ["^chmod\\s+(u=rw,g=r,o=|0?640)"] };
    expect(gradeQuestion(short, { kind: "short", text: " CHMOD 640 " }).correct).toBe(true);
    expect(gradeQuestion(short, { kind: "short", text: "chmod u=rw,g=r,o= file" }).correct).toBe(true);
    expect(gradeQuestion(short, { kind: "short", text: "chmod 777" }).correct).toBe(false);
    const order = { id: "o", kind: "order" as const, prompt: "p", explanation: "e", items: ["a", "b", "c", "d"] };
    const g = gradeQuestion(order, { kind: "order", order: ["a", "b", "d", "c"] });
    expect(g.correct).toBe(false);
    expect(g.score).toBe(0.5);
  });
});
