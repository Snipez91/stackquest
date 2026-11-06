import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Database access. Production uses node-postgres against DATABASE_URL.
 * Without DATABASE_URL (local dev) we use PGlite — real PostgreSQL compiled to
 * WebAssembly, persisted to .data/pglite — so no Docker or local Postgres is needed.
 * Both run the same SQL migrations in ./drizzle.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db: Db; ready: Promise<void>; driver: "pg" | "pglite"; close: () => Promise<void> };

const g = globalThis as unknown as { __sqDb?: Holder };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function createHolder(): Promise<Holder> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : url.includes("localhost") ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" },
    });
    const db = drizzle(pool, { schema }) as unknown as Db;
    const ready = process.env.AUTO_MIGRATE === "false" ? Promise.resolve() : migrate(drizzle(pool, { schema }), { migrationsFolder: MIGRATIONS });
    return { db, ready, driver: "pg", close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory") (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir === "memory" ? undefined : dir);
  const raw = drizzle(client, { schema });
  const ready = migrate(raw, { migrationsFolder: MIGRATIONS });
  return { db: raw as unknown as Db, ready, driver: "pglite", close: () => client.close() };
}

let pending: Promise<Holder> | null = null;

export async function getDb(): Promise<Db> {
  if (g.__sqDb) {
    await g.__sqDb.ready;
    return g.__sqDb.db;
  }
  pending ??= createHolder().then(async (h) => {
    await h.ready;
    g.__sqDb = h;
    const { syncMissionVersions } = await import("../content-sync");
    await syncMissionVersions(h.db);
    if (process.env.DEMO_MODE === "true") {
      const { ensureDemoData } = await import("../demo");
      await ensureDemoData(h.db);
    }
    return h;
  }).catch((e) => {
    // Don't cache a failed initialisation; the next request retries.
    pending = null;
    g.__sqDb = undefined;
    throw e;
  });
  return (await pending).db;
}

export function dbDriver(): "pg" | "pglite" | null {
  return g.__sqDb?.driver ?? null;
}

/** Tests: install a pre-built database (e.g. in-memory PGlite). */
export function __setTestDb(db: Db) {
  g.__sqDb = { db, ready: Promise.resolve(), driver: "pglite", close: async () => {} };
}

export { schema };
