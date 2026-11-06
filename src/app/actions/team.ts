"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMission } from "@/content";
import { weekStartDay } from "@/lib/time";
import { getDb } from "@/server/db";
import { raceEntries, races, teamGoals, teams } from "@/server/db/schema";
import { clientIp, requireContext, requireUser } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import {
  acceptInvite,
  changeRole,
  createInvite,
  createTeam,
  muteMember,
  removeMember,
  requireAdmin,
  requireMembership,
  revokeInvite,
  setActiveTeam,
  updateTeam,
} from "@/server/teams";
import { publish } from "@/server/realtime";
import type { FormState } from "./auth";

function fail(e: unknown): FormState {
  if (e instanceof AppError) return { error: e.message };
  throw e;
}

export async function acceptInviteAction(token: string) {
  const user = await requireUser();
  const r = await acceptInvite(await getDb(), user.id, token, await clientIp());
  redirect(r.alreadyMember ? "/dashboard" : "/onboarding?joined=1");
}

/** Accepts a full invite URL or a bare token pasted by the user. */
export async function joinByLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const raw = String(form.get("link") ?? "").trim();
  const token = raw.match(/invite\/([\w-]+)/)?.[1] ?? raw;
  if (!/^[\w-]{20,100}$/.test(token)) return { error: "That doesn't look like an invitation link. It should end with /invite/ followed by a long code." };
  const user = await requireUser();
  try {
    await acceptInvite(await getDb(), user.id, token, await clientIp());
  } catch (e) {
    return fail(e);
  }
  redirect("/onboarding?joined=1");
}

export async function createTeamAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const db = await getDb();
    // Self-hosted servers can allow only the first team; everyone else joins by invite.
    if (process.env.TEAM_CREATION === "first-only" && (await db.select({ id: teams.id }).from(teams).limit(1)).length > 0) {
      throw new AppError("forbidden", "This server hosts a single team. Ask a team admin for an invitation link.");
    }
    await createTeam(db, user.id, { name: String(form.get("name") ?? ""), timezone: String(form.get("timezone") ?? "UTC") });
  } catch (e) {
    return fail(e);
  }
  redirect("/onboarding");
}

export async function switchTeamAction(teamId: string) {
  const user = await requireUser();
  await setActiveTeam(await getDb(), user.id, teamId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type InviteState = { error?: string; ok?: string; link?: string } | undefined;

export async function createInviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const ctx = await requireContext();
  try {
    const { token } = await createInvite(await getDb(), ctx.user.id, ctx.team.id, {
      role: form.get("role") === "admin" ? "admin" : "member",
      expiresInHours: Number(form.get("expiresInHours") ?? 72),
      maxUses: Number(form.get("maxUses") ?? 1),
      label: String(form.get("label") ?? "") || undefined,
    });
    // RENDER_EXTERNAL_URL is set automatically on Render.
    const base = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
    revalidatePath("/admin");
    return { ok: "Invitation created. Copy the link now — for security it won't be shown again.", link: `${base}/invite/${token}` };
  } catch (e) {
    return fail(e) as InviteState;
  }
}

export async function revokeInviteAction(inviteId: string) {
  const ctx = await requireContext();
  await revokeInvite(await getDb(), ctx.user.id, ctx.team.id, inviteId);
  revalidatePath("/admin");
}

export async function changeRoleAction(userId: string, role: "admin" | "member"): Promise<FormState> {
  const ctx = await requireContext();
  try {
    await changeRole(await getDb(), ctx.user.id, ctx.team.id, userId, role);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin");
  return { ok: "Role updated." };
}

export async function removeMemberAction(userId: string): Promise<FormState> {
  const ctx = await requireContext();
  try {
    await removeMember(await getDb(), ctx.user.id, ctx.team.id, userId);
  } catch (e) {
    return fail(e);
  }
  if (userId === ctx.user.id) redirect("/welcome");
  revalidatePath("/admin");
  return { ok: "Member removed." };
}

export async function muteMemberAction(userId: string, minutes: number): Promise<FormState> {
  const ctx = await requireContext();
  try {
    await muteMember(await getDb(), ctx.user.id, ctx.team.id, userId, minutes);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin");
  return { ok: minutes > 0 ? "Messages paused." : "Messages restored." };
}

export async function updateTeamAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireContext();
  try {
    await updateTeam(await getDb(), ctx.user.id, ctx.team.id, { name: String(form.get("name") ?? ""), timezone: String(form.get("timezone") ?? "UTC") });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Team settings saved." };
}

const GoalSchema = z.object({
  title: z.string().trim().min(3).max(80),
  metric: z.enum(["missions", "reviews", "independent", "tracks_touched"]),
  track: z.enum(["python", "linux", "javascript", "networking", "capstone"]).optional(),
  target: z.coerce.number().int().min(1).max(1000),
});

export async function createGoalAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const db = await getDb();
  try {
    await requireAdmin(db, ctx.user.id, ctx.team.id);
    const p = GoalSchema.safeParse({
      title: form.get("title"),
      metric: form.get("metric"),
      track: form.get("track") || undefined,
      target: form.get("target"),
    });
    if (!p.success) return { error: p.error.issues[0].message };
    await db.insert(teamGoals).values({ ...p.data, track: p.data.track ?? null, teamId: ctx.team.id, weekStart: weekStartDay(ctx.team.timezone), createdBy: ctx.user.id });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/team");
  return { ok: "Goal added for this week." };
}

export async function deleteGoalAction(goalId: string) {
  const ctx = await requireContext();
  const db = await getDb();
  await requireAdmin(db, ctx.user.id, ctx.team.id);
  await db.delete(teamGoals).where(and(eq(teamGoals.id, goalId), eq(teamGoals.teamId, ctx.team.id)));
  revalidatePath("/team");
}

export async function createRaceAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const db = await getDb();
  const slug = String(form.get("mission") ?? "");
  const mission = getMission(slug);
  if (!mission) return { error: "Pick a mission for the race." };
  const hours = Math.min(Math.max(Number(form.get("hours") ?? 24), 1), 24 * 7);
  try {
    await requireMembership(db, ctx.user.id, ctx.team.id);
    const now = new Date();
    await db.insert(races).values({ teamId: ctx.team.id, missionSlug: slug, title: `Race: ${mission.title}`, startsAt: now, endsAt: new Date(now.getTime() + hours * 3_600_000), createdBy: ctx.user.id });
  } catch (e) {
    return fail(e);
  }
  publish({ teamId: ctx.team.id, type: "activity", data: { kind: "race_created", mission: mission.title } });
  revalidatePath("/team");
  return { ok: "Race started. It's optional — anyone can join while it's open." };
}

export async function joinRaceAction(raceId: string) {
  const ctx = await requireContext();
  const db = await getDb();
  const [race] = await db.select().from(races).where(and(eq(races.id, raceId), eq(races.teamId, ctx.team.id)));
  if (!race) throw new AppError("not_found", "Race not found.");
  if (race.endsAt.getTime() < Date.now()) throw new AppError("gone", "This race has ended.");
  await db.insert(raceEntries).values({ raceId, userId: ctx.user.id }).onConflictDoNothing();
  redirect(`/missions/${race.missionSlug}?race=${raceId}`);
}
