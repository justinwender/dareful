import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { KEYBOARD_SHARE, takesKeyboard, typingFromViewport, typingStarts } from "@/lib/ui/viewport";
import { needFromMarket } from "@/lib/ledger/home";
import { chainCarries, provisionalVoters, snapshotIsThePeopleIn } from "@/lib/ledger/provisional";
import { inTheSnapshot } from "@/lib/ledger/markets";
import { membershipKey, oneRowPerPeople, setLabel } from "@/lib/ledger/groups";
import { HANDOFF_MS, parseHandoff, resumeFrom } from "@/lib/ui/join-handoff";
import { GUEST_NAME_MAX, SLIDE_PROMPT, UNTOUCHED_PERCENT, guestNameOf, headerWords, offersKeep, opensRaised } from "@/lib/ui/entry-words";
import { codeOf, emailLooksRight, otpProblem, phoneDataOf } from "@/lib/auth/otp";
import { googleOffered, withoutOauthParams } from "@/lib/auth/google";
import { reachableBy } from "@/lib/auth/reach";
import { nextPosition, roomFor, SNAP_PX, visibleAt, type SheetMeasure } from "@/components/ui/pinned-sheet";
import { addYears, clampProposal, datePhrase, dateWords, deadlineMismatch, decideByDate, decideByMoment, DECIDE_BY_SPANS, fromProposal, latestDate, longDateWords, pastTheLatest, shortDateWords, swapDateWords, termsDeadlines } from "@/lib/ledger/decide-by";
import { kindForQuestion } from "@/lib/ui/question-shape";
import { IDEAS, IDEA_GROUPS, blankOf, ideaById, ideaKindWords, ideasOnNow } from "@/lib/ideas";
import { seenAlready, tipPlacement, tipsFor, tipTarget, TIPS_AT_MOST } from "@/lib/ui/tips";
import { infoSheet } from "@/lib/ui/info-sheets";
import { draftOnNow, DRAFT_ON_NOW_MS } from "@/lib/ledger/drafts";
import { guestLineFor } from "@/lib/ledger/guest";
import { GUEST_LINE_HEIGHT, guestLineWords } from "@/lib/ui/guest-words";
import { escalationWhy, liveCallsAllowed, MODELS, structured, taskOf, withEscalation } from "@/lib/ai/client";
import { z } from "zod";
import { answerIndexOf, clipWords, Triage } from "@/lib/ai/settler";
import { datedAndAgreeing, HAS_DATE } from "@/lib/ai/markets";
import { browserSaysOffline, browserWentOffline, offlineSettled, reachable, PROBE_PATH } from "@/lib/ui/connection";
import { emailOfDynamicUser } from "@/lib/notify/channels";
import { inCount } from "@/lib/ui/copy";
import { fitField, fittedHeight, sizesItself } from "@/lib/ui/fit-content";
import { cardMeta } from "@/lib/sports/cards";
import { suggestedNameOf } from "@/lib/auth/jwt";
import { loginMethod } from "@/lib/auth/login";
import { JwtVerifiedCredentialFormatEnum, JwtVerifiedCredentialFromJSON, JwtVerifiedCredentialToJSON, ProviderEnum, type JwtVerifiedCredential } from "@dynamic-labs/sdk-api-core";

/**
 * Credentials made with Dynamic's own model and serializer, never typed by hand: the wire form (`wire`, what a login
 * token and the users API carry; the users API wraps them as `{ user: { email, verifiedCredentials } }`, read from its
 * key names on 2026-10-05) and the SDK's in-browser form read back from it (`inBrowser`).
 */
const wire = (c: JwtVerifiedCredential) => JwtVerifiedCredentialToJSON(c) as Record<string, unknown>;
const inBrowser = (c: JwtVerifiedCredential) => JwtVerifiedCredentialFromJSON(JwtVerifiedCredentialToJSON(c));
const GOOGLE_CRED: JwtVerifiedCredential = { id: "c1", format: JwtVerifiedCredentialFormatEnum.Oauth, oauthProvider: ProviderEnum.Google, oauthDisplayName: "Sam Okafor", oauthEmails: ["sam@gmail.com"], signInEnabled: true };
const EMAIL_CRED: JwtVerifiedCredential = { id: "c2", format: JwtVerifiedCredentialFormatEnum.Email, email: "sam@work.com", signInEnabled: true };
const PHONE_CRED: JwtVerifiedCredential = { id: "c3", format: JwtVerifiedCredentialFormatEnum.PhoneNumber, phoneNumber: "4155552671", phoneCountryCode: "1", isoCountryCode: "US", signInEnabled: true };
const WALLET_CRED: JwtVerifiedCredential = { id: "c4", format: JwtVerifiedCredentialFormatEnum.Blockchain, address: "0xAbCdEf0123456789aBcDeF0123456789abcdef01", chain: "eip155", signInEnabled: false };

test("a field the page focused by itself on arriving takes no keyboard and leaves the root tall; a field a finger touched, or one focused while a tap is handled, drops it to the plain height", () => {
  assert.equal(typingStarts({ field: true, touched: false, inGesture: false }), false, "the code screen's field, focused on arrival with no keyboard under it, leaves no band");
  assert.equal(typingStarts({ field: true, touched: true, inGesture: false }), true, "a field a finger touched brings the keyboard");
  assert.equal(typingStarts({ field: true, touched: false, inGesture: true }), true, "a sheet that focuses its field as a tap opens it brings the keyboard");
  assert.equal(typingStarts({ field: false, touched: true, inGesture: true }), false, "a box ticked by a finger raises nothing");
  for (const type of ["checkbox", "radio"]) assert.equal(takesKeyboard({ tagName: "INPUT", getAttribute: () => type }), false, `a ${type} is not a field that takes the keyboard`);
});

test("the visible part of the screen settles what a focus could not: no field focused is never typing, a field over a short visible part is", () => {
  assert.equal(typingFromViewport({ field: false, visible: 488, layout: 812 }), false, "a keyboard gone with its field lets the root go tall again");
  assert.equal(typingFromViewport({ field: true, visible: 488, layout: 812 }), true, "a phone reopened with its keyboard up is typing, however the focus came");
  assert.equal(typingFromViewport({ field: true, visible: 806, layout: 874 }), null, "a keyboard on its way in has shrunk nothing yet, so nothing changes");
  assert.ok(KEYBOARD_SHARE > 806 / 874 - 0.2 && KEYBOARD_SHARE < 806 / 874, "the share sits under what an installed copy shows with no keyboard (806 of 874)");
});

test("the root reads the keyboard from one listener, mounted once beside the presses", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(/<Presses \/>\s*<Typing \/>/.test(layout), "the typing listener is mounted at the root");
  const component = readFileSync("src/components/ui/typing.tsx", "utf8");
  assert.ok(component.includes('document.addEventListener("focusin", onFocusIn, true)') && component.includes('document.addEventListener("focusout", onFocusOut, true)'), "it follows the focus in and out");
  assert.ok(component.includes('vv?.addEventListener("resize", onViewport)'), "and the visible part of the screen moving");
});

test("the chain keeps a question only when it would ask exactly the people in it, the asker counted as the contract counts them", () => {
  assert.equal(chainCarries({ registered: [], inIt: ["0xa", "0xb"], asker: "0xa" }), true, "a set nobody has registered yet: the chain would ask the two people in, and nobody else");
  assert.equal(chainCarries({ registered: ["0xa", "0xb"], inIt: ["0xa", "0xb"], asker: "0xa" }), true, "everyone it has registered is in");
  assert.equal(chainCarries({ registered: ["0xa", "0xb", "0xc"], inIt: ["0xa", "0xb"], asker: "0xa" }), false, "someone registered in the set who never got in would be asked: decided here");
  assert.equal(chainCarries({ registered: [], inIt: ["0xb", "0xc"], asker: "0xa" }), false, "the asker shared it and never got in, and the contract registers the asker: decided here");
  assert.equal(chainCarries({ registered: ["0xab"], inIt: ["0xAb", "0xcd"], asker: "0xCD" }), true, "addresses compared whatever their case");
});

test("a lock's completion says loudly when the chain's voters are not the people in", () => {
  assert.equal(snapshotIsThePeopleIn(["0xA", "0xb"], ["0xa", "0xB"]), true, "the same two people, whatever the case");
  assert.equal(snapshotIsThePeopleIn(["0xa", "0xb", "0xc"], ["0xa", "0xb"]), false, "someone registered between the check and the lock is in the snapshot");
  assert.equal(snapshotIsThePeopleIn(["0xa"], ["0xa", "0xb"]), false, "someone in is missing from it");
  const markets = readFileSync("src/lib/ledger/markets.ts", "utf8");
  const completion = markets.slice(markets.indexOf("export async function completeLock("), markets.indexOf("export async function quorumOf("));
  assert.ok(completion.includes('if (!snapshotIsThePeopleIn(onchain.quorum, people.map((p) => p.wallet))) console.error("a lock\'s voters on the chain are not the people in"'), "the completion compares what the chain snapshotted with the people in, and logs when they differ");
});

test("only the people in a question vote: the asker who never got in is no voter, and a guest is none until they sign up", () => {
  assert.deepEqual(provisionalVoters([{ userId: "ana" }, { userId: null }, { userId: "ben" }, { userId: "ana" }]), ["ana", "ben"]);
  assert.deepEqual(provisionalVoters([{ userId: null }]), [], "a question only guests are in has nobody to call it until one signs up");
  assert.deepEqual(inTheSnapshot(["0xaa", "0xbb"], ["0xAA", "0xcc"]), ["0xaa"], "on the chain, the people in whom its snapshot names, whatever the case of the address");
});

const at = new Date("2026-10-04T20:00:00Z");
const locked = (people: Array<{ id: string; ghost?: boolean }>, votesCast = 1) => ({
  state: "locked" as const,
  dare: { id: "d1", title: "Who wins, Lightning or Rangers?", creatorId: "asker", resolvesBy: new Date(at.getTime() + 86_400_000), createdAt: at, lockedAt: at, mark: null, markKind: null, ink: null } as never,
  people: people.map((p) => ({ id: p.id, name: p.id, ghost: p.ghost ?? false, percent: null, number: null, pick: null })),
  votesCast,
  saidBy: null,
  votingOpen: true,
});

test("Now asks only the people in a question to vote, and counts the votes over the people in, never the whole set", () => {
  assert.equal(needFromMarket(locked([{ id: "asker" }, { id: "jp" }]), "kit", false, at, () => "tonight"), null, "a member of the set who never got in has no Vote row");
  assert.equal(needFromMarket(locked([{ id: "asker" }, { id: "jp" }]), "jp", false, at, () => "tonight")?.context, "One of 2 has called it", "two in, not one of five");
  assert.equal(needFromMarket(locked([{ id: "asker" }, { id: "jp" }, { id: "c:gabe", ghost: true }]), "jp", false, at, () => "tonight")?.context, "One of 2 has called it", "a guest is not a voter until they sign up");
});

test("a game's send answers words when an action throws on its way, and the error card asks the server again and is counted", () => {
  const start = readFileSync("src/components/on/start-game.tsx", "utf8");
  assert.ok(start.includes("await attempt(() => startGameAction(") && start.includes("await attempt(() => openGameQuestionsAction(signed))"), "both of the send's actions go through attempt, so a throw is words at the button");
  const card = readFileSync("src/app/error.tsx", "utf8");
  assert.ok(card.includes("(retry ?? reset)();"), "Try again asks the server for the screen again");
  assert.ok(card.includes('report("error_shown", { cause: "screen", screen: screenOf(pathname ?? "/") })'), "an error card is counted by its screen's shape");
});

test("one row per set of people: sets with the same people read as one, the one a question goes to, dated by the latest any of them asked", () => {
  assert.equal(membershipKey([{ userId: "b", claimId: null }, { userId: null, claimId: "g" }, { userId: "a", claimId: null }]), "c:g,u:a,u:b", "accounts and guests alike, in one order");
  const at = (d: string) => new Date(`2026-10-0${d}T20:00:00Z`);
  const row = (id: string, over: Partial<{ key: string; named: boolean; isDyad: boolean; createdAt: Date; asked: number; lastAskedAt: Date | null }>) => ({ id, key: "u:j,u:n", named: false, isDyad: false, createdAt: at("1"), asked: 1, lastAskedAt: at("1"), ...over });
  const rows = oneRowPerPeople([row("occasion", { createdAt: at("2"), asked: 2, lastAskedAt: at("3") }), row("dyad", { isDyad: true, createdAt: at("3"), asked: 1, lastAskedAt: at("2") }), row("crew", { named: true }), row("three", { key: "u:j,u:n,u:r" })]);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["crew", "dyad", "three"], "the pair's dyad stands for the pair; a named set and a set of other people are their own rows");
  const pair = rows.find((r) => r.id === "dyad");
  assert.deepEqual([pair?.asked, pair?.lastAskedAt?.toISOString()], [3, at("3").toISOString()], "counting both, dated by the latest");
  const older = oneRowPerPeople([row("new", { createdAt: at("4") }), row("old", { createdAt: at("2") })]);
  assert.deepEqual(older.map((r) => r.id), ["old"], "with no dyad, the oldest");
  assert.equal(setLabel({ name: null, isDyad: false, memberNames: ["Ana", "Noah", "Sam"], viewerName: "Ana" }), "Noah, Sam and you", "a guest is named with the set's people");
});

test("the odds line starts at 50% under the slide prompt, and an untouched entry is 50%", () => {
  assert.equal(UNTOUCHED_PERCENT, 50);
  assert.equal(SLIDE_PROMPT, "Slide to your prediction");
  assert.equal(headerWords(false, 50, () => "a coin flip"), SLIDE_PROMPT, "the prompt until the first touch, with the thumb at 50");
  assert.equal(headerWords(true, 70, (v) => `${v} words`), "70 words", "the words for the number once touched");
  const stage = readFileSync("src/components/markets/market-stage.tsx", "utf8");
  assert.ok(stage.includes("mine?.percent ?? props.argument?.defaultPercent ?? UNTOUCHED_PERCENT"), "the value an untouched yes-or-no entry sends is 50");
  assert.ok(stage.includes("<OddsHeader value={value} touched={touched} />") && stage.includes('<TeamHeader mode="wins" value={value} touched={touched}'), "both headers say the prompt until the first touch");
});

const T = Date.parse("2026-10-04T23:00:00Z");
const dare = "36644d99-fd0c-4b97-9570-4eba20289952";
test("what a sign-in from a link carries across it: read back whole within half an hour, and nothing when stale, from the future or malformed", () => {
  const h = { dareId: dare, at: T, name: "Sam", entry: { stake: "500", percent: 50 } };
  assert.deepEqual(parseHandoff(JSON.stringify(h), T + 60_000), h);
  assert.equal(parseHandoff(JSON.stringify(h), T + HANDOFF_MS + 1), null, "stale");
  assert.equal(parseHandoff(JSON.stringify(h), T - 1), null, "from the future");
  assert.equal(parseHandoff("{not json", T), null);
  assert.equal(parseHandoff(JSON.stringify({ ...h, entry: { stake: "five dollars" } }), T), null, "a stake that is not units");
  assert.equal(parseHandoff(JSON.stringify({ ...h, dareId: "not-an-id" }), T), null);
  assert.equal(parseHandoff(null, T), null);
});

test("a signed-in screen sends the entry picked before Sign in, signs a guest entry the claim folded in, and spends the handoff once theirs is signed", () => {
  const base = { dareId: dare, at: T };
  assert.equal(resumeFrom({ ...base, entry: { stake: "500", percent: 50 } }, null), "enter", "not in yet: the picked entry goes in");
  assert.equal(resumeFrom(base, null), "nothing", "nothing picked, nothing sent");
  assert.equal(resumeFrom({ ...base, entry: { stake: "500", percent: 70 } }, { unsigned: true }), "enter", "an entry folded in unsigned is replaced by the numbers just picked");
  assert.equal(resumeFrom({ ...base, keep: true }, { unsigned: true }), "keep", "a guest entry kept in an account is signed as it stands");
  assert.equal(resumeFrom(base, { unsigned: true }), "nothing");
  assert.equal(resumeFrom({ ...base, keep: true }, {}), "done", "already theirs and signed");
  assert.equal(resumeFrom({ ...base, entry: { stake: "500", percent: 70 } }, {}), "done", "an entry already signed is never changed by a handoff left over");
});

test("the account step's fields: an email that looks like one, a US or Canadian number in Dynamic's shape, a six-digit code, and words for each failure", () => {
  assert.equal(emailLooksRight(" sam@example.com "), true);
  assert.equal(emailLooksRight("sam@example"), false);
  assert.deepEqual(phoneDataOf("(415) 555-2671"), { phone: "4155552671", iso2: "us", dialCode: "1" });
  assert.deepEqual(phoneDataOf("+1 604 555 0199"), { phone: "6045550199", iso2: "ca", dialCode: "1" });
  assert.equal(phoneDataOf("+44 20 7946 0958"), null, "text messages reach the US and Canada only");
  assert.equal(phoneDataOf("123"), null);
  assert.equal(codeOf(" 123 456 "), "123456");
  assert.equal(codeOf("12345"), null);
  assert.equal(otpProblem(new Error("Invalid verification code"), "code"), "That code didn’t match. Try it again, or send a new one.");
  assert.equal(otpProblem(new Error("network down"), "code"), "That didn’t go through on our end. Try again.");
});

test("Google's return is finished at the root and its parameters come off the address after, and the installed app offers it only by its switch", () => {
  assert.equal(withoutOauthParams("https://dareful.app/m/abc?dynamicOauthCode=x&dynamicOauthState=y&side=yes#enter"), "/m/abc?side=yes#enter");
  assert.equal(withoutOauthParams("https://dareful.app/?dynamicOauthCode=x"), "/");
  assert.equal(withoutOauthParams("https://dareful.app/you?dynamicOauthCode=x&dynamicOauthState=y&dynamicOauthSsoProviderId=z"), "/you", "every parameter the SDK reads, its SSO provider's id included");
  assert.equal(googleOffered(false), true, "the browser offers Google");
  const providers = readFileSync("src/components/providers.tsx", "utf8");
  assert.ok(providers.includes("<OauthReturn />"), "the return is handled at the root");
});

test("a guest gives a name and nothing else, saved and said whole; Join as sits under it with I already have an account below and the consent line above, and an entry leads to keeping it in an account, once for a remembered guest", () => {
  assert.equal(guestNameOf("  Justin incognito  "), "Justin incognito", "trimmed, and the whole of it: the owner's screenshot joined Justin incognito as Justin");
  assert.equal(guestNameOf("x".repeat(GUEST_NAME_MAX + 5)), "x".repeat(GUEST_NAME_MAX), "at most forty characters, as the server keeps");
  assert.equal(offersKeep({ remembered: false, offeredHere: true }), true, "a new guest's first entry: always");
  assert.equal(offersKeep({ remembered: true, offeredHere: false }), true, "a guest this phone remembers: until it has come once here");
  assert.equal(offersKeep({ remembered: true, offeredHere: true }), false, "and then not again");
  const stage = readFileSync("src/components/markets/market-stage.tsx", "utf8");
  assert.ok(!/Your phone number|Is one of these you\?|suggestGhostNamesAction/.test(stage), "no number and no suggested names for a guest");
  assert.ok(stage.includes('enterAsGhostAction(dareId, position, { name: ghost.known ? "" : guestNameOf(ghostName) })'), "the entry sends the name the button says, and nothing else");
  assert.ok(stage.includes("? `Join as ${guestNameOf(ghostName)}`"), "the button names exactly what is saved");
  assert.ok(stage.includes('className={whoStep ? "h-auto min-h-14 whitespace-normal break-words py-3 text-center" : undefined}'), "a long name wraps rather than being cut");
  assert.ok(/<Button variant="tertiary" className="self-center" onClick=\{\(\) => setAccountStep\("sign-in"\)\} disabled=\{step !== "idle"\} data-join-sign-in="">\s*I already have an account\s*<\/Button>/.test(stage), "signing in is a quiet text button");
  assert.ok(stage.includes('{ghost && (whoStep || ghost.known) && !reading && !changing && state === "open" ? ('), "on the join step, and for a phone that remembers the guest");
  assert.ok(stage.indexOf("data-join-primary") < stage.indexOf("I already have an account"), "under the main action, never above it");
  assert.ok(stage.includes("{joining ? null : consentLine}") && /\{consentLine\}\s*<label className="flex flex-col gap-1">\s*<span className="text-label text-ink-3">Your name<\/span>/.test(stage), "the consent line sits above the name on the join step, out of the actions");
  assert.ok(stage.includes("if (offersKeep({ remembered: ghost.known !== null, offeredHere: keepOfferedHere() })) {") && stage.includes('setAccountStep("keep");'), "once saved, the sheet's next step is keeping the call in an account, by that rule");
  assert.ok(readFileSync("src/lib/ledger/ghost-entry.ts", "utf8").includes("const name = guestNameOf(who.name);"), "the server saves the same name");
  const action = readFileSync("src/lib/actions/markets.ts", "utf8");
  assert.ok(action.includes("who: { name: who.data.name, phoneHash: null, memberClaimId: null }"), "the server reads no number from a guest");
  const boot = readFileSync("src/components/auth/wallet-bootstrap.tsx", "utf8");
  assert.ok(boot.includes('if (a.bound > 0 && !readJoinHandoff(Date.now()) && !readStay(Date.now())) router.push("/welcome");'), "a sign-in from a link stays on its question, and one from the guest line on its screen");
  const invite = readFileSync("src/components/markets/invite-preview.tsx", "utf8");
  assert.ok(invite.includes("if (!h || h.dareId !== data.dareId || (!h.entry && !h.keep)) return;"), "the invitation joins on its own after a sign-in from its own join flow");
});

test("the card for an account the app cannot reach: no email and no Google on the login, shown at the top of Now", () => {
  assert.deepEqual(reachableBy({ email: "sam@example.com" }), { email: true, google: false });
  assert.deepEqual(reachableBy({ verifiedCredentials: [inBrowser(GOOGLE_CRED)] }), { email: false, google: true });
  assert.deepEqual(reachableBy({ verifiedCredentials: [inBrowser(EMAIL_CRED)] }), { email: true, google: false }, "an email credential reaches them without a top-level address");
  assert.deepEqual(reachableBy({ verifiedCredentials: [inBrowser(PHONE_CRED), inBrowser(WALLET_CRED)] }), { email: false, google: false }, "a phone alone reaches nobody when push is off");
  assert.deepEqual(reachableBy(null), { email: false, google: false });
  const now = readFileSync("src/components/home/now-content.tsx", "utf8");
  assert.ok(now.includes("{owesCard ? <ReachCard /> : null}"), "Now draws it while the account is owed it");
});

test("a tucked sheet keeps its handle above the strip over the home indicator, and the page's room follows the sheet's height at every position", () => {
  const m: SheetMeasure = { handle: 40, rest: 160, natural: 420, raisedCap: 600, fullCap: 760, pad: 58 };
  assert.equal(visibleAt("tucked", m), 98, "the handle row and the 58px under it that the strip covers: the handle stands clear of the home indicator");
  assert.equal(roomFor("resting", m), 180, "resting: the move and 20px");
  assert.equal(roomFor("raised", m), 440, "raised: all of it, so the last element scrolls clear of a raised sheet");
  assert.equal(roomFor("tucked", m), 118);
  assert.equal(roomFor("full", { ...m, natural: 900 }), 620, "full stands as high as raised for the room");
});

const NY = "America/New_York";
const sunday = new Date("2026-10-04T23:30:00Z"); // 7:30pm Sunday, October 4, in New York

test("decided by Tonight, This week, This month or a date: a date already past is today, one past the furthest a question can run is never moved to fit, and the chips start from the write-up's date", () => {
  assert.deepEqual(DECIDE_BY_SPANS.map((s) => s.label), ["Tonight", "This week", "This month"]);
  assert.equal(clampProposal("2026-10-13", sunday, NY), "2026-10-13");
  assert.equal(clampProposal("2031-06-01", sunday, NY), null, "past the furthest a question can run: no date to start on, never one moved to fit");
  assert.equal(clampProposal("2026-09-01", sunday, NY), "2026-10-04", "a date already past is today");
  assert.equal(clampProposal("Oct 13", sunday, NY), null, "not a date is no proposal");
  assert.equal(latestDate(sunday, NY), "2029-10-04", "three years on by the calendar, as a person and a model read it, not 1,095 days");
  assert.equal(addYears("2028-02-29", 1), "2029-02-28", "a leap day falls back in a year without one");
  assert.deepEqual(pastTheLatest("2056-10-04", sunday, NY), { knownBy: "2056-10-04", latest: "2029-10-04" });
  assert.equal(pastTheLatest("2029-10-04", sunday, NY), null, "the furthest date itself fits");
  assert.equal(longDateWords("2056-10-06"), "October 6, 2056", "a date years away says its year");
  assert.deepEqual(fromProposal("2026-10-13", sunday, NY), { key: "date", date: "2026-10-13" });
  assert.deepEqual(fromProposal("2026-10-04", sunday, NY), { key: "tonight" }, "today's date is Tonight");
  assert.deepEqual(fromProposal(null, sunday, NY), { key: "week" });
  assert.equal(decideByMoment({ key: "date", date: "2026-10-13" }, sunday, NY).toISOString(), "2026-10-14T03:59:00.000Z", "a minute before midnight on the 13th in New York");
  assert.equal(decideByMoment({ key: "tonight" }, sunday, NY).toISOString(), "2026-10-05T03:59:00.000Z");
  assert.equal(decideByDate({ key: "week" }, sunday, NY), "2026-10-11");
  assert.equal(dateWords("2026-10-13"), "October 13");
  assert.equal(shortDateWords("2026-11-02"), "Nov 2");
});

test("the terms and the decide-by never disagree: a deadline the terms name must be the decide-by date, and the chips change the terms' date with them", () => {
  const terms = "Yes if the package is on the porch by October 13. No if it isn't.";
  assert.deepEqual(termsDeadlines(terms, sunday, NY), [{ said: "October 13", date: "2026-10-13", yearless: true }]);
  assert.equal(deadlineMismatch(terms, "2026-10-13", sunday, NY), null);
  assert.equal(deadlineMismatch(terms, "2026-11-02", sunday, NY), "October 13", "Zach's question: Oct 13 in the terms and Nov 2 on the chip");
  assert.equal(deadlineMismatch("Counts if it snows before Thanksgiving.", "2026-11-26", sunday, NY), null, "no month and day, nothing to compare");
  assert.equal(deadlineMismatch("Decided by Tues, Oct. 13th.", "2026-10-13", sunday, NY), null, "short and dotted spellings read the same");
  assert.equal(termsDeadlines("Yes if it happens by Jan 3.", sunday, NY)[0]?.date, "2027-01-03", "a month already past this year is next year's");
  assert.equal(swapDateWords(terms, "2026-10-13", "2026-11-02"), "Yes if the package is on the porch by November 2. No if it isn't.");
  assert.equal(swapDateWords("by Oct 13", "2026-10-13", "2026-10-11"), "by October 11");
});

test("the market type follows the question's shape: which and who are pick one, how many and how much a number, a whether question yes or no", () => {
  assert.equal(kindForQuestion("Which country has more people, Canada or Australia?"), "categorical");
  assert.equal(kindForQuestion("who falls asleep first"), "categorical");
  assert.equal(kindForQuestion("How many shirts can Gabe wear?"), "numeric");
  assert.equal(kindForQuestion("how much will dinner cost"), "numeric");
  assert.equal(kindForQuestion("How long will x take?"), "numeric");
  assert.equal(kindForQuestion("Will the train be late?"), "binary");
  assert.equal(kindForQuestion("Does John fall asleep during the movie?"), "binary");
  assert.equal(kindForQuestion("John falls asleep during the movie"), null, "a statement leaves the type where it was");
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  assert.ok(form.includes("const shaped = kindForQuestion(next);") && form.includes("if (shaped && shaped !== shapeKind.current) {"), "the question step follows the shape when the shape changes");
  assert.ok(readFileSync("src/lib/ai/markets.ts", "utf8").includes('never about "the one picked" or "the chosen one"'), "a yes-or-no write-up never says the one picked");
});

test("ideas: thirteen fixed questions in four groups, two with a blank, the tile on What's on and on Now while fewer than three are running", () => {
  assert.equal(IDEAS.length, 13);
  assert.deepEqual([...IDEA_GROUPS], ["Tonight", "Around the house", "Out and about", "This season"]);
  assert.deepEqual(IDEAS.filter((i) => blankOf(i.text)).map((i) => i.id), ["pong", "take"], "x is the slot in two ideas");
  assert.deepEqual(blankOf("Will x win the pong game?"), { before: "Will ", after: " win the pong game?" });
  assert.equal(blankOf("Will the train be late?"), null, "no x in the train");
  assert.equal(ideaById("food")?.unit?.plural, "minutes", "a number idea carries its unit");
  assert.equal(ideaById("nope"), null);
  assert.deepEqual([ideaKindWords("categorical"), ideaKindWords("numeric"), ideaKindWords("binary")], ["Pick one", "A number", "Yes or no"]);
  assert.deepEqual([ideasOnNow(0), ideasOnNow(2), ideasOnNow(3)], [true, true, false]);
  for (const i of IDEAS) assert.ok(!/\b(grandpa|kids?|child(ren)?|sick|ill)\b/i.test(i.text), `What's on's rules: ${i.text}`);
  const on = readFileSync("src/app/on/page.tsx", "utf8");
  assert.ok(on.indexOf("<IdeasTile />") > 0 && on.indexOf("<IdeasTile />") < on.indexOf("data-most-asked"), "first on What's on, above Most asked");
  assert.ok(readFileSync("src/components/home/now-content.tsx", "utf8").includes("{ideasOnNow(home.running.length) ? <IdeasTile /> : null}"), "last on Now while fewer than three are running");
});

test("first-visit tips: the first three entries that point at a control on the screen, rules skipped, placed beside the control and kept inside the screen", () => {
  const sheet = infoSheet("market-open");
  assert.ok(sheet);
  const all = tipsFor(sheet!, () => true);
  assert.equal(all.length, TIPS_AT_MOST, "three at most");
  assert.ok(all.every((t) => tipTarget(t.entry) !== null), "only entries that point at something");
  assert.deepEqual(all.map((t) => t.entry.term), ["Tap the avatars", "Swipe the sheet", "More"], "in the sheet's own order, gestures first");
  assert.deepEqual(tipsFor(sheet!, (s) => s === "[data-share]").map((t) => t.entry.term), ["Share"], "a control off the screen is skipped");
  assert.equal(tipsFor(infoSheet("now")!, () => false).length, 0, "nothing on screen, no tips");
  const rulesOnly = { name: "A rule", groups: { "Rules and timing": [{ term: "Swipe the sheet", description: "A rule whose words name a control." }] } };
  assert.deepEqual(tipsFor(rulesOnly, () => true), [], "a rule is never a tip, even when its words name a control");
  const placed = tipPlacement({ x: 300, y: 40, width: 44, height: 44 }, 22, { width: 390, height: 844 }, { width: 240, height: 100 });
  assert.deepEqual(placed.cut, { x: 294, y: 34, width: 56, height: 56, radius: 28 }, "6px larger on every side, rounded to match");
  assert.equal(placed.below, true, "a control in the top half gets its tip under it");
  assert.equal(placed.tip.x, 390 - 12 - 240, "moved sideways to stay 12px inside the screen");
  assert.equal(placed.tip.y, 34 + 56 + 2 + 6, "6px off the ring");
  assert.equal(tipPlacement({ x: 20, y: 700, width: 100, height: 48 }, 12, { width: 390, height: 844 }, { width: 240, height: 100 }).below, false, "over a control in the bottom half");
  assert.equal(tipPlacement({ x: 20, y: 500, width: 100, height: 48 }, 12, { width: 390, height: 844 }, { width: 240, height: 100 }).below, false, "over a control in the bottom half, with room on both sides (the touch-ups round)");
  assert.equal(seenAlready(["/m/[id]"], "/m/[id]"), true, "a market once you're in is the same screen");
});

test("a draft is on Now for a day and on You after, and a guest's line says what an account gets until a win says it louder", () => {
  const at = new Date("2026-10-04T12:00:00Z");
  assert.equal(draftOnNow(new Date(at.getTime() - DRAFT_ON_NOW_MS + 1), at), true);
  assert.equal(draftOnNow(new Date(at.getTime() - DRAFT_ON_NOW_MS), at), false, "a day on, it leaves Needs you");
  assert.equal(guestLineFor({ inAny: false, here: null }), null, "before a first market, nothing");
  assert.equal(guestLineFor({ inAny: true, here: { in: false, won: false, numeric: false } }), null, "the link page before they're in has its own way to sign in");
  assert.equal(guestLineFor({ inAny: true, here: null }), "first");
  assert.equal(guestLineFor({ inAny: true, here: { in: true, won: true, numeric: false } }), "called");
  assert.equal(guestLineFor({ inAny: true, here: { in: true, won: true, numeric: true } }), "closest");
  assert.equal(guestLineWords("first"), "Sign up and Dareful will remind you when it’s time to vote.");
  assert.equal(guestLineWords("called"), "You called it. Sign up so it counts.");
  assert.equal(guestLineWords("closest"), "You were closest. Sign up so it counts.");
  assert.ok(GUEST_LINE_HEIGHT.first === 64 && GUEST_LINE_HEIGHT.called === 44 && GUEST_LINE_HEIGHT.closest >= 44, "at least 44px, 64 where the first line takes two lines");
  assert.ok(readFileSync("src/app/layout.tsx", "utf8").includes("pt-[calc(env(safe-area-inset-top)+var(--guest-line,0px))]"), "the page starts under the line, outside the scroller");
});

test("models: Haiku 5.5 drafts (4.5 until the touch-ups round), Sonnet 5.5 weighs and writes Help define's terms, nothing calls Fable, and a drafting answer that fails its shape or its time goes once to Sonnet", () => {
  if (!process.env.AI_MODEL_DRAFTING) assert.equal(MODELS.drafting, "claude-haiku-5-5");
  if (!process.env.AI_MODEL_RULING) assert.equal(MODELS.ruling, "claude-sonnet-5-5");
  for (const f of ["src/lib/ai/client.ts", "src/lib/ai/markets.ts", "src/lib/ai/settler.ts"]) assert.ok(!/claude-fable/i.test(readFileSync(f, "utf8")), `${f} names no Fable model`);
  const zod = new Error("bad");
  zod.name = "ZodError";
  assert.equal(escalationWhy(zod), "invalid");
  assert.equal(escalationWhy(new Error("the model did not answer (scope market)")), "invalid");
  assert.equal(escalationWhy(new Error("the model ran out of room before finishing (scope market)")), "invalid");
  const timeout = new Error("Request timed out.");
  timeout.name = "APIConnectionTimeoutError";
  assert.equal(escalationWhy(timeout), "timeout");
  assert.equal(escalationWhy(new Error("529 overloaded")), null, "an outage is not a reason");
  assert.deepEqual([taskOf("scope number"), taskOf("careful questions pet"), taskOf("rule claim")], ["write_up", "careful", "other"]);
  const markets = readFileSync("src/lib/ai/markets.ts", "utf8");
  assert.ok(markets.includes("return answers && answers.length > 0 ? MODELS.ruling : MODELS.drafting;"), "Help define's final terms are Sonnet's");
});

test("a write-up Haiku answers without a date is asked once of Sonnet, whose answer stands; one with a date, and every ruling call, is asked once", async () => {
  assert.equal(HAS_DATE({ decideBy: "2026-11-02" }), true);
  assert.equal(HAS_DATE({ decideBy: "" }), false, "no date the group could know by");
  assert.equal(HAS_DATE({ decideBy: "next week" }), false);
  const asked: string[] = [];
  const notes: string[] = [];
  let resets = 0;
  const once = (answers: Record<string, { decideBy: string }>) => async (model: string) => (asked.push(model), answers[model] ?? { decideBy: "" });
  const note = (_label: string, why: string) => void notes.push(why);
  const req = { label: "scope market", model: MODELS.drafting, accept: HAS_DATE, onReset: () => void (resets += 1) };
  const plain = await withEscalation(req, once({ [MODELS.drafting]: { decideBy: "" }, [MODELS.ruling]: { decideBy: "2026-11-02" } }), note);
  assert.deepEqual(asked, [MODELS.drafting, MODELS.ruling], "Haiku, then Sonnet once");
  assert.equal(plain.decideBy, "2026-11-02");
  assert.deepEqual(notes, ["invalid"], "counted as an escalation");
  assert.equal(resets, 1, "the streamed answer starts over");
  asked.length = 0;
  const both = await withEscalation(req, once({}), note);
  assert.equal(asked.length, 2, "never a third call");
  assert.equal(both.decideBy, "", "Sonnet's answer stands either way");
  asked.length = 0;
  await withEscalation(req, once({ [MODELS.drafting]: { decideBy: "2026-10-13" } }), note);
  assert.deepEqual(asked, [MODELS.drafting], "a dated answer stands");
  asked.length = 0;
  await withEscalation({ ...req, model: MODELS.ruling }, once({}), note);
  assert.deepEqual(asked, [MODELS.ruling], "a ruling call is not asked again");
  const markets = readFileSync("src/lib/ai/markets.ts", "utf8");
  assert.equal(markets.split("    accept: datedAndAgreeing(input.now, input.zone),").length - 1, 3, "every write-up's three kinds carry the check, the date and the terms agreeing (the touch-ups round)");
  const agreeing = datedAndAgreeing(new Date("2026-10-08T13:27:00Z"), "America/New_York");
  assert.equal(agreeing({ decideBy: "2026-10-08", terms: "Yes if Boone is out as manager by October 8, 2029." }), false, "Haiku 5.5's one miss in the comparison: terms three years out over a decide-by of today");
  assert.equal(agreeing({ decideBy: "2029-10-08", terms: "Yes if Boone is out as manager by October 8, 2029." }), true);
  assert.equal(agreeing({ decideBy: "2026-10-15", terms: "Yes if Boone is out as manager." }), true, "terms that name no date agree with any");
  assert.equal(agreeing({ decideBy: "", terms: "Yes if Boone is out as manager." }), false);
});

test("a guest's entry stage keeps its place in the page across the entry, so the sheet's next step survives the refresh that brings the entry line in", () => {
  const ghost = readFileSync("src/app/m/[id]/ghost.tsx", "utf8");
  const sites = ghost.split("\n").filter((l) => /\? stage : null\}|\? null : stage\}/.test(l));
  const open = sites.filter((l) => !/\|\| state === "open" \? null : stage/.test(l));
  assert.equal(open.length, 1, "one place while it is open");
  assert.ok(!/mine &&|mine \?/.test(open[0] ?? "mine"), "the open stage's place does not depend on whether you are in");
});

test("offline is settled by a request when the browser says so: iOS 27 says offline with the network up, so a tap waits on this origin's answer instead of being refused", async () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const say = (onLine: boolean) => Object.defineProperty(globalThis, "navigator", { value: { onLine }, configurable: true });
  try {
    let asked = 0;
    const answers = (ok: boolean) => async () => (asked++, ok);
    say(true);
    assert.equal(await offlineSettled(answers(false)), false, "online by the browser's word: no request");
    assert.equal(asked, 0);
    say(false);
    browserWentOffline();
    assert.equal(await offlineSettled(answers(false)), true, "the browser says offline and nothing answers: offline");
    assert.equal(await offlineSettled(answers(true)), false, "the browser says offline and this origin answers: not offline");
    assert.equal(browserSaysOffline(), false, "a word shown wrong is not believed again on this page");
    asked = 0;
    assert.equal(await offlineSettled(answers(false)), false, "and no second request for it");
    assert.equal(asked, 0);
    browserWentOffline();
    assert.equal(browserSaysOffline(), true, "until the browser says offline anew");
  } finally {
    if (real) Object.defineProperty(globalThis, "navigator", real);
    browserWentOffline();
  }
  const seen: Array<[string, RequestInit | undefined]> = [];
  assert.equal(await reachable((async (url: string, init?: RequestInit) => (seen.push([url, init]), new Response(null, { status: 204 }))) as typeof fetch, 50), true);
  assert.equal(seen[0]?.[0], PROBE_PATH);
  assert.equal(seen[0]?.[1]?.method, "HEAD");
  assert.equal(seen[0]?.[1]?.cache, "no-store", "never an answer from the cache");
  assert.equal(await reachable((async () => { throw new TypeError("Load failed"); }) as typeof fetch, 50), false, "a phone with no network fails at once");
  const hangs = ((_: string, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
  const raced = await Promise.race([reachable(hangs, 30), new Promise<string>((done) => setTimeout(() => done("still waiting"), 500).unref())]);
  assert.equal(raced, false, "nothing within the time is offline");
  const button = readFileSync("src/components/ui/button.tsx", "utf8");
  assert.ok(!button.includes("tapGoes(offlineNow())"), "a tap is never refused on the browser's word alone");
  assert.ok(button.includes("void offlineSettled().then((off) => {"), "the word is settled before anything is refused");
  assert.ok(readFileSync("src/components/ui/offline-bar.tsx", "utf8").includes("useSyncExternalStore(subscribeOffline, offlineConfirmed, onServer)"), "the bar stands only once a request bore the word out");
});

test("a long drag lands the sheet where the finger let it go: from raised, one drag down past resting tucks it, and a short one moves a single position", () => {
  const all = ["tucked", "resting", "raised", "full"] as const;
  const at = { tucked: 460, resting: 300, raised: 0, full: -120 } as const;
  const yOf = (p: keyof typeof at) => at[p];
  assert.equal(nextPosition("raised", 400, [...all], yOf), "tucked", "let go nearer tucked than resting");
  assert.equal(nextPosition("raised", 200, [...all], yOf), "resting", "let go nearer resting");
  assert.equal(nextPosition("raised", SNAP_PX + 1, [...all], yOf), "resting", "a short drag still moves one position");
  assert.equal(nextPosition("tucked", -440, [...all], yOf), "raised", "up from tucked as far as the finger went");
  assert.equal(nextPosition("tucked", -600, [...all], yOf), "full");
  assert.equal(nextPosition("resting", SNAP_PX, [...all], yOf), "resting", "exactly the snap stays");
  assert.equal(nextPosition("tucked", 300, [...all], yOf), "tucked", "the bottom holds");
  assert.ok(readFileSync("src/components/ui/pinned-sheet.tsx", "utf8").includes("let to = nextPosition(current, moved, available, yOf);"), "the sheet passes its offsets");
});

test("a page grows with its content and never shrinks below it, so its bottom room clears the tab bar and the sheet on a long page", () => {
  const screen = readFileSync("src/components/ledger/screen.tsx", "utf8");
  const main = screen.split("\n").find((l) => l.includes("<main ")) ?? "";
  assert.ok(main.includes(" grow shrink-0 "), "grows, never shrinks, on an automatic basis");
  assert.ok(!/\bflex-1\b/.test(main), "a flex-1 page is held at its minimum height in the fixed scroller, and the last row sits under the tab bar");
});

test("a tip's ring moves with its cut-out, at once, and only the tip itself travels", () => {
  const tips = readFileSync("src/components/ui/first-tips.tsx", "utf8");
  const ring = tips.split("\n").find((l) => l.includes("data-tip-ring")) ?? "";
  assert.ok(ring.includes("border-2 border-ink"), "the ring");
  assert.ok(!ring.includes("tips-move"), "a ring that slides parts from its cut-out, which jumps");
  assert.ok(tips.split("\n").some((l) => l.includes("ref={tipBox}") && l.includes("tips-move")), "the tip travels");
});

test("the entry sheet opens raised for a first entry, so the 50% it would send is on screen; a number and a draft rest", () => {
  assert.equal(opensRaised({ mine: null, number: false, draft: false }), true, "a first entry on someone's question");
  assert.equal(opensRaised({ mine: null, number: true, draft: false }), false, "a number starts on its field");
  assert.equal(opensRaised({ mine: null, number: false, draft: true }), false, "a draft rests: its terms stay on screen and its two moves are on the page");
  assert.equal(opensRaised({ mine: { unsigned: true }, number: false, draft: false }), true, "an entry waiting to be kept");
  assert.equal(opensRaised({ mine: {}, number: false, draft: false }), false, "once in, nothing raises it");
  assert.equal(opensRaised({ mine: null, number: false, draft: false, asker: true }), false, "the asker's own question rests until they are in, so its share row is on screen (the second-pass round)");
  assert.ok(readFileSync("src/components/markets/market-stage.tsx", "utf8").includes('useState(() => opensRaised({ mine, number: numberUnit !== null, draft: state === "draft", asker: props.asker === true }))'), "the sheet reads the rule");
  assert.ok(readFileSync("src/app/m/[id]/market-screen.tsx", "utf8").includes("asker={d.creatorId === me.id}"), "and the page says who asked");
});

test("a pick-one argument's ruling names one of its answers by its words, and nothing it did not list", () => {
  assert.equal(answerIndexOf(["Canada", "Australia"], "australia"), 1);
  assert.equal(answerIndexOf(["Canada", "Australia"], " Canada "), 0);
  assert.equal(answerIndexOf(["Canada", "Australia"], "New Zealand"), null, "never guessed");
});

test("a Google account is reached and named: its address from the linked account when there is no other, its first name from the display name, and its sign-in counted as Google", () => {
  assert.equal(emailOfDynamicUser({ user: { email: "sam@example.com" } }), "sam@example.com");
  assert.equal(emailOfDynamicUser({ user: { email: null, verifiedCredentials: [wire(WALLET_CRED), wire(GOOGLE_CRED)] } }), "sam@gmail.com", "Google's address when the record has none of its own");
  assert.equal(emailOfDynamicUser({ user: { email: null, verifiedCredentials: [wire(GOOGLE_CRED), wire(EMAIL_CRED)] } }), "sam@work.com", "an email credential before Google's");
  assert.equal(emailOfDynamicUser({ email: null, verified_credentials: [wire(GOOGLE_CRED)] }), "sam@gmail.com", "a login token's shape reads the same");
  assert.equal(emailOfDynamicUser({ user: { email: null, verifiedCredentials: [wire(PHONE_CRED), wire(WALLET_CRED)] } }), null, "a phone alone has no address");
  const google = { sub: "u1", verified_credentials: [wire(GOOGLE_CRED), wire(WALLET_CRED)] };
  assert.equal(suggestedNameOf(google as never), "Sam", "the first word of Google's display name");
  assert.equal(loginMethod(google), "google");
  assert.equal(loginMethod({ verified_credentials: [wire(PHONE_CRED), wire(WALLET_CRED)] }), "phone");
  assert.equal(loginMethod({ email: "sam@work.com", verified_credentials: [wire(EMAIL_CRED), wire(WALLET_CRED)] }), "email");
});

test("no test and no audit reaches the live API: under the test runner a model call is refused before any request is made", async () => {
  assert.equal(liveCallsAllowed(), false, "this process is the test runner's");
  assert.equal(liveCallsAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv), true, "the app itself calls");
  assert.equal(liveCallsAllowed({ NODE_TEST_CONTEXT: "child-v8" } as unknown as NodeJS.ProcessEnv), false);
  assert.equal(liveCallsAllowed({ DAREFUL_NO_LIVE_AI: "1" } as unknown as NodeJS.ProcessEnv), false);
  const call = structured({ label: "scope market", model: MODELS.drafting, system: "x", user: "y", toolName: "t", toolDescription: "d", inputSchema: { properties: {} }, shape: z.object({}), timeoutMs: 1000 });
  await assert.rejects(call, /live model calls are off under the test runner/);
});

test("a triage with a long criterion or a fourth one is clipped, never thrown away: the answer Sonnet 5.5 gave in the comparison parses", () => {
  const long = "by reaction time available to the receiver, measured from the ball leaving the hand to contact, in milliseconds";
  const t = Triage.parse({ tier: "contestable", claim: "Is returning a top men's first serve harder than putting a pitch in play?", criteria: [long, "by elite success rate", "by years of training", "by injuries"], declineReason: "", dareInstead: "" });
  assert.equal(t.criteria.length, 3, "three at most, the rest dropped");
  assert.ok((t.criteria[0] ?? "").length <= 110 && long.startsWith(t.criteria[0] ?? "x"), "cut back at a word");
  assert.equal(clipWords("short", 110), "short");
  assert.equal(clipWords("one two three four", 9), "one two");
});

test("Continue with Google leads the account step as its one chalk, with Google's own mark unmodified, then an email, a phone number and the way out; on Now's card Google leads too", () => {
  const step = readFileSync("src/components/auth/account-step.tsx", "utf8");
  const at = (needle: string) => step.indexOf(needle);
  assert.ok(at("data-account-google") > 0 && at("data-account-google") < at("{via === \"email\" ? \"Email\" : \"Phone number\"}") && at("{via === \"email\" ? \"Email\" : \"Phone number\"}") < at("data-account-switch") && at("data-account-switch") < at("data-account-close"), "Google, then the address, then the phone, then the way out");
  assert.ok(/<Button variant="primary" onClick=\{\(\) => void withGoogle\(\)\}[^>]*data-account-google="">\s*<GoogleMark \/>\s*Continue with Google/.test(step), "Google is the step's chalk, its mark at the left");
  assert.ok(step.includes('<Button variant={google ? "secondary" : "primary"} onClick={() => void send()}'), "the address's Continue gives way to it, and leads only without it");
  const card = readFileSync("src/components/home/reach-card.tsx", "utf8");
  assert.ok(card.indexOf("data-reach-google") > 0 && card.indexOf("data-reach-google") < card.indexOf("data-reach-email") && /<GoogleMark \/>\s*Link Google/.test(card), "the card: Google first, with its mark, a secondary under Now's one chalk");
  // Google's mark as Google's own configurator draws it, read from developers.google.com/identity/branding-guidelines on 2026-10-06: its colours and paths, hashed there and here.
  const svg = readFileSync("public/brand/google-g.svg", "utf8");
  const paths = [...svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].map((m) => `${m[1]}|${m[2]}`).join("\n");
  assert.equal(createHash("sha256").update(paths).digest("hex"), "7b27de299a22bc1f085e9b332071ff0b141778a52e01053fd19035c5c8669ce1", "the mark is unmodified");
  const mark = readFileSync("src/components/auth/google-mark.tsx", "utf8");
  assert.ok(mark.includes('src="/brand/google-g.svg"') && mark.includes("width={20} height={20}"), "at Google's 20px");
});

test("asking and starting a game skip who's in: a question goes to whoever its asker sends it to and opens as it is sent; adding one to a game keeps the game's own people", () => {
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  assert.ok(form.includes('const who = { kind: "link" } as const;'), "asking sends it to whoever it is sent to");
  assert.ok(!/step === "who"|WhoStep/.test(form), "and has no who's-in step");
  assert.ok(form.includes("if (r.create) await openAsSent(r.id, r.create);"), "it opens as it is sent, with share, copy and the code in view");
  const start = readFileSync("src/components/on/start-game.tsx", "utf8");
  assert.ok(start.includes('const who: Who = mode.kind === "add" && mode.groupId ? { kind: "set", groupId: mode.groupId } : { kind: "link" };'), "starting a game does too; adding one keeps the game's own people, unless they already run it");
  assert.ok(!/step === "who"|WhoStep/.test(start), "and has no who's-in step either");
});

test("a question too far off to decide says so at Decided with its nearer version, picks no date for the asker and sends nothing until they choose", () => {
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  assert.ok(form.includes("message={`That can’t be known until ${longDateWords(tooFar.knownBy)}, and the furthest a question can run is ${longDateWords(tooFar.latest)}.`}"), "said in plain words, at the field it is about");
  assert.ok(/onClick=\{askNearer\} data-ask-nearer="">\s*Ask this instead\s*<\/Button>/.test(form), "one nearer version, taken whole with a tap");
  assert.ok(form.includes("<Chip size={36} selected={!tooFar && decide.key === w.key} choice>") && form.includes("<Chip size={36} selected={!tooFar && decide.key === \"date\"} choice>"), "no date picked for the asker");
  assert.ok(form.includes('if (tooFar && pace !== "argument") return setProblem("Pick when it’s decided.");'), "nothing sent until they choose");
  assert.ok(form.includes("max={latestDate(new Date(), askerZone())}"), "the phone's date picker stops at the same furthest date");
});

test("the ask flow's fields grow with what they hold where the browser will not, and a reading wraps rather than being cut", () => {
  assert.equal(fittedHeight({ scrollHeight: 112, offsetHeight: 84, clientHeight: 82 }), 114, "the content, its padding and the two borders");
  const css = (globalThis as { CSS?: unknown }).CSS;
  try {
    (globalThis as { CSS?: unknown }).CSS = { supports: () => false };
    assert.equal(sizesItself(), false, "Safari 26.0: no field-sizing");
    const field = { style: { height: "82px" }, scrollHeight: 112, offsetHeight: 84, clientHeight: 82 };
    fitField(field);
    assert.equal(field.style.height, "114px", "so the height is set from the content");
    (globalThis as { CSS?: unknown }).CSS = { supports: (p: string, v: string) => p === "field-sizing" && v === "content" };
    assert.equal(sizesItself(), true, "Safari 27: the browser does it");
    const native = { style: { height: "" }, scrollHeight: 112, offsetHeight: 84, clientHeight: 82 };
    fitField(native);
    assert.equal(native.style.height, "", "and nothing here touches it");
  } finally {
    (globalThis as { CSS?: unknown }).CSS = css;
  }
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  for (const [ref, value] of [["lineField", "line"], ["titleField", "title"], ["termsField", "terms"]]) {
    assert.ok(form.includes(`const ${ref} = useFitsContent(${value});`) && form.includes(`ref={${ref}}`), `the ${value} field is fitted`);
  }
  const start = form.indexOf("That could be decided a few ways.");
  const readings = form.slice(start, form.indexOf("const units = selectedSet?.units ?? [];", start));
  assert.ok(readings.includes('className="h-auto min-h-12 whitespace-normal py-3 text-left"'), "each reading wraps inside its button");
});

test("the tiebreaker rules on Opus 5.5 with its effort said, room for its thinking and the API's fallback, voids unless what it has clearly supports one outcome, and names the outcome; everything else stays where it was", () => {
  assert.equal(MODELS.tiebreaker, "claude-opus-5-5", "Opus 5.5 by default");
  assert.deepEqual([MODELS.ruling, MODELS.drafting], ["claude-sonnet-5-5", "claude-haiku-5-5"], "the rest as routed (drafting on Haiku 5.5 since the touch-ups round)");
  const settler = readFileSync("src/lib/ai/settler.ts", "utf8");
  assert.equal(settler.split("model: MODELS.tiebreaker,").length - 1, 3, "the three tiebreaker calls: yes or no, a number, pick one");
  assert.equal(settler.split("...TIEBREAKER_CALL,").length - 1, 3);
  assert.ok(settler.includes('const TIEBREAKER_CALL = { maxTokens: 16_000, effort: "medium", fallback: true, search: { maxUses: 3 } } as const;'), "medium said aloud, sixteen thousand of room, the fallback, and a quick search for a public fact (the touch-ups round)");
  for (const what of ["one outcome", "one number", "one of the listed answers"]) assert.ok(settler.includes(`unless what is in front of you clearly supports ${what} under the terms as recorded`), `the void rule, for ${what}`);
  assert.equal(settler.split("When it does clearly support one, rule it, even when the answer is uncomfortable, and say in the ruling which").length - 1, 3, "and the outcome named when it rules");
  assert.ok(/label: "rule claim",\s*model: MODELS\.ruling,/.test(settler), "an argument's proposed ruling, which the two can overrule, stays on the ruling model");
  const client = readFileSync("src/lib/ai/client.ts", "utf8");
  assert.ok(client.includes('if (req.fallback) return anthropic().beta.messages.create({ ...(params as object), betas: [FALLBACK_BETA], fallbacks: "default" }') && client.includes('export const FALLBACK_BETA = "server-side-fallback-2026-07-01";'), "the fallback asked for on the beta endpoint");
  assert.equal(client.split("...thinkingFor(").length - 1, 2, "the effort sent when it is said, on the plain call and the streamed one, each model's own way (`thinkingFor`, the touch-ups round)");
});

test("a deadline the terms name with its year is that date, one without agrees with the same month and day in a later year, a chip moves a written year with the date, and the refusal says the year when it is not this one's", () => {
  // The simulator's case (the second-pass round): the nearer Mars question, decided October 6, 2029, refused against this year's October 6.
  const terms = "Yes if any human sets foot on Mars by October 6, 2029. No if none do. We'll know by October 6.";
  assert.deepEqual(termsDeadlines(terms, sunday, NY), [{ said: "October 6, 2029", date: "2029-10-06", yearless: false }, { said: "October 6", date: "2026-10-06", yearless: true }]);
  assert.equal(deadlineMismatch(terms, "2029-10-06", sunday, NY), null, "the year written is the date, and the yearless October 6 is the same day");
  assert.equal(deadlineMismatch("Decided by October 6, 2028.", "2029-10-06", sunday, NY), "October 6, 2028", "a written year that is not the decide-by's");
  assert.equal(deadlineMismatch("Decided by October 13.", "2029-10-06", sunday, NY), "October 13", "another day, with or without a year");
  assert.equal(swapDateWords("Yes if it lands by October 6, 2029. We know by October 6.", "2029-10-06", "2027-05-01"), "Yes if it lands by May 1, 2027. We know by May 1.");
  assert.deepEqual([datePhrase("2029-10-06", sunday, NY), datePhrase("2026-10-13", sunday, NY)], ["October 6, 2029", "October 13"]);
  for (const f of ["src/components/markets/ask-form.tsx", "src/lib/actions/markets.ts"]) assert.ok(/and it’s decided \$\{datePhrase\(/.test(readFileSync(f, "utf8")), `${f} says the year`);
});

test("a count beside a clock says how many are in and nobody rather than a zero: a new game reads nobody's in yet, never 0 of 1 in, and no count has a second number", () => {
  assert.equal(inCount(0), "nobody’s in yet");
  assert.deepEqual([inCount(1), inCount(3)], ["1 in", "3 in"], "nobody is asked by name, so there is no second number (the games-and-the-reveal round)");
  const fresh = cardMeta({ key: "home_wins", state: "open", viewerIn: false, mine: null, inCount: 0, votesCast: 0, proposed: false, voted: false, teams: { away: "LAC", home: "BUF" }, unit: null, answers: null, outcomeWords: null, feedEnding: null, resolvedBy: null, closest: null, votingEnds: null });
  assert.equal(fresh.text, "Closes at kickoff · nobody’s in yet", "the simulator's new game, as Tam");
  assert.ok(!readFileSync("src/lib/ledger/market-view.ts", "utf8").includes("groupSize") && !readFileSync("src/components/on/game-page.tsx", "utf8").includes("groupSize"), "Now and the game page count no set");
});

