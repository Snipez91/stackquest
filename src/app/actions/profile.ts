"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/current";
import { isValidTimeZone } from "@/lib/time";
import type { FormState } from "./auth";

const ProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Display name needs at least 2 characters.").max(40),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone."),
  theme: z.enum(["dark", "light"]),
  reduceMotion: z.boolean(),
  showOnLeaderboard: z.boolean(),
  preferredTrack: z.enum(["python", "linux", "javascript", "networking", ""]).transform((v) => v || null),
});

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = ProfileSchema.safeParse({
    displayName: form.get("displayName"),
    timezone: form.get("timezone"),
    theme: form.get("theme"),
    reduceMotion: form.get("reduceMotion") === "on",
    showOnLeaderboard: form.get("showOnLeaderboard") === "on",
    preferredTrack: form.get("preferredTrack") ?? "",
  });
  if (!p.success) return { error: p.error.issues[0].message };
  await (await getDb()).update(users).set(p.data).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
