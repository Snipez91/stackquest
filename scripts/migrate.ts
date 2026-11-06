// Applies SQL migrations in ./drizzle to DATABASE_URL (or local PGlite when unset).
// The app also migrates on first connection unless AUTO_MIGRATE=false.
import path from "node:path";

async function main() {
  const folder = path.join(process.cwd(), "drizzle");
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const url = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString: url, ssl: url.includes("localhost") || process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" } });
    await migrate(drizzle(pool), { migrationsFolder: folder });
    await pool.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
    await migrate(drizzle(client), { migrationsFolder: folder });
    await client.close();
  }
  console.log("Migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
