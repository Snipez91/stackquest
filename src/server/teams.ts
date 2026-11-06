import { and, asc, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { activity, channels, invites, memberships, teams, users } from "./db/schema";
import { AppError, forbidden, notFound } from "./errors";
import { enforceRateLimit, RateLimitError } from "./ratelimit";
import { randomToken, sha256 } from "./auth/password";
import { isValidTimeZone } from "@/lib/time";
import { publish } from "./realtime";

export type Role = "admin" | "member";
export type Membership = typeof memberships.$inferSelect;

// ------------------------------------------------------------------ authorization

/**
 * The single gate for team-scoped data. Every server read/write of team data
 * calls this with the *session* user id; the team id from the client is only
 * a request, never trusted on its own.
 */
export async function requireMembership(db: Db, userId: string, teamId: string): Promise<Membership> {
  if (!z.string().uuid().safeParse(teamId).success) throw forbidden();
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)))
    .limit(1);
  if (!m) throw forbidden("You're not a member of that team.");
  return m;
}

export async function requireAdmin(db: Db, userId: string, teamId: string): Promise<Membership> {
  const m = await requireMembership(db, userId, teamId);
  if (m.role !== "admin") throw forbidden("Only team admins can do that.");
  return m;
}

/** The user's active team membership, falling back to their earliest membership. */
export async function activeMembership(db: Db, userId: string, activeTeamId: string | null) {
  if (activeTeamId) {
    const rows = await db
      .select({ m: memberships, t: teams })
      .from(memberships)
      .innerJoin(teams, eq(teams.id, memberships.teamId))
      .where(and(eq(memberships.userId, userId), eq(memberships.teamId, activeTeamId)))
      .limit(1);
    if (rows.length) return rows[0];
  }
  const rows = await db
    .select({ m: memberships, t: teams })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.joinedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUserTeams(db: Db, userId: string) {
  return db
    .select({ id: teams.id, name: teams.name, role: memberships.role, isDemo: teams.isDemo })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.joinedAt));
}

export async function setActiveTeam(db: Db, userId: string, teamId: string) {
  await requireMembership(db, userId, teamId);
  await db.update(users).set({ activeTeamId: teamId }).where(eq(users.id, userId));
}

// ------------------------------------------------------------------ teams

const TeamInput = z.object({
  name: z.string().trim().min(2, "Team name needs at least 2 characters.").max(50),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone."),
});

export const DEFAULT_CHANNELS = [
  { kind: "general" as const, key: "general", name: "general" },
  { kind: "track" as const, key: "python", name: "python" },
  { kind: "track" as const, key: "linux", name: "linux" },
  { kind: "track" as const, key: "javascript", name: "javascript" },
  { kind: "track" as const, key: "networking", name: "networking" },
];

export async function createTeam(db: Db, userId: string, input: z.input<typeof TeamInput>) {
  const p = TeamInput.safeParse(input);
  if (!p.success) throw new AppError("bad_request", p.error.issues[0].message);
  try {
    await enforceRateLimit(db, `team-create:${userId}`, 5, 86_400);
  } catch (e) {
    if (e instanceof RateLimitError) throw new AppError("rate_limited", e.message);
    throw e;
  }
  return db.transaction(async (tx) => {
    const [team] = await tx.insert(teams).values({ name: p.data.name, timezone: p.data.timezone }).returning();
    await tx.insert(memberships).values({ teamId: team.id, userId, role: "admin" });
    await tx.insert(channels).values(DEFAULT_CHANNELS.map((c) => ({ ...c, teamId: team.id })));
    await tx.update(users).set({ activeTeamId: team.id }).where(eq(users.id, userId));
    await tx.insert(activity).values({ teamId: team.id, userId, kind: "team_created", payload: { name: team.name } });
    return team;
  });
}

export async function updateTeam(db: Db, actorId: string, teamId: string, input: z.input<typeof TeamInput>) {
  await requireAdmin(db, actorId, teamId);
  const p = TeamInput.safeParse(input);
  if (!p.success) throw new AppError("bad_request", p.error.issues[0].message);
  await db.update(teams).set(p.data).where(eq(teams.id, teamId));
}

// ------------------------------------------------------------------ invites

export const InviteInput = z.object({
  role: z.enum(["admin", "member"]).default("member"),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
  maxUses: z.coerce.number().int().min(1).max(100).default(1),
  label: z.string().trim().max(60).optional(),
});

export async function createInvite(db: Db, actorId: string, teamId: string, input: z.input<typeof InviteInput>) {
  await requireAdmin(db, actorId, teamId);
  const p = InviteInput.safeParse(input);
  if (!p.success) throw new AppError("bad_request", p.error.issues[0].message);
  try {
    await enforceRateLimit(db, `invite-create:${actorId}`, 30, 3600);
  } catch (e) {
    if (e instanceof RateLimitError) throw new AppError("rate_limited", e.message);
    throw e;
  }
  const token = randomToken();
  const [invite] = await db
    .insert(invites)
    .values({
      teamId,
      tokenHash: sha256(token),
      createdBy: actorId,
      role: p.data.role,
      label: p.data.label || null,
      maxUses: p.data.maxUses,
      expiresAt: new Date(Date.now() + p.data.expiresInHours * 3_600_000),
    })
    .returning();
  // The raw token is returned once and never stored.
  return { token, invite };
}

export type InvitePreview =
  | { status: "valid"; teamName: string; role: Role; expiresAt: Date; memberCount: number }
  | { status: "expired" | "revoked" | "used_up" | "invalid" };

export async function previewInvite(db: Db, token: string): Promise<InvitePreview> {
  if (!token || token.length > 100) return { status: "invalid" };
  const [row] = await db
    .select({ i: invites, t: teams })
    .from(invites)
    .innerJoin(teams, eq(teams.id, invites.teamId))
    .where(eq(invites.tokenHash, sha256(token)))
    .limit(1);
  if (!row) return { status: "invalid" };
  if (row.i.revokedAt) return { status: "revoked" };
  if (row.i.expiresAt.getTime() <= Date.now()) return { status: "expired" };
  if (row.i.uses >= row.i.maxUses) return { status: "used_up" };
  const [{ n }] = await db.select({ n: count() }).from(memberships).where(eq(memberships.teamId, row.t.id));
  return { status: "valid", teamName: row.t.name, role: row.i.role, expiresAt: row.i.expiresAt, memberCount: Number(n) };
}

export async function acceptInvite(db: Db, userId: string, token: string, ip = "unknown"): Promise<{ teamId: string; alreadyMember: boolean }> {
  try {
    await enforceRateLimit(db, `invite-accept:${ip}`, 20, 900);
  } catch (e) {
    if (e instanceof RateLimitError) throw new AppError("rate_limited", e.message);
    throw e;
  }
  const hash = sha256(token ?? "");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invites).where(eq(invites.tokenHash, hash)).limit(1);
    if (!inv) throw new AppError("not_found", "This invitation link isn't valid. Ask your team admin for a new one.");
    const [existing] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.teamId, inv.teamId), eq(memberships.userId, userId)))
      .limit(1);
    if (existing) {
      await tx.update(users).set({ activeTeamId: inv.teamId }).where(eq(users.id, userId));
      return { teamId: inv.teamId, alreadyMember: true };
    }
    // Atomic consume: only succeeds while the invite is live and has uses left.
    const consumed = await tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(and(eq(invites.id, inv.id), isNull(invites.revokedAt), gt(invites.expiresAt, sql`now()`), lt(invites.uses, invites.maxUses)))
      .returning({ id: invites.id });
    if (!consumed.length) {
      if (inv.revokedAt) throw new AppError("gone", "This invitation was revoked. Ask your team admin for a new link.");
      if (inv.expiresAt.getTime() <= Date.now()) throw new AppError("gone", "This invitation has expired. Ask your team admin for a new link.");
      throw new AppError("gone", "This invitation has already been used. Ask your team admin for a new link.");
    }
    await tx.insert(memberships).values({ teamId: inv.teamId, userId, role: inv.role });
    await tx.update(users).set({ activeTeamId: inv.teamId }).where(eq(users.id, userId));
    const [u] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId));
    await tx.insert(activity).values({ teamId: inv.teamId, userId, kind: "joined", payload: { name: u.displayName } });
    return { teamId: inv.teamId, alreadyMember: false };
  }).then((r) => {
    if (!r.alreadyMember) publish({ teamId: r.teamId, type: "team.changed", data: {} });
    return r;
  });
}

export async function listInvites(db: Db, actorId: string, teamId: string) {
  await requireAdmin(db, actorId, teamId);
  return db
    .select({
      id: invites.id,
      role: invites.role,
      label: invites.label,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      uses: invites.uses,
      revokedAt: invites.revokedAt,
      createdAt: invites.createdAt,
      createdBy: users.displayName,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(eq(invites.teamId, teamId))
    .orderBy(sql`${invites.createdAt} desc`);
}

export async function revokeInvite(db: Db, actorId: string, teamId: string, inviteId: string) {
  await requireAdmin(db, actorId, teamId);
  const r = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.teamId, teamId)))
    .returning({ id: invites.id });
  if (!r.length) throw notFound("Invite not found.");
}

// ------------------------------------------------------------------ members

export async function listMembers(db: Db, actorId: string, teamId: string) {
  await requireMembership(db, actorId, teamId);
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      handle: users.handle,
      avatarHue: users.avatarHue,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      lastSeenAt: memberships.lastSeenAt,
      mutedUntil: memberships.mutedUntil,
      isDemo: users.isDemo,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .orderBy(asc(users.displayName));
}

async function adminCount(db: Db, teamId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.teamId, teamId), eq(memberships.role, "admin")));
  return Number(n);
}

export async function changeRole(db: Db, actorId: string, teamId: string, targetId: string, role: Role) {
  await requireAdmin(db, actorId, teamId);
  const target = await requireMembership(db, targetId, teamId).catch(() => {
    throw notFound("That person isn't on this team.");
  });
  if (target.role === "admin" && role === "member" && (await adminCount(db, teamId)) <= 1) {
    throw new AppError("conflict", "A team needs at least one admin. Promote someone else first.");
  }
  await db.update(memberships).set({ role }).where(and(eq(memberships.teamId, teamId), eq(memberships.userId, targetId)));
  publish({ teamId, type: "team.changed", data: {} });
}

export async function removeMember(db: Db, actorId: string, teamId: string, targetId: string) {
  if (actorId !== targetId) await requireAdmin(db, actorId, teamId);
  const target = await requireMembership(db, targetId, teamId);
  if (target.role === "admin" && (await adminCount(db, teamId)) <= 1) {
    throw new AppError("conflict", "The last admin can't leave. Promote someone else first.");
  }
  await db.delete(memberships).where(and(eq(memberships.teamId, teamId), eq(memberships.userId, targetId)));
  await db.update(users).set({ activeTeamId: null }).where(and(eq(users.id, targetId), eq(users.activeTeamId, teamId)));
  publish({ teamId, type: "team.changed", data: {} });
}

export async function muteMember(db: Db, actorId: string, teamId: string, targetId: string, minutes: number) {
  await requireAdmin(db, actorId, teamId);
  if (actorId === targetId) throw new AppError("bad_request", "You can't mute yourself.");
  await requireMembership(db, targetId, teamId);
  const until = minutes > 0 ? new Date(Date.now() + Math.min(minutes, 7 * 24 * 60) * 60_000) : null;
  await db.update(memberships).set({ mutedUntil: until }).where(and(eq(memberships.teamId, teamId), eq(memberships.userId, targetId)));
}
