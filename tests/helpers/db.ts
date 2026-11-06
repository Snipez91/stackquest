import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import { __setTestDb, type Db } from "@/server/db";
import { signUp } from "@/server/auth/core";

/** Fresh in-memory Postgres (PGlite) with the real migrations applied. */
export async function testDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  __setTestDb(db as unknown as Db);
  return db as unknown as Db;
}

let n = 0;
export async function makeUser(db: Db, name = "Learner", tz = "UTC") {
  n++;
  return signUp(db, { email: `user${n}-${Date.now()}@example.test`, password: "correct horse battery", displayName: `${name} ${n}`, timezone: tz }, `ip-${n}`);
}
