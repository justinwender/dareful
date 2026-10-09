/**
 * The submission round's mutants (2026-10-09): one break per rule the round added, each naming the test that must fail
 * while it is in place. Kept beside mutants.ts, which takes them into the list. None widens what the code does to rows
 * a test did not make: the snapshot refresh's day filter has no mutant, since breaking it would write every day there is.
 */
import type { Mutant } from "./mutants";

const U = "tests/unit/submission.test.ts";
const D = "tests/db/submission.test.ts";
const H = "tests/http/submission.test.ts";

const T_U_CODE = "a code typed by someone signed out opens its question as its link does, its misses counted by the network it came from (section 0)";
const T_U_PASS = "pass the phone is offered to the question's asker before their call and to anyone in, while it is open, and to nobody else (section 0)";
const T_U_TIPS = "a market's and a game page's tips wait until the person is in and then run as one sequence, however many show (section 0)";
const T_U_CARD = "the public numbers' picture says each number with its noun and when it was read, and says so when it could not read them (section 2)";
const T_U_LAUNCH = "since launch begins on the day the build began, so nothing a test keeps long before it is counted (section 2)";
const T_U_CACHE = "the public numbers are read at most once every five minutes however often the picture is asked for, and sent so every proxy asks again (section 2)";
const T_U_REDACT = "keys come out of every error the app logs, stores or shows, by their value and by their shape (section 4)";
const T_U_CONSOLE = "the server's console takes keys out of what it prints, the error objects beside a line included, and leaves every other line as it was (section 4)";
const T_U_KEPT = "a failure is kept with no key in it: a chain write's, by address and by value, and a feed read's (section 4)";
const T_U_RUNNER = "the mutation runner says what a run should take from the last full audit's spend, pauses near the suites' floor and carries on once topped up (section 3)";

const T_D_CODE = "a typed code is its question's link for a guest: it opens the question and joins nobody, a code that matches nothing costs the network a guess, twenty an hour is the limit, and a guest's misses older than a day are not kept";
const T_D_PASS = "pass the phone is the asker's to hand over before their own call and anyone's who is in, while the question is open, and nobody else's";
const T_D_NUMBERS = "the public numbers: accounts and guests apart, questions asked and settled, each by /stats's own definitions in a day long before launch, and a day already written gains them";
const T_D_PUBLIC = "the public numbers are /stats's own four since launch, with real use on the chain beside them, read at the moment they were asked for";
const T_D_FIXTURE = "a test account is left out of every count from the moment it is made, unless a test about counting asks for one, made long before launch";

const T_H_ROW = "a share row carries every icon its screen should have: share, copy and the code while it is open, and pass the phone for its asker before their call and for anyone in";
const T_H_GAME = "a game page's one row carries pass the phone for the question its code is for, by the market's rule, and its open card draws no row of its own";
const T_H_TIPS = "a market's tips wait until the viewer is in: the information icon says so until their entry stands";
const T_H_IMAGE = "the public numbers are a picture, drawn by the app and sent fresh to every proxy";

const JOIN = "src/lib/actions/join.ts";
const ROOMS = "src/lib/ledger/rooms.ts";
const HAND = "src/lib/ledger/hand-over.ts";
const GAME = "src/components/on/game-page.tsx";
const MARKET = "src/app/m/[id]/market-screen.tsx";
const ROW = "src/components/markets/whos-in-row.tsx";
const TIPS = "src/lib/ui/tips.ts";
const FIRST_TIPS = "src/components/ui/first-tips.tsx";
const STATS = "src/lib/usage/stats.ts";
const CARD = "src/lib/ui/numbers-card.tsx";
const ROUTE = "src/app/numbers/route.ts";
const PUBLIC = "src/lib/usage/public-numbers.ts";
const REDACT = "src/lib/redact.ts";
const CONSOLE = "src/lib/redact-console.ts";
const FIXTURE = "tests/db/fixture.ts";
const RUN = "tests/mutation/run.ts";
const ROOM = "tests/mutation/room.ts";

const PASS_RULE = "  return q.open && (q.viewerIn || q.viewerAsked);";
const GAME_PASS = ' pass={codeQuestion && passThePhoneShows({ open: codeQuestion.state === "open", viewerIn: codeQuestion.mine !== null, viewerAsked: codeQuestion.dare.creatorId === me.id }) ? { dareId: codeQuestion.dare.id, explained: me.handOverExplainedAt !== null } : null}';
const SETTLED_LINE = "where not u.excluded_from_counts and d.resolved_at is not null and d.resolved_by in ('quorum', 'provisional', 'arbitration', 'feed', 'ruling') and ${inWindow(\"d.resolved_at\", w)}`;";
const FRESH = '"cache-control": "no-cache, max-age=0, must-revalidate"';

export const submission: Mutant[] = [
  // Section 0: a code works like its link.
  { id: "guest-code-told-to-sign-in", file: JOIN, find: "  if (!user) return codeForGuest(raw);", replace: '  if (!user) return { error: WORDS.signedOut, at: "form" };', suite: U, kills: [T_U_CODE], why: "a guest who types a code is told to sign in, as the owner found (the last round)" },
  { id: "guest-code-counted-by-address", file: JOIN, find: '  return createHmac("sha256", process.env.SESSION_SECRET ?? "dareful").update(`code-guess:${address}`).digest("hex").slice(0, 32);', replace: "  return address;", suite: U, kills: [T_U_CODE], why: "a guest's network address itself goes into the table" },
  { id: "guest-code-misses-free", file: ROOMS, find: "    await spendGuess(who);", replace: '    if ("userId" in who) await spendGuess(who);', suite: D, kills: [T_D_CODE], why: "a guest walks the codes for nothing" },
  { id: "guest-guesses-unlimited", file: ROOMS, find: "where network_hash = ${who.network} and created_at > now() - interval '1 hour'`)", replace: "where network_hash = ${who.network} and created_at > now()`)", suite: D, kills: [T_D_CODE], why: "a network's misses are never counted toward the hour's twenty" },
  { id: "guest-misses-kept-forever", file: ROOMS, find: '    if ("network" in who) await tx.delete(schema.codeAttempts).where(sql`${schema.codeAttempts.networkHash} is not null and ${schema.codeAttempts.createdAt} < now() - interval \'1 day\'`);\n', replace: "", suite: D, kills: [T_D_CODE], why: "a guest's misses are kept long after they count for anything" },

  // Section 0: pass the phone for the asker and on a game page.
  { id: "pass-only-once-in", file: HAND, find: PASS_RULE, replace: "  return q.open && q.viewerIn;", suite: U, kills: [T_U_PASS], why: "the asker who has not made their call has no pass the phone, which the owner took for gone" },
  { id: "pass-only-once-in-db", file: HAND, find: PASS_RULE, replace: "  return q.open && q.viewerIn;", suite: D, kills: [T_D_PASS], why: "the same break on the server's own check" },
  { id: "pass-only-once-in-http", file: HAND, find: PASS_RULE, replace: "  return q.open && q.viewerIn;", suite: H, kills: [T_H_ROW], why: "the same break on the market's row" },
  { id: "pass-for-anyone", file: HAND, find: PASS_RULE, replace: "  return q.open;", suite: U, kills: [T_U_PASS], why: "someone who neither asked nor is in hands the phone over" },
  { id: "pass-for-anyone-db", file: HAND, find: PASS_RULE, replace: "  return q.open;", suite: D, kills: [T_D_PASS], why: "the same break on the server's own check" },
  { id: "game-row-loses-pass", file: GAME, find: GAME_PASS, replace: "", suite: H, kills: [T_H_GAME], why: "the game page's one row has no pass the phone, as it had none since the page took that row" },
  { id: "game-row-loses-pass-source", file: GAME, find: GAME_PASS, replace: "", suite: U, kills: [T_U_PASS], why: "the same, read in the source" },
  { id: "market-pass-needs-in", file: MARKET, find: "viewerAsked: d.creatorId === me.id }) ? { dareId: d.id, explained: me.handOverExplainedAt !== null } : null} />", replace: "viewerAsked: false }) ? { dareId: d.id, explained: me.handOverExplainedAt !== null } : null} />", suite: H, kills: [T_H_ROW], why: "a market's row hides pass the phone from its asker until they are in" },
  { id: "row-loses-the-code", file: ROW, find: "          {code ? (", replace: "          {false ? (", suite: H, kills: [T_H_ROW, T_H_GAME], why: "a share row loses the code to scan its screen should have" },
  { id: "row-loses-copy", file: ROW, find: '          <button type="button" aria-label={copied ? "Link copied" : "Copy the link"}', replace: '          {false && <button type="button" aria-label={copied ? "Link copied" : "Copy the link"}', also: [{ file: ROW, find: "          </button>\n          {code ? (", replace: "          </button>}\n          {code ? (" }], suite: H, kills: [T_H_ROW], why: "a share row loses copy the link" },
  { id: "row-loses-the-pass-button", file: ROW, find: "          {pass ? (", nth: 1, replace: "          {false ? (", suite: H, kills: [T_H_ROW, T_H_GAME], why: "the row is given pass the phone and draws no button for it" },

  // Section 0: a market's tips wait until the person is in, then run as one.
  { id: "market-tips-three-at-a-time", file: TIPS, find: "  return runsAsOne(opts.key) ? out : out.slice(0, TIPS_AT_MOST);", replace: "  return out.slice(0, TIPS_AT_MOST);", suite: U, kills: [T_U_TIPS], why: "a market's tips stop at three, the owner's \"3 of 3\" and the rest on the next market" },
  { id: "tips-ignore-the-wait", file: FIRST_TIPS, find: "      if (icon?.dataset.tipsWait !== undefined) return;\n", replace: "", suite: U, kills: [T_U_TIPS], why: "a market's tips show before the person is in, without pass the phone and photos" },
  { id: "tips-never-look-again", file: FIRST_TIPS, find: 'attributeFilter: ["data-info-icon", "data-tips-wait"]', replace: 'attributeFilter: ["data-info-icon"]', suite: U, kills: [T_U_TIPS], why: "the tips wait for good: getting in never brings the look round again" },
  { id: "tip-ringed-half-off-the-screen", file: FIRST_TIPS, find: "      const el = tip ? shown(tip.target, !broughtIn.current.has(tip.key)) : null;", replace: "      const el = tip ? shown(tip.target) : null;", suite: U, kills: [T_U_TIPS], why: "a control half under the screen's foot is ringed where it is, the ring and its card cut off" },
  { id: "tip-scrolls-for-a-fixed-control", file: FIRST_TIPS, find: '  if (whole && !el.closest("[data-fixed]")) {', replace: "  if (whole) {", suite: U, kills: [T_U_TIPS], why: "the page scrolls under the + for a control no scroll can move" },
  { id: "market-tips-never-wait", file: MARKET, find: " tipsWait={mine === null} />", replace: " tipsWait={false} />", suite: H, kills: [T_H_TIPS], why: "a market's screen never says its tips wait" },
  { id: "info-icon-drops-the-wait", file: "src/components/ui/info.tsx", find: 'data-tips-wait={tipsWait ? "" : undefined}', replace: "data-tips-wait={undefined}", suite: H, kills: [T_H_TIPS], why: "the icon never carries the wait it is given" },
  { id: "guest-tips-never-wait", file: "src/app/m/[id]/ghost.tsx", find: ' tipsWait={mine === null} />', replace: " />", suite: U, kills: [T_U_TIPS], why: "a guest's market shows its tips before the guest is in" },
  { id: "game-tips-never-wait", file: GAME, find: '<TopBar back right={more} info="game" tipsWait={!inAny} />', replace: '<TopBar back right={more} info="game" />', suite: U, kills: [T_U_TIPS], why: "a game page shows its tips before the person is in any of its questions" },

  // Section 2: the public numbers and the day's new people.
  { id: "guests-count-the-bound", file: STATS, find: "where c.claimed_by is null and c.merged_into is null and not c.excluded_from_counts and not a.excluded_from_counts", replace: "where c.merged_into is null and not c.excluded_from_counts and not a.excluded_from_counts", suite: D, kills: [T_D_NUMBERS], why: "a guest who made an account counts twice, as the guest and as the account" },
  { id: "guests-on-a-tests-question", file: STATS, find: "and not c.excluded_from_counts and not a.excluded_from_counts and p.acknowledged_at", replace: "and not c.excluded_from_counts and p.acknowledged_at", suite: D, kills: [T_D_NUMBERS], why: "a test's or a walk's guest counts as a real one" },
  { id: "settled-counts-expired", file: STATS, find: SETTLED_LINE, replace: "where not u.excluded_from_counts and d.resolved_at is not null and d.resolved_by in ('quorum', 'provisional', 'arbitration', 'feed', 'ruling', 'expired') and ${inWindow(\"d.resolved_at\", w)}`;", suite: D, kills: [T_D_NUMBERS], why: "a question nobody settled counts as settled" },
  { id: "questions-count-drafts", file: STATS, find: "where not u.excluded_from_counts and d.creator_signature is not null and ${inWindow(\"d.created_at\", w)}`;", replace: "where not u.excluded_from_counts and ${inWindow(\"d.created_at\", w)}`;", suite: D, kills: [T_D_NUMBERS], why: "a draft never sent counts as asked" },
  { id: "accounts-count-the-excluded", file: STATS, find: "const ACCOUNTS = (w: StatWindow) => sql`select count(*)::int as n from users u where not u.excluded_from_counts and ", replace: "const ACCOUNTS = (w: StatWindow) => sql`select count(*)::int as n from users u where ", suite: D, kills: [T_D_NUMBERS], why: "the owner's test accounts count as people" },
  { id: "snapshot-refresh-forgets-the-day", file: STATS, find: "    if (write) await db.update(schema.usageSnapshots).set({ counts: { ...counts, ...now } })", replace: "    if (write) await db.update(schema.usageSnapshots).set({ counts: now })", suite: D, kills: [T_D_NUMBERS], why: "a day gains the four and loses everything it was taken with" },
  { id: "launch-from-the-beginning", file: STATS, find: ": { from: LAUNCH, to: now };", replace: ": { from: null, to: now };", suite: U, kills: [T_U_LAUNCH], why: "since launch counts what a test keeps in 2002" },
  { id: "public-numbers-this-week", file: PUBLIC, find: '  const four = await peopleAndQuestions(windowFor("launch", now));', replace: '  const four = await peopleAndQuestions(windowFor("week", now));', suite: D, kills: [T_D_PUBLIC], why: "the README's numbers are the last seven days, called everything" },
  { id: "public-numbers-without-the-chain", file: PUBLIC, find: "    chain = { obligations: c.obligations, questions: c.questions, people: c.people, sets: c.sets };", replace: "    void c;", suite: D, kills: [T_D_PUBLIC], why: "the picture never says what real use put on the chain" },
  { id: "card-says-plural-for-one", file: CARD, find: "  return { n: n.toLocaleString(\"en-US\"), noun: n === 1 ? one : many };", replace: "  return { n: n.toLocaleString(\"en-US\"), noun: many };", suite: U, kills: [T_U_CARD], why: "\"1 guests\"" },
  { id: "card-reads-in-utc", file: CARD, find: 'const ZONE = "America/New_York";', replace: 'const ZONE = "UTC";', suite: U, kills: [T_U_CARD], why: "the time the numbers were read says ET and is UTC" },
  { id: "numbers-kept-by-proxies", file: ROUTE, find: FRESH, replace: '"cache-control": "public, max-age=31536000, immutable"', suite: H, kills: [T_H_IMAGE], why: "GitHub's image proxy keeps the first picture for a year, and the numbers stop counting" },
  { id: "numbers-kept-by-proxies-source", file: ROUTE, find: FRESH, replace: '"cache-control": "public, max-age=31536000, immutable"', suite: U, kills: [T_U_CACHE], why: "the same, read in the source" },
  { id: "numbers-read-every-time", file: ROUTE, find: '["public-numbers-v1"], { revalidate: READ_EVERY_S }', replace: '["public-numbers-v1"], { revalidate: 1 }', suite: U, kills: [T_U_CACHE], why: "every view reads the database and the indexer, whatever the five minutes" },
  { id: "numbers-failure-kept", file: ROUTE, find: "    return renderNumbersCard(null, f, NEVER_KEPT);", replace: "    return renderNumbersCard(null, f, FRESH);", suite: U, kills: [T_U_CACHE], why: "a failed read is kept at the edge as if it were the numbers" },
  { id: "fixture-counts-test-accounts", file: FIXTURE, find: ", displayName: name, phoneHash, ...(opts.counted ? { createdAt: BEFORE_LAUNCH } : { excludedFromCounts: true }) })", replace: ", displayName: name, phoneHash, ...(opts.counted ? { createdAt: BEFORE_LAUNCH } : {}) })", suite: D, kills: [T_D_FIXTURE], why: "a test account counts as a person while its run lasts, and for good if the run is cut short" },
  { id: "fixture-counts-test-signers", file: FIXTURE, find: ", displayName: name, ...(opts.counted ? { createdAt: BEFORE_LAUNCH } : { excludedFromCounts: true }) })", replace: ", displayName: name, ...(opts.counted ? { createdAt: BEFORE_LAUNCH } : {}) })", suite: D, kills: [T_D_FIXTURE], why: "a test signer counts, wallets and all, on the chain's real use" },
  { id: "fixture-counted-made-today", file: FIXTURE, find: ", displayName: name, phoneHash, ...(opts.counted ? { createdAt: BEFORE_LAUNCH } : { excludedFromCounts: true }) })", replace: ", displayName: name, phoneHash, ...(opts.counted ? {} : { excludedFromCounts: true }) })", suite: D, kills: [T_D_FIXTURE], why: "a counting test's account is made today and counts since launch while it runs" },

  // Section 4: keys out of every error.
  { id: "redaction-keeps-the-rpc-key", file: REDACT, find: "    .replace(/(https?:\\/\\/[^\\s\"'`<>]+?\\/v\\d+\\/)[A-Za-z0-9_-]{16,}/g, `$1${KEY_MARK}`)\n", replace: "", suite: U, kills: [T_U_REDACT], why: "an RPC's key this process does not hold stays in the line" },
  { id: "redaction-forgets-the-secrets", file: REDACT, find: "  for (const name of SECRET_NAMES) {", replace: "  for (const name of [] as string[]) {", suite: U, kills: [T_U_REDACT], why: "the app's own secrets are never looked for by their value" },
  { id: "redaction-keeps-the-password", file: REDACT, find: "    .replace(/([a-z][a-z0-9+.-]*:\\/\\/[^:\\s/\"'`<>@]+:)[^@\\s\"'`<>]+@/gi, `$1${KEY_MARK}@`)\n", replace: "", suite: U, kills: [T_U_REDACT], why: "a connection string's password stays in the line" },
  { id: "console-passes-keys", file: CONSOLE, find: "    c[level] = (...args: unknown[]) => original(...args.map((a) => redactArg(a, env)));", replace: "    c[level] = (...args: unknown[]) => original(...args);", suite: U, kills: [T_U_CONSOLE], why: "the console prints what it is given, keys and all" },
  { id: "console-reads-strings-only", file: CONSOLE, find: "  const shown = inspect(arg, { depth: 8, breakLength: 120 });", replace: "  return arg;\n  const shown = inspect(arg, { depth: 8, breakLength: 120 });", suite: U, kills: [T_U_CONSOLE], why: "an error printed beside a line carries the RPC's key, as it did in production" },
  { id: "instrumentation-forgets-the-console", file: "src/instrumentation.ts", find: "  guardConsole();\n", replace: "", suite: U, kills: [T_U_CONSOLE], why: "no server instance puts the redaction in place" },
  { id: "failure-keeps-the-secrets", file: "src/lib/chain/failures.ts", find: "  return redactKeys(`${first}${details}`.replace(/https?:\\/\\/\\S+/g, \"[rpc]\")).slice(0, 300);", replace: "  return `${first}${details}`.replace(/https?:\\/\\/\\S+/g, \"[rpc]\").slice(0, 300);", suite: U, kills: [T_U_KEPT], why: "a chain failure that quotes a secret keeps it in the table and the owner's email" },
  { id: "feed-error-keeps-the-key", file: "src/lib/sports/index.ts", find: "  return redactKeys(error).slice(0, 200);", replace: "  return error.slice(0, 200);", suite: U, kills: [T_U_KEPT], why: "a feed's failure keeps a key in the table" },
  { id: "stats-line-keeps-the-key", file: "src/app/stats/page.tsx", find: 'why: redactKeys(err instanceof Error ? err.message.split("\\n")[0] : String(err))', replace: 'why: err instanceof Error ? err.message.split("\\n")[0] : String(err)', suite: U, kills: [T_U_KEPT], why: "a section's line on /stats logs the failure as it came" },

  // Section 3: the runner's pause and its room.
  { id: "runner-counts-a-refusal", file: RUN, find: "      queue.splice(i + 1, 0, m);\n", replace: "", suite: U, kills: [T_U_RUNNER], why: "a run the suites refused at the floor is lost, never run again" },
  { id: "runner-never-waits", file: RUN, find: "  if (signing(m)) waitForRoom(m.id, estimateWei(Math.max(0, dbChosen - dbDone), 0));", replace: "  if (false) waitForRoom(m.id, estimateWei(Math.max(0, dbChosen - dbDone), 0));", suite: U, kills: [T_U_RUNNER], why: "the run spends the relayer down to the floor and voids everything after" },
  { id: "runner-on-production-rpc", file: RUN, find: "if (process.env.AUDIT_RPC_URL) process.env.MONAD_RPC_URL = process.env.AUDIT_RPC_URL;\n", replace: "", suite: U, kills: [T_U_RUNNER], why: "the audit's chain calls share production's own key" },
  { id: "runner-never-emails", file: RUN, find: '      const sent = helper(["ops",', replace: '      const sent = helper(["ops", "--dry",', suite: U, kills: [T_U_RUNNER], why: "the owner is never told the audit paused" },
  { id: "audit-reaches-the-api", file: RUN, find: 'env: { ...process.env, DAREFUL_NO_LIVE_AI: "1" }', replace: "env: process.env", suite: U, kills: [T_U_RUNNER], why: "the audit's one-process test runs could call the live model API, since nothing tells the guard it is under the test runner" },
  { id: "pause-at-the-floor-itself", file: ROOM, find: "export const PAUSE_AT_WEI = TEST_FLOOR_WEI + 10n ** 18n;", replace: "export const PAUSE_AT_WEI = TEST_FLOOR_WEI;", suite: U, kills: [T_U_RUNNER], why: "a run starts a mutant that takes the relayer under the suites' floor" },
  { id: "estimate-from-every-mutant", file: ROOM, find: "  const perMutant = LAST_FULL.wei / BigInt(LAST_FULL.db);", replace: "  const perMutant = LAST_FULL.wei / BigInt(LAST_FULL.mutants);", suite: U, kills: [T_U_RUNNER], why: "the estimate spreads the spend over mutants that never sign" },
  { id: "mon-in-thousandths", file: ROOM, find: "  const cents = (v % 10n ** 18n) / 10n ** 16n;", replace: "  const cents = (v % 10n ** 18n) / 10n ** 15n;", suite: U, kills: [T_U_RUNNER], why: "the run says 7.990 MON" },
];
