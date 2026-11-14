import { neonConfig, Pool } from "@neondatabase/serverless";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import ws from "ws";

const configuredMigrationUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
const migrationUrl = configuredMigrationUrl && !new URL(configuredMigrationUrl).hostname.includes("-pooler")
  ? configuredMigrationUrl
  : process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error("Set DATABASE_URL or DATABASE_URL_UNPOOLED before running production migrations.");
}
if (!configuredMigrationUrl || configuredMigrationUrl.includes("-pooler")) {
  console.warn("DATABASE_URL_UNPOOLED is not set; running migrations with DATABASE_URL.");
}

async function migrateProduction() {
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: migrationUrl, max: 1 });
  let needsSchemaPush = false;
  try {
    const { rows } = await pool.query(
      "SELECT to_regclass('public.users') AS users_table, to_regclass('public.products') AS products_table, to_regclass('drizzle.__drizzle_migrations') AS drizzle_migrations, to_regclass('public.__drizzle_migrations') AS public_migrations",
    );
    const state = rows[0] as {
      users_table: string | null;
      products_table: string | null;
      drizzle_migrations: string | null;
      public_migrations: string | null;
    };
    const historyTable = state.drizzle_migrations || state.public_migrations;
    const existingApplicationSchema = Boolean(state.users_table || state.products_table);
    let migrationCount = 0;
    if (historyTable) {
      const { rows: migrationRows } = await pool.query(
        `SELECT count(*)::int AS count FROM ${historyTable}`,
      );
      migrationCount = Number((migrationRows[0] as { count: number }).count);
    }
    if (existingApplicationSchema && migrationCount === 0) {
      needsSchemaPush = true;
    }
  } finally {
    await pool.end();
  }

  const cli = resolve("node_modules", "drizzle-kit", "bin.cjs");
  const command = needsSchemaPush ? "push" : "migrate";
  if (needsSchemaPush) {
    console.warn("No Drizzle migration history was found; synchronizing the existing database schema before the build.");
  }
  const result = spawnSync(process.execPath, [cli, command], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL_UNPOOLED: migrationUrl },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

migrateProduction().catch((error: unknown) => {
  console.error("Production migration failed:", error);
  process.exitCode = 1;
});
