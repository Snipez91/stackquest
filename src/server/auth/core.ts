import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db";
import { sessions, users } from "../db/schema";
import { AppError } from "../errors";
import { enforceRateLimit, RateLimitError } from "../ratelimit";
import { isValidTimeZone } from "@/lib/time";
import { hashPassword, passwordProblem, randomToken, sha256, verifyPassword } from "./password";

export const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

export const SignUpInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  password: z.string(),
  displayName: z.string().trim().min(2, "Use at least 2 characters.").max(40),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone.").default("UTC"),
});

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  timezone: string;
  avatarHue: number;
  activeTeamId: string | null;
  theme: string;
  reduceMotion: boolean;
  showOnLeaderboard: boolean;
  preferredTrack: string | null;
  onboardedAt: Date | null;
  isDemo: boolean;
};

function toPublic(u: typeof users.$inferSelect): PublicUser {
  const { passwordHash: _p, createdAt: _c, ...rest } = u;
  return rest;
}

async function uniqueHandle(db: Db, displayName: string): Promise<string> {
  const base =
    displayName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 16) || "learner";
  for (let i = 0; i < 50; i++) {
    const h = i === 0 ? base : `${base}${i + 1}`;
    const taken = await db.select({ id: users.id }).from(users).where(eq(users.handle, h)).limit(1);
    if (!taken.length) return h;
  }
  return `${base}${randomToken().slice(0, 6).toLowerCase()}`;
}

export async function signUp(db: Db, input: z.input<typeof SignUpInput>, ip = "unknown"): Promise<PublicUser> {
  const parsed = SignUpInput.safeParse(input);
  if (!parsed.success) throw new AppError("bad_request", parsed.error.issues[0].message);
  const { email, password, displayName, timezone } = parsed.data;
  const pwProblem = passwordProblem(password);
  if (pwProblem) throw new AppError("bad_request", pwProblem);
  await enforceRateLimit(db, `signup:${ip}`, 10, 3600).catch(rethrowRate);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new AppError("conflict", "An account with that email already exists. Sign in instead.");
  const [u] = await db
    .insert(users)
    .values({
      email,
      displayName,
      handle: await uniqueHandle(db, displayName),
      passwordHash: await hashPassword(password),
      timezone,
      avatarHue: Math.abs([...email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 360,
    })
    .returning();
  return toPublic(u);
}

function rethrowRate(e: unknown): never {
  if (e instanceof RateLimitError) throw new AppError("rate_limited", e.message);
  throw e;
}

export async function signIn(db: Db, emailRaw: string, password: string, ip = "unknown"): Promise<PublicUser> {
  const email = emailRaw.trim().toLowerCase();
  await enforceRateLimit(db, `signin:ip:${ip}`, 30, 900).catch(rethrowRate);
  await enforceRateLimit(db, `signin:email:${email}`, 8, 900).catch(rethrowRate);
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Verify against a dummy hash when the user doesn't exist to keep timing similar.
  const ok = await verifyPassword(password, u?.passwordHash ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!u || !ok) throw new AppError("unauthorized", "That email and password don't match an account.");
  return toPublic(u);
}

export async function createSession(db: Db, userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null });
  return { token, expiresAt };
}

export async function userForSessionToken(db: Db, token: string): Promise<{ user: PublicUser; renewedExpiry?: Date } | null> {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, sql`now()`)))
    .limit(1);
  if (!rows.length) return null;
  const { s, u } = rows[0];
  let renewedExpiry: Date | undefined;
  if (s.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * 86_400_000) {
    renewedExpiry = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.update(sessions).set({ expiresAt: renewedExpiry }).where(eq(sessions.id, id));
  }
  return { user: toPublic(u), renewedExpiry };
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function deleteAllSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function changePassword(db: Db, userId: string, current: string, next: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new AppError("unauthorized", "Current password is incorrect.");
  const p = passwordProblem(next);
  if (p) throw new AppError("bad_request", p);
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await deleteAllSessions(db, userId);
}
