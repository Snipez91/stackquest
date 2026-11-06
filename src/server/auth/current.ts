import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { activeMembership } from "../teams";
import { createSession, deleteSession, userForSessionToken, type PublicUser } from "./core";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sq_session" : "sq_session";

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Behind a proxy (Render, Fly, etc.) the first X-Forwarded-For hop is the client.
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

export async function startSession(userId: string) {
  const db = await getDb();
  const h = await headers();
  const { token, expiresAt } = await createSession(db, userId, h.get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
}

/** Current user or null. Cached per request. */
export const currentUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const r = await userForSessionToken(await getDb(), token);
  return r?.user ?? null;
});

export async function requireUser(): Promise<PublicUser> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

export type Context = {
  user: PublicUser;
  team: { id: string; name: string; timezone: string; isDemo: boolean };
  role: "admin" | "member";
};

/** Signed-in user plus their active team. Redirects to sign-in or team setup as needed. */
export const requireContext = cache(async (): Promise<Context> => {
  const user = await requireUser();
  const db = await getDb();
  const am = await activeMembership(db, user.id, user.activeTeamId);
  if (!am) redirect("/welcome");
  return { user, team: { id: am.t.id, name: am.t.name, timezone: am.t.timezone, isDemo: am.t.isDemo }, role: am.m.role };
});

/** For route handlers: same as requireContext but returns null instead of redirecting. */
export async function apiContext(): Promise<Context | null> {
  const user = await currentUser();
  if (!user) return null;
  const db = await getDb();
  const am = await activeMembership(db, user.id, user.activeTeamId);
  if (!am) return null;
  return { user, team: { id: am.t.id, name: am.t.name, timezone: am.t.timezone, isDemo: am.t.isDemo }, role: am.m.role };
}
