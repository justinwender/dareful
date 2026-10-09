/**
 * The touch-ups round (2026-10-08): after the relayer ran dry (section 0), the owner's page and the log (section 1),
 * the app's rulings (section 2), every tap answering (section 3), writing the terms (section 4), the sheets (section
 * 5), the game page's one row (section 6), the tile (section 7), the keyboard (section 8), pull to refresh (section
 * 9), the guides (section 10) and settings (section 11). Pure rules only; the database's side is in
 * tests/db/touch-ups.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { concat, ContractFunctionRevertedError, hexToBytes, InvalidInputRpcError, keccak256, RpcRequestError, stringToBytes, stringToHex, type Hex } from "viem";
import { contractRefused, dueToTell, failureWhy, TELL_AFTER_MS, TELL_AGAIN_MS } from "@/lib/chain/failures";
import { alreadyThere, failureKeyOf } from "@/lib/chain/relayer";
import { costOf, daysCovered, relayerLow, RELAYER_FLOOR, TEST_FLOOR_MARK } from "@/lib/chain/watch";
import { CHAIN_LOCK_GIVE_UP_MS, CHAIN_LOCK_REFUSALS, givesUp } from "@/lib/ledger/markets";
import { chainPending, isProvisional } from "@/lib/ledger/provisional";
import { darefulDaresAbi } from "@/lib/chain/abi/DarefulDares";
import { pushFailure } from "@/lib/notify/channels";
import { SECTION_LIMIT_MS, TookTooLong, within } from "@/lib/usage/within";
import { tapHolds } from "@/components/ui/button";
import { newSalt, sealedText, sealHolds, sealInTerms, sealLine, sealOf } from "@/lib/ledger/seal";
import { everyoneAgreed, rulingStage, SILENCE_MS, silenceSettles, STAGE_WORDS } from "@/lib/ledger/rulings";
import { agreedWords } from "@/lib/ui/calls-words";
import { CarefulQuestions, eitherOr, threeSentences } from "@/lib/ai/settler";
import { appRulingStood } from "@/lib/ledger/markets";
import { roomAfterCutOff, thinkingFor } from "@/lib/ai/client";
import { FLICK_PX_PER_MS, modalNext, modalOffset, modalPositions } from "@/components/ui/sheet";
import { RAISED_SHARE } from "@/components/ui/pinned-sheet";
import { ASK_SOMETHING_KEY, ASK_TARGET, CURATED_TIPS, tipPlacement, tipsFor } from "@/lib/ui/tips";
import { infoSheet } from "@/lib/ui/info-sheets";
import { cutPhrasesIn } from "@/lib/ui/copy-rules";
import { nameProblem, NOT_A_NAME, ownUnitOf } from "@/lib/ledger/settings";
import { typingAtTouch } from "@/lib/ui/viewport";

const MON = 10n ** 18n;
const recorded = JSON.parse(readFileSync("tests/fixtures/chain/relayer-writes.json", "utf8")) as { writes: Array<{ kind: string; raw: Hex; charged: string; baseFee: string }> };

// ------------------------------------------------------------------------------------- section 0: the relayer

test("a write costs its gas limit at the base fee and its tip, as the chain charged the relayer's three real writes after the top-up", () => {
  assert.equal(recorded.writes.length, 3);
  for (const w of recorded.writes) assert.equal(costOf(w.raw, BigInt(w.baseFee)), BigInt(w.charged), w.kind);
  // A base fee over the transaction's own maximum is capped by it: the price is never more than the signed cap.
  const first = recorded.writes[0] as { raw: Hex; charged: string };
  assert.ok(costOf(first.raw, 10n ** 15n) < 10n ** 15n * 480_000n);
});

test("the relayer is low under three days of use at the past week's rate, or under the floor, and the days it covers are read in integers", () => {
  const perDay = 7n * MON;
  assert.equal(relayerLow(15n * MON, RELAYER_FLOOR, perDay), true, "14.87 MON at 7 a day is two days");
  assert.equal(relayerLow(21n * MON, RELAYER_FLOOR, perDay), false, "exactly three days is not under three days");
  assert.equal(relayerLow(2n * MON, RELAYER_FLOOR, 0n), true, "under the floor with nothing spent");
  assert.equal(relayerLow(4n * MON, RELAYER_FLOOR, 0n), false);
  assert.equal(daysCovered(14_870_000_000_000_000_000n, 7n * MON), 2.1);
  assert.equal(daysCovered(MON, 0n), null, "nothing spent covers no number of days");
  assert.ok(readFileSync("tests/mutation/run.ts", "utf8").includes(`const FLOOR_MARK = "${TEST_FLOOR_MARK}";`), "the audit reads the suites' refusal at the floor as void, never a kill");
});

test("a failure is filed without the RPC's address, which carries its key, and with the node's own words", () => {
  const err = new InvalidInputRpcError(new RpcRequestError({ body: { method: "eth_sendRawTransaction" }, error: { code: -32000, message: "Signer had insufficient balance" }, url: "https://monad-testnet.example/v2/secret-key-here" }));
  const why = failureWhy(err);
  assert.ok(!why.includes("secret-key-here"), why);
  assert.ok(!/https?:\/\//.test(why), why);
  assert.match(why, /insufficient balance/);
  const inline = failureWhy(new Error("request to https://monad-testnet.example/v2/secret-key-here failed, reason: socket hang up"));
  assert.ok(!inline.includes("secret-key-here") && inline.includes("[rpc]"), `an address in the first line itself is taken out: ${inline}`);
  assert.equal(contractRefused(err), false, "the relayer's gas is not the contract refusing");
});

test("the contract refusing a write is told apart from the network: a revert is believed, a balance is not", () => {
  const revert = new ContractFunctionRevertedError({ abi: darefulDaresAbi, functionName: "create", message: "execution reverted" });
  assert.equal(contractRefused(revert), true);
  assert.equal(contractRefused(new Error("The contract function \"create\" reverted.\n\nError: BadEnterSignature(uint256 index)")), true);
  assert.equal(contractRefused(new Error("fetch failed")), false);
  assert.equal(contractRefused(new Error("The request took too long to respond. timeout")), false);
});

test("a revert that says the thing is already there is the write's purpose met, and every failure is filed under the thing, not the attempt", () => {
  assert.equal(alreadyThere(new Error("reverted with DareExists(bytes32 dareId)")), true);
  assert.equal(alreadyThere(new Error("reverted with GroupExists(bytes32 groupId)")), true);
  assert.equal(alreadyThere(new Error("reverted with BadEnterSignature(uint256 index)")), false);
  assert.equal(failureKeyOf({ kind: "create", subject: { dareId: "a" } }), failureKeyOf({ kind: "create", subject: { dareId: "a" }, actor: "someone" }));
  assert.notEqual(failureKeyOf({ kind: "create", subject: { dareId: "a" } }), failureKeyOf({ kind: "resolve", subject: { dareId: "a" } }));
});

test("the owner hears of a write failing for more than fifteen minutes and still failing, once a day at most", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(dueToTell({ firstFailedAt: ago(TELL_AFTER_MS + 1), lastFailedAt: ago(60_000), alertedAt: null }, now), true);
  assert.equal(dueToTell({ firstFailedAt: ago(TELL_AFTER_MS - 1), lastFailedAt: ago(60_000), alertedAt: null }, now), false, "not yet fifteen minutes");
  assert.equal(dueToTell({ firstFailedAt: ago(TELL_AFTER_MS * 4), lastFailedAt: ago(TELL_AFTER_MS + 1), alertedAt: null }, now), false, "nobody is trying it any more");
  assert.equal(dueToTell({ firstFailedAt: ago(TELL_AFTER_MS * 4), lastFailedAt: ago(60_000), alertedAt: ago(3_600_000) }, now), false, "told within the day");
  assert.equal(dueToTell({ firstFailedAt: ago(TELL_AGAIN_MS * 2), lastFailedAt: ago(60_000), alertedAt: ago(TELL_AGAIN_MS) }, now), true, "a day on and still failing");
});

test("a close's chain write is given up on the contract's third refusal or after a day of failing, never on the network's word", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const since = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(givesUp({ refused: true, tries: CHAIN_LOCK_REFUSALS - 1, pendingSince: since(60_000), now }), false, "a node a block behind can refuse what the chain would take");
  assert.equal(givesUp({ refused: true, tries: CHAIN_LOCK_REFUSALS, pendingSince: since(60_000), now }), true);
  assert.equal(givesUp({ refused: false, tries: 900, pendingSince: since(CHAIN_LOCK_GIVE_UP_MS - 60_000), now }), false, "a dry relayer is tried again until the day is out");
  assert.equal(givesUp({ refused: false, tries: 2, pendingSince: since(CHAIN_LOCK_GIVE_UP_MS), now }), true);
});

test("a close whose chain write is still to land is neither on the chain nor provisional, and becomes provisional only when it is given up", () => {
  const locked = new Date();
  assert.equal(isProvisional({ lockedAt: locked, onchainId: null, chainPendingAt: locked }), false);
  assert.equal(chainPending({ onchainId: null, chainPendingAt: locked }), true);
  assert.equal(isProvisional({ lockedAt: locked, onchainId: null, chainPendingAt: null }), true);
  assert.equal(chainPending({ onchainId: Buffer.alloc(32), chainPendingAt: null }), false);
  assert.equal(isProvisional({ lockedAt: locked, onchainId: Buffer.alloc(32), chainPendingAt: null }), false);
});

// ------------------------------------------------------------------------------ section 1: the owner's page and the log

test("a push the library cannot encrypt to, or the service says is gone, is a dead subscription; the network and a busy service are tried once more", async () => {
  const webpush = (await import("web-push")).default;
  // A key pair from the library's own generator, so nothing here is a key typed by hand.
  const vapid = webpush.generateVAPIDKeys();
  webpush.setVapidDetails("https://dareful.app", vapid.publicKey, vapid.privateKey);
  // The library's own refusal, before anything is sent, for the placeholder keys the suites used to insert.
  let thrown: unknown = null;
  try {
    webpush.generateRequestDetails({ endpoint: "https://push.invalid/x", keys: { p256dh: "p", auth: "a" } }, "x");
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof Error, "the library refuses keys it cannot encrypt to");
  assert.equal(pushFailure(thrown), "dead");
  const said = (status: number) => new webpush.WebPushError("Received unexpected response code", status, {}, "", "https://push.invalid/x");
  assert.equal(pushFailure(said(410)), "dead");
  assert.equal(pushFailure(said(404)), "dead");
  assert.equal(pushFailure(said(403)), "dead", "a subscription made with another key pair");
  assert.equal(pushFailure(said(429)), "retry");
  assert.equal(pushFailure(said(503)), "retry");
  assert.equal(pushFailure(said(413)), "failed", "too big is not helped by a second try");
  assert.equal(pushFailure(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), "retry");
});

test("a section of the owner's page waits its time and no longer, and the read it gave up on is not mistaken for a value", async () => {
  assert.equal(await within(50, Promise.resolve(7)), 7);
  await assert.rejects(within(20, new Promise((r) => setTimeout(() => r(1), 200))), (e: unknown) => e instanceof TookTooLong);
  await assert.rejects(within(200, Promise.reject(new Error("the indexer responded 503"))), /503/);
  assert.ok(SECTION_LIMIT_MS.counts > SECTION_LIMIT_MS.chain, "forty queries get longer than one");
});

// ---------------------------------------------------------------------------------- section 3: every tap answers

test("a tap holds its control until the action answers: its promise, the caller's own wait, or two frames for a tap that started none", () => {
  assert.equal(tapHolds({ returned: Promise.resolve(), sawLoading: false }), "promise");
  assert.equal(tapHolds({ returned: undefined, sawLoading: true }), "loading");
  assert.equal(tapHolds({ returned: undefined, sawLoading: false }), "frames");
  assert.equal(tapHolds({ returned: { then: 1 }, sawLoading: false }), "frames", "something with a then that is not a function is not a promise");
});

// ------------------------------------------------------------------------------------------ section 2: the app's rulings

test("a ruling is sealed as its verdict and reasons with a salt, the terms carry the seal, and the check holds only for the exact text", () => {
  const salt = "0x0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff" as const;
  const text = sealedText(1n, "Hitting a pitch is harder.", null);
  assert.equal(text, "yes\nHitting a pitch is harder.");
  assert.equal(sealedText(-1n, "Nothing settles it.", null).split("\n")[0], "cannot decide");
  assert.equal(sealedText(1n, "Soccer.", ["Baseball", "Soccer"]).split("\n")[0], "answer: Soccer", "a pick names its answer by its own words");
  const seal = sealOf(salt, text);
  assert.equal(seal, keccak256(concat([hexToBytes(salt), stringToBytes(text)])), "the salt's 32 bytes, then the text's UTF-8 bytes");
  const terms = `Yes if hitting a pitch in play is harder.\n\n${sealLine(seal)}`;
  assert.equal(sealInTerms(terms), seal);
  assert.equal(sealHolds(terms, salt, text), true);
  assert.equal(sealHolds(terms, salt, `${text} `), false, "one character more and it fails");
  assert.equal(sealHolds(terms, `0x${"00".repeat(32)}`, text), false, "another salt fails");
  assert.equal(sealHolds("Yes if hitting a pitch in play is harder.", salt, text), false, "terms with no seal hold nothing");
  assert.notEqual(newSalt(), newSalt());
  assert.ok(!/—/.test(sealLine(seal)));
});

test("everyone in agreeing with the ruling as it stands settles it; an agreement with an earlier ruling, or one person short, does not", () => {
  assert.equal(everyoneAgreed(["a", "b"], [{ pid: "a", outcome: 1n }, { pid: "b", outcome: 1n }], 1n), true);
  assert.equal(everyoneAgreed(["a", "b"], [{ pid: "a", outcome: 1n }], 1n), false);
  assert.equal(everyoneAgreed(["a", "b"], [{ pid: "a", outcome: 1n }, { pid: "b", outcome: 0n }], 1n), false, "an agreement with a different ruling is not one with this");
  assert.equal(everyoneAgreed([], [], 1n), false);
});

test("silence agrees a day after the ruling is shown, never with a dispute, never twice, and never before it is shown", () => {
  const now = new Date("2026-10-09T20:11:00Z");
  const shown = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(silenceSettles({ revealedAt: shown(SILENCE_MS), disputes: 0, resolved: false, now }), true);
  assert.equal(silenceSettles({ revealedAt: shown(SILENCE_MS - 60_000), disputes: 0, resolved: false, now }), false);
  assert.equal(silenceSettles({ revealedAt: shown(SILENCE_MS * 2), disputes: 1, resolved: false, now }), false);
  assert.equal(silenceSettles({ revealedAt: shown(SILENCE_MS * 2), disputes: 0, resolved: true, now }), false);
  assert.equal(silenceSettles({ revealedAt: null, disputes: 0, resolved: false, now }), false);
});

test("an argument after its close names its ruling's stage in plain words, never that it has happened", () => {
  assert.equal(rulingStage({ ruled: false, disputes: 0, settledBy: "evidence", said: 0, weighing: false }), "asking");
  assert.equal(rulingStage({ ruled: false, disputes: 0, settledBy: "evidence", said: 1, weighing: false }), "weighing");
  assert.equal(rulingStage({ ruled: false, disputes: 0, settledBy: "facts", said: 0, weighing: false }), "weighing");
  assert.equal(rulingStage({ ruled: true, disputes: 0, settledBy: "facts", said: 0, weighing: false }), "ruled");
  assert.equal(rulingStage({ ruled: true, disputes: 1, settledBy: "facts", said: 0, weighing: false }), "tiebreaker");
  for (const words of Object.values(STAGE_WORDS)) assert.ok(!/happened/i.test(words) || words === "Say what happened", words);
  assert.equal(agreedWords([{ name: "Dave", me: false }]), "Dave agrees.");
  assert.equal(agreedWords([{ name: "Dave", me: false }, { name: "You", me: true }]), "Dave and you agree.");
  assert.equal(agreedWords([{ name: "You", me: true }]), "You agree.");
  assert.equal(agreedWords([]), "");
});

test("a ruling's reasons are three sentences at most, cut between sentences and never inside a number", () => {
  assert.equal(threeSentences("One. Two. Three. Four. Five."), "One. Two. Three.");
  assert.equal(threeSentences("Saves run 20 to 25 percent. A batter rarely makes contact at 2.5 seconds. That decides it. And more."), "Saves run 20 to 25 percent. A batter rarely makes contact at 2.5 seconds. That decides it.");
  assert.equal(threeSentences("Just one."), "Just one.");
});

test("the chain's record of a ruling is told as the app's own when its hash is the app's ruling's text, and as the tiebreaker's otherwise", () => {
  const d = { pace: "argument", aiOutcome: 1n, aiRationale: "Hitting a pitch is harder.", kind: "binary", outcomeLabels: ["no", "yes"] };
  const own = keccak256(stringToHex(sealedText(1n, "Hitting a pitch is harder.", null)));
  assert.equal(appRulingStood(d, own), true);
  assert.equal(appRulingStood(d, keccak256(stringToHex("The tiebreaker's paragraph."))), false);
  assert.equal(appRulingStood({ ...d, pace: "dare" }, own), false, "a dare has no app ruling to stand");
});

// ------------------------------------------------------------------------------------------- section 4: writing the terms

test("an either-or question answered by yes and no is caught, and a question that offers two ways carries its own two answers", () => {
  assert.equal(eitherOr("Does Boone need to be formally terminated, or does stepping down voluntarily count?"), true, "the owner's screenshot");
  assert.equal(eitherOr("If Boone is fired partway through a season, does that count as 'fire' for that year?"), false);
  assert.equal(eitherOr("Does a non-renewal at the end of a contract count as being fired?"), false);
  assert.equal(eitherOr("Does Boone stepping down or resigning from the position count, or only if the Yankees terminate him?"), true, "found on the simulator");
  assert.equal(eitherOr("Must it happen by the end of 2026 or anytime in 2027?"), true);
  assert.equal(eitherOr("Does Boone stepping down or resigning count?"), false, "a plain or between two things that count the same");
  const ok = CarefulQuestions.safeParse({ questions: [{ question: "Does it have to be a firing, or does stepping down count too?", answers: ["Only a firing", "Stepping down counts too"] }, { question: "Does a firing during the playoffs count?" }, "Does a non-renewal count as being fired?"] });
  assert.ok(ok.success);
  assert.deepEqual(ok.data.questions[0]?.answers, ["Only a firing", "Stepping down counts too"]);
  assert.equal(ok.data.questions[1]?.answers, null);
  assert.equal(CarefulQuestions.safeParse({ questions: [{ question: "Does Boone need to be formally terminated, or does stepping down voluntarily count?" }, { question: "Does a firing during the playoffs count?" }, { question: "Does a non-renewal count as being fired?" }] }).success, false, "an either-or without its answers goes back to the model");
  const empty = CarefulQuestions.safeParse({ questions: [{ question: "Does a firing during the playoffs count?", answers: [] }, { question: "Does a firing in spring count?" }, { question: "Does a non-renewal count as being fired?" }] });
  assert.ok(empty.success, "an empty list of answers is read as none");
});

test("each model's thinking is said its own way, and a cut-off answer gets twice the room once", () => {
  assert.deepEqual(thinkingFor("claude-haiku-5-5", "off"), { thinking: { type: "disabled" } });
  assert.deepEqual(thinkingFor("claude-sonnet-5-5", "off"), { thinking: { type: "between_tools" } });
  assert.deepEqual(thinkingFor("claude-opus-5-5", "off"), { output_config: { effort: "low" } }, "Opus cannot stop thinking");
  assert.deepEqual(thinkingFor("claude-haiku-4-5-20251001", "medium"), {}, "Haiku 4.5 takes no effort");
  assert.deepEqual(thinkingFor("claude-sonnet-5-5", "medium"), { output_config: { effort: "medium" } });
  assert.deepEqual(thinkingFor("claude-sonnet-5-5", undefined), {});
  assert.equal(roomAfterCutOff(900), 1800);
  assert.equal(roomAfterCutOff(30_000), 32_000);
});

// --------------------------------------------------------------------------------------------- sections 5 to 11

test("a modal sheet has the pinned sheet's positions: it opens raised, at most three quarters of the screen, drags up to full when raised cannot show it all, and closes below raised", () => {
  const tall = { panel: 800, screen: 874 };
  assert.deepEqual(modalPositions(tall), ["tucked", "raised", "full"]);
  assert.equal(modalOffset("raised", tall), 800 - Math.round(874 * RAISED_SHARE), "raised shows 72% of the screen");
  assert.equal(modalOffset("full", tall), 0);
  assert.equal(modalOffset("tucked", tall), 800, "closed is all of it below the screen");
  assert.equal(modalNext("raised", -40, 0.1, tall), "full", "a drag up past the snap");
  assert.equal(modalNext("raised", -10, 0.1, tall), "raised", "a small drag stays");
  assert.equal(modalNext("full", 30, 0.1, tall), "raised", "down from full stops at raised");
  assert.equal(modalNext("raised", 30, 0.1, tall), "tucked", "and below raised closes it");
  assert.equal(modalNext("raised", 10, FLICK_PX_PER_MS, tall), "tucked", "as a flick down does");
  assert.equal(modalNext("full", 700, 0.1, tall), "tucked", "one long drag goes as far as the finger took it");
  const short = { panel: 300, screen: 874 };
  assert.deepEqual(modalPositions(short), ["tucked", "raised"], "a sheet that fits has no full");
  assert.equal(modalOffset("raised", short), 0, "and stands whole");
  assert.equal(modalNext("raised", -60, 0.1, short), "raised", "a drag up has nowhere to go");
  const sheet = readFileSync("src/components/ui/sheet.tsx", "utf8");
  assert.ok(sheet.includes("const escape = useEffectEvent(() => onClose());") && !sheet.includes("}, [open, onClose]);"), "the focus moves only when it opens and closes, never on a parent's render (the PIN's cursor)");
  assert.ok(!/\btall\b|\bfull = false\b/.test(sheet.split("export function Sheet(")[1]?.split(")")[0] ?? ""), "one sheet, no height modes");
});

test("first-visit tips: Ask something once for every tab, each new tip once wherever its control shows, three at a time, and the card kept on the screen", () => {
  const plus = tipsFor(infoSheet("now")!, (s) => s === ASK_TARGET);
  assert.deepEqual(plus.map((t) => [t.entry.term, t.key]), [["Ask something", ASK_SOMETHING_KEY]]);
  assert.deepEqual(tipsFor(infoSheet("people")!, (s) => s === ASK_TARGET, { seen: [ASK_SOMETHING_KEY] }), [], "seen on Now, never again on People");
  const market = infoSheet("market-open")!;
  assert.deepEqual(tipsFor(market, () => true, { key: "market-open", seen: [] }).map((t) => t.key), ["/tips/share", "/tips/copy", "/tips/code"], "three at a time, in order");
  assert.deepEqual(tipsFor(market, () => true, { key: "market-open", seen: ["/tips/share", "/tips/copy", "/tips/code"] }).map((t) => t.key), ["/tips/pass", "/tips/photos"], "the rest on a later visit, each once");
  assert.deepEqual(tipsFor(market, (s) => s === "button[data-pass-phone]", { key: "market-open", seen: [] }).map((t) => t.entry.description), ["A friend makes their call on your phone, with their own PIN."], "only what is on screen");
  assert.deepEqual(tipsFor(infoSheet("ask-question")!, () => true, { key: "ask-question", seen: [] }).map((t) => t.entry.term), ["Add a mark", "Stickers", "What kind of thing"]);
  for (const tips of Object.values(CURATED_TIPS))
    for (const t of tips) {
      assert.match(t.key ?? "", /^\/[a-z0-9/[\]-]{0,39}$/, "a key the account can keep");
      assert.ok(/[.]$/.test(t.entry.description) && !/—/.test(t.entry.description) && cutPhrasesIn(`${t.entry.term} ${t.entry.description}`).length === 0, t.entry.term);
    }
  const screen = { width: 402, height: 874 };
  const over = tipPlacement({ x: 330, y: 760, width: 56, height: 56 }, 28, screen, { width: 240, height: 120 });
  assert.equal(over.below, false, "over a control in the bottom half");
  const nearTop = tipPlacement({ x: 330, y: 300, width: 56, height: 56 }, 28, { width: 402, height: 500 }, { width: 240, height: 300 });
  assert.ok(nearTop.tip.y >= 12, "never off the top edge");
  const squeezed = tipPlacement({ x: 100, y: 80, width: 56, height: 56 }, 28, { width: 402, height: 260 }, { width: 240, height: 200 });
  assert.ok(squeezed.tip.y >= 12 && squeezed.tip.y + 200 <= 260 - 12 + 1e-9 || squeezed.tip.y === 12, "kept inside the screen when neither side has room");
  const first = readFileSync("src/components/ui/first-tips.tsx", "utf8");
  assert.ok(first.includes("find(visible)") && first.includes("const el = tip ? shown(tip.target) : null;"), "the copy of the control on the screen, never the first in the document");
});

test("settings on You: a name the sign-up step would take, and units of your own, a word or two, never one already offered, six at most", () => {
  assert.equal(nameProblem("  Sam  "), null);
  assert.equal(nameProblem(""), NOT_A_NAME);
  assert.equal(nameProblem("sam.wells"), NOT_A_NAME, "an identifier is not a name");
  assert.equal(nameProblem("x".repeat(41)), "That’s longer than a name.");
  assert.deepEqual(ownUnitOf("  Pizza  Slice ", []), { label: "pizza slice" });
  assert.deepEqual(ownUnitOf("beers", []), { error: "That one’s offered already." });
  assert.deepEqual(ownUnitOf("Pizza", ["pizza"]), { error: "You have that one." });
  assert.deepEqual(ownUnitOf("2 pizzas", []), { error: "Letters only, like pizza." });
  assert.deepEqual(ownUnitOf("taco", ["a", "b", "c", "d", "e", "f"]), { error: "That’s six. Take one off first." });
  assert.deepEqual(ownUnitOf("", []), { error: "Say what it is, like pizza." });
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  assert.equal(form.split("unitChip({ kind: \"new\", template: null, label: o }, `“${o}”`, `own-${o}`)").length - 1, 2, "offered as a quoted word beside the others on both stake rows");
  assert.equal(form.split("u.template === unit.template && (u.template !== null || u.label === unit.label)").length - 1, 2, "and selected by its own word");
});

test("a finger on a field moves the root before the focus, so the caret lands in the field; a mouse, a field already focused or a root already moved do not", () => {
  assert.equal(typingAtTouch({ pointerType: "touch", field: true, focused: false, typing: false }), true);
  assert.equal(typingAtTouch({ pointerType: "mouse", field: true, focused: false, typing: false }), false);
  assert.equal(typingAtTouch({ pointerType: "touch", field: false, focused: false, typing: false }), false);
  assert.equal(typingAtTouch({ pointerType: "touch", field: true, focused: true, typing: false }), false);
  assert.equal(typingAtTouch({ pointerType: "touch", field: true, focused: false, typing: true }), false);
  const typing = readFileSync("src/components/ui/typing.tsx", "utf8");
  assert.ok(typing.includes('document.addEventListener("pointercancel", onCancel, true);') && typing.includes("TOUCH_FOCUS_MS"), "a touch that becomes a scroll, or focuses nothing, puts it back");
});

test("the tiles lay their line out as a column the safe square's width, never a fragment, and the game page shares from one row", () => {
  const tiles = readFileSync("src/lib/ui/tiles.tsx", "utf8");
  assert.ok(!/<>|<\/>/.test(tiles), "no fragment: the renderer lays one out as a row with no width");
  const page = readFileSync("src/components/on/game-page.tsx", "utf8");
  assert.ok(page.includes("<MarketScreen id={c.dare.id} search={{}} embedded pageShares={pageShares} pagePhotos={!outsider} />") && page.includes("code={codeQuestion ?"), "the page's row carries the code, and the open card draws no row of its own");
  const screen = readFileSync("src/app/m/[id]/market-screen.tsx", "utf8");
  assert.ok(screen.includes("share={pageShares ? null :") && screen.includes('code={state === "open" && !pageShares ?'));
});

test("every sign-in opens the app's own sheet, and the terms field shows the loader until the first words", () => {
  for (const f of ["src/components/auth/sign-in-button.tsx", "src/components/auth/device.tsx", "src/components/providers.tsx"]) assert.ok(!readFileSync(f, "utf8").includes("setShowAuthFlow"), `${f} never opens Dynamic's modal`);
  assert.ok(readFileSync("src/components/providers.tsx", "utf8").includes("<SignInSheetHost>"));
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  assert.ok(form.includes("data-terms-loader") && form.includes("Writing the terms…"), "the loader in the field");
  assert.ok(form.includes("if (!reuse) writeUp();") && form.includes("setTimeout(startEarly, EARLY_WRITE_UP_MS)"), "the write-up starts while the question rests, and Next takes it");
});

test("what someone said is weighed for a minute and a half at most, and a read that never comes ends the wait with nothing picked", () => {
  const screen = readFileSync("src/app/m/[id]/market-screen.tsx", "utf8");
  assert.ok(screen.includes('const weighingClaim = d.pace === "dare" && !decidedByFeed && lastSaid !== null && (d.aiProposedAt === null || d.aiProposedAt < lastSaid) && now.getTime() - lastSaid.getTime() < 90_000;'), "the loader stands only while the app's read is older than the last thing said, and never past ninety seconds");
  const actions = readFileSync("src/lib/actions/markets.ts", "utf8");
  assert.ok(actions.includes('if (d.pace === "dare") await db.update(schema.dares).set({ aiOutcome: null, aiConfidenceBps: null, aiRationale: null, aiProposedAt: new Date() })'), "a dare's failed read is stamped empty, so the sheet asks at once");
});
