import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { markRead } from "@/server/chat";

export const dynamic = "force-dynamic";

export const POST = route(async (ctx, req) => {
  const { channelId } = z.object({ channelId: z.string() }).parse(await readJson(req));
  await markRead(await getDb(), ctx.user.id, channelId);
  return { ok: true };
});
