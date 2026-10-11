import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { appDatabaseUrl } from "./url";
import { guardPool, type Guard } from "./pool";

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
const globalForDb = globalThis as unknown as { __darefulGuard?: Guard };

/** The pool's connections, and so the queries and transactions the guard lets the driver hold at once. */
export const POOL_MAX = 5;

/**
 * Every query goes through the guard (src/db/pool.ts, pre-submission bug fixes 1): never more in flight than the pool
 * has connections, so the driver never queues one behind another, which Supabase's transaction pooler stops answering;
 * and a pool that stops answering anyway is replaced within seconds.
 */
const guard =
  globalForDb.__darefulGuard ??
  guardPool(() => postgres(appDatabaseUrl(process.env.DATABASE_URL), { max: POOL_MAX, idle_timeout: 20, prepare: false }), {
    slots: POOL_MAX,
    onReplace: (why) => console.error("the database pool stopped answering and was replaced", { why }),
  });
if (process.env.NODE_ENV !== "production") globalForDb.__darefulGuard = guard;

export const db = drizzle(guard.client, { schema });
export const dbGuard = guard;
export { schema };
