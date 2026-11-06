import { getMission, getSkill } from "@/content";
import type { Mission } from "@/content/schema";
import { publicQuestion } from "./grading";
import { renderMarkdown } from "./markdown";

/**
 * What the browser receives for a mission. Hints, solutions, wrong solutions,
 * question answers, the debrief and shell check assertions stay on the server.
 * Code tests are sent because they run in the learner's browser sandbox.
 */
export function toPublicMission(m: Mission) {
  const ws = m.workspace;
  let workspace;
  if (ws.kind === "python" || ws.kind === "javascript") {
    workspace = {
      kind: ws.kind,
      files: ws.files,
      entry: ws.entry,
      tests: ws.tests.map((t) => ({ id: t.id, name: t.name, code: t.code, hidden: t.hidden })),
      timeoutMs: ws.timeoutMs,
      exports: ws.kind === "javascript" ? ws.exports : undefined,
      html: ws.kind === "javascript" ? ws.html : undefined,
    } as const;
  } else if (ws.kind === "shell") {
    workspace = {
      kind: "shell" as const,
      scenario: ws.scenario,
      checks: ws.checks.map((c) => ({ id: c.id, name: c.name })),
      starterCommands: ws.starterCommands,
    };
  } else {
    workspace = { kind: "evidence" as const, files: ws.files };
  }
  return {
    slug: m.slug,
    version: m.version,
    title: m.title,
    summary: m.summary,
    track: m.track,
    tier: m.tier,
    minutes: m.minutes,
    assessmentTypes: m.assessmentTypes,
    skills: m.skills.map((s) => ({ id: s, name: getSkill(s)?.name ?? s })),
    appliesSkills: m.appliesSkills.map((s) => ({ id: s, name: getSkill(s)?.name ?? s })),
    prerequisites: m.prerequisites.map((p) => ({ slug: p, title: getMission(p)?.title ?? p })),
    brief: { from: m.brief.from, channel: m.brief.channel, html: renderMarkdown(m.brief.body) },
    objectives: m.objectives,
    concept: { title: m.concept.title, html: renderMarkdown(m.concept.body) },
    workedExample: m.workedExample ? { title: m.workedExample.title, html: renderMarkdown(m.workedExample.body) } : null,
    simulationNote: m.simulationNote ?? null,
    successCriteria: m.successCriteria,
    hintCount: m.hints.length,
    questions: m.questions.map((q) => ({ ...publicQuestion(q), promptHtml: renderMarkdown(q.prompt) })),
    workspace,
  };
}

export type PublicMission = ReturnType<typeof toPublicMission>;
