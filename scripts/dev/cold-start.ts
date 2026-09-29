/**
 * Where a cold start's server time goes (docs/decisions.md 2026-09-29, the logo round): one fresh process, the
 * same steps the root layout and Now run for a signed-in person, each timed. Read-only: it reads one account's
 * Now and writes nothing. Run it as
 *
 *   npx tsx --env-file=.env.local scripts/dev/cold-start.ts "<display name>"
 *
 * The name picks the account (the development browser's own by default). What it cannot see is the framework's
 * share (loading the server's bundle and rendering the page to HTML); the browser's navigation timing has that.
 */
const started = performance.now();
const since = (t: number) => Math.round(performance.now() - t);

async function main() {
  const name = process.argv[2] ?? "Claude Code (localhost)";
  let t = performance.now();
  const { db, schema } = await import("@/db");
  const { eq, sql } = await import("drizzle-orm");
  const dbLoad = since(t);

  t = performance.now();
  const { nowFor } = await import("@/lib/ledger/home");
  const { passThePhoneStatus } = await import("@/lib/ledger/pass-the-phone");
  const { closesLabel } = await import("@/lib/ui/copy");
  const appLoad = since(t);

  t = performance.now();
  await db.execute(sql`select 1`);
  const connect = since(t);

  t = performance.now();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.displayName, name)).limit(1);
  const session = since(t);
  if (!user) throw new Error(`no account named ${name}`);

  t = performance.now();
  await passThePhoneStatus(user.id);
  const pass = since(t);

  // Every call to the indexer goes through fetch; time them where they are made.
  const indexer: number[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const f = performance.now();
    try {
      return await realFetch(...args);
    } finally {
      indexer.push(since(f));
    }
  }) as typeof fetch;

  const runs: number[] = [];
  const now = new Date();
  for (let i = 0; i < 3; i += 1) {
    t = performance.now();
    await nowFor(user, { now, closes: (at) => closesLabel(at, now, "America/New_York"), zone: "America/New_York" });
    runs.push(since(t));
  }
  globalThis.fetch = realFetch;

  console.log(JSON.stringify({ "loading the database client": dbLoad, "loading Now's modules": appLoad, "first connection": connect, "the session's account": session, "pass the phone": pass, "Now's data, three runs": runs, "indexer calls (ms each)": indexer, total: since(started) }, null, 2));
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
