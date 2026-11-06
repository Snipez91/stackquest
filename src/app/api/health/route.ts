import { sql } from "drizzle-orm";
import { getDb, dbDriver } from "@/server/db";
import { missionCount } from "@/content";

export const dynamic = "force-dynamic";

/** Liveness + database check for load balancers. Exposes no user data. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: dbDriver(), missions: missionCount });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
