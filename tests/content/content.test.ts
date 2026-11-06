import { describe, expect, it } from "vitest";
import { missions, skills, tracks, missionsForTrack, getMission } from "@/content";
import { correctAnswer, gradeQuestion } from "@/lib/grading";
import type { SimEvent } from "@/sim/schema";
import { runMissionCode } from "../helpers/code-runner";

/**
 * Curriculum integrity. Every published mission must: parse, have reachable
 * prerequisites, map review items to real skills, have answerable questions,
 * and (for practical workspaces) a reference solution that passes while the
 * starter state and representative wrong solutions fail.
 */

const ONLY = process.env.CONTENT_TRACK; // e.g. CONTENT_TRACK=python to iterate on one track
const selected = ONLY ? missions.filter((m) => m.track === ONLY) : missions;

type Step = string | { write: string; content: string };
const toEvents = (steps: Step[]): SimEvent[] =>
  steps.map((s) => (typeof s === "string" ? { t: "cmd", line: s } : { t: "write", path: s.write, content: s.content }));

describe("curriculum structure", () => {
  it("has the launch curriculum size", () => {
    if (ONLY) return;
    for (const t of ["python", "linux", "javascript", "networking"] as const) {
      const ms = missionsForTrack(t);
      expect(ms.length, `${t} missions`).toBeGreaterThanOrEqual(12);
      for (const tier of ["beginner", "intermediate", "advanced"] as const) {
        expect(ms.filter((m) => m.tier === tier).length, `${t} ${tier}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(missionsForTrack("capstone").length).toBeGreaterThanOrEqual(4);
  });

  it("has unique slugs, review ids and question ids", () => {
    const slugs = missions.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const reviewIds = missions.flatMap((m) => m.review.map((r) => r.id));
    expect(new Set(reviewIds).size).toBe(reviewIds.length);
  });

  it("references only existing skills", () => {
    const ids = new Set(skills.map((s) => s.id));
    for (const m of missions) {
      for (const s of [...m.skills, ...m.appliesSkills, ...m.review.map((r) => r.skill)]) {
        expect(ids.has(s), `${m.slug} -> skill ${s}`).toBe(true);
      }
    }
  });

  it("every skill is taught by at least one mission and reviewed somewhere", () => {
    if (ONLY) return;
    for (const s of skills) {
      expect(missions.some((m) => m.skills.includes(s.id)), `skill ${s.id} taught`).toBe(true);
      expect(missions.some((m) => m.review.some((r) => r.skill === s.id)), `skill ${s.id} reviewed`).toBe(true);
    }
  });

  it("has reachable, acyclic prerequisites", () => {
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const m of missions) {
        if (!done.has(m.slug) && m.prerequisites.every((p) => done.has(p))) {
          done.add(m.slug);
          progress = true;
        }
      }
    }
    for (const m of missions) {
      for (const p of m.prerequisites) expect(getMission(p), `${m.slug} prereq ${p}`).toBeDefined();
      expect(done.has(m.slug), `${m.slug} reachable`).toBe(true);
    }
  });

  it("has a track definition for every mission track", () => {
    for (const m of missions) expect(tracks.some((t) => t.id === m.track)).toBe(true);
  });
});

describe.each(selected.map((m) => [m.slug, m] as const))("mission %s", (_slug, m) => {
  it("questions accept their own correct answers", () => {
    const qs = [...m.questions, m.transfer.question, m.refresher.practice, ...m.review.flatMap((r) => r.variants)];
    for (const q of qs) {
      const g = gradeQuestion(q, correctAnswer(q));
      expect(g.correct, `${m.slug}/${q.id}: ${g.feedback}`).toBe(true);
    }
  });

  it("explain questions reject an empty-ish answer", () => {
    for (const q of m.questions.filter((x) => x.kind === "explain")) {
      expect(gradeQuestion(q, { kind: "explain", text: "I am not sure what happened here." }).correct).toBe(false);
    }
  });

  const ws = m.workspace;
  if (ws.kind === "python" || ws.kind === "javascript") {
    it("reference solution passes every check", async () => {
      const r = await runMissionCode(m, ws.solution);
      const failed = r.tests.filter((t) => !t.pass);
      expect(failed, `${r.stderr}\n${JSON.stringify(failed)}`).toEqual([]);
      expect(r.tests.length).toBe(ws.tests.length);
    }, 60_000);

    it("starter code does not pass", async () => {
      const r = await runMissionCode(m, {});
      expect(r.tests.some((t) => !t.pass), "starter passes all checks").toBe(true);
    }, 60_000);

    it.each(ws.wrongSolutions.map((w) => [w.label, w] as const))("wrong solution fails: %s", async (_l, w) => {
      const r = await runMissionCode(m, w.files);
      expect(r.tests.some((t) => !t.pass), `wrong solution "${w.label}" passed`).toBe(true);
    }, 60_000);
  }

  if (ws.kind === "shell") {
    const checks = ws.checks.map((c) => ({ id: c.id, assert: c.assert }));
    // Imported lazily so code-track content can be validated on its own.
    const sim = () => import("@/sim");
    it("reference solution passes every check", async () => {
      const { gradeEvents } = await sim();
      const { results } = gradeEvents(ws.scenario, toEvents(ws.solution), checks);
      expect(results.filter((r) => !r.pass)).toEqual([]);
    });
    it("starting state does not pass", async () => {
      const { gradeEvents } = await sim();
      const { results } = gradeEvents(ws.scenario, [], checks);
      expect(results.some((r) => !r.pass)).toBe(true);
    });
    it.each(ws.wrongSolutions.map((w) => [w.label, w] as const))("wrong solution fails: %s", async (_l, w) => {
      const { gradeEvents } = await sim();
      const { results } = gradeEvents(ws.scenario, toEvents(w.steps), checks);
      expect(results.some((r) => !r.pass), `wrong solution "${w.label}" passed`).toBe(true);
    });
  }
});
