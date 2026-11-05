import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@/db/schema";

let pool: Pool | undefined;

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Add your Neon connection string to .env before starting the store.");
  }
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 1000, connectionTimeoutMillis: 10000 });
  return drizzle(pool, { schema });
}

type Database = ReturnType<typeof createDatabase>;
let instance: Database | undefined;

export const db = new Proxy({} as Database, {
  get(_target, property) {
    instance ??= createDatabase();
    const value: unknown = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function closeDb() {
  if (pool) await pool.end();
}
