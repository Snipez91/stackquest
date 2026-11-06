"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { signIn, signUp, changePassword } from "@/server/auth/core";
import { clientIp, endSession, requireUser, startSession } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { acceptInvite } from "@/server/teams";
import { demoLearner } from "@/server/demo";

export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined;

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  // Only same-site relative paths: never redirect to another origin.
  return /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : "/dashboard";
}

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const invite = String(form.get("invite") ?? "");
  try {
    const db = await getDb();
    const user = await signIn(db, email, password, await clientIp());
    await startSession(user.id);
    if (invite) await acceptInvite(db, user.id, invite, await clientIp());
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, fields: { email } };
    throw e;
  }
  redirect(invite ? "/dashboard?joined=1" : safeNext(form.get("next")));
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const fields = {
    email: String(form.get("email") ?? ""),
    displayName: String(form.get("displayName") ?? ""),
    timezone: String(form.get("timezone") ?? "UTC"),
  };
  const invite = String(form.get("invite") ?? "");
  let joined = false;
  try {
    const db = await getDb();
    const user = await signUp(db, { ...fields, password: String(form.get("password") ?? "") }, await clientIp());
    await startSession(user.id);
    if (invite) {
      await acceptInvite(db, user.id, invite, await clientIp());
      joined = true;
    }
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, fields };
    throw e;
  }
  redirect(joined ? "/onboarding?joined=1" : "/welcome");
}

export async function signOutAction() {
  await endSession();
  redirect("/sign-in");
}

export async function demoSignInAction() {
  if (process.env.DEMO_MODE !== "true") throw new AppError("forbidden", "Demo mode is not enabled on this deployment.");
  const db = await getDb();
  const u = await demoLearner(db);
  if (!u) throw new AppError("not_found", "Demo data is not available.");
  await startSession(u.id);
  redirect("/dashboard");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.isDemo) return { error: "The demo account's password can't be changed." };
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "The new passwords don't match." };
  try {
    await changePassword(await getDb(), user.id, String(form.get("current") ?? ""), next);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  // All sessions were revoked, including this one.
  redirect("/sign-in?changed=1");
}
