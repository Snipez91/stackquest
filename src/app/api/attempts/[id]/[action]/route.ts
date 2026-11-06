import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { answerQuestion, completeAttempt, requestHint, revealSolution, saveDraft, submitPractical, viewRefresher } from "@/server/learning";

export const dynamic = "force-dynamic";

type P = { id: string; action: string };

export const POST = route<unknown, P>(async (ctx, req, { id, action }) => {
  const db = await getDb();
  const body = (await readJson(req)) as Record<string, unknown>;
  switch (action) {
    case "hint":
      return requestHint(db, ctx.user.id, id, z.number().int().parse(body.index));
    case "refresher":
      return { refresher: await viewRefresher(db, ctx.user.id, id) };
    case "solution":
      return revealSolution(db, ctx.user.id, id);
    case "draft":
      await saveDraft(db, ctx.user.id, id, body.draft);
      return { ok: true };
    case "practical":
      return submitPractical(db, ctx.user.id, id, body.payload, z.string().max(100).parse(body.idempotencyKey));
    case "answer":
      return answerQuestion(db, ctx.user.id, id, z.string().max(80).parse(body.questionId), body.answer);
    case "complete":
      return completeAttempt(db, ctx.user.id, id);
    default:
      throw new AppError("not_found", "Unknown action.");
  }
});
