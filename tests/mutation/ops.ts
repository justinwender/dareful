/**
 * The ops round's mutants (2026-10-09): one break per rule the round added, each naming the test that must fail while it
 * is in place. Kept beside mutants.ts, which takes them into the list. None widens what the code does to rows a test did
 * not make: the suites' own feed is never renamed to the real scoreboard's in a running test (that would mark the real
 * schedule as read), a flush is never made to replace production's counts, and no alert or state is ever written under
 * production's own names.
 */
import type { Mutant } from "./mutants";

const U = "tests/unit/ops.test.ts";
const U_SUB = "tests/unit/submission.test.ts";
const D = "tests/db/ops.test.ts";
const D_SUB = "tests/db/submission.test.ts";
const H = "tests/http/ops.test.ts";

const T_U_COVERS = "nothing a question left is drawn as a cover: its proposals are its story's, whatever page reads them (section 0)";
const T_U_MARGIN = "a margin past four either way stands in its slice, read from the axis's ends and never from its words (section 0)";
const T_U_FEED = "no test reads games under the real scoreboard's name, so no run marks the real schedule as just read (section 0)";
const T_U_LINES = "the owner's lines are the brief's table, in one file (section 1)";
const T_U_RELAYER = "the relayer is warned under ten MON and urgent under five or three days at the past week's rate, folding in its old email (section 1)";
const T_U_CREDIT = "the model API's credit counts down from what was entered and is urgent on any answer saying it is gone, for an hour (section 1)";
const T_U_PLAN = "Supabase's database and storage are warned at 70% and urgent at 90% of the free plan, Resend at 70 and 90 a day or 2,100 and 2,700 a month (section 1)";
const T_U_ALCHEMY = "Alchemy is warned at 70% of the month's thirty million units and urgent at 90% or any refusal; the indexer at seven days left and three or a refusal (section 1)";
const T_U_ALERTS_OF = "a level holds two alerts, past its warning line and past its urgent line, and a level that could not be read touches neither (section 1)";
const T_U_ONCE = "an alert is told once when it begins, holds while it lasts, clears when it recovers, and is told again only after it begins again (sections 1 and 5)";
const T_U_DOWN = "a core system down is told only once it has been down ten minutes (section 5)";
const T_U_TELLER = "the owner is told by one email and a push to each of his accounts' phones, and a telling counts as gone if either went (sections 1 and 5)";
const T_U_RPC = "the RPC's calls are weighed at each method's units, a batch call by call, and only Alchemy's are counted (section 1)";
const T_U_PRICE = "a model answer is priced from its usage at the published prices, searches and cache included, and what is left never overstated (section 1)";
const T_U_OUT = "the API saying the credit is gone is known by its billing error or by the words it still sends with a 400 (section 1)";
const T_U_TYPED = "the credit the owner types is read as dollars and cents, and nothing else is taken (section 1)";
const T_U_KEPT = "every answer the model API gives is kept as its usage, the health check's one token included, and every send through Resend and every push is counted (section 1)";
const T_U_TURNS = "reads go in turns of three, never more in flight, each answer in its place, so the pooler's queue never gets deep (the ops round)";
const T_U_CORE = "health's core rules: the tick within three minutes, a block within two, the indexer within a minute of the head (section 2)";
const T_U_PUSH = "the push check is down past half failing and slow past a fifth, from five sends; an hourly check's answer stands an hour unless it was down; a run is shared a minute (section 2)";
const T_U_WORDS = "a check's answer carries a few plain words and never what a failure said: past its time it is down, past its slow mark slow (section 2)";
const T_U_MORNING_WHEN = "the morning email goes from 8am Eastern, about the day before, and every failure is a span with when it began and ended (section 5)";
const T_U_MORNING = "the morning email names every level against its lines, the two read by hand, each system, the canary, the model's cost, the errors and yesterday's numbers (section 5)";
const T_U_TICK = "health and the runway are read every five minutes from the tick, which records each run it finishes (sections 2 and 5)";
const T_U_CANARY = "the canary signs as two accounts of its own, from its own mnemonic, whose words never reach a log, and is off until one is set (section 4)";
const T_U_OUTSIDE = "the outside check passes production that answers, and fails on a core system down, on a run kept as anywhere but production, on a page that does not answer, and on a missing picture (section 3)";
const T_U_WORKFLOW = "the outside watch runs every fifteen minutes and after every production deploy, and signs in every six hours once the secrets exist (section 3)";
const T_U_CACHE = "the public numbers are read at most once every five minutes however often the picture is asked for, and sent so every proxy asks again (section 2)";
const T_U_CARD = "the public numbers' picture says each number with its noun and when it was read, and says so when it could not read them (section 2)";

const T_D_FEED = "a schedule read from the suites' own feed leaves the real scoreboard's refresh mark as it found it (section 0)";
const T_D_LINE = "a crossed line is told once by email and push, held while it lasts, cleared when it recovers, and told again when it crosses again; a telling that went nowhere stays due (sections 1 and 5)";
const T_D_DOWN = "a core system down is told after ten minutes, once, and a system that decides nothing is never told (sections 2 and 5)";
const T_D_READERS = "the runway reads the database as Supabase counts it, the bucket's objects, and the app's own emails today and this month (section 1)";
const T_D_RPC = "the RPC's units are added up by day and method, a write at a time, and the month is summed (section 1)";
const T_D_SPEND = "what the model API has spent is priced from every answer kept, and what is left of the credit counts down from the moment it was entered (section 1)";
const T_D_PUSH = "the push check reads the share failing over the day before its moment (section 2)";
const T_D_CLAIM = "a key is taken once: a second claim of the same day's email gets nothing (section 5)";
const T_D_MORNING = "the morning email goes once a day from 8am Eastern, with the day's failures in it, and a second tick sends nothing (section 5)";
const T_D_PLAYED = "a question is played once someone besides its asker is in, and the played are settled, still open or ended without a decision (section 6)";
const T_D_CANARY = "a canary run asks, enters, closes onto the chain, settles there and leaves nothing behind: no number /stats shows moves, and its accounts count for nothing (section 4)";
const T_D_CANARY_FAIL = "a canary step that fails is told at once by name, with what it said, the run kept and no question left (section 4)";
const T_D_TURNS = "a health run asks its checks a few at a time, never all at once, and answers each in its place (section 2)";
const T_D_ENV = "a health answer is its own environment's: one run a minute there, its own claim, its own hourly answers, and never another's run (section 2)";
const T_U_ENV = "a health run is its environment's, by the platform's own word, and only production's look at the core for the owner (section 2)";
const T_D_DELAY = "an alert row remembers when its condition began, and is due only once its delay has passed (section 5)";
const T_D_NUMBERS = "the public numbers: accounts and guests apart, questions asked and settled, each by /stats's own definitions in a day long before launch, and a day already written gains them";

const T_H_GUEST = "a guest's page draws covers as covers and a question's result under the question's story, never as a cover (section 0)";
const T_H_PERSON = "an account's page draws a question's result under the question's story, never as a cover (section 0)";
const T_H_CONFIRM = "a question's result is confirmed under its story by its debtor, and its creditor is sent to the question (section 0)";
const T_H_NUMBERS = "the numbers picture is drawn once for many asks, and every proxy is still told to ask again (section 0)";
const T_H_HEALTH = "the health route answers every system as ok, slow or down with nothing secret in it, 200 only while the core is up, and one run a minute (section 2)";

const PROPOSALS = "src/lib/ledger/proposals.ts";
const GUEST_PAGE = "src/app/p/c/[id]/page.tsx";
const PERSON = "src/lib/ledger/person.ts";
const VIEW = "src/lib/ledger/market-view.ts";
const CONFIRM = "src/app/o/[id]/page.tsx";
const FIXTURE = "tests/db/fixture.ts";
const SPORTS = "src/lib/sports/index.ts";
const ROUTE = "src/app/numbers/route.ts";
const LINES = "src/lib/ops/lines.ts";
const RUNWAY = "src/lib/ops/runway.ts";
const ALERTS = "src/lib/ops/alerts.ts";
const RPC = "src/lib/ops/rpc-usage.ts";
const SPEND = "src/lib/ai/spend.ts";
const CLIENT = "src/lib/ai/client.ts";
const CHANNELS = "src/lib/notify/channels.ts";
const RELAYER = "src/lib/chain/relayer.ts";
const TURNS = "src/lib/ops/turns.ts";
const HEALTH = "src/lib/ops/health.ts";
const HEALTH_ROUTE = "src/app/api/health/route.ts";
const MORNING = "src/lib/ops/morning.ts";
const STATE = "src/lib/ops/state.ts";
const TICK = "src/lib/ops/tick.ts";
const TICK_ROUTE = "src/app/api/tick/route.ts";
const CANARY = "src/lib/ops/canary.ts";
const OUTSIDE = "scripts/ops/outside-check.mjs";
const WORKFLOW = ".github/workflows/watch.yml";
const SIGN_IN = "scripts/ops/watch-sign-in.mjs";
const STATS = "src/lib/usage/stats.ts";
const CARD = "src/lib/ui/numbers-card.tsx";

export const ops: Mutant[] = [
  // Section 0: a question's result is never a cover.
  { id: "covers-include-results", file: PROPOSALS, find: '  return rows.filter((r) => r.origin !== "dare");', replace: "  return rows.filter(() => true);", suite: U, kills: [T_U_COVERS], why: "a question's result is drawn as a cover, the guest's page's \"Covered · You got this one · $5.00\"" },
  { id: "guest-page-draws-results", file: GUEST_PAGE, find: "  const rows = coversOnly(all);", replace: "  const rows = all;", suite: H, kills: [T_H_GUEST], why: "the guest's page draws the question's result as a cover again, the bug the submission round found" },
  { id: "guest-page-forgets-stories", file: GUEST_PAGE, find: "marketCards({ viewerId: me.id, withClaimId: ghost.id })", replace: "Promise.resolve([])", suite: H, kills: [T_H_GUEST], why: "a guest's page says nothing of a question the two of you were in, or \"Nothing between you two yet\" over a settled one" },
  { id: "story-misses-guests", file: VIEW, find: "ps.some((p) => pidOf(p) === withId)", replace: "ps.some((p) => p.userId === withId)", suite: H, kills: [T_H_GUEST], why: "a question with a guest in it is never found for that guest's page" },
  { id: "person-draws-results", file: PERSON, find: "  for (const p of coversOnly(pending)) {", replace: "  for (const p of pending) {", suite: H, kills: [T_H_PERSON], why: "an account's page draws a question's pending result as a cover once a guest signs up" },
  { id: "story-forgets-proposals", file: VIEW, find: "    ...proposed.map((p) => ({ id: p.id, originId: p.originId, from: (p.fromUser ?? p.fromClaim) as string, to: (p.toUser ?? p.toClaim) as string, quantity: p.quantity ?? 1n })),\n", replace: "", suite: H, kills: [T_H_PERSON], why: "a question settled here shows nothing it left under its story" },
  { id: "confirm-draws-a-cover", file: CONFIRM, find: "  if (market) {\n", replace: "  if (false) {\n", suite: H, kills: [T_H_CONFIRM], why: "its debtor confirms a question's result on a cover card" },
  { id: "confirm-keeps-the-creditor", file: CONFIRM, find: '  if (market && !(proposal.fromUser === me.id && proposal.status === "pending")) redirect(`/m/${market}`);\n', replace: "", suite: H, kills: [T_H_CONFIRM], why: "the creditor lands on a page made for the debtor's yep" },

  // Section 0: a margin past four either way never crashes its question.
  { id: "slices-read-the-labels", file: "src/lib/ledger/number-axis.ts", find: "  return sliceOf(v, BigInt(axis.lo), BigInt(axis.hi)) - 1;", replace: '  return sliceOf(v, BigInt((axis.columns[0]?.label ?? "0").replace(/,/g, "")), BigInt((axis.columns[axis.columns.length - 1]?.label ?? "0").replace(/,/g, "").split(" ")[0] ?? "0")) - 1;', suite: U, kills: [T_U_MARGIN], why: "the slice is found by reading its labels as numbers again, and \"Packers by 7\" crashes the question" },
  { id: "axis-sent-without-its-ends", file: "src/lib/ledger/number-axis.ts", find: "  return { mode: a.mode, lo: a.lo.toString(), hi: a.hi.toString(), columns:", replace: '  return { mode: a.mode, lo: "0", hi: "0", columns:', suite: U, kills: [T_U_MARGIN], why: "the browser places every call in the first slice" },

  // Section 0: the suites leave the real schedule alone.
  { id: "test-feed-named-espn", file: FIXTURE, find: "export const TEST_FEED = `test:feed:${randomUUID().slice(0, 8)}`;", replace: 'export const TEST_FEED = "espn";', suite: U, kills: [T_U_FEED], why: "every suite marks the real NFL schedule as just read, holding production's refresh back half an hour" },
  { id: "a-test-reads-the-real-feed", file: "tests/db/stats.test.ts", find: "testSchedule(game)", replace: '{ name: "espn", listGames: async () => game }', suite: U, kills: [T_U_FEED], why: "one test goes back to reading under the real scoreboard's name" },
  { id: "schedule-read-unmarked", file: SPORTS, find: "    await noteRead(sport, source.name, now, null);\n  } catch (err) {\n    await noteRead(sport, source.name, now, err instanceof Error ? err.message : \"unknown\");\n    throw err;\n  }\n  return { games: count };", replace: "  } catch (err) {\n    await noteRead(sport, source.name, now, err instanceof Error ? err.message : \"unknown\");\n    throw err;\n  }\n  return { games: count };", suite: D, kills: [T_D_FEED], why: "a schedule read is marked under no name at all, so the stalest sport is read every tick" },

  // Section 0: the numbers picture is drawn once for many asks.
  { id: "numbers-drawn-every-ask", file: ROUTE, find: "    const kept = await drawing();", replace: '    const kept = { png: Buffer.from(await renderNumbersCard(await publicNumbers(), await loadFonts(), FRESH).arrayBuffer()).toString("base64"), drawnAt: new Date().toISOString() };', suite: H, kills: [T_H_NUMBERS], why: "every README view draws the picture again, at the function's cost" },
  { id: "numbers-edge-a-minute", file: ROUTE, find: '"vercel-cdn-cache-control": `max-age=${READ_EVERY_S}`', replace: '"vercel-cdn-cache-control": "max-age=60"', suite: U_SUB, kills: [T_U_CACHE], why: "the edge keeps the picture a minute, so a busy README draws it five times as often" },

  // Section 1: the lines, in one file.
  { id: "relayer-warned-at-one", file: LINES, find: "relayer: { warn: 10n * MON, urgent: 5n * MON, urgentDays: 3 },", replace: "relayer: { warn: 1n * MON, urgent: 5n * MON, urgentDays: 3 },", suite: U, kills: [T_U_LINES, T_U_RELAYER], why: "the warning comes under the urgent line, too late to be a warning" },
  { id: "credit-lines-in-cents", file: LINES, find: "anthropic: { warnCents: 500n, urgentCents: 200n },", replace: "anthropic: { warnCents: 50n, urgentCents: 20n },", suite: U, kills: [T_U_LINES, T_U_CREDIT], why: "the model API's credit warns at fifty cents" },
  { id: "database-warned-at-80", file: LINES, find: "database: { limitBytes: 500 * MB, warnPercent: 70, urgentPercent: 90 },", replace: "database: { limitBytes: 500 * MB, warnPercent: 80, urgentPercent: 90 },", suite: U, kills: [T_U_LINES, T_U_PLAN], why: "the database warns at 80%, not the owner's 70%" },
  { id: "resend-day-at-80", file: LINES, find: "resend: { dayLimit: 100, dayWarn: 70,", replace: "resend: { dayLimit: 100, dayWarn: 80,", suite: U, kills: [T_U_LINES, T_U_PLAN], why: "Resend warns at 80 a day" },
  { id: "alchemy-limit-tenfold", file: LINES, find: "alchemy: { limitCu: 30_000_000,", replace: "alchemy: { limitCu: 300_000_000,", suite: U, kills: [T_U_LINES, T_U_ALCHEMY], why: "the month's units read against a plan ten times the free one" },
  { id: "indexer-lives-ninety-days", file: LINES, find: "indexer: { lifespanDays: 30, warnDaysLeft: 7, urgentDaysLeft: 3 },", replace: "indexer: { lifespanDays: 90, warnDaysLeft: 7, urgentDaysLeft: 3 },", suite: U, kills: [T_U_LINES, T_U_ALCHEMY], why: "the hosted indexer's deployment is read as living ninety days, and it is deleted with no warning" },
  { id: "down-told-at-once", file: LINES, find: "export const DOWN_TELLS_AFTER_MS = 10 * 60_000;", replace: "export const DOWN_TELLS_AFTER_MS = 0;", suite: U, kills: [T_U_LINES], why: "every blip of a core system wakes the owner" },

  // Section 1: the levels.
  { id: "relayer-forgets-the-days", file: RUNWAY, find: "  const urgent = relayerLow(balance, L.urgent, perDay);", replace: "  const urgent = balance < L.urgent;", suite: U, kills: [T_U_RELAYER], why: "the old email's three days at the past week's rate are lost in the fold" },
  { id: "credit-ignores-refusal", file: RUNWAY, find: "  const urgent = out || (left !== null && left.cents < L.urgentCents);", replace: "  const urgent = left !== null && left.cents < L.urgentCents;", suite: U, kills: [T_U_CREDIT], why: "the API saying the balance is too low is not urgent when the arithmetic says there is credit" },
  { id: "refusal-holds-forever", file: RUNWAY, find: "const recent = (r: OpsState | null, now: Date) => r !== null && now.getTime() - r.at.getTime() < REFUSAL_HOLDS_MS;", replace: "const recent = (r: OpsState | null, now: Date) => r !== null;", suite: U, kills: [T_U_CREDIT], why: "one refusal holds a line at urgent for good" },
  { id: "percent-rounds-up", file: RUNWAY, find: "const pct = (used: number, limit: number) => Math.floor((100 * used) / limit);", replace: "const pct = (used: number, limit: number) => Math.ceil((100 * used) / limit);", suite: U, kills: [T_U_PLAN], why: "69.99% reads as seventy and warns" },
  { id: "resend-month-never-read", file: RUNWAY, find: '  const mon: LevelState = month >= L.monthUrgent ? "urgent" : month >= L.monthWarn ? "warn" : "ok";', replace: '  const mon: LevelState = "ok";', suite: U, kills: [T_U_PLAN], why: "the month's 3,000 emails run out with no warning" },
  { id: "alchemy-ignores-refusal", file: RUNWAY, find: '  const state: LevelState = out || p >= L.urgentPercent ? "urgent" : p >= L.warnPercent ? "warn" : "ok";', replace: '  const state: LevelState = p >= L.urgentPercent ? "urgent" : p >= L.warnPercent ? "warn" : "ok";', suite: U, kills: [T_U_ALCHEMY], why: "Alchemy refusing calls for rate is not urgent" },
  { id: "indexer-ignores-refusal", file: RUNWAY, find: '  const state: LevelState = out || left <= L.urgentDaysLeft ? "urgent" : left <= L.warnDaysLeft ? "warn" : "ok";', replace: '  const state: LevelState = left <= L.urgentDaysLeft ? "urgent" : left <= L.warnDaysLeft ? "warn" : "ok";', suite: U, kills: [T_U_ALCHEMY], why: "the indexer refusing queries at its hundred a minute is not urgent" },
  { id: "unread-raises-alerts", file: RUNWAY, find: '  if (l.state === "unread") return [];\n', replace: "", suite: U, kills: [T_U_ALERTS_OF], why: "a level that could not be read clears its alerts, and tells again when it can" },
  { id: "urgent-is-not-a-warning", file: RUNWAY, find: 'active: l.state === "warn" || l.state === "urgent"', replace: 'active: l.state === "warn"', suite: U, kills: [T_U_ALERTS_OF], why: "a level straight past both lines clears its warning" },
  { id: "warning-told-beside-urgent", file: RUNWAY, find: "  const lines = due.filter((d) => !urgentKeys.has(d.key));", replace: "  const lines = due;", suite: D, kills: [T_D_LINE], why: "a level past both lines is told twice, the warning beside the urgent one" },

  // Sections 1 and 5: telling.
  { id: "alert-told-every-time", file: ALERTS, find: "due: toldAt === null && now.getTime() - began.getTime() >= delayMs", replace: "due: now.getTime() - began.getTime() >= delayMs", suite: U, kills: [T_U_ONCE], why: "the owner is told every five minutes for as long as a line stays crossed" },
  { id: "alert-never-clears", file: ALERTS, find: "  if (!active) return since === null ? { next: { since: null, toldAt: null }, due: false, cleared: false } : { next: { since: null, toldAt: null }, due: false, cleared: true };", replace: "  if (!active) return { next: { since, toldAt }, due: false, cleared: false };", suite: U, kills: [T_U_ONCE], why: "a line that recovered and crossed again is never told again" },
  { id: "delay-ignored", file: ALERTS, find: "now.getTime() - began.getTime() >= delayMs, cleared: false };", replace: "now.getTime() - began.getTime() >= 0, cleared: false };", suite: U, kills: [T_U_DOWN], why: "a core system is told down the minute it blips" },
  { id: "teller-pushes-one-phone", file: ALERTS, find: "    for (const id of channels.owners()) pushed =", replace: "    for (const id of [...channels.owners()].slice(0, 1)) pushed =", suite: U, kills: [T_U_TELLER], why: "only the first of the owner's accounts gets the push" },
  { id: "teller-email-only", file: ALERTS, find: "    return emailed || pushed;", replace: "    return emailed;", suite: U, kills: [T_U_TELLER], why: "an alert whose push went but whose email failed is tried again and again" },
  { id: "told-though-nothing-went", file: ALERTS, find: "  if (!went) return [];\n", replace: "", suite: D, kills: [T_D_LINE], why: "an alert whose email and push both failed is marked told and never tried again" },
  { id: "observe-ignores-delay", file: ALERTS, find: "const step = alertStep(row ? { since: row.since, toldAt: row.toldAt } : null, active, now, delayMs);", replace: "const step = alertStep(row ? { since: row.since, toldAt: row.toldAt } : null, active, now, 0);", suite: D, kills: [T_D_DELAY], why: "the database's alert ignores its delay, and a core system is told down the moment it blips" },
  { id: "clear-not-kept", file: ALERTS, find: "...(step.cleared ? { clearedAt: now } : {})", replace: "...{}", suite: D, kills: [T_D_LINE], why: "when a line came back is never kept for the morning's reading" },

  // Section 1: what things cost.
  { id: "rpc-batch-one-call", file: RPC, find: "(Array.isArray(parsed) ? parsed : [parsed])", replace: "[parsed]", suite: U, kills: [T_U_RPC], why: "a batch of calls is weighed as one, or as nothing" },
  { id: "rpc-unlisted-free", file: RPC, find: "export const UNLISTED_CU = 26;", replace: "export const UNLISTED_CU = 0;", suite: U, kills: [T_U_RPC], why: "a method the table does not list costs nothing" },
  { id: "rpc-429-not-a-refusal", file: RPC, find: '  if (status === 429 || /compute units per second capacity/i.test(text)) return "rate";', replace: '  if (/compute units per second capacity/i.test(text)) return "rate";', suite: U, kills: [T_U_RPC], why: "Alchemy's throughput refusal goes unseen" },
  { id: "rpc-counts-the-public-node", file: RPC, find: '    return new URL(url).hostname.endsWith(".alchemy.com");', replace: "    return true;", suite: U, kills: [T_U_RPC], why: "the audit's public RPC is counted against Alchemy's month" },
  { id: "rpc-month-is-forever", file: RPC, find: "from rpc_calls where day like ${`${month}-%`}`)", replace: "from rpc_calls where true`)", suite: D, kills: [T_D_RPC], why: "every month's units are read as this month's" },
  { id: "price-forgets-searches", file: SPEND, find: " + SEARCH_NANO * BigInt(u.searches)", replace: "", suite: U, kills: [T_U_PRICE], why: "a search's ten dollars a thousand is never counted" },
  { id: "cents-round-down", file: SPEND, find: "  return (nano + NANO_PER_CENT - 1n) / NANO_PER_CENT;", replace: "  return nano / NANO_PER_CENT;", suite: U, kills: [T_U_PRICE], why: "what is left of the credit is overstated" },
  { id: "credit-words-missed", file: SPEND, find: ' || /credit balance is too low/i.test(message)', replace: "", suite: U, kills: [T_U_OUT], why: "the 400 the API still sends when the credit is gone is missed" },
  { id: "typed-takes-three-decimals", file: SPEND, find: "match(/^(\\d{1,6})(?:\\.(\\d{1,2}))?$/)", replace: "match(/^(\\d{1,6})(?:\\.(\\d{1,3}))?$/)", suite: U, kills: [T_U_TYPED], why: "$1.234 is taken, as 1,234 cents" },
  { id: "spend-reads-past-its-window", file: SPEND, find: "${until ? sql`at < ${until.toISOString()}::timestamptz` : sql`true`}", replace: "${sql`true`}", suite: D, kills: [T_D_SPEND], why: "a window's spend counts every call after it" },
  { id: "credit-forgets-the-spend", file: SPEND, find: "  return { cents: entry.cents > spent ? entry.cents - spent : 0n,", replace: "  return { cents: entry.cents,", suite: D, kills: [T_D_SPEND], why: "the credit never counts down" },
  { id: "streamed-answer-unkept", file: CLIENT, find: "    await recordAiCall(req.label, res.model || req.model, usageOf(res));\n", replace: "", suite: U, kills: [T_U_KEPT], why: "every streamed write-up's tokens go uncounted" },
  { id: "ops-email-uncounted", file: CHANNELS, find: '  await recordSend("email", "ops", !error);\n', replace: "", suite: U, kills: [T_U_KEPT], why: "the owner's own alerts are left out of Resend's day" },
  { id: "push-uncounted", file: CHANNELS, find: '    await recordSend("push", kind, went);\n', replace: "", suite: U, kills: [T_U_KEPT], why: "the push check has nothing to read" },
  { id: "relayer-calls-unweighed", file: RELAYER, find: ", fetchFn: countedFetch });", replace: " });", suite: U, kills: [T_U_KEPT], why: "the relayer's calls never reach Alchemy's month" },
  { id: "emails-count-failures", file: RUNWAY, find: "where channel = 'email' and ok and at >=", replace: "where channel = 'email' and at >=", suite: D, kills: [T_D_READERS], why: "an email Resend refused counts against its quota" },
  { id: "database-is-one-database", file: RUNWAY, find: "sql`select sum(pg_database_size(datname))::bigint as n from pg_database where datallowconn`", replace: "sql`select pg_database_size(current_database())::bigint as n`", suite: D, kills: [T_D_READERS], why: "the database's size is not what the usage page counts" },

  // The pooler's queue.
  { id: "turns-wide-open", file: TURNS, find: "export const TURN = 3;", replace: "export const TURN = 50;", suite: U, kills: [T_U_TURNS], why: "every read at once, the queue the pooler stalls on" },
  { id: "turns-ignore-their-size", file: TURNS, find: "Math.max(1, Math.min(size, tasks.length))", replace: "Math.max(1, tasks.length)", suite: U, kills: [T_U_TURNS], why: "the turns' size is never used" },

  // Section 2: health.
  { id: "tick-fresh-for-half-an-hour", file: HEALTH, find: "export const TICK_FRESH_MS = 3 * 60_000;", replace: "export const TICK_FRESH_MS = 30 * 60_000;", suite: U, kills: [T_U_CORE], why: "a dead tick reads as alive for half an hour" },
  { id: "block-fresh-for-twenty-minutes", file: HEALTH, find: "export const BLOCK_FRESH_MS = 2 * 60_000;", replace: "export const BLOCK_FRESH_MS = 20 * 60_000;", suite: U, kills: [T_U_CORE], why: "a node twenty minutes behind reads as up" },
  { id: "indexer-ten-minutes-behind", file: HEALTH, find: "export const INDEXER_LAG_MS = 60_000;", replace: "export const INDEXER_LAG_MS = 600_000;", suite: U, kills: [T_U_CORE], why: "an indexer ten minutes behind reads as up" },
  { id: "push-never-slow", file: HEALTH, find: '  if (failed * 5 > sent) return "slow";\n', replace: "", suite: U, kills: [T_U_PUSH], why: "two pushes in five failing reads as fine" },
  { id: "down-stands-an-hour", file: HEALTH, find: 'kept !== undefined && kept.state !== "down" && now', replace: "kept !== undefined && now", suite: U, kills: [T_U_PUSH], why: "a model check that failed is not asked again for an hour" },
  { id: "run-shared-ten-minutes", file: HEALTH, find: "export const SHARE_MS = 60_000;", replace: "export const SHARE_MS = 600_000;", suite: U, kills: [T_U_PUSH], why: "the answer is ten minutes stale" },
  { id: "health-checks-all-at-once", file: HEALTH, find: "    TURN,\n  );\n  const run: HealthRun", replace: "    checks.length,\n  );\n  const run: HealthRun", suite: D, kills: [T_D_TURNS], why: "every check at once again: the driver stalls over the pooler and the route holds for five minutes" },
  { id: "failure-text-repeated", file: HEALTH, find: ': err instanceof Error && err.name === "TookTooLong" ? `no answer in ${check.limitMs / 1000}s` : "failed";', replace: ': err instanceof Error && err.name === "TookTooLong" ? `no answer in ${check.limitMs / 1000}s` : err instanceof Error ? err.message : "failed";', suite: U, kills: [T_U_WORDS], why: "a failure's own words, an RPC address with its key among them, go into the public answer" },
  { id: "lesser-systems-decide", file: HEALTH, find: "ok: results.every((r) => !r.core || r.state !== \"down\")", replace: "ok: results.every((r) => r.state !== \"down\")", suite: D, kills: [T_D_DOWN], why: "Resend's or the scoreboard's trouble reads as production down" },
  { id: "lesser-systems-decide-http", file: HEALTH, find: "ok: results.every((r) => !r.core || r.state !== \"down\")", replace: "ok: results.every((r) => r.state !== \"down\")", suite: H, kills: [T_H_HEALTH], why: "the same, read by the route" },
  { id: "down-told-at-once-db", file: HEALTH, find: "c.note ?? c.state, now, DOWN_TELLS_AFTER_MS))", replace: "c.note ?? c.state, now, 0))", suite: D, kills: [T_D_DOWN], why: "a core system is told down the minute it blips" },
  { id: "health-always-200", file: HEALTH_ROUTE, find: "status: run.ok ? 200 : 503", replace: "status: 200", suite: H, kills: [T_H_HEALTH], why: "the outside check can never see production down" },
  { id: "health-runs-every-ask", file: HEALTH, find: "  if (last && shareable(last.at, now)) return", replace: "  if (false) return", also: [{ file: HEALTH, find: "  const claimed = await within(READ_MS, claimRun(now, env)).catch(() => true);", replace: "  const claimed = true;" }], suite: H, kills: [T_H_HEALTH], why: "every ask runs every check, the indexer's minute and the model's hour with them" },
  { id: "every-server-is-production", file: HEALTH, find: '  return env.VERCEL_ENV === "production" ? "production" : env.VERCEL_ENV === "preview" ? "preview" : "local";', replace: '  return "production";', suite: U, kills: [T_U_ENV], why: "a laptop's run is kept as production's and tells the owner about production" },
  { id: "health-watches-everywhere", file: HEALTH, find: '  return ownTeller || env === "production";', replace: "  return true;", suite: U, kills: [T_U_ENV], why: "a laptop with its own indexer behind tells the owner production is down" },
  { id: "health-answer-reads-every-environment", file: HEALTH, find: "coreOk: schema.healthRuns.coreOk, checks: schema.healthRuns.checks }).from(schema.healthRuns).where(eq(schema.healthRuns.env, env))", replace: "coreOk: schema.healthRuns.coreOk, checks: schema.healthRuns.checks }).from(schema.healthRuns)", suite: D, kills: [T_D_ENV], why: "production answers with a laptop's run for a minute, and the outside check fails on it" },
  { id: "health-last-answers-every-environment", file: HEALTH, find: "const rows = await db.select({ checks: schema.healthRuns.checks }).from(schema.healthRuns).where(eq(schema.healthRuns.env, env))", replace: "const rows = await db.select({ checks: schema.healthRuns.checks }).from(schema.healthRuns)", suite: D, kills: [T_D_ENV], why: "an hourly check a laptop answered stands for production" },
  { id: "health-claims-across-environments", file: HEALTH, find: "values (${`health:claim:${env}`},", replace: "values ('health:claim',", suite: D, kills: [T_D_ENV], why: "a laptop's run takes production's minute, and production answers with its stale run" },
  { id: "health-keeps-without-its-environment", file: HEALTH, find: "db.insert(schema.healthRuns).values({ at: now, source, env, coreOk: run.ok, checks: results })", replace: "db.insert(schema.healthRuns).values({ at: now, source, coreOk: run.ok, checks: results })", suite: D, kills: [T_D_ENV], why: "production's runs are kept as a laptop's, so it never shares one and runs every check on every ask" },
  { id: "health-route-hides-its-environment", file: HEALTH_ROUTE, find: "{ ok: run.ok, at: run.at, env: run.env, checks:", replace: "{ ok: run.ok, at: run.at, checks:", suite: H, kills: [T_H_HEALTH], why: "the outside check cannot tell production's own run from one kept anywhere else" },
  { id: "push-reads-two-days", file: HEALTH, find: "and at > ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz and at <= ${now.toISOString()}::timestamptz", replace: "and at > ${new Date(now.getTime() - 2 * 86_400_000).toISOString()}::timestamptz and at <= ${now.toISOString()}::timestamptz", suite: D, kills: [T_D_PUSH], why: "the failing share reads two days, not one" },

  // Section 5: the morning email.
  { id: "morning-before-eight", file: MORNING, find: "  return easternHour(now) >= MORNING_HOUR;", replace: "  return true;", suite: U, kills: [T_U_MORNING_WHEN], why: "the summary goes at midnight" },
  { id: "morning-about-today", file: MORNING, find: "new Date(Date.UTC(y, m - 1, d - 1))", replace: "new Date(Date.UTC(y, m - 1, d))", suite: U, kills: [T_U_MORNING_WHEN], why: "\"yesterday's numbers\" are today's half-day" },
  { id: "spans-never-merge", file: MORNING, find: "      if (cur && cur.state === c.state) {", replace: "      if (false) {", suite: U, kills: [T_U_MORNING_WHEN], why: "a ten-minute outage is listed as two" },
  { id: "morning-forgets-by-hand", file: MORNING, find: "  for (const h of BY_HAND) lines.push(`- ${h.what}: against ${h.line}. ${h.url}`);\n", replace: "", suite: U, kills: [T_U_MORNING], why: "Vercel's CPU and Supabase's egress are never named" },
  { id: "morning-forgets-the-canary", file: MORNING, find: '  lines.push("", "THE CANARY");', replace: '  lines.push("");', suite: U, kills: [T_U_MORNING], why: "the canary's runs are not headed" },
  { id: "morning-reads-every-environment", file: MORNING, find: "where(and(eq(schema.healthRuns.env, env), gte(schema.healthRuns.at, since)", replace: "where(and(gte(schema.healthRuns.at, since)", suite: D, kills: [T_D_MORNING], why: "a laptop's failures read as production's in the owner's morning" },
  { id: "morning-sends-twice", file: MORNING, find: '  if (!(await claimState(key, { at: now.toISOString() }, now))) return "taken";', replace: "  await claimState(key, { at: now.toISOString() }, now);", suite: D, kills: [T_D_MORNING], why: "two ticks in the same minute send two summaries" },
  { id: "claim-always-taken", file: STATE, find: ".onConflictDoNothing({ target: schema.opsState.key }).returning({ key: schema.opsState.key });", replace: ".onConflictDoUpdate({ target: schema.opsState.key, set: { at } }).returning({ key: schema.opsState.key });", suite: D, kills: [T_D_CLAIM], why: "a key is claimed by everyone who asks" },
  { id: "ops-every-minute", file: TICK, find: "  return now.getUTCMinutes() % OPS_EVERY_MIN === 0;", replace: "  return true;", suite: U, kills: [T_U_TICK], why: "every check and every reading every minute, the indexer's query and the RPC's units with them" },
  { id: "tick-never-recorded", file: TICK_ROUTE, find: "  await beat(now, summary)", replace: "  await Promise.resolve(summary)", suite: U, kills: [T_U_TICK], why: "the tick never records its run, so health reads it as dead" },

  // Section 4: the canary.
  { id: "canary-on-without-a-key", file: CANARY, find: '  if (!env.CANARY_MNEMONIC) return "CANARY_MNEMONIC is not set";\n', replace: "", suite: U, kills: [T_U_CANARY], why: "the canary runs with no keys and fails every six hours" },
  { id: "canary-shares-a-key", file: CANARY, find: "b: { ledger: at(2), governance: at(3) }", replace: "b: { ledger: at(2), governance: at(2) }", suite: U, kills: [T_U_CANARY], why: "one account's governance key is its ledger key" },
  { id: "canary-words-printable", file: "src/lib/redact.ts", find: '  "CANARY_MNEMONIC",\n', replace: "", suite: U, kills: [T_U_CANARY], why: "a failed canary run prints the twelve words that make its keys" },
  { id: "canary-leaves-entries", file: CANARY, find: "    await tx.delete(schema.darePositions).where(inArray(schema.darePositions.dareId, ids));\n", replace: "", suite: D, kills: [T_D_CANARY], why: "the canary's question cannot be removed, and its rows stay behind every six hours" },
  { id: "canary-skips-the-indexer", file: CANARY, find: '    await timed("indexer", async () => {', replace: '    if (false) await timed("indexer", async () => {', suite: D, kills: [T_D_CANARY], why: "the canary never waits on the indexer, the one system only it reads that way" },
  { id: "canary-failure-untold", file: CANARY, find: "    await tell(`Dareful: the canary failed at ${at}`", replace: "    if (false) await tell(`Dareful: the canary failed at ${at}`", suite: D, kills: [T_D_CANARY_FAIL], why: "a failed canary run tells nobody" },

  // Section 3: outside the app.
  { id: "outside-ignores-core-down", file: OUTSIDE, find: "return { ok: res.status === 200 && body.ok === true && down.length === 0 && own,", replace: "return { ok: own,", suite: U, kills: [T_U_OUTSIDE], why: "the workflow passes with a core system down" },
  { id: "outside-takes-any-run", file: OUTSIDE, find: "    const own = body.env === expected;", replace: "    const own = true;", suite: U, kills: [T_U_OUTSIDE], why: "production storing its runs under another name passes, and its down alerts never go" },
  { id: "outside-ignores-the-picture", file: OUTSIDE, find: "return { ok: png && bytes > 1_000,", replace: "return { ok: true,", suite: U, kills: [T_U_OUTSIDE], why: "an error page where the picture should be passes" },
  { id: "outside-any-home-page", file: OUTSIDE, find: "    const titled = /<title>[^<]*Dareful/i.test(html);", replace: "    const titled = true;", suite: U, kills: [T_U_OUTSIDE], why: "a parked domain passes as the app" },
  { id: "watch-hourly", file: WORKFLOW, find: '    - cron: "*/15 * * * *"', replace: '    - cron: "0 * * * *"', suite: U, kills: [T_U_WORKFLOW], why: "a dead production goes unnoticed for an hour" },
  { id: "watch-any-deploy", file: WORKFLOW, find: "(github.event.deployment_status.state == 'success' && github.event.deployment.environment == 'Production')", replace: "(github.event.deployment_status.state == 'success')", suite: U, kills: [T_U_WORKFLOW], why: "a preview deploy checks production and reads as production's deploy" },
  { id: "sign-in-runs-without-secrets", file: WORKFLOW, find: "        if: env.WATCH_EMAIL != '' && env.WATCH_CODE != ''\n        working-directory: ${{ runner.temp }}/watch\n", replace: "        working-directory: ${{ runner.temp }}/watch\n", suite: U, kills: [T_U_WORKFLOW], why: "with no secrets the pass runs in a folder nobody made and the six-hourly job fails red" },
  { id: "sign-in-needs-a-browser-to-skip", file: SIGN_IN, find: 'import { appendFileSync, mkdirSync } from "node:fs";\n', replace: 'import { appendFileSync, mkdirSync } from "node:fs";\nimport { chromium } from "playwright";\n', suite: U, kills: [T_U_WORKFLOW], why: "the script cannot even say it skipped on a machine with no browser installed" },
  { id: "sign-in-marks-tips", file: SIGN_IN, find: '  if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes("/tips/")) return route.abort();\n', replace: "", suite: U, kills: [T_U_WORKFLOW], why: "the robot's visits mark the shared test account's tips as seen" },

  // Section 6: questions played.
  { id: "played-from-one-in", file: STATS, find: 'and ${inWindow("d.created_at", w)} and ${COUNTED_IN("d.id")} >= 2`;', replace: 'and ${inWindow("d.created_at", w)} and ${COUNTED_IN("d.id")} >= 1`;', suite: D, kills: [T_D_PLAYED], why: "a question only its asker is in counts as played" },
  { id: "played-settled-counts-expired", file: STATS, find: "const DECIDED = sql.raw(`('quorum', 'provisional', 'arbitration', 'feed', 'ruling')`);", replace: "const DECIDED = sql.raw(`('quorum', 'provisional', 'arbitration', 'feed', 'ruling', 'expired')`);", suite: D, kills: [T_D_PLAYED], why: "a question nobody called counts as settled" },
  { id: "played-open-counts-expired", file: STATS, find: "count(*) filter (where d.resolved_at is null)::int as open", replace: "count(*) filter (where d.resolved_at is null or d.resolved_by = 'expired')::int as open", suite: D, kills: [T_D_PLAYED], why: "a question that ended undecided reads as still open" },
  { id: "asked-counts-called-off", file: STATS, find: "and coalesce(d.resolved_by, '') <> 'removed' and ${inWindow(\"d.created_at\", w)}`;\n\n/** How a question", replace: "and ${inWindow(\"d.created_at\", w)}`;\n\n/** How a question", suite: D, kills: [T_D_PLAYED], why: "a question its asker called off before anyone joined counts as asked" },
  { id: "asked-counts-called-off-sub", file: STATS, find: "and coalesce(d.resolved_by, '') <> 'removed' and ${inWindow(\"d.created_at\", w)}`;\n\n/** How a question", replace: "and ${inWindow(\"d.created_at\", w)}`;\n\n/** How a question", suite: D_SUB, kills: [T_D_NUMBERS], why: "the same, read by the earlier round's day" },
  { id: "card-leads-with-asked", file: CARD, find: '{ title: "Questions played", items: [counted(n.questions_two_in, "played", "played")], detail: how },', replace: '{ title: "Questions", items: [counted(n.questions_two_in, "asked", "asked")], detail: how },', suite: U_SUB, kills: [T_U_CARD], why: "the picture leads with questions asked again" },
];
