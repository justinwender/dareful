import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The only database connection in the application. Server-side only, over DATABASE_URL (the Supabase
 * Session pooler). The browser never gets a Supabase connection, an anon key, or a client-side SDK.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const globalForDb = globalThis as unknown as { __darefulSql?: ReturnType<typeof postgres> };

const client = globalForDb.__darefulSql ?? postgres(databaseUrl(), { max: 5, prepare: true });
if (process.env.NODE_ENV !== "production") globalForDb.__darefulSql = client;

export const db = drizzle(client, { schema });
export { schema };
