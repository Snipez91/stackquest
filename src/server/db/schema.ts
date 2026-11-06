import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();

// ------------------------------------------------------------------ identity

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  handle: text("handle").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  avatarHue: integer("avatar_hue").notNull().default(210),
  activeTeamId: uuid("active_team_id"),
  theme: text("theme").notNull().default("dark"),
  reduceMotion: boolean("reduce_motion").notNull().default(false),
  showOnLeaderboard: boolean("show_on_leaderboard").notNull().default(true),
  preferredTrack: text("preferred_track"),
  onboardedAt: ts("onboarded_at"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: created(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

// ------------------------------------------------------------------ teams

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: created(),
});

export const memberships = pgTable(
  "memberships",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    mutedUntil: ts("muted_until"),
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    label: text("label"),
    expiresAt: ts("expires_at").notNull(),
    maxUses: integer("max_uses").notNull().default(1),
    uses: integer("uses").notNull().default(0),
    revokedAt: ts("revoked_at"),
    createdAt: created(),
  },
  (t) => [index("invites_team_idx").on(t.teamId)],
);

// ------------------------------------------------------------------ curriculum versions

/** Snapshot of each mission version the app has served, so history stays interpretable. */
export const missionVersions = pgTable(
  "mission_versions",
  {
    slug: text("slug").notNull(),
    version: integer("version").notNull(),
    track: text("track").notNull(),
    tier: text("tier").notNull(),
    title: text("title").notNull(),
    contentHash: text("content_hash").notNull(),
    firstSeenAt: created(),
  },
  (t) => [primaryKey({ columns: [t.slug, t.version] })],
);

// ------------------------------------------------------------------ learning

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    missionSlug: text("mission_slug").notNull(),
    missionVersion: integer("mission_version").notNull(),
    status: text("status", { enum: ["in_progress", "completed"] }).notNull().default("in_progress"),
    hintsUsed: integer("hints_used").notNull().default(0),
    solutionViewed: boolean("solution_viewed").notNull().default(false),
    refresherViewed: boolean("refresher_viewed").notNull().default(false),
    failedChecks: integer("failed_checks").notNull().default(0),
    submissions: integer("submissions").notNull().default(0),
    independent: boolean("independent"),
    /** Practical checks passed (server-replayed for shell, client-reported for code). */
    practicalPassed: boolean("practical_passed").notNull().default(false),
    practicalVerifiedBy: text("practical_verified_by", { enum: ["server", "client"] }),
    lastCheckResults: jsonb("last_check_results").$type<{ id: string; pass: boolean; detail?: string }[]>(),
    questionResults: jsonb("question_results").$type<Record<string, { correct: boolean; score: number; tries: number }>>(),
    /** Learner's draft workspace (files / shell event log), autosaved. */
    draft: jsonb("draft").$type<Record<string, unknown>>(),
    isRaceAttempt: boolean("is_race_attempt").notNull().default(false),
    startedAt: ts("started_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("attempts_user_idx").on(t.userId, t.missionSlug),
    index("attempts_team_idx").on(t.teamId, t.completedAt),
    uniqueIndex("attempts_one_open_idx")
      .on(t.userId, t.teamId, t.missionSlug)
      .where(sql`status = 'in_progress'`),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["practical", "question"] }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    passed: boolean("passed").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("submissions_idem_idx").on(t.userId, t.idempotencyKey)],
);

export const skillEvidence = pgTable(
  "skill_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    kind: text("kind", {
      enum: [
        "assisted_completion",
        "independent_completion",
        "applied_in_later_mission",
        "review_pass",
        "review_fail",
        "transfer_pass",
        "transfer_fail",
      ],
    }).notNull(),
    /** Days since the skill was last practised (for delayed-recall evidence). */
    delayDays: integer("delay_days").notNull().default(0),
    points: real("points").notNull(),
    sourceKey: text("source_key").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("skill_evidence_source_idx").on(t.userId, t.sourceKey), index("skill_evidence_user_skill_idx").on(t.userId, t.skillId)],
);

export const mastery = pgTable(
  "mastery",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    score: real("score").notNull().default(0),
    completions: integer("completions").notNull().default(0),
    independentCompletions: integer("independent_completions").notNull().default(0),
    delayedPasses: integer("delayed_passes").notNull().default(0),
    delayedAttempts: integer("delayed_attempts").notNull().default(0),
    lastPracticedAt: ts("last_practiced_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.teamId, t.skillId] })],
);

export const reviewStates = pgTable(
  "review_states",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    skillId: text("skill_id").notNull(),
    missionSlug: text("mission_slug").notNull(),
    kind: text("kind", { enum: ["review", "transfer"] }).notNull().default("review"),
    stage: integer("stage").notNull().default(0),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    nextVariant: integer("next_variant").notNull().default(0),
    lastReviewedAt: ts("last_reviewed_at"),
    retiredAt: ts("retired_at"),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.teamId, t.itemId] }), index("review_due_idx").on(t.userId, t.teamId, t.dueOn)],
);

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    variant: integer("variant").notNull(),
    correct: boolean("correct").notNull(),
    confidence: text("confidence", { enum: ["unsure", "okay", "confident"] }),
    stageBefore: integer("stage_before").notNull(),
    stageAfter: integer("stage_after").notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    reviewedAt: ts("reviewed_at").notNull().defaultNow(),
  },
  // One graded review per scheduled due date: resubmits are idempotent.
  (t) => [uniqueIndex("review_logs_once_idx").on(t.userId, t.teamId, t.itemId, t.dueOn)],
);

export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    track: text("track"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("xp_idem_idx").on(t.userId, t.teamId, t.idempotencyKey), index("xp_team_time_idx").on(t.teamId, t.createdAt)],
);

export const achievements = pgTable(
  "achievements",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    earnedAt: ts("earned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.teamId, t.achievementId] })],
);

export const diagnostics = pgTable("diagnostics", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  results: jsonb("results").$type<Record<string, { correct: number; total: number }>>().notNull(),
  recommended: jsonb("recommended").$type<{ track: string; missionSlug: string; reason: string }>().notNull(),
  takenAt: ts("taken_at").notNull().defaultNow(),
});

// ------------------------------------------------------------------ team play

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Public, non-sensitive summary only (no answers, no mistakes). */
    payload: jsonb("payload").$type<Record<string, string | number | boolean>>().notNull(),
    createdAt: created(),
  },
  (t) => [index("activity_team_idx").on(t.teamId, t.createdAt)],
);

export const teamGoals = pgTable("team_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  metric: text("metric", { enum: ["missions", "reviews", "independent", "tracks_touched"] }).notNull(),
  track: text("track"),
  target: integer("target").notNull(),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const races = pgTable("races", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  missionSlug: text("mission_slug").notNull(),
  title: text("title").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const raceEntries = pgTable(
  "race_entries",
  {
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    durationMs: integer("duration_ms"),
    hintsUsed: integer("hints_used"),
  },
  (t) => [primaryKey({ columns: [t.raceId, t.userId] })],
);

// ------------------------------------------------------------------ chat

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["general", "track", "mission"] }).notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("channels_team_key_idx").on(t.teamId, t.kind, t.key)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    clientId: text("client_id").notNull(),
    createdAt: created(),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
    deletedBy: uuid("deleted_by"),
  },
  (t) => [
    uniqueIndex("messages_client_idx").on(t.userId, t.clientId),
    index("messages_channel_idx").on(t.channelId, t.createdAt),
  ],
);

export const channelReads = pgTable(
  "channel_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["mention", "achievement", "goal", "review_due"] }).notNull(),
    payload: jsonb("payload").$type<Record<string, string>>().notNull(),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.teamId, t.createdAt)],
);
