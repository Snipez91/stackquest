import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { listMessages, postMessage } from "@/server/chat";

export const dynamic = "force-dynamic";

export const GET = route(async (ctx, req) => {
  const u = new URL(req.url);
  const channelId = u.searchParams.get("channel") ?? "";
  const iso = z.string().datetime({ offset: true }).optional();
  const before = iso.parse(u.searchParams.get("before") ?? undefined);
  const after = iso.parse(u.searchParams.get("after") ?? undefined);
  const r = await listMessages(await getDb(), ctx.user.id, channelId, { before, after, limit: 50 });
  return { channel: { id: r.channel.id, name: r.channel.name, kind: r.channel.kind, key: r.channel.key }, messages: r.messages, hasMore: r.hasMore };
});

export const POST = route(async (ctx, req) => {
  const body = z.object({ channelId: z.string(), body: z.string().max(10_000), clientId: z.string().max(64) }).parse(await readJson(req, 20_000));
  return postMessage(await getDb(), ctx.user.id, body.channelId, body);
});
