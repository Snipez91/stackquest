import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { markRaceAttempt, startAttempt } from "@/server/learning";

export const dynamic = "force-dynamic";

export const POST = route(async (ctx, req) => {
  const { slug, raceId } = z.object({ slug: z.string().max(80), raceId: z.string().uuid().optional() }).parse(await readJson(req));
  const db = await getDb();
  const attempt = await startAttempt(db, ctx.user.id, ctx.team.id, slug);
  const racing = raceId ? await markRaceAttempt(db, ctx.user.id, ctx.team.id, attempt.id, raceId, slug) : false;
  return { attempt: { id: attempt.id, status: attempt.status, hintsUsed: attempt.hintsUsed, racing } };
});
