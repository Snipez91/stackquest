import type { Question } from "@/content/schema";

/**
 * Offline, deterministic grading for mission and review questions. Runs on the
 * server (authoritative) and is also used client-side for instant feedback on
 * practice-only items. No AI service is involved.
 */

export type Answer =
  | { kind: "mcq"; choice: number }
  | { kind: "short"; text: string }
  | { kind: "order"; order: string[] }
  | { kind: "explain"; text: string };

export interface QuestionGrade {
  correct: boolean;
  /** 0..1 partial credit (order and explain questions). */
  score: number;
  feedback: string;
  /** For explain questions: which concepts were detected / missing. */
  concepts?: { label: string; found: boolean }[];
}

export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;]+$/, "");
}

function conceptFound(text: string, anyOf: string[]): boolean {
  const t = " " + normalize(text).replace(/[^a-z0-9./:_\-\s]/g, " ") + " ";
  return anyOf.some((k) => {
    const key = normalize(k);
    if (key.startsWith("re:")) {
      try {
        return new RegExp(key.slice(3), "i").test(text);
      } catch {
        return false;
      }
    }
    return t.includes(key);
  });
}

export function gradeQuestion(q: Question, a: Answer): QuestionGrade {
  if (a.kind !== q.kind) return { correct: false, score: 0, feedback: "Answer type does not match the question." };
  switch (q.kind) {
    case "mcq": {
      const ok = (a as { choice: number }).choice === q.answer;
      return { correct: ok, score: ok ? 1 : 0, feedback: q.explanation };
    }
    case "short": {
      const text = normalize((a as { text: string }).text);
      const ok =
        text.length > 0 &&
        (q.accept.some((x) => normalize(x) === text) ||
          q.acceptPatterns.some((p) => {
            try {
              return new RegExp(p, "i").test((a as { text: string }).text.trim());
            } catch {
              return false;
            }
          }));
      return { correct: ok, score: ok ? 1 : 0, feedback: q.explanation };
    }
    case "order": {
      const order = (a as { order: string[] }).order;
      const valid = order.length === q.items.length && q.items.every((i) => order.includes(i));
      if (!valid) return { correct: false, score: 0, feedback: "Place every step exactly once." };
      const inPlace = q.items.filter((item, i) => order[i] === item).length;
      const ok = inPlace === q.items.length;
      return {
        correct: ok,
        score: inPlace / q.items.length,
        feedback: ok ? q.explanation : `${inPlace} of ${q.items.length} steps are in the right position. ${q.explanation}`,
      };
    }
    case "explain": {
      const text = (a as { text: string }).text;
      const concepts = q.concepts.map((c) => ({ label: c.label, found: conceptFound(text, c.anyOf) }));
      const found = concepts.filter((c) => c.found).length;
      const ok = text.trim().length >= 20 && found >= q.minConcepts;
      return {
        correct: ok,
        score: Math.min(1, found / q.minConcepts),
        concepts,
        feedback: ok
          ? "Your explanation covers the key ideas. Compare it with the model answer."
          : `Your explanation is missing: ${concepts
              .filter((c) => !c.found)
              .map((c) => c.label)
              .join(", ")}. Concept matching is a keyword heuristic — compare with the model answer below.`,
      };
    }
  }
}

/** The canonical correct answer for a question (used for self-validation tests). */
export function correctAnswer(q: Question): Answer {
  switch (q.kind) {
    case "mcq":
      return { kind: "mcq", choice: q.answer };
    case "short":
      return { kind: "short", text: q.accept[0] };
    case "order":
      return { kind: "order", order: [...q.items] };
    case "explain":
      return { kind: "explain", text: q.modelAnswer };
  }
}

/** Strip answers before sending a question to the browser. */
export function publicQuestion(q: Question) {
  switch (q.kind) {
    case "mcq":
      return { id: q.id, kind: q.kind, prompt: q.prompt, code: q.code, codeLanguage: q.codeLanguage, options: q.options };
    case "short":
      return { id: q.id, kind: q.kind, prompt: q.prompt, code: q.code, codeLanguage: q.codeLanguage, placeholder: q.placeholder };
    case "order":
      return { id: q.id, kind: q.kind, prompt: q.prompt, code: q.code, codeLanguage: q.codeLanguage, items: deterministicShuffle(q.items, q.id) };
    case "explain":
      return { id: q.id, kind: q.kind, prompt: q.prompt, code: q.code, codeLanguage: q.codeLanguage, concepts: q.concepts.map((c) => c.label), minConcepts: q.minConcepts };
  }
}
export type PublicQuestion = ReturnType<typeof publicQuestion>;

/** Shuffle that never returns the solved order (for 3+ items) and is stable per id. */
export function deterministicShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.every((x, i) => x === items[i]) && out.length > 1) out.push(out.shift()!);
  return out;
}
