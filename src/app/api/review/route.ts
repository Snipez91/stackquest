import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { publicQuestion } from "@/lib/grading";
import { reviewQueue, submitReview } from "@/server/learning";

export const dynamic = "force-dynamic";

export const GET = route(async (ctx) => {
  const q = await reviewQueue(await getDb(), ctx.user.id, ctx.team.id, ctx.user.timezone);
  // Answers stay on the server until the learner has tried.
  return { ...q, items: q.items.map((i) => ({ ...i, question: publicQuestion(i.question) })) };
});

export const POST = route(async (ctx, req) => {
  const b = z
    .object({ itemId: z.string().max(120), answer: z.unknown(), confidence: z.enum(["unsure", "okay", "confident"]).default("okay") })
    .parse(await readJson(req));
  return submitReview(await getDb(), ctx.user.id, ctx.team.id, ctx.user.timezone, b.itemId, b.answer, b.confidence);
});
