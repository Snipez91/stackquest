import { z } from "zod";
import { AssertionSchema, SimScenarioSchema } from "@/sim/schema";

/**
 * Mission content schema. Missions are plain data validated by these schemas,
 * so adding a mission means adding a data file — no component changes.
 * See docs/ADDING_MISSIONS.md.
 */

export const TRACKS = ["python", "linux", "javascript", "networking", "capstone"] as const;
export const TrackIdSchema = z.enum(TRACKS);
export type TrackId = z.infer<typeof TrackIdSchema>;

export const TIERS = ["beginner", "intermediate", "advanced"] as const;
export const TierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof TierSchema>;

const md = z.string().min(1);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const skillId = z.string().regex(/^(py|lx|js|net)\.[a-z0-9-]+$/);

export const SkillSchema = z.object({
  id: skillId,
  track: TrackIdSchema.exclude(["capstone"]),
  name: z.string(),
  description: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

/** Corrective feedback shown when a check fails. */
export const FeedbackSchema = z.object({
  what: z.string().min(1), // what failed, in observable terms
  why: z.string().min(1), // why it matters
  next: z.string().min(1), // what to try next
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// ---------------------------------------------------------------- questions

const base = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  prompt: md,
  /** Optional code / output shown with the prompt. */
  code: z.string().optional(),
  codeLanguage: z.enum(["python", "javascript", "bash", "text", "log", "json"]).optional(),
  explanation: md,
};

export const McqQuestionSchema = z.object({
  ...base,
  kind: z.literal("mcq"),
  options: z.array(z.string().min(1)).min(2).max(6),
  answer: z.number().int().nonnegative(),
});

/** Short free-text answer, normalised (trimmed, case-insensitive, collapsed whitespace). */
export const ShortQuestionSchema = z.object({
  ...base,
  kind: z.literal("short"),
  accept: z.array(z.string().min(1)).min(1),
  /** Optional regexes (case-insensitive) that also count as correct. */
  acceptPatterns: z.array(z.string()).default([]),
  placeholder: z.string().optional(),
});

/** Put items in the correct order. `items` is given in the correct order; the UI shuffles. */
export const OrderQuestionSchema = z.object({
  ...base,
  kind: z.literal("order"),
  items: z.array(z.string().min(1)).min(3).max(8),
});

/**
 * Explain a root cause or decision in your own words. Graded offline by concept
 * coverage (keyword groups), never by an AI service. The learner then compares
 * with a model answer. This is a heuristic, and the UI says so.
 */
export const ExplainQuestionSchema = z.object({
  ...base,
  kind: z.literal("explain"),
  concepts: z
    .array(z.object({ label: z.string(), anyOf: z.array(z.string().min(2)).min(1) }))
    .min(1),
  minConcepts: z.number().int().positive(),
  modelAnswer: md,
});

export const QuestionSchema = z.discriminatedUnion("kind", [
  McqQuestionSchema,
  ShortQuestionSchema,
  OrderQuestionSchema,
  ExplainQuestionSchema,
]);
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionInput = z.input<typeof QuestionSchema>;

// ---------------------------------------------------------------- workspaces

const WorkspaceFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  editable: z.boolean().default(false),
});

/**
 * A code test. For Python, `code` is Python run after the learner's files are
 * loaded (as module `main` plus every other .py file importable by name); it
 * must raise AssertionError (with a message) on failure. For JavaScript, `code`
 * is a function body run with `module` (the learner module's exports) and helpers
 * `assert`, `assertEqual`, `assertDeepEqual`, `captureLogs`, `dom`, `mockFetch` in
 * scope; it may be async. Tests check behaviour, not text, so any correct
 * implementation passes.
 */
export const CodeTestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  code: z.string().min(1),
  /** Hidden tests are run but their code isn't shown before completion. */
  hidden: z.boolean().default(false),
  feedback: FeedbackSchema,
});
export type CodeTest = z.infer<typeof CodeTestSchema>;

const CodeSolutionSchema = z.record(z.string(), z.string());

const codeWorkspace = {
  files: z.array(WorkspaceFileSchema).min(1),
  /** Main file the learner edits (must be editable). */
  entry: z.string(),
  tests: z.array(CodeTestSchema).min(1),
  timeoutMs: z.number().int().min(500).max(20_000).default(5000),
  /** Reference solution: path -> full file content. Must pass all tests. */
  solution: CodeSolutionSchema,
  /** Representative wrong solutions; each must fail at least one test. */
  wrongSolutions: z.array(z.object({ label: z.string(), files: CodeSolutionSchema })).min(1),
};

export const PythonWorkspaceSchema = z.object({ kind: z.literal("python"), ...codeWorkspace });
export const JavaScriptWorkspaceSchema = z.object({
  kind: z.literal("javascript"),
  ...codeWorkspace,
  /** Top-level names from the entry file exposed to tests as `module.<name>`. */
  exports: z.array(z.string().regex(/^[A-Za-z_$][\w$]*$/)).min(1),
  /** Optional HTML fixture loaded into the simulated DOM (`document`) before the code runs. */
  html: z.string().optional(),
});

export const ShellCheckSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  assert: AssertionSchema,
  feedback: FeedbackSchema,
});
export type ShellCheck = z.infer<typeof ShellCheckSchema>;

/** Linux and networking missions: a stateful simulated lab. */
export const ShellWorkspaceSchema = z.object({
  kind: z.literal("shell"),
  scenario: SimScenarioSchema,
  checks: z.array(ShellCheckSchema).min(1),
  /** Reference solution as shell lines (and optional file writes). Must pass all checks. */
  solution: z.array(
    z.union([z.string(), z.object({ write: z.string(), content: z.string() })]),
  ),
  wrongSolutions: z
    .array(
      z.object({
        label: z.string(),
        steps: z.array(z.union([z.string(), z.object({ write: z.string(), content: z.string() })])),
      }),
    )
    .min(1),
  /** Suggested first commands shown as chips for beginners. */
  starterCommands: z.array(z.string()).default([]),
});

/** Investigation missions: read-only evidence; grading is via the mission questions. */
export const EvidenceWorkspaceSchema = z.object({
  kind: z.literal("evidence"),
  files: z.array(z.object({ path: z.string(), content: z.string(), language: z.string().default("text") })).min(1),
});

export const WorkspaceSchema = z.discriminatedUnion("kind", [
  PythonWorkspaceSchema,
  JavaScriptWorkspaceSchema,
  ShellWorkspaceSchema,
  EvidenceWorkspaceSchema,
]);
export type Workspace = z.infer<typeof WorkspaceSchema>;

// ---------------------------------------------------------------- review items

/**
 * A spaced-review item tied to one skill. Several equivalent variants exist so
 * that repeated reviews require recall, not recognition of a memorised answer.
 */
export const ReviewItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  skill: skillId,
  variants: z.array(QuestionSchema).min(2),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

// ---------------------------------------------------------------- mission

export const ASSESSMENT_TYPES = [
  "write-code",
  "repair-code",
  "interpret-output",
  "investigate-logs",
  "configure-system",
  "order-steps",
  "explain-root-cause",
] as const;

export const MissionSchema = z
  .object({
    slug,
    /** Bump when grading-relevant content changes; attempts record the version used. */
    version: z.number().int().positive(),
    track: TrackIdSchema,
    tier: TierSchema,
    /** Position within track+tier (1-based). */
    order: z.number().int().positive(),
    title: z.string().min(3).max(80),
    summary: z.string().min(10).max(220),
    minutes: z.number().int().min(5).max(90),
    assessmentTypes: z.array(z.enum(ASSESSMENT_TYPES)).min(1),
    /** Skills taught/assessed here. Mastery evidence is recorded against these. */
    skills: z.array(skillId).min(1),
    /** Earlier skills this mission relies on without re-teaching them. */
    appliesSkills: z.array(skillId).default([]),
    /** Missions that must be completed first. */
    prerequisites: z.array(slug).default([]),
    brief: z.object({
      from: z.string(), // e.g. "Priya Raman, SRE lead"
      channel: z.string().default("#incidents"),
      body: md,
    }),
    objectives: z.array(z.string().min(5)).min(2).max(6),
    concept: z.object({ title: z.string(), body: md }),
    /** Required when the mission introduces a new concept (all beginner missions). */
    workedExample: z.object({ title: z.string(), body: md }).optional(),
    /** What is simulated here and what transfers to real systems. */
    simulationNote: z.string().optional(),
    workspace: WorkspaceSchema,
    successCriteria: z.array(z.string().min(5)).min(1),
    /** Progressively more specific; the last one may nearly give the answer. */
    hints: z.array(md).min(3).max(5),
    /** Prediction / explanation / ordering / interpretation questions. */
    questions: z.array(QuestionSchema).min(1).max(5),
    debrief: z.object({
      solution: md,
      commonMistakes: z.array(z.string().min(5)).min(2),
      realWorld: md,
    }),
    review: z.array(ReviewItemSchema).min(2),
    /** Apply the skill in a new context, unlocked after a delay. */
    transfer: z.object({ context: md, question: QuestionSchema }),
    /** Offered when the learner struggles: a short refresher + a simpler practice question. */
    refresher: z.object({ body: md, practice: QuestionSchema }),
  })
  .superRefine((m, ctx) => {
    if (m.tier === "beginner" && !m.workedExample) {
      ctx.addIssue({ code: "custom", message: "beginner missions must include a worked example" });
    }
    const ws = m.workspace;
    if ((ws.kind === "python" || ws.kind === "javascript") && !ws.files.some((f) => f.path === ws.entry && f.editable)) {
      ctx.addIssue({ code: "custom", message: `entry ${ws.entry} must be an editable file` });
    }
    if (ws.kind === "evidence" && m.questions.length < 2) {
      ctx.addIssue({ code: "custom", message: "evidence missions need at least 2 graded questions" });
    }
    for (const q of [...m.questions, m.transfer.question, m.refresher.practice, ...m.review.flatMap((r) => r.variants)]) {
      if (q.kind === "mcq" && q.answer >= q.options.length) {
        ctx.addIssue({ code: "custom", message: `question ${q.id}: answer index out of range` });
      }
      if (q.kind === "explain" && q.minConcepts > q.concepts.length) {
        ctx.addIssue({ code: "custom", message: `question ${q.id}: minConcepts exceeds concepts` });
      }
    }
    for (const r of m.review) {
      if (!m.skills.includes(r.skill) && !m.appliesSkills.includes(r.skill)) {
        ctx.addIssue({ code: "custom", message: `review ${r.id} targets skill ${r.skill} not in mission skills` });
      }
    }
    const ids = new Set<string>();
    for (const q of m.questions) {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", message: `duplicate question id ${q.id}` });
      ids.add(q.id);
    }
  });

export type Mission = z.infer<typeof MissionSchema>;
export type MissionInput = z.input<typeof MissionSchema>;

export const TrackSchema = z.object({
  id: TrackIdSchema,
  name: z.string(),
  tagline: z.string(),
  color: z.string(), // tailwind token name, e.g. "py"
  description: md,
  /** Honest scope statement: what the launch curriculum covers and what it doesn't. */
  coverage: z.object({ included: z.array(z.string()), future: z.array(z.string()) }),
});
export type Track = z.infer<typeof TrackSchema>;
