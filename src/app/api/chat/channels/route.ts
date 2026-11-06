import { z } from "zod";
import { readJson, route } from "@/server/api";
import { getDb } from "@/server/db";
import { ensureMissionChannel, listChannels } from "@/server/chat";

export const dynamic = "force-dynamic";

export const GET = route(async (ctx) => ({ channels: await listChannels(await getDb(), ctx.user.id, ctx.team.id) }));

export const POST = route(async (ctx, req) => {
  const { missionSlug } = z.object({ missionSlug: z.string().max(80) }).parse(await readJson(req));
  return { channel: await ensureMissionChannel(await getDb(), ctx.user.id, ctx.team.id, missionSlug) };
});
