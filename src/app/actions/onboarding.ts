"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DIAGNOSTIC } from "@/content/diagnostic";
import { missionsForTrack } from "@/content";
import { getDb } from "@/server/db";
import { diagnostics, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/current";

const Input = z.object({
  interest: z.enum(["python", "linux", "javascript", "networking", "unsure"]),
  answers: z.record(z.string(), z.number().int().min(-1).max(5)),
});

export type DiagnosticResult = {
  perTrack: Record<string, { correct: number; total: number; level: "new" | "some" | "solid" }>;
  recommended: { track: string; missionSlug: string; missionTitle: string; reason: string };
};

export async function submitDiagnosticAction(raw: z.input<typeof Input>): Promise<DiagnosticResult> {
  const user = await requireUser();
  const { interest, answers } = Input.parse(raw);
  const perTrack: DiagnosticResult["perTrack"] = {};
  for (const q of DIAGNOSTIC) {
    const t = (perTrack[q.track] ??= { correct: 0, total: 0, level: "new" });
    t.total++;
    if (answers[q.id] === q.answer) t.correct++;
  }
  for (const t of Object.values(perTrack)) t.level = t.correct === t.total ? "solid" : t.correct >= 1 ? "some" : "new";

  const track = interest !== "unsure" ? interest : (Object.entries(perTrack).sort((a, b) => b[1].correct - a[1].correct)[0]?.[0] ?? "python");
  const ms = missionsForTrack(track as "python");
  const solid = perTrack[track]?.level === "solid";
  const start = (solid ? ms.find((m) => m.tier === "intermediate") : ms[0]) ?? ms[0];
  const reason = solid
    ? `You answered every ${track} question correctly, so beginner missions are optional — start at intermediate. You can still do any beginner mission.`
    : interest === "unsure"
      ? `You did best in ${track}. Starting at the beginning builds the mental models later missions rely on.`
      : `Starting at the beginning of ${track} builds the mental models later missions rely on.`;
  const recommended = { track, missionSlug: start?.slug ?? "", missionTitle: start?.title ?? "", reason };

  const db = await getDb();
  const results = Object.fromEntries(Object.entries(perTrack).map(([k, v]) => [k, { correct: v.correct, total: v.total }]));
  await db
    .insert(diagnostics)
    .values({ userId: user.id, results, recommended: { track, missionSlug: recommended.missionSlug, reason } })
    .onConflictDoUpdate({ target: diagnostics.userId, set: { results, recommended: { track, missionSlug: recommended.missionSlug, reason }, takenAt: new Date() } });
  await db.update(users).set({ onboardedAt: new Date(), preferredTrack: interest === "unsure" ? track : interest }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { perTrack, recommended };
}

export async function skipOnboardingAction() {
  const user = await requireUser();
  await (await getDb()).update(users).set({ onboardedAt: new Date() }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}
