/**
 * The submission round (2026-10-09): a code works like its link for a guest, pass the phone for the asker and on a game
 * page's row, a market's tips run as one once the person is in, the public numbers and the day's new people, keys out
 * of every error, and the mutation runner's arithmetic and its pause. Pure, or a read of the source where the rule is
 * a line of a component.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passThePhoneShows } from "@/lib/ledger/hand-over";
import { ASK_TARGET, CURATED_TIPS, MARKET_SHEETS, runsAsOne, tipsFor, TIPS_AT_MOST } from "@/lib/ui/tips";
import { infoSheet } from "@/lib/ui/info-sheets";
import { counted, numbersCardLines, readAt } from "@/lib/ui/numbers-card";
import { LAUNCH, windowFor } from "@/lib/usage/stats";
import { KEY_MARK, redactKeys, secretValues } from "@/lib/redact";
import { guardConsole, redactArg } from "@/lib/redact-console";
import { failureWhy } from "@/lib/chain/failures";
import { storedFeedError } from "@/lib/sports";
import { estimateWei, LAST_FULL, mon, PAUSE_AT_WEI, TEST_FLOOR_WEI } from "../mutation/room";

const read = (f: string) => readFileSync(f, "utf8");
/** A key shaped as the RPC's is, made up for the test. */
const FAKE_KEY = "alch_ZZtest0000fakeKEY0000xyz";
const RPC = `https://monad-testnet.g.alchemy.com/v2/${FAKE_KEY}`;

// ------------------------------------------------------------------------------------------ section 0

test("a code typed by someone signed out opens its question as its link does, its misses counted by the network it came from (section 0)", () => {
  const join = read("src/lib/actions/join.ts");
  const action = join.slice(join.indexOf("export async function joinByCodeAction"), join.indexOf("/**\n * A code typed by someone with no session"));
  assert.ok(action.includes("if (!user) return codeForGuest(raw);") && !action.includes("WORDS.signedOut"), "a guest's code is never told to sign in");
  const guest = join.slice(join.indexOf("async function codeForGuest"), join.indexOf("export async function joinByLinkAction"));
  assert.ok(guest.includes("guestTo = (await marketForCode(typed.data, { network: await networkOfRequest() })).id;"), "the question the code is for, joining nobody");
  assert.ok(guest.includes("redirect(`/m/${guestTo}`);"), "and its own screen, where a guest joins with a name (a game's question goes on to its page)");
  assert.ok(join.includes('.update(`code-guess:${address}`)') && !/network_hash|networkHash/.test(join), "a keyed hash of the network, never the address, is what is counted");
});

test("pass the phone is offered to the question's asker before their call and to anyone in, while it is open, and to nobody else (section 0)", () => {
  assert.equal(passThePhoneShows({ open: true, viewerIn: false, viewerAsked: true }), true, "the asker, before their own call");
  assert.equal(passThePhoneShows({ open: true, viewerIn: true, viewerAsked: false }), true, "anyone in");
  assert.equal(passThePhoneShows({ open: true, viewerIn: false, viewerAsked: false }), false, "someone who is neither");
  assert.equal(passThePhoneShows({ open: false, viewerIn: true, viewerAsked: true }), false, "nobody once it is closed");
  const page = read("src/components/on/game-page.tsx");
  assert.ok(page.includes("pass={codeQuestion && passThePhoneShows({ open: codeQuestion.state === \"open\", viewerIn: codeQuestion.mine !== null, viewerAsked: codeQuestion.dare.creatorId === me.id }) ? { dareId: codeQuestion.dare.id, explained: me.handOverExplainedAt !== null } : null}"), "the game page's one row carries it for the question its code is for");
  assert.ok(read("src/app/m/[id]/market-screen.tsx").includes("pass={passThePhoneShows({ open: state === \"open\", viewerIn: mine !== null, viewerAsked: d.creatorId === me.id })"), "a market's row by the same rule");
});

test("a market's and a game page's tips wait until the person is in and then run as one sequence, however many show (section 0)", () => {
  for (const key of MARKET_SHEETS) assert.equal(runsAsOne(key), true, key);
  assert.equal(runsAsOne("ask-question"), false, "asking keeps three at a time");
  assert.equal(runsAsOne(undefined), false);
  const sheet = infoSheet("market-open");
  assert.ok(sheet, "the market's sheet");
  const all = tipsFor(sheet, (selector) => selector !== ASK_TARGET, { key: "market-open", seen: [] });
  assert.deepEqual(all.map((t) => t.key), (CURATED_TIPS["market-open"] ?? []).map((t) => t.key), "every way to share, pass the phone and photos, in one run");
  assert.ok(all.length > TIPS_AT_MOST, "past three");
  const ask = infoSheet("ask-question");
  assert.ok(ask);
  assert.ok(tipsFor(ask, () => true, { key: "ask-question", seen: [] }).length <= TIPS_AT_MOST, "asking keeps its three");
  const tips = read("src/components/ui/first-tips.tsx");
  assert.ok(tips.includes("if (icon?.dataset.tipsWait !== undefined) return;"), "nothing shows while the screen says to wait");
  assert.ok(tips.includes('attributeFilter: ["data-info-icon", "data-tips-wait"]'), "and the wait ending brings the look round again");
  assert.ok(tips.includes("const el = tip ? shown(tip.target, !broughtIn.current.has(tip.key)) : null;") && tips.includes("if (r.top - RING_REACH < band.top || r.bottom + RING_REACH > band.bottom) return false;"), "a control only partly on the screen is brought in whole, ring and all, before its tip shows (found on the iOS 26 simulator)");
  assert.ok(tips.includes('if (whole && !el.closest("[data-fixed]")) {'), "and one on a fixed layer, which no scroll can move, is pointed at where it is");
  assert.ok(read("src/components/ui/info.tsx").includes('data-tips-wait={tipsWait ? "" : undefined}'));
  assert.ok(read("src/app/m/[id]/market-screen.tsx").includes("tipsWait={mine === null} />"), "a market waits for the viewer's entry");
  assert.ok(read("src/app/m/[id]/ghost.tsx").includes('<TopBar wordmark info="market-link" tipsWait={mine === null} />'), "a guest's market for the guest's");
  const page = read("src/components/on/game-page.tsx");
  assert.ok(page.includes('<TopBar back right={more} info="game" tipsWait={!inAny} />') && page.includes('<TopBar back info="game-night" tipsWait={!inAny} />') && page.includes('<TopBar wordmark info="game-link" tipsWait={!guestIn} />'), "a game page for an entry in any of its questions");
});

// ------------------------------------------------------------------------------------------ section 2

test("the public numbers' picture says each number with its noun and when it was read, and says so when it could not read them (section 2)", () => {
  assert.deepEqual(counted(1, "guest", "guests"), { n: "1", noun: "guest" });
  assert.deepEqual(counted(1234, "guest", "guests"), { n: "1,234", noun: "guests" });
  const counts = { accounts: 16, guests: 1, questions_two_in: 17, played_settled: 12, played_open: 5, played_undecided: 0, sets_two_questions: 6 };
  const lines = numbersCardLines({ ...counts, chain: { obligations: 10, questions: 11, people: 8, sets: 1 }, at: "2026-10-09T13:41:00.000Z" });
  // The ops round (section 6) leads with the questions played and adds the groups that came back.
  assert.deepEqual(lines.groups.map((g) => [g.title, g.items.map((i) => `${i.n} ${i.noun}`), g.detail ?? null]), [
    ["People", ["16 with accounts", "1 guest"], null],
    ["Questions played", ["17 played"], "12 settled · 5 still open · none ended undecided"],
    ["Groups", ["6 came back"], "for a second question"],
  ]);
  assert.equal(lines.chain, "On Monad, from real use: 10 obligations · 11 questions · 8 people · 1 set");
  assert.equal(lines.footer, "Counted 9:41am ET, October 9, 2026");
  assert.equal(numbersCardLines({ ...counts, chain: null, at: "2026-10-09T13:41:00.000Z" }).chain, "On Monad: the indexer couldn’t be read just now.", "the chain's line says it could not be read");
  assert.deepEqual(numbersCardLines(null), { groups: [], chain: "", footer: "The numbers couldn’t be read just now." });
  assert.equal(readAt("2026-12-01T05:05:00.000Z"), "12:05am ET, December 1, 2026", "Eastern, standard time");
});

test("since launch begins on the day the build began, so nothing a test keeps long before it is counted (section 2)", () => {
  assert.equal(LAUNCH.toISOString(), "2026-09-13T04:00:00.000Z");
  const now = new Date("2026-10-09T12:00:00Z");
  assert.equal(windowFor("launch", now).from?.toISOString(), LAUNCH.toISOString());
  assert.equal(windowFor("week", now).from?.toISOString(), "2026-10-02T12:00:00.000Z");
});

test("the public numbers are read at most once every five minutes however often the picture is asked for, and sent so every proxy asks again (section 2)", () => {
  const route = read("src/app/numbers/route.ts");
  assert.ok(route.includes("export const READ_EVERY_S = 300;"));
  // The ops round (section 0) keeps the drawing too, numbers and picture together, five minutes at a time.
  assert.ok(route.includes("const png = await renderNumbersCard(await publicNumbers(), await loadFonts(), FRESH).arrayBuffer();") && route.includes('  ["public-numbers-png-v1"],\n  { revalidate: READ_EVERY_S },\n'), "one read and one drawing shared by every instance, five minutes at a time");
  assert.ok(route.includes('export const FRESH = { "cache-control": "no-cache, max-age=0, must-revalidate", "vercel-cdn-cache-control": `max-age=${READ_EVERY_S}`, "content-type": "image/png" };'), "no copy kept downstream, the edge's for the five minutes");
  assert.ok(route.includes('return new Response(Buffer.from(kept.png, "base64"), { headers: { ...FRESH, "x-drawn-at": kept.drawnAt } });') && route.includes("return renderNumbersCard(null, await loadFonts(), NEVER_KEPT);"), "a failed read is drawn and never kept");
  assert.ok(read("next.config.ts").includes('"/numbers": ["./src/lib/ui/fonts/*"]'), "the deployed route carries its fonts");
});

// ------------------------------------------------------------------------------------------ section 4

test("keys come out of every error the app logs, stores or shows, by their value and by their shape (section 4)", () => {
  const env = { MONAD_RPC_URL: RPC, ANTHROPIC_API_KEY: "sk-ant-fake-0000000000000000", DATABASE_URL: "postgresql://postgres.abc:pa55word-fake@aws-0-us-east-1.pooler.supabase.com:6543/postgres", TICK_SECRET: "short" } as Record<string, string>;
  const viem = `HTTP request failed.\n\nURL: ${RPC}\nRequest body: {"method":"eth_getBalance"}\n\nDetails: fetch failed`;
  const out = redactKeys(viem, env);
  assert.ok(!out.includes(FAKE_KEY), "the RPC's key, by its value");
  assert.ok(out.includes("https://monad-testnet.g.alchemy.com/[key]"), "the host stays, for whoever reads the log");
  assert.ok(!redactKeys(`URL: ${RPC}`, {}).includes(FAKE_KEY), "and by its shape when this process does not hold it");
  assert.ok(!redactKeys("the key sk-ant-fake-0000000000000000 was refused", env).includes("sk-ant-fake"), "a model key");
  assert.ok(!redactKeys("connect to postgresql://postgres.abc:pa55word-fake@aws-0-us-east-1.pooler.supabase.com:6543/postgres", {}).includes("pa55word"), "a connection string's password");
  assert.ok(!redactKeys("GET https://api.example.com/v1/games?api_key=abcdef123456&x=1", {}).includes("abcdef123456"), "a key in a query");
  assert.ok(!redactKeys("authorization: Bearer abcdefghijklmnop123", {}).includes("abcdefghijklmnop123"), "a bearer token");
  assert.equal(redactKeys("Closing it didn’t go through. Nothing changed. https://dareful.app/m/1234", {}), "Closing it didn’t go through. Nothing changed. https://dareful.app/m/1234", "everything else reads as it was");
  assert.ok(!secretValues(env).some((s) => s.value === "short"), "a value too short to be a secret is left alone");
  assert.equal(KEY_MARK, "[key]");
});

test("the server's console takes keys out of what it prints, the error objects beside a line included, and leaves every other line as it was (section 4)", () => {
  const printed: string[] = [];
  const fake = { log: (...a: unknown[]) => printed.push(a.map(String).join(" ")), info: () => undefined, warn: () => undefined, error: (...a: unknown[]) => printed.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")), debug: () => undefined } as unknown as Console;
  guardConsole(fake, {});
  const err = Object.assign(new Error("RPC Request failed."), { url: RPC, metaMessages: [`URL: ${RPC}`] });
  fake.error("an argument did not lock", { dareId: "f26b2522", err });
  assert.ok(printed[0] && !printed[0].includes(FAKE_KEY) && printed[0].includes("an argument did not lock"), "the key out of the error printed beside the line");
  const clean = { dareId: "f26b2522", why: "took longer than 6000ms" };
  assert.equal(redactArg(clean, {}), clean, "an object with nothing to take out is handed on as itself");
  assert.equal(redactArg(`URL: ${RPC}`, {}), "URL: https://monad-testnet.g.alchemy.com/v2/[key]");
  const instrumentation = read("src/instrumentation.ts");
  assert.ok(instrumentation.includes('if (process.env.NEXT_RUNTIME !== "nodejs") return;') && instrumentation.includes("guardConsole();"), "in place on every server instance as it starts");
});

test("a failure is kept with no key in it: a chain write's, by address and by value, and a feed read's (section 4)", () => {
  const before = process.env.ENVIO_API_TOKEN;
  process.env.ENVIO_API_TOKEN = "envio-fake-token-0000";
  try {
    const why = failureWhy(new Error(`refused with envio-fake-token-0000 at ${RPC}`));
    assert.ok(!why.includes("envio-fake-token-0000") && !why.includes(FAKE_KEY), "the chain's failure");
    assert.ok(!storedFeedError(`scoreboard nhl: GET https://api.example.com/v1/x?api_key=abcdef123456 failed, envio-fake-token-0000`).includes("abcdef123456"), "the feed's");
    assert.ok(!storedFeedError("envio-fake-token-0000").includes("envio-fake"), "by value too");
  } finally {
    if (before === undefined) delete process.env.ENVIO_API_TOKEN;
    else process.env.ENVIO_API_TOKEN = before;
  }
  assert.ok(read("src/app/stats/page.tsx").includes('why: redactKeys(err instanceof Error ? err.message.split("\\n")[0] : String(err))'), "a section's line on /stats");
});

// ------------------------------------------------------------------------------------------ section 3

test("the mutation runner says what a run should take from the last full audit's spend, pauses near the suites' floor and carries on once topped up (section 3)", () => {
  assert.equal(TEST_FLOOR_WEI, 5n * 10n ** 18n, "the suites' own floor");
  assert.equal(PAUSE_AT_WEI, 6n * 10n ** 18n, "a worst run above it");
  assert.equal(mon(LAST_FULL.wei), "8.10");
  assert.equal(estimateWei(LAST_FULL.db, 0) <= LAST_FULL.wei && LAST_FULL.wei - estimateWei(LAST_FULL.db, 0) < BigInt(LAST_FULL.db), true, "the last audit's own size gives back its spend");
  assert.equal(mon(estimateWei(854, 0)), "16.20", "twice the database mutants, twice the spend");
  assert.equal(mon(-15n * 10n ** 16n), "-0.15");
  const run = read("tests/mutation/run.ts");
  assert.ok(run.includes("if (signing(m)) waitForRoom(m.id, estimateWei(Math.max(0, dbChosen - dbDone), 0));"), "every mutant that can sign waits for the relayer first");
  assert.ok(run.includes("queue.splice(i + 1, 0, m);"), "a run the suites refused is run again, never counted");
  assert.ok(run.includes("if (process.env.AUDIT_RPC_URL) process.env.MONAD_RPC_URL = process.env.AUDIT_RPC_URL;"), "its chain calls on the RPC it is given");
  assert.ok(run.includes('const sent = helper(["ops", `The audit paused'), "the owner emailed once a pause begins");
  assert.ok(run.includes('env: { ...process.env, DAREFUL_NO_LIVE_AI: "1" }'), "its test runs never reach the live model API: one process sets no NODE_TEST_CONTEXT, so the runner says so by name");
});
