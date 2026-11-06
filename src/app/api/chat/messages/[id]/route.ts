import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { deleteMessage, editMessage } from "@/server/chat";

export const dynamic = "force-dynamic";

export const PATCH = route<unknown, { id: string }>(async (ctx, req, { id }) => {
  const { body } = z.object({ body: z.string().max(10_000) }).parse(await readJson(req, 20_000));
  return { message: await editMessage(await getDb(), ctx.user.id, id, body) };
});

export const DELETE = route<unknown, { id: string }>(async (ctx, _req, { id }) => {
  await deleteMessage(await getDb(), ctx.user.id, id);
  return { ok: true };
});
