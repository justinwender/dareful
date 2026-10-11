/**
 * Pre-submission bug fixes 1 (2026-10-10): a new account's first screens draw, the tips put back what they moved and run
 * as one on every screen, email says why it did not go, a line to the owner is kept until it goes, Dynamic's test
 * sign-ins are left out of counts and never emailed, and Dynamic's sandbox has a line. Pure, or a read of the source where
 * the rule is a line of a component.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PAGE_LAYER } from "@/components/ledger/screen";
import { forbiddenClasses, forbiddenOn } from "@/lib/ui/layers";
import { scrollAfterRun, tipsFor, ASK_TARGET } from "@/lib/ui/tips";
import { infoSheet } from "@/lib/ui/info-sheets";
import { isTestEmail, isTestPhone, isTestSignIn } from "@/lib/auth/test-sign-in";
import { COUNTED_SKIPS, loginEmail, missesLine, sendEmail, type AddressRead } from "@/lib/notify/channels";
import { emailSkipOf } from "@/lib/notify";
import { emailLineFirst } from "@/lib/ops/health";
import { hereEnv } from "@/lib/ops/here";
import { lateText, UNTOLD_KEEP_MS, UNTOLD_PER_RUN } from "@/lib/ops/untold";
import { LINES } from "@/lib/ops/lines";
import { dynamicUsersLevel } from "@/lib/ops/runway";
import type { Notice } from "@/lib/notify/messages";
import { guardPool, heardBack, stalled } from "@/db/pool";
import { recordedHow } from "@/lib/ledger/markets";
import type postgres from "postgres";

const read = (f: string) => readFileSync(f, "utf8");

// ------------------------------------------------------------------------------------------ section 0

test("a new account's first screens draw: the page is a layer of its own, by opacity and never a transform, so a fixed layer inside it before the app runs is still fixed (section 0)", () => {
  assert.deepEqual(PAGE_LAYER, { willChange: "opacity" });
  assert.deepEqual(forbiddenOn(PAGE_LAYER), [], "opacity captures no fixed layer");
  assert.notDeepEqual(forbiddenOn({ willChange: "transform" }), [], "the rule still refuses a transform");
  assert.ok(read("src/components/ledger/screen.tsx").includes('<main data-page={layer ?? ""} data-arrive={how} style={PAGE_LAYER}'), "every screen's page wears it");
  assert.ok(read("src/components/auth/wallet-bootstrap.tsx").includes('data-account-setup=""'), "the name step is marked, so the tips wait for it");
});

test("the one will-change above a fixed layer is opacity: any other name, inline or as a class, is refused (section 0, as the owner asked before the commit)", () => {
  // A fixed layer is inside the page until the app runs, under the page's own will-change: nothing but opacity may stand there.
  for (const ok of ["opacity", "auto", " Opacity "]) assert.deepEqual(forbiddenOn({ willChange: ok }), [], ok);
  for (const no of ["scroll-position", "contents", "opacity, scroll-position", "left"]) assert.notDeepEqual(forbiddenOn({ "will-change": no }), [], no);
  assert.deepEqual(forbiddenClasses("will-change-auto will-change-[opacity] [will-change:opacity] [will-change:auto]"), []);
  assert.deepEqual(forbiddenClasses("will-change-scroll will-change-contents will-change-[left] [will-change:left] [will-change:opacity,left]"), ["will-change-scroll", "will-change-contents", "will-change-[left]", "[will-change:left]", "[will-change:opacity,left]"]);
});

test("a run of tips puts back what it moved and ends with its screen: the scroll it made is undone, a tip that cannot be pointed at is skipped at once, and a new address ends it (section 0)", () => {
  assert.equal(scrollAfterRun(120, 400), 120, "a run that scrolled the page puts it back");
  assert.equal(scrollAfterRun(120, 120), null, "a run that moved nothing moves nothing");
  assert.equal(scrollAfterRun(0, 0.5), null, "under a pixel is where it began");
  assert.equal(scrollAfterRun(0, 1), 0);
  assert.equal(scrollAfterRun(null, 400), null, "no run, nothing to put back");
  const src = read("src/components/ui/first-tips.tsx");
  assert.ok(src.includes("    const back = restore ? scrollAfterRun(startScroll.current, scrollTopOf()) : null;"), "the run's end reads where it began");
  assert.ok(src.includes("    if (back !== null) scrollPageTo(back);"), "and goes back there");
  assert.ok(src.includes("      if (!tip) return endRun(true);"), "a run whose tips ran out ends");
  assert.ok(src.includes("        return at < rest.length ? setTips(rest) : endRun(true);"), "the last one that cannot be pointed at ends the run, not leaves it standing");
  assert.ok(src.includes("  const next = () => (last ? endRun(true) : setAt(at + 1));"), "after the last, the screen is as it was");
  assert.ok(src.includes("    if (showing.current) endRun(false);"), "no tip outlives its screen");
  assert.ok(src.includes("      const counts = (selector: string) => shown(selector) !== null || inPage(selector, page) !== null;"), "a run counts only its own screen's controls");
  assert.ok(src.includes("      const there = inPage(tip.target, runPage.current);"), "and looks for them only in its own page");
});

test("every screen's tips run as one, however many: there is no limit of three a visit (section 0)", () => {
  const ask = infoSheet("ask-question");
  assert.ok(ask, "the asking screen has its sheet");
  const all = tipsFor(ask, () => true, { key: "ask-question" });
  assert.ok(all.length > 3, `every tip the screen has, ${all.length} of them`);
  assert.equal(new Set(all.map((t) => t.key)).size, all.length, "each once");
  assert.ok(!read("src/lib/ui/tips.ts").includes("TIPS_AT_MOST"), "the limit is gone");
  assert.equal(tipsFor(ask, (s) => s !== ASK_TARGET, { key: "ask-question" }).length, all.length, "the asking screen's own set does not lean on the +");
});

// ------------------------------------------------------------------------------------------ section 1

const NOTICE: Notice = { title: "Gabe settled up", body: "Gabe settled the pizza.", url: "https://dareful.app/p/x" };

/** Runs `f` with these variables set (undefined removes one) and puts every one back. */
async function withEnv<T>(vars: Record<string, string | undefined>, f: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
  try {
    return await f();
  } finally {
    for (const [k, v] of Object.entries(before)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test("Dynamic's test sign-ins are known by their address or number: +dynamic_test right before the @, or a US number with the 555 area code (section 3)", () => {
  assert.equal(isTestEmail("judge+dynamic_test@example.com"), true);
  assert.equal(isTestEmail("Judge+Dynamic_Test@dareful.app"), true, "in any case");
  assert.equal(isTestEmail("judge+dynamic_test.x@example.com"), false, "only right before the @");
  assert.equal(isTestEmail("judge@example.com"), false);
  assert.equal(isTestEmail(null), false);
  assert.equal(isTestPhone("+15551234242"), true);
  assert.equal(isTestPhone("+1 (555) 123-4242"), true, "any spelling of it");
  assert.equal(isTestPhone("+15161234242"), false, "another area code");
  assert.equal(isTestPhone("+445551234242"), false, "another country");
  assert.equal(isTestPhone(undefined), false);
  assert.equal(isTestSignIn({ email: "a+dynamic_test@example.com", verified_credentials: [] }), true, "the token's email");
  assert.equal(isTestSignIn({ verified_credentials: [{ format: "email", email: "a+dynamic_test@dareful.app" }] }), true, "an email credential's");
  assert.equal(isTestSignIn({ verified_credentials: [] }, "+15550001111"), true, "the phone it vouches for");
  assert.equal(isTestSignIn({ email: "a@example.com", verified_credentials: [{ format: "oauth", oauth_emails: ["a+dynamic_test@gmail.com"] }] }, "+15161234242"), false, "a Google address is never a test sign-in");
  const route = read("src/app/api/session/route.ts");
  assert.ok(route.includes("phoneHash, excludedFromCounts: testSignIn })"), "left out from the moment the account is made");
  assert.ok(route.includes("if (testSignIn && !existing.excludedFromCounts) await db.update(schema.users).set({ excludedFromCounts: true })"), "and one made before, the next time it signs in");
});

test("a lookup of someone's address that fails says why, as an error, never a quiet null (section 1)", async () => {
  const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const errors: unknown[][] = [];
  const was = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    await withEnv({ NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: "env-test", DYNAMIC_API_TOKEN: "token-test" }, async () => {
      assert.deepEqual(await loginEmail("dyn-1", answer(200, { user: { email: "gabe@example.com" } })), { address: "gabe@example.com" });
      assert.deepEqual(await loginEmail("dyn-1", answer(200, { user: { email: null, verifiedCredentials: [] } })), { none: true }, "a phone login has no address, and that is no failure");
      assert.equal(errors.length, 0);
      assert.deepEqual(await loginEmail("dyn-1", answer(401, {})), { failed: "Dynamic answered 401" });
      assert.deepEqual(await loginEmail("dyn-1", answer(200, ["not a user"])), { failed: "Dynamic's answer had a shape this cannot read" });
      const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      assert.deepEqual(await loginEmail("dyn-1", (async () => Promise.reject(timeout)) as unknown as typeof fetch), { failed: "Dynamic did not answer in 5 seconds" });
      assert.equal(errors.length, 3, "each failure is an error in the log");
      assert.ok(errors.every((e) => e[0] === "reading a login email failed"));
      assert.deepEqual(await loginEmail("seed:gabe", answer(500, {})), { none: true }, "a seed account has no Dynamic record and is never looked up");
    });
    await withEnv({ DYNAMIC_API_TOKEN: undefined }, async () => {
      assert.deepEqual(await loginEmail("dyn-1", answer(200, { user: { email: "gabe@example.com" } })), { failed: "DYNAMIC_API_TOKEN is not set" });
    });
  } finally {
    console.error = was;
  }
});

test("an email that does not go says why, and only email failing counts against it: off in production, an address unread, Resend refusing (section 1)", async () => {
  const sent: string[] = [];
  const counted: boolean[] = [];
  const deps = (address: AddressRead, error: { name: string } | null = null) => ({
    read: async () => address,
    send: async (m: { to: string }) => (sent.push(m.to), { error }),
    record: async (_c: "email" | "push", _k: "notice" | "ops", ok: boolean) => void counted.push(ok),
  });
  const was = console.error;
  console.error = () => undefined;
  try {
    await withEnv({ VERCEL_ENV: undefined, EMAIL_FROM: undefined }, async () => {
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ address: "gabe@example.com" })), { went: false, skip: "not_production" }, "a laptop has email off on purpose");
    });
    await withEnv({ VERCEL_ENV: "production", EMAIL_FROM: undefined, RESEND_API_KEY: "re_test" }, async () => {
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ address: "gabe@example.com" })), { went: false, skip: "off", cause: "EMAIL_FROM not set" }, "production with no sender is email off, named");
    });
    await withEnv({ VERCEL_ENV: "production", EMAIL_FROM: "Dareful <hello@dareful.app>", RESEND_API_KEY: "re_test" }, async () => {
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ failed: "Dynamic answered 401" })), { went: false, skip: "unread", cause: "Dynamic answered 401" });
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ none: true })), { went: false, skip: "no_address" });
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ address: "judge+dynamic_test@example.com" })), { went: false, skip: "test_account" }, "a test sign-in is never emailed");
      assert.deepEqual(sent, [], "nothing was handed to Resend yet");
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ address: "gabe@example.com" }, { name: "validation_error" })), { went: false, skip: "refused", cause: "Resend said validation_error" });
      assert.deepEqual(await sendEmail("u", NOTICE, deps({ address: "gabe@example.com" })), { went: true });
      assert.deepEqual(sent, ["gabe@example.com", "gabe@example.com"]);
      assert.deepEqual(counted, [false, true], "both sends counted for the quota, and only the sends");
      const thrown = { read: async () => ({ address: "gabe@example.com" }), send: async () => Promise.reject(new TypeError("fetch failed")), record: async () => undefined };
      assert.deepEqual(await sendEmail("u", NOTICE, thrown), { went: false, skip: "refused", cause: "Resend said unreachable: TypeError" }, "a send that throws is refused, never thrown");
      const unreadable = { read: async () => Promise.reject(new Error("pool")), record: async () => undefined };
      assert.deepEqual(await sendEmail("u", NOTICE, unreadable), { went: false, skip: "unread", cause: "the account could not be read (Error)" });
    });
  } finally {
    console.error = was;
  }
  assert.deepEqual([...COUNTED_SKIPS], ["off", "unread", "refused"]);
  assert.deepEqual(emailSkipOf({ went: true }), null);
  assert.deepEqual(emailSkipOf(null), null, "push carried it, so no email was meant to go");
  assert.deepEqual(emailSkipOf({ went: false, skip: "refused", cause: "x".repeat(300) }), { emailSkipped: "refused", emailSkipCause: "x".repeat(120) });
  assert.deepEqual(emailSkipOf({ went: false, skip: "test_account" }), { emailSkipped: "test_account", emailSkipCause: null });
  const deliver = read("src/lib/notify/index.ts");
  assert.ok(deliver.includes("if (channels.length > 0 || skip) await db.update(schema.notificationLog).set({ ...(channels.length > 0 ? { channels } : {}), ...(skip ?? {}) })"), "the reason is kept on the notice");
});

test("the health check's email line is down when email is not set up, and in production when a counted notice missed its email over the day (section 1)", () => {
  assert.deepEqual(emailLineFirst({ env: "production", missing: "EMAIL_FROM", missed: null }), { down: "EMAIL_FROM not set" });
  assert.deepEqual(emailLineFirst({ env: "local", missing: "RESEND_API_KEY and EMAIL_FROM", missed: null }), { down: "RESEND_API_KEY and EMAIL_FROM not set" }, "named, wherever it runs");
  assert.deepEqual(emailLineFirst({ env: "production", missing: null, missed: "2 notices in the last day did not go by email: 2 refused" }), { down: "2 notices in the last day did not go by email: 2 refused" });
  assert.equal(emailLineFirst({ env: "preview", missing: null, missed: "1 notice" }), null, "only production's misses are production's");
  assert.equal(emailLineFirst({ env: "production", missing: null, missed: null }), null, "then Resend is asked about the domain");
  assert.equal(missesLine([]), null);
  assert.equal(missesLine([{ skip: "test_account", cause: null, n: 4 }, { skip: "no_address", cause: null, n: 2 }]), null, "a test sign-in and a phone login are not email failing");
  assert.equal(
    missesLine([
      { skip: "unread", cause: "Dynamic answered 401", n: 2 },
      { skip: "refused", cause: "Resend said validation_error", n: 1 },
      { skip: "unread", cause: "Dynamic did not answer in 5 seconds", n: 1 },
      { skip: "off", cause: "EMAIL_FROM not set", n: 1 },
    ]),
    "5 notices in the last day did not go by email: 3 address unread (Dynamic answered 401 2; Dynamic did not answer in 5 seconds 1), 1 email off (EMAIL_FROM not set), 1 refused (Resend said validation_error)",
  );
  assert.equal(missesLine([{ skip: "refused", cause: null, n: 1 }]), "1 notice in the last day did not go by email: 1 refused");
  assert.equal(hereEnv({ VERCEL_ENV: "production" }), "production");
  assert.equal(hereEnv({}), "local");
});

test("a line to the owner no channel carried is kept and sent late, oldest first, a few a run, for three days at most (section 1)", () => {
  const at = new Date("2026-10-10T12:00:00Z");
  assert.equal(lateText("The canary failed.", at), "This could not be sent at 12:00 UTC on 2026-10-10, when it happened, and is sent now that email goes.\n\nThe canary failed.");
  assert.equal(UNTOLD_KEEP_MS, 3 * 86_400_000);
  assert.equal(UNTOLD_PER_RUN, 5);
  for (const [file, line] of [
    ["src/lib/ops/canary.ts", "    const tell = deps.tell ?? ((subject: string, text: string) => tellOrKeep(subject, text));"],
    ["src/lib/chain/reconcile.ts", "  return tellOrKeep(subject, text);"],
    ["src/lib/chain/delegated-signer.ts", "  return tellOrKeep(subject, text);"],
    ["src/lib/ops/morning.ts", "  if (!went) await keep(subject, text, now);"],
    ["src/lib/ops/tick.ts", "  const late = (await tellKept(now).catch(say(\"the kept lines could not be sent\"))) ?? 0;"],
  ] as const)
    assert.ok(read(file).includes(line), `${file} keeps what did not go`);
  // The alerts and the failing chain writes count as told only once a channel carried them, and stay due until then.
  assert.ok(read("src/lib/ops/alerts.ts").includes("  if (!went) return [];"));
  assert.ok(read("src/lib/chain/failures.ts").includes("  if (told)\n    await db"));
});

test("Dynamic's sandbox has a line: warned at 700 of its 1,000 users and urgent at 900, past which nobody new can sign in (section 3)", () => {
  assert.deepEqual([LINES.dynamic.limit, LINES.dynamic.warn, LINES.dynamic.urgent], [1_000, 700, 900]);
  assert.deepEqual([dynamicUsersLevel(37).state, dynamicUsersLevel(699).state, dynamicUsersLevel(700).state, dynamicUsersLevel(899).state, dynamicUsersLevel(900).state], ["ok", "ok", "warn", "warn", "urgent"]);
  assert.equal(dynamicUsersLevel(37).reading, "37 of 1,000");
  assert.equal(dynamicUsersLevel(912).why, "Dynamic's sandbox holds 912 of its 1,000 users");
  assert.equal(dynamicUsersLevel(37).why, null);
});

// ------------------------------------------------------------------------------------------ section 2

/** A stand-in for postgres.js: every query and transaction is held until the test answers it, and ending it fails what it holds. */
function standIn(name: string) {
  const held: Array<{ what: string; ok: (v: unknown) => void; no: (e: unknown) => void }> = [];
  let ended = false;
  const hold = (what: string) => new Promise((ok, no) => held.push({ what, ok, no }));
  const sql = {
    options: { parsers: {} as Record<string, unknown>, serializers: {} as Record<string, unknown>, prepare: false },
    unsafe: (s: string) => Object.assign(hold(`${name}:${s}`), { values() { return this; } }),
    begin: () => hold(`${name}:begin`),
    end: async () => {
      ended = true;
      for (const h of held.splice(0)) h.no(Object.assign(new Error("destroyed"), { code: "CONNECTION_DESTROYED" }));
    },
  };
  return { sql: sql as unknown as postgres.Sql, held, ended: () => ended };
}
const tick = () => new Promise((r) => setImmediate(r));
const answer = async (pool: ReturnType<typeof standIn>, what: string) => {
  const i = pool.held.findIndex((h) => h.what === what);
  assert.ok(i >= 0, `${what} is held`);
  pool.held.splice(i, 1)[0]?.ok([]);
  await tick();
};

test("the guard never hands the driver more than it has connections: the rest wait in order, and transactions leave one free for reads (section 2)", async () => {
  const pool = standIn("a");
  const guard = guardPool(() => pool.sql, { slots: 3, stallMs: 60_000 });
  const q = (s: string) => (guard.client.unsafe(s) as unknown as Promise<unknown>).catch(() => undefined);
  void q("1");
  void q("2");
  void q("3");
  void q("4");
  void q("5");
  await tick();
  assert.deepEqual(pool.held.map((h) => h.what), ["a:1", "a:2", "a:3"], "three in flight, never more");
  assert.deepEqual(guard.stats(), { inFlight: 3, waiting: 2, replaced: 0 });
  await answer(pool, "a:1");
  assert.deepEqual(pool.held.map((h) => h.what), ["a:2", "a:3", "a:4"], "the next one goes when one answers, in order");
  await answer(pool, "a:2");
  await answer(pool, "a:3");
  await answer(pool, "a:4");
  await answer(pool, "a:5");
  assert.deepEqual(guard.stats(), { inFlight: 0, waiting: 0, replaced: 0 });
  const t = (n: number) => (guard.client.begin as unknown as () => Promise<unknown>)().catch(() => n);
  void t(1);
  void t(2);
  void t(3);
  void q("after");
  await tick();
  assert.deepEqual(pool.held.map((h) => h.what), ["a:begin", "a:begin", "a:after"], "two transactions of three slots, and the read behind the waiting third goes past it");
  await answer(pool, "a:begin");
  assert.deepEqual(pool.held.map((h) => h.what), ["a:begin", "a:after", "a:begin"], "the third transaction goes when one ends");
  assert.throws(() => (guard.client as unknown as (s: TemplateStringsArray) => unknown)`select 1`, /through drizzle/, "a tagged query would skip the guard");
  await guard.client.end();
});

test("a pool that stops answering is replaced: what it held fails at once and what waited goes to a fresh one, while a long transaction, a full pool of slow statements or a queue behind the relayer's lock is no stall (section 2)", async () => {
  let clock = 1_000_000;
  const pools: Array<ReturnType<typeof standIn>> = [];
  const replaced: string[] = [];
  // Three slots, two of them for transactions.
  const guard = guardPool(() => (pools.push(standIn(`p${pools.length}`)), (pools.at(-1) as ReturnType<typeof standIn>).sql), { slots: 3, stallMs: 10_000, now: () => clock, onReplace: (why) => void replaced.push(why) });
  const first = pools[0] as ReturnType<typeof standIn>;
  const drizzles = (v: unknown) => v;
  first.sql.options.parsers["1184"] = drizzles;
  const failed: string[] = [];
  const q = (s: string) => (guard.client.unsafe(s) as unknown as Promise<unknown>).catch((e: { code?: string }) => void failed.push(`${s}:${e.code}`));
  const begin = () => void (guard.client.begin as unknown as () => Promise<unknown>)().catch(() => undefined);
  begin();
  await tick();
  clock += 60_000;
  assert.equal(guard.check(), false, "a transaction a minute long is the app at work");
  void q("slow");
  begin();
  await tick();
  clock += 15_000;
  assert.equal(guard.check(), false, "every slot busy for fifteen seconds with nothing waiting: a statement waiting on a lock is the app at work");
  await answer(first, "p0:slow");
  begin();
  await tick();
  assert.deepEqual(guard.stats(), { inFlight: 2, waiting: 1, replaced: 0 }, "a third transaction waits, with the read slot free");
  clock += 15_000;
  assert.equal(guard.check(), false, "transactions queued behind each other with a slot left for reads (the relayer's lock on a hung node) are the app at work");
  void q("read");
  void q("waits");
  await tick();
  clock += 5_000;
  await answer(first, "p0:begin");
  clock += 7_000;
  assert.equal(guard.check(), false, "a read twelve seconds waiting, but something answered seven seconds ago");
  clock += 3_000;
  assert.equal(guard.check(), true, "every slot busy, a read ten seconds waiting for one, and nothing answered in that time");
  await tick();
  assert.deepEqual([pools.length, first.ended(), replaced.length], [2, true, 1]);
  assert.deepEqual(failed, ["read:CONNECTION_DESTROYED"], "what the stalled pool held failed at once");
  const fresh = pools[1] as ReturnType<typeof standIn>;
  assert.equal(fresh.sql.options.parsers["1184"], drizzles, "the fresh pool reads values the way drizzle set the first to");
  assert.deepEqual(fresh.held.map((h) => h.what), ["p1:waits"], "what waited goes to the fresh pool");
  void q("next");
  await tick();
  assert.deepEqual(fresh.held.map((h) => h.what), ["p1:waits", "p1:next"], "and so does what comes after");
  assert.deepEqual(guard.stats(), { inFlight: 2, waiting: 0, replaced: 1 });
  await guard.client.end();
});

test("a stall is every slot busy and something waiting with nothing answered for the whole time, and a refusal is an answer while a dead connection is not (section 2)", () => {
  assert.equal(stalled({ fullSince: 0, oldestWaiting: null, lastAnswer: 0, now: 60_000, stallMs: 10_000 }), false, "nothing waiting, however long every slot has been busy");
  assert.equal(stalled({ fullSince: 0, oldestWaiting: 50_000, lastAnswer: 0, now: 59_999, stallMs: 10_000 }), false);
  assert.equal(stalled({ fullSince: 0, oldestWaiting: 50_000, lastAnswer: 0, now: 60_000, stallMs: 10_000 }), true);
  assert.equal(stalled({ fullSince: null, oldestWaiting: 0, lastAnswer: 0, now: 60_000, stallMs: 10_000 }), false, "a slot free: what waits is a transaction behind the others");
  assert.equal(stalled({ fullSince: 59_000, oldestWaiting: 0, lastAnswer: 0, now: 60_000, stallMs: 10_000 }), false, "a wait counts from when the last slot was taken: a read taking it is no stall");
  assert.equal(stalled({ fullSince: 0, oldestWaiting: 0, lastAnswer: 50_001, now: 60_000, stallMs: 10_000 }), false, "something answered within the time");
  assert.equal(heardBack(Object.assign(new Error("duplicate key"), { code: "23505", severity: "ERROR" })), true);
  assert.equal(heardBack(new Error("not allowed")), true, "the app's own error inside a transaction");
  for (const code of ["CONNECTION_CLOSED", "CONNECTION_DESTROYED", "CONNECTION_ENDED", "CONNECT_TIMEOUT", "ECONNRESET", "ETIMEDOUT"]) assert.equal(heardBack(Object.assign(new Error(code), { code })), false, code);
  const index = read("src/db/index.ts");
  assert.ok(index.includes("export const db = drizzle(guard.client, { schema });"), "every query in the app goes through the guard");
  assert.ok(index.includes("{ max: POOL_MAX, idle_timeout: 20, prepare: false }") && index.includes("slots: POOL_MAX,"), "as many slots as connections");
});

test("nothing inside a transaction asks the app's own client, so a transaction never waits for one of the pool's slots: every body asks through its own (section 2, as the owner asked before the commit)", () => {
  // The relayer's send lock is the one exception, on purpose and out of this body's sight: its writes go through the
  // app's client so they stand even if the send under the lock fails, and they take the slot no transaction can hold.
  const files = (readdirSync("src", { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/${f}`);
  const bodies: Array<{ where: string; body: string }> = [];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/\.transaction\(\s*async\s*\(\w+\)\s*=>\s*\{/g)) {
      let i = (m.index ?? 0) + m[0].length;
      let depth = 1;
      for (; depth > 0 && i < text.length; i += 1) depth += text[i] === "{" ? 1 : text[i] === "}" ? -1 : 0;
      bodies.push({ where: `${file}:${text.slice(0, m.index).split("\n").length}`, body: text.slice((m.index ?? 0) + m[0].length, i - 1) });
    }
  }
  assert.ok(bodies.length >= 20, `every transaction in the app is read (${bodies.length})`);
  for (const b of bodies) {
    assert.ok(!/(?<![\w.])db\./.test(b.body), `${b.where} asks the app's client from inside a transaction`);
    assert.ok(!/(?<![\w.])record\(/.test(b.body), `${b.where} counts usage from inside a transaction`);
  }
});

// ------------------------------------------------------------------------------------------ section 3

test("a decided question's record says how it was decided: no ruling is the votes, a final score's ruling is the final score's and any other the tiebreaker's, whatever the caller expected (section 3)", () => {
  const dare = { aiOutcome: null, aiRationale: null, kind: "binary" as const, outcomeLabels: [] as string[], pace: "dare" as const };
  const FEED = "0x" + "aa".repeat(32);
  const OTHER = "0x" + "bb".repeat(32);
  const writes = [{ rulingHash: FEED, rulingText: "Decided by the final score, as the terms said. Bills 24, Jets 17." }];
  assert.deepEqual(recordedHow(dare, null, { by: "feed", rulingHash: FEED as `0x${string}` }, writes), { by: "quorum" }, "no ruling on the chain is the quorum's, whoever asked");
  assert.deepEqual(recordedHow(dare, FEED, undefined, writes), { by: "feed", rulingText: writes[0]?.rulingText, rulingHash: FEED }, "the final score's own record, with its words");
  assert.deepEqual(recordedHow(dare, FEED.toUpperCase().replace("0X", "0x"), undefined, writes).by, "feed", "in any case");
  assert.deepEqual(recordedHow(dare, OTHER, undefined, writes), { by: "arbitration" }, "a ruling no final-score write carried is the tiebreaker's");
  assert.deepEqual(recordedHow(dare, FEED, { by: "arbitration", rulingHash: OTHER as `0x${string}` }, writes).by, "feed", "the record outranks a caller expecting the tiebreaker");
  assert.deepEqual(recordedHow(dare, OTHER, { by: "feed", rulingText: "x", rulingHash: FEED as `0x${string}` }, writes), { by: "arbitration" }, "and a caller expecting the final score");
  const given = { by: "arbitration" as const, rulingText: "The tiebreaker's words.", rulingHash: OTHER as `0x${string}` };
  assert.deepEqual(recordedHow(dare, OTHER, given, writes), given, "the caller's own write, landed, keeps its words");
  const markets = read("src/lib/ledger/markets.ts");
  assert.ok(markets.includes("  const settled = recordedHow(d, indexed.rulingHash ?? null, how, feedWrites);"), "every reconcile reads the record");
  const feed = read("src/lib/sports/index.ts");
  assert.ok(feed.includes('if ((await marketById(d.id))?.resolvedBy === "feed") return { txHash: "0x" as Hex, voided };'), "a final-score write that landed though its send failed counts as settled, not decided meanwhile");
});
