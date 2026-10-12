/**
 * Pre-submission bug fixes 2's mutants (2026-10-12): one break per rule the batch added, each naming the test that must
 * fail while it is in place. Kept beside mutants.ts, which takes them into the list. None widens what the code does to
 * rows a test did not make: the hand-over's and the bind's breaks join or leave out only the tests' own people, and the
 * indexer's start is exercised against a stand-in Docker on the test's own socket, never the machine's.
 */
import type { Mutant } from "./mutants";

const U = "tests/unit/bug-fixes-2.test.ts";
const U_HAND = "tests/unit/hand-over.test.ts";
const D = "tests/db/bug-fixes-2.test.ts";

const T_KEYPAD = "the PIN's keypad: a digit adds itself up to four, Delete takes one off, the digit that makes the fourth sends, and while a PIN is on its way no key does anything (section 0)";
const T_WAITS = "handing the phone over waits as every tap does: the keypad held from the fourth digit, the tally past a third of a second, the line at three, our own words at a minute, and a thrown request answered in words (section 0)";
const T_PIN_WAIT = "the PIN step holds from the fourth digit until the answer: every key takes nothing at once, past a third of a second the tally counts where the dots were with the keypad at 0.88, and past three seconds a line says it is still going (pre-submission bug fixes 2)";
const T_UNITS = "the units row on You names no next time, which left the stakes in the final round, and a next time is never a unit of your own nor said to be offered (section 1)";
const T_RULES = "the local indexer's rules: a create's every port on 127.0.0.1, publishing everything or the VM's own network refused, and every published or listening address read for what reaches beyond this Mac (section 1)";
const T_OWN_PORT = "the local indexer's own port: a server with no host, every interface or another address listens on 127.0.0.1, and a socket path or a loopback host is left alone (section 1)";
const T_SOCKET = "the local indexer's socket to Docker: a create reaches Docker with every port on 127.0.0.1, one it cannot make so never reaches it, everything else passes as it came, and a hijacked stream is joined both ways (section 1)";
const T_START = "npm run indexer:dev is the start on 127.0.0.1, and CLAUDE.md's environment section points at it (section 1)";
const T_D_FALLBACK = "a friend picked from the host's own people gets into a question asked without naming anyone: a right PIN joins them to its group, and their entry stands with the terms over the question's own group and counts; a wrong PIN leaves the group as it was (section 0)";
const T_D_GAME = "the same on a game page: a question on a game, asked without naming anyone, takes the friend from the host's phone into its set (section 0)";
const T_D_LOUD = "a hand-over whose terms over the question's own group cannot be signed still lets the entry stand, and says so in the log, never quietly (section 0)";
const T_NOBODY = "an empty Who's joining? is everyone in only when the host has people here and every one is in; a host with people out of it, or nobody yet, hears that none has pass the phone on, and how a friend turns it on (section 0, the owner's addition)";
const T_WHO_EMPTY = "who's joining with nobody to pick says which it is: everyone this was sent to is in already, or none of the host's people have pass the phone on, with how a friend turns it on (pre-submission bug fixes 2)";
const T_D_NOBODY = "Who's joining? with nobody to pick says why: none of the host's people who aren't in has pass the phone on, or everyone the host could pick is in already, and a host with nobody here yet hears the first (section 0, the owner's addition)";
const T_D_BIND = "a guest who got into a question asked between two people becomes an account seated in its group: the entry is theirs to keep, and one the asker removed seats nobody (section 0, the other ways in)";

const HAND = "src/lib/ledger/hand-over.ts";
const CLAIMS = "src/lib/ledger/claims.ts";
const STEPS = "src/components/markets/hand-over-steps.tsx";
const HAND_UI = "src/components/markets/hand-over.tsx";
const SETTINGS = "src/lib/ledger/settings.ts";
const START = "scripts/dev/indexer-on-loopback.mjs";
const PRELOAD = "scripts/dev/listen-on-loopback.mjs";

const JOIN = '  try {\n    const d = await marketById(input.dareId);\n    if (!d) return { ok: false, refused: "That one doesn\'t exist." };\n    await joinGroupOf(d, input.friendId);\n';

export const bugFixes2: Mutant[] = [
  // section 0: pass the phone, and the other ways into a question
  { id: "hand-over-joins-nobody", file: HAND, find: "    await joinGroupOf(d, input.friendId);\n", replace: "", suite: D, kills: [T_D_FALLBACK, T_D_GAME], why: "every friend from the host's own people refused as not in the group, as on production from October 7" },
  { id: "hand-over-joins-on-a-wrong-pin", file: HAND, find: `  if (!pin.ok) return { ok: false, pin };\n${JOIN}`, replace: `${JOIN}    if (!pin.ok) return { ok: false, pin };\n`, suite: D, kills: [T_D_FALLBACK], why: "a wrong PIN puts the friend in the host's question's group all the same" },
  {
    id: "hand-over-joins-after-signing",
    file: HAND,
    find: `${JOIN}  } catch (err) {\n    return { ok: false, refused: err instanceof MarketError ? err.message : "That didn't go through. Try again." };\n  }\n  let signature: Hex | null;`,
    replace: "  let signature: Hex | null;",
    also: [{ file: HAND, find: "  try {\n    const position = await enterMarket(", replace: "  await joinGroupOf((await marketById(input.dareId))!, input.friendId);\n  try {\n    const position = await enterMarket(" }],
    suite: D,
    kills: [T_D_FALLBACK],
    why: "the terms over the question's own group are refused before she is a member, and her entry goes in without them",
  },
  { id: "hand-over-terms-quiet", file: HAND, find: "  if (!question) console.error(\"a hand-over's entry went in without the terms over the question's own group\", { dareId: input.dareId, why });\n", replace: "", suite: D, kills: [T_D_LOUD], why: "terms that could not be signed go unsaid again, the silence that hid the bug" },
  { id: "bind-seats-nobody", file: CLAIMS, find: "  if (bound) await seatBoundEntries(bound.claimId, userId);\n", replace: "", suite: D, kills: [T_D_BIND], why: "a guest's account is refused its own entry on a question asked between two, and shown the invitation" },
  { id: "bind-seats-a-removed-entry", file: CLAIMS, find: "eq(schema.darePositions.boundClaim, claimId), isNull(schema.darePositions.dismissedAt)));", replace: "eq(schema.darePositions.boundClaim, claimId)));", suite: D, kills: [T_D_BIND], why: "an entry the asker removed seats its account in the pair's set" },
  // section 0, the owner's addition: an empty Who's joining? says why
  { id: "nobody-always-all-in", file: HAND, find: '  return input.people > 0 && input.notInYet === 0 ? "all_in" : "none_on";', replace: '  return "all_in";', suite: U, kills: [T_NOBODY], why: "\"Everyone this was sent to is in already.\" when nobody the host knows has pass the phone on, as the owner found on production" },
  { id: "nobody-new-host-all-in", file: HAND, find: '  return input.people > 0 && input.notInYet === 0 ? "all_in" : "none_on";', replace: '  return input.notInYet === 0 ? "all_in" : "none_on";', suite: U, kills: [T_NOBODY], why: "a host with nobody here yet is told everyone is in" },
  { id: "picks-reason-dropped", file: HAND, find: "  return { candidates, empty: candidates.length > 0 ? null : nobodyToPick({ people: people.length, notInYet: mine.length }) };", replace: "  return { candidates, empty: null };", suite: D, kills: [T_D_NOBODY], why: "the reason is worked out and never sent, so the sheet says everyone is in" },
  { id: "picks-reason-beside-a-list", file: HAND, find: "empty: candidates.length > 0 ? null : nobodyToPick(", replace: "empty: nobodyToPick(", suite: D, kills: [T_D_FALLBACK], why: "a reason for nobody stands beside the people to pick" },
  { id: "sheet-reason-ignored", file: STEPS, find: 'nobodyToPickWords(empty ?? "all_in", host)', replace: 'nobodyToPickWords("all_in", host)', suite: U_HAND, kills: [T_WHO_EMPTY], why: "the sheet says everyone is in whatever the server found" },
  { id: "sheet-how-unsaid", file: STEPS, find: '                {nobody.how ? <span className="text-body-sm text-ink-2">{nobody.how}</span> : null}\n', replace: "", suite: U_HAND, kills: [T_WHO_EMPTY], why: "the host learns nobody has it on and not how a friend turns it on" },
  { id: "words-blame-everyone-in", file: STEPS, find: "  return { line: `None of ${host}’s people have pass the phone on yet.`, how:", replace: "  return { line: \"Everyone this was sent to is in already.\", how:", suite: U, kills: [T_NOBODY], why: "the words for nobody set up are the words for everyone in" },
  { id: "pass-page-reason-dropped", file: "src/app/m/[id]/pass/page.tsx", find: "          nobody={picks.empty}", replace: "          nobody={null}", suite: U, kills: [T_NOBODY], why: "the page never hands the reason to the sheet" },
  // section 0: the PIN step's wait
  { id: "pin-held-keys-still-type", file: STEPS, find: "  if (held) return { pin, send: false };\n", replace: "", suite: U, kills: [T_KEYPAD], why: "a key tapped while the PIN is on its way changes the dots and can send a second PIN" },
  { id: "pin-fifth-digit-taken", file: STEPS, find: "  if (pin.length >= PIN_LENGTH) return { pin, send: false };\n", replace: "", suite: U, kills: [T_KEYPAD], why: "a fifth digit lands on a full PIN" },
  { id: "pin-sends-early", file: STEPS, find: "  return { pin: next, send: next.length === PIN_LENGTH };", replace: "  return { pin: next, send: next.length >= PIN_LENGTH - 1 };", suite: U, kills: [T_KEYPAD], why: "the third digit sends a PIN that can only be wrong, and costs a try" },
  { id: "pin-keys-never-held", file: STEPS, find: ' disabled={holding} aria-label={k === "back" ? "Delete" : k}', replace: ' aria-label={k === "back" ? "Delete" : k}', suite: U_HAND, kills: [T_PIN_WAIT], why: "the keypad takes taps while the PIN is on its way" },
  { id: "pin-no-tally", file: STEPS, find: '            {counting ? (\n              <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-ink" data-pin-wait="">\n                <TallyLoader size={22} />\n              </span>\n            ) : null}\n', replace: "", suite: U_HAND, kills: [T_PIN_WAIT], why: "three to five seconds of nothing after the fourth digit, which read as frozen" },
  { id: "pin-dots-over-the-tally", file: STEPS, find: ', counting && "invisible")} />', replace: ")} />", suite: U_HAND, kills: [T_PIN_WAIT], why: "the dots and the tally drawn over each other" },
  { id: "pin-keypad-undimmed", file: STEPS, find: 'cn("grid grid-cols-3 gap-2", counting && "opacity-[0.88]")', replace: 'cn("grid grid-cols-3 gap-2")', suite: U_HAND, kills: [T_PIN_WAIT], why: "the keypad looks ready while it takes nothing" },
  { id: "pin-no-line", file: STEPS, find: '          {line ? <p className="text-center text-caption text-ink-3" data-pin-still="">{line}</p> : null}\n', replace: "", suite: U_HAND, kills: [T_PIN_WAIT], why: "a long wait with nothing said" },
  { id: "hand-over-waits-as-a-read", file: HAND_UI, find: 'buttonWait(useWaitStage(holding === "sent"), "write")', replace: 'buttonWait(useWaitStage(holding === "sent"), "read")', suite: U, kills: [T_WAITS], why: "an entry on its way gets a read's block and its Try again, a second send of a write" },
  { id: "hand-over-keys-ignore-the-hold", file: HAND_UI, find: "pinAfterKey(pin, k, held.current)", replace: "pinAfterKey(pin, k, false)", suite: U, kills: [T_WAITS], why: "a tap in the same frame as the fourth digit sends a second PIN" },
  { id: "hand-over-sends-twice", file: HAND_UI, find: "    if (!friend || !picked || held.current) return;", replace: "    if (!friend || !picked) return;", suite: U, kills: [T_WAITS], why: "two sends of the PIN at once, counting two tries" },
  { id: "hand-over-throws-through", file: HAND_UI, find: "const r = await attempt(() => enterFromHostAction(dareId, picked.position, friend.id, full));", replace: "const r = await enterFromHostAction(dareId, picked.position, friend.id, full);", suite: U, kills: [T_WAITS], why: "a request that throws leaves the keypad held for good" },
  { id: "hand-over-never-gives-up", file: HAND_UI, find: "      setProblem(WORDS.server);\n    }, GIVE_UP_MS);", replace: "      setProblem(null);\n    }, GIVE_UP_MS);", suite: U, kills: [T_WAITS], why: "a minute with no answer frees the keypad with nothing said" },
  { id: "hand-over-lock-frees-keys", file: HAND_UI, find: '      setHolding("leaving");\n', replace: "      setHolding(null);\n", suite: U, kills: [T_WAITS], why: "a locked PIN takes more digits while the screen leaves" },
  { id: "hand-over-tally-at-once", file: HAND_UI, find: 'counting={holding === "sent" && wait.pending}', replace: "counting={holding !== null}", suite: U, kills: [T_WAITS], why: "the tally flashes on a quick wrong PIN, and stands over a lock's words" },
  // section 1: the units row, and the local indexer on 127.0.0.1
  { id: "units-caption-next-time", file: "src/app/you/page.tsx", find: '"Beers, coffees, rounds, dollars: whatever a cover or a question runs on"', replace: '"Beers, coffees, a next time, dollars: whatever a cover or a question runs on"', suite: U, kills: [T_UNITS], why: "the row names a stake the final round took out" },
  { id: "units-sheet-next-time", file: "src/components/you/account.tsx", find: "a beer, a coffee, a round, dollars.", replace: "a beer, a coffee, a next time, dollars.", suite: U, kills: [T_UNITS], why: "the sheet names a stake the final round took out" },
  { id: "next-time-made-yours", file: SETTINGS, find: "  if (NOT_A_STAKE.has(label)) return { error: \"A next time can’t be a stake.\" };\n", replace: "", suite: U, kills: [T_UNITS], why: "a next time comes back to the stakes as a unit of your own" },
  { id: "next-time-said-offered", file: SETTINGS, find: "  if (NOT_A_STAKE.has(label)) return { error: \"A next time can’t be a stake.\" };", replace: "  if (NOT_A_STAKE.has(label)) return { error: \"That one’s offered already.\" };", suite: U, kills: [T_UNITS], why: "a next time is said to be offered where nothing offers it" },
  { id: "create-every-interface-kept", file: START, find: "        here.push({ ...b, HostIp: LOOPBACK });", replace: "        here.push({ ...b });", suite: U, kills: [T_RULES, T_SOCKET], why: "Envio's Postgres and Hasura on every interface of this Mac, as before" },
  { id: "create-publish-all-passes", file: START, find: '  if (host.PublishAllPorts) return { refused: "asks to publish every port it exposes" };\n', replace: "", suite: U, kills: [T_RULES, T_SOCKET], why: "a container publishing everything it exposes, on every interface" },
  { id: "create-host-network-passes", file: START, find: '  if (host.NetworkMode === "host") return { refused: "asks for the VM\'s own network" };\n', replace: "", suite: U, kills: [T_RULES], why: "a container on the VM's own network, carried to every interface" },
  { id: "create-port-twice", file: START, find: "        if (seen.has(key)) continue;\n", replace: "", suite: U, kills: [T_RULES], why: "IPv4's and IPv6's binding of one port both made 127.0.0.1, and Docker refuses the second" },
  { id: "published-no-address-is-here", file: START, find: '        const ip = b?.HostIp || "0.0.0.0";', replace: '        const ip = b?.HostIp || "127.0.0.1";', suite: U, kills: [T_RULES], why: "a port published with no address, which is every interface, reads as this Mac's alone" },
  { id: "published-all-unread", file: START, find: '  if (inspect?.HostConfig?.PublishAllPorts) out.add("every port");\n', replace: "", suite: U, kills: [T_RULES], why: "a container publishing everything it exposes passes the check" },
  { id: "ipv6-loopback-beyond", file: START, find: ' || bare === "::1" || ', replace: " || ", suite: U, kills: [T_RULES], why: "IPv6's loopback read as beyond this Mac, and a good run stopped" },
  { id: "listening-loopback-beyond", file: START, find: "    if (!onlyHere(addr.slice(0, at))) out.add(addr);", replace: "    out.add(addr);", suite: U, kills: [T_RULES], why: "every listener read as beyond this Mac, and every run stopped" },
  { id: "socket-sends-the-refused-on", file: START, find: '      if ("refused" in made) {\n        seen({ name, refused: made.refused });', replace: '      if ("refused" in made) {\n        forward(Buffer.concat(chunks).toString("utf8"));\n        return;\n        seen({ name, refused: made.refused });', suite: U, kills: [T_SOCKET], why: "a create the socket cannot make loopback reaches Docker as it came" },
  { id: "socket-create-unrewritten", file: START, find: "      forward(JSON.stringify(made.body));", replace: '      forward(Buffer.concat(chunks).toString("utf8"));', suite: U, kills: [T_SOCKET], why: "the rewrite is made and Docker is sent the original" },
  { id: "socket-no-hijack", file: START, find: '  server.on("upgrade", (req, socket, head) => {', replace: '  server.on("upgrade-never", (req, socket, head) => {', suite: U, kills: [T_SOCKET], why: "docker exec -i through the socket is cut off, so Envio's psql through Docker fails" },
  { id: "socket-hijack-one-way", file: START, find: "      socket.pipe(up);\n", replace: "", suite: U, kills: [T_SOCKET], why: "what the client sends after Docker's 101 never reaches Docker" },
  { id: "start-keeps-old-containers", file: START, find: "    if (beyond.length === 0) continue;", replace: "    continue;", suite: U, kills: [T_START], why: "containers an earlier start made on every interface stay there" },
  { id: "start-straight-to-docker", file: START, find: "DOCKER_HOST: `unix://${sock}`", replace: "DOCKER_HOST: `unix://${docker}`", suite: U, kills: [T_START], why: "Envio speaks to Docker around the socket, and asks for every interface" },
  { id: "start-no-preload", file: START, find: 'NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${preload}`.trim()', replace: 'NODE_OPTIONS: process.env.NODE_OPTIONS ?? ""', suite: U, kills: [T_START], why: "envio dev's own port on every interface" },
  { id: "start-never-stops", file: START, find: "        stop(`Stopping: ${problems.join(\"; \")}.`, 1);", replace: "        say(`Stopping: ${problems.join(\"; \")}.`);", suite: U, kills: [T_START], why: "a port beyond this Mac is said and left open" },
  { id: "preload-every-interface-kept", file: PRELOAD, find: '    else if (!isHere(out[1])) out[1] = "127.0.0.1";\n', replace: "", suite: U, kills: [T_OWN_PORT], why: "a server asking for every interface gets it" },
  { id: "preload-no-host-kept", file: PRELOAD, find: '    if (typeof out[1] !== "string") out.splice(1, 0, "127.0.0.1");\n    else if', replace: '    if (false) out.splice(1, 0, "127.0.0.1");\n    else if', suite: U, kills: [T_OWN_PORT], why: "Envio's app.listen(port) on every interface, as before" },
  { id: "preload-options-kept", file: PRELOAD, find: '    if (!isHere(first.host)) out[0] = { ...first, host: "127.0.0.1" };', replace: "    void first;", suite: U, kills: [T_OWN_PORT], why: "listen({ port }) on every interface" },
  { id: "preload-never-loaded", file: PRELOAD, find: 'if (process.env.DAREFUL_LISTEN_ON_LOOPBACK === "1") {', replace: 'if (process.env.DAREFUL_LISTEN_ON_LOOPBACK === "never") {', suite: U, kills: [T_OWN_PORT], why: "the rule is there and nothing goes through it" },
  { id: "indexer-dev-the-old-way", file: "package.json", find: '"indexer:dev": "node scripts/dev/indexer-on-loopback.mjs",', replace: '"indexer:dev": "node scripts/with-env.mjs --cwd indexer npm run dev",', suite: U, kills: [T_START], why: "the documented start publishes everything on every interface again" },
  { id: "brief-points-nowhere", file: "CLAUDE.md", find: "and runs `scripts/dev/indexer-on-loopback.mjs`, which opens", replace: "and runs `envio dev`, which opens", suite: U, kills: [T_START], why: "the brief stops naming the one safe start" },
];
