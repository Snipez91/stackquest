import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { missions } from "@/content";
import type { Db } from "./db";
import { missionVersions } from "./db/schema";

/**
 * Records every mission version this deployment serves. If a mission's
 * content changes without a version bump we log loudly: historical attempts
 * reference (slug, version) and should keep meaning what they meant.
 */
export async function syncMissionVersions(db: Db) {
  const existing = await db.select().from(missionVersions);
  for (const m of missions) {
    const hash = createHash("sha256").update(JSON.stringify(m)).digest("hex");
    const row = existing.find((r) => r.slug === m.slug && r.version === m.version);
    if (!row) {
      await db
        .insert(missionVersions)
        .values({ slug: m.slug, version: m.version, track: m.track, tier: m.tier, title: m.title, contentHash: hash })
        .onConflictDoNothing();
    } else if (row.contentHash !== hash) {
      console.warn(`[content] ${m.slug} v${m.version} changed without a version bump. Bump "version" if grading changed.`);
      await db
        .update(missionVersions)
        .set({ contentHash: hash, title: m.title })
        .where(and(eq(missionVersions.slug, m.slug), eq(missionVersions.version, m.version)));
    }
  }
}
