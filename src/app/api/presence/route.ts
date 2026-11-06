import { route } from "@/server/api";
import { getDb } from "@/server/db";
import { onlineMembers, unreadTotals } from "@/server/chat";

export const dynamic = "force-dynamic";

export const GET = route(async (ctx) => {
  const db = await getDb();
  const [online, unread] = await Promise.all([onlineMembers(db, ctx.user.id, ctx.team.id), unreadTotals(db, ctx.user.id, ctx.team.id)]);
  return { online, ...unread };
});
