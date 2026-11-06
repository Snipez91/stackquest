import { sql } from "drizzle-orm";
import type { Db } from "./db";

/**
 * Fixed-window rate limiter stored in Postgres, so limits hold across server
 * instances and restarts. Returns whether the action is allowed.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfter: number }> {
  const rows = await db.execute<{ count: number; window_start: Date | string }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = (rows as unknown as { rows?: { count: number; window_start: Date | string }[] }).rows?.[0] ?? (rows as unknown as { count: number; window_start: Date | string }[])[0];
  const count = Number(row.count);
  const started = new Date(row.window_start).getTime();
  const retryAfter = Math.max(1, Math.ceil((started + windowSeconds * 1000 - Date.now()) / 1000));
  return { ok: count <= limit, retryAfter };
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`);
  }
}

export async function enforceRateLimit(db: Db, key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(db, key, limit, windowSeconds);
  if (!r.ok) throw new RateLimitError(r.retryAfter);
}
