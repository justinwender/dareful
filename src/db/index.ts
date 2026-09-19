import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { appDatabaseUrl } from "./url";

/**
 * The only database connection in the application. Server-side only, over DATABASE_URL, which is the Supabase
 * transaction pooler (port 6543). The browser never gets a Supabase connection, an anon key, or a client-side SDK.
 *
 * Transaction mode, because the session pooler admits fifteen clients in total and every serverless instance
 * holds its connections for as long as it lives: three warm instances exhausted it in production and the
 * fourth request got a 500 (docs/decisions.md 2026-09-18). In transaction mode a server connection is held
 * only for the length of a transaction. The price is no session state, so: no prepared statements
 * (`prepare: false`), and only transaction-scoped locks (`pg_advisory_xact_lock`, `for update` inside a
 * transaction), never session-scoped ones. Migrations are applied through Supabase and never use this client.
 */
const globalForDb = globalThis as unknown as { __darefulSql?: ReturnType<typeof postgres> };

const client = globalForDb.__darefulSql ?? postgres(appDatabaseUrl(process.env.DATABASE_URL), { max: 5, idle_timeout: 20, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__darefulSql = client;

export const db = drizzle(client, { schema });
export { schema };
