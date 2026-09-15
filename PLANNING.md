# PLANNING.md

Working name: **Dareful** (dareful.app)

A social ledger for friend groups, built around the friendly dare. Records obligations between friends in whatever currency the group actually runs on (dollars, beers, rounds, favors, turns), created four ways: someone loses a dare, someone loses an argument, someone covers something, or a receipt gets split. Confirmed obligations live onchain as non-transferable records that no one can move, sell, or redeem. Nothing of monetary value is ever held.

Status: pre-implementation. No code exists. This document is the thing to implement against. It supersedes every earlier version.

This repository is public. Nothing in this document, in `CLAUDE.md`, or in any committed file may contain personal information about the author. Everything committed is about the product.

---

## 1. Thesis

The product is a lighthearted "I bet Johnny can't jump that fence" before it is anything else. The dare is the acquisition hook. What the dare leaves behind is a ledger, and the ledger is what people come back for, but the order matters: fun first, accounting second, and the accounting must never be allowed to make the app feel like homework.

**The app never asks you to log. It asks you to decide.** This is the central design constraint and the answer to why anyone opens the app at all. Logging loses to "I got you next time" every time, because logging costs something now and pays off months later. Nobody opens an app to record what happened. People do pull out a phone to settle: who is right, who is paying, whether he will actually do it. Every entry point is one of those moments, and the ledger entry is the residue of the decision rather than the thing being asked for.

Two loops, and the product needs both:

**Fast loop, seconds to minutes.** An argument gets settled. Everyone puts a number on whether John falls asleep and the movie ends. Roulette picks who fronts the tab. These resolve while everyone is still sitting there, they happen several times a night, and they are why the app gets opened in the first place.

**Slow loop, days to weeks.** A dare on a future event, resolving by quorum after the fact. These happen perhaps monthly, and they are why people come back.

A product with only the slow loop is a calendar of pending bets. A product with only the fast loop is a toy that leaves nothing behind. The ledger is what connects them, and calibration (Section 8e) is what makes months of both worth having: every market scores everyone on accuracy, and the payout and the calibration are the same number.

The ledger solves amnesia, not defection. Friends do not welch on "you'll get me next time." What happens is that everyone forgets who is up. Existing tools (Splitwise, Tab, splitty, SplitEven, Settle Up, Tricount) treat the problem as accounting and set the win state to a zero balance, which is why they feel like homework and why nobody uses them for the informal ninety percent of what passes between friends.

Two social regimes exist and the product must serve both without asking anyone to declare which one they are in:

**Let-it-ride.** Obligations are deliberately left unquantified because settling closes the account and closing the account implies the relationship can end. The imprecision in "you'll get me next time" is load-bearing: it creates a reason to meet again. The job here is to make the imprecise durable rather than to make it precise.

**Always-square.** Everyone settles fully, so no debt exists and there is no gift to protect. The scarce good becomes the privilege of paying, because covering a $400 tab is financially neutral but earns points on $400 of spend. The fairness question is turn-taking on a benefit, and the useful metric is dollars routed through each person's card.

The same event log answers both. Open obligations give the parity read. Settled expenses grouped by who fronted give the capture read. A group's behavior selects the display without anyone configuring anything.

The timeline is the product. It runs from the past (what happened between these people, with photos) into the future (what they have planned), and the ledger is what the timeline happens to contain. A timeline that only runs backward is an accounting tool. One that runs forward is a relationship.

**Who this is for.** A stable friend group of four to eight people who already share a group chat, see each other in person at least weekly, and cover for each other constantly: dinners, rounds, rides, tickets, the thing someone forgot cash for. Not "everyone who splits bills." The group already has a running informal ledger; it lives in memory and a text thread, and it is always slightly wrong. The behaviors this product is built from were observed in exactly these groups: the same person fronting most dinners without anyone tracking it, "you'll get me next time" as a deliberate act rather than a deferral, credit card capture as the actual scarce resource in groups that always square, and the phone coming out three times a night to settle who was right about something. The first users are the author's own groups, which is where the design came from and where the testing log starts.

**The catalysts.** Anyone in this segment has said or heard every one of these in the last year, and each one is a moment the product intercepts. "That should be on Polymarket," said about anything with an outcome, from a friend's relationship to whether the Knicks cover, since roughly 2024. "Bet." as a one-word reply. "Let's ask ChatGPT" to end an argument, which is the phone already coming out to settle something. "Over/under on how long until he texts her back." "Loser buys the round." "Who's paying?" followed by someone suggesting card roulette. "I'll Venmo you," which is the sentence that never resolves. "I'm not putting it in Splitwise," which is the sentence that explains why. Fantasy football and March Madness side pools, the annual proof that the group likes betting each other. Wordle and Connections scores posted to the chat every morning, which is the group already sharing numbers competitively without anyone calling it that. The product exists because each of these moments currently produces a laugh and no record, and the record is the part people would keep if keeping it cost nothing.

## 2. Design principles

These are load-bearing. Violating one is a design bug, not a preference.

1. **Notify about what people did, never about states of the world.** "Justin dared you to jump a fence," "three people have voted, yours is the last," and "Gabe settled up" are people acting, and not sending them makes the product broken. "You have owed Gabe $40 for sixty days," any aging badge, and "you have not opened the app in three weeks" are nobody acting: they are the app judging you, and they are what gets it deleted. Automated collection is the most awkward thing software can do to a friendship. The test for any notification is whether a specific person just did a specific thing that the recipient would want to know about.

2. **The creditor authors, the debtor confirms.** Only the person who covered something can create the obligation, and the copy is "I got this one," never "Gabe owes me $32." One-tap confirm on the other side. Nothing exists on the ledger until the debtor has confirmed it.

3. **Count before amount.** The headline unit for a relationship is exchange history and rough parity. Hard dollar figures are available but never the first thing anyone sees, except for obligations explicitly marked as expected to settle.

4. **Precision is optional and discardable.** Knowing a share was $47.20 and choosing to log it as "Justin got this one" is a different act from not knowing. The system retains the magnitude invisibly, off the chain, so it can answer "are we roughly even" later.

5. **Forgiveness is a status move.** "Call it even" is a first-class, celebrated, creditor-initiated action, not a hidden escape hatch.

6. **Settlement is the photo moment.** Photo capture is requested when an obligation closes in the real world, not when it is created. It doubles as proof of settlement and as the memory layer, and it lands at a moment two people are already together.

7. **One account per bet, not one per person.** Entering a position, conceding, and claiming never require an account. Someone taps a link, puts a number on it, types a first name, and is done. Only the person who creates something needs to be signed in, and the login that creates their wallets is a Partiful-style email or phone step, never a visible wallet ceremony. Nothing mints for a participant until they have an account and confirm; until then their side of the bet is a pending proposal on the creator's timeline and a claim waiting for them. The unclaimed obligation is the signup prompt, and it is the only signup prompt, because it is a social fact their friends created rather than the app asking for anything. See Section 4, "Accountless participation." Invisible wallet creation and accountless entry are both Phase 1 acceptance tests.

8. **Cross-platform or nothing.** One Android user in a five-person group and a ledger with a hole in it is worse than no ledger. This forecloses iMessage extensions entirely, and it is also the competitive wedge: the moment one person in a group is on Android, platform-native group features stop working and a cross-platform link wins by default.

9. **Errors must be visible, not silent.** A misparsed receipt price that still reconciles will overcharge someone's friend invisibly. A transaction that fails on gas will strand an obligation invisibly. Every automated computation and every chain write gets an invariant that fails loudly.

10. **The server can write the ledger but can never cast a vote.** Actions that bind only yourself (confirming your own debt, settling or forgiving what you are owed) may be signed silently on your behalf. Actions that bind other people (voting on a market's outcome) always require a signature from a key the server does not hold, or a consent to arbitration signed with that key before the outcome was known. This is the boundary between "invisible blockchain" and "the app decided the bet." It is enforced architecturally in Section 7, not by policy.

## 3. Scope boundaries

Explicitly out of scope. These are easier to commit to now than later.

- **No custody of anything with monetary value. Ever.** Users hold non-custodial wallets whose only contents are non-transferable obligation records. The platform holds no keys that can move value and no balances of its own. Obligation tokens cannot be transferred, sold, redeemed, or exchanged, and this is enforced in the contract, not promised in a document.
- **A USD-denominated obligation is a record of an amount, not a claim against the platform.** It is not redeemable anywhere. Settlement happens however people already settle, and the app only records that it happened.
- **No fee tied to wager size, wager volume, or settlement amount.** This is architectural, not commercial. A rake converts the platform from bystander to house. There is no monetization plan; if one ever appears it must be structurally independent of betting activity.
- **No Venmo, PayPal, or Cash App integration, including read-only.** No sanctioned API exists, the terms of those services prohibit gambling-adjacent use, and a record linking specific dares to specific payments is a paper trail the product must never hold. Settlement is marked in-app.
- **No notification about a state of the world.** See Principle 1. Notifications track what people did; nothing is ever sent because time passed or a balance aged.
- **No native mobile app in v1.** Web plus PWA install. This forecloses reading the phone's photo library; photos come from capture at the settlement moment.
- **No external calendar integration.** Plans live on the timeline. An "add to calendar" export link is the only calendar touchpoint.
- **No inbound messaging integration.** Dareful never receives messages from iMessage, WhatsApp, SMS, or Telegram in v1. Recorded so nobody relitigates it: Apple does not allow a business in a group chat and will not approve a bot-only deployment; WhatsApp's Groups API caps groups at eight, requires an Official Business Account, and cannot join an existing group; US SMS requires A2P 10DLC registration against a business identity. Telegram bots can join groups and are the one post-submission inbound surface worth testing. Outbound is different: every share goes out through the user's own composer via a share-sheet or `sms:` deep link, from their own number, into whatever chat they choose. That needs no integration, no approval, and works inside iMessage groups because the human is the sender.
- **No order book, no liquidity, no price discovery, no market maker, no house.** Markets resolve by a competitive scoring rule (Section 8c): each person states a belief, is scored on accuracy after the fact, and settles pairwise with every other participant on the difference in their scores. There is no market price at any moment, nothing is bought or sold, no side is taken, and no pot is held. It is a forecasting contest structure, not a wager on a side. Custody and settlement posture are unchanged: nothing moves and every obligation is a non-transferable record.
- **The app suggests an anchor, takes no position, takes no cut, and settles nothing in money.** The three prohibitions must all hold at once. The suggested probability is a conversation starter to argue against, never a price and never presented as one. A friend group cannot produce price discovery: five people with no liquidity is a market thin enough to capture for free, which is exactly why there is none.
- **No drinking games, and no game administration for games that produce no obligations.** Never have I ever and "take a drink when X" generate no ledger state and leave nothing on the timeline. Games that produce dares (truth or dare, a round of challenges, "loser buys the next round") are dare sequences and belong in Phase 11. The mechanic can be identical; the framing cannot involve drinking.
- **No shared points valuation.** Track dollars captured. A private per-user multiplier lens is allowed; a group-visible "Gabe earned $180 of value" is not.
- **No group-level regime setting.** Regime is inferred per obligation.
- **No cross-group capture fairness comparison.** Capture equity needs a denominator that only exists inside a group.
- **No credit-card-roulette variant where the loser eats the tab.** Roulette decides who fronts; the group still squares. A $400 dinner must never become a $400 loss.
- **No deletion of ledger history.** The onchain log is immutable and the offchain log mirrors that. Archiving hides; nothing erases. The one exception is personal data that was never ledger history: a phone hash is deleted when its ghost is dismissed.

## 4. Architecture

### The governing rule

Anything two people must agree on goes onchain. Anything one person controls stays off.

| Onchain (Monad) | Offchain (Postgres) |
|---|---|
| Obligation existence, denomination, quantity, debtor, creditor | Magnitude in cents (`amount_cents`), `settle_expected`, memo |
| Settlement, forgiveness, netting | Photos, display names, avatars |
| Market terms hash, every position (stake and stated value), quorum membership, resolution, payouts (when every participant has a wallet) | Market title, full terms text, AI anchor, AI proposal and rationale, and the whole market when any participant is a ghost |
| Group and denomination identifiers | Group names, denomination labels, emoji, archive preferences |
| | Pending (unconfirmed) obligation proposals, participant claims and their tokens, personal links, provisional markets |
| | Plans and RSVPs |
| | Expenses, receipts, item claims |
| | Delegation credentials |

### Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Client: Next.js PWA                                          │
│   Dynamic SDK (auth, two embedded wallets)                   │
│   Reads: Envio GraphQL (chain state) + Next.js API (Postgres)│
│   Signs: governance wallet (votes, always prompted);         │
│          ledger wallet only when not delegated               │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
┌──────────────▼───────────────┐  ┌────────────▼───────────────┐
│ Server: Next.js API routes   │  │ Envio HyperIndex            │
│   Delegation webhook receiver│  │   Indexes Ledger + Dares    │
│   Delegated signer (ledger   │  │   Serves GraphQL            │
│     wallets only)            │  │                             │
│   Relayer (pays gas)         │  └────────────┬───────────────┘
│   AI proposer + anchor       │               │
│   Claim binding on signup    │               │
│   Postgres via Drizzle       │               │
└──────────────┬───────────────┘               │
               │ Alchemy RPC                   │ Alchemy RPC
┌──────────────▼───────────────────────────────▼───────────────┐
│ Monad (testnet through submission, mainnet after)            │
│   DarefulLedger  (ERC-1155, non-transferable)                │
│   DarefulDares   (quorum resolution)                         │
└──────────────────────────────────────────────────────────────┘
```

### Two wallets per user

Every user has two Dynamic embedded wallets on Monad, created at first login.

**Ledger wallet.** Delegated to the server. Signs every routine ledger action silently: confirming an obligation, settling, forgiving, netting, entering a position in a market. The user never sees a prompt for these.

**Governance wallet.** Never delegated. The app never requests delegation for it. Signs exactly one kind of message: a vote on a market's outcome. Every vote prompts. Consent to arbitration rides on the entry signature from the ledger wallet, which is deliberate: it is consent to a rule, given before the outcome exists, not a vote on an outcome.

The contracts enforce the split. `DarefulLedger` registers both wallets per member and accepts actions signed by ledger wallets. `DarefulDares` reads the quorum from `DarefulLedger.governanceOf(groupId)` at creation and never accepts a caller-supplied quorum, so a creator cannot substitute addresses they control. Votes are accepted only from those governance addresses. A compromised server holding every delegated share can write any ledger entry; it cannot produce a single vote.

Whether Dynamic's per-wallet MPC shares are cryptographically isolated when two wallets derive from one root is confirmed with Dynamic before mainnet. Until then the isolation is operational (the server never receives governance shares) and this is logged in `docs/decisions.md`.

### Transaction submission

All contract mutations use a signed-message pattern (ERC-2771 style with a single trusted relayer). The user's wallet signs an EIP-712 message authorizing the action; the server's relayer submits it and pays gas. This means:

- Users never hold MON and never see a fee.
- Ledger actions are signed server-side with delegated shares, so they are silent.
- Votes are signed client-side with the governance wallet, so they prompt, and the relayer still pays.
- Monad's reserve balance mechanism never touches a user, because user wallets never send transactions.

Monad charges gas against the declared gas limit, not gas used. The relayer passes an explicit `gas` value on every transaction, derived from a per-function table maintained in `src/lib/chain/gas.ts`, never from estimation.

### Accountless participation

Most bets that matter for acquisition resolve within hours and involve people who will not create an account for them. "Will John fall asleep during this movie" is not worth a signup to anyone but the person who made it. The product has to work when exactly one participant has an account.

**The rule: nothing goes onchain for a position nobody signed.** An obligation is an edge between two addresses, and a position is only real onchain when its owner signed it, so a market with an accountless participant, or with a position the host typed for someone (see "One phone" below), cannot be an onchain market and cannot mint. It runs provisionally, offchain, and produces obligation proposals that mint later.

**The flow.**

1. The creator, who is signed in, makes the bet. For a micro-bet this is one line of text and one tap (Section 8a).
2. The creator names who is in, either by picking them from the phone's contacts (the Contact Picker API: the OS sheet opens, they select people, the app receives only those entries) or by typing names. A picked contact is hashed at the edge; if the hash matches a `users.phone_hash`, that user is added to the market's group, otherwise a `participant_claims` row is created or reused by hash and added to the group as a ghost member. A typed name creates a claim with no hash. The raw number is used once to prefill the composer and never stored. The group itself is created or matched lazily from the member set, the way implicit dyads already are, so "Gabe, John, and Alex" is the same group next Friday. Previously picked people are offered first without reopening the picker.
3. Three ways in, all resolving to the same market. The **group link** is one URL for the whole market, opened in the creator's own composer (share sheet, or an `sms:` deep link) and pasted into whatever chat they choose. A **personal link** carries a `personal_links` token for one member and goes to that person as a 1:1 text, one composer open each. A **room code** is for people in the same room: the creator's screen shows a QR of the group link and a six-character code beneath it, and anyone present scans or types it (see "The room code" below). Dareful is never in the chat and never sends anything.
4. A recipient taps the link and lands on one page: the market, who the app thinks they are, and a choice between entering as that person or signing in. From a personal link the identity is pre-filled. From the group link they pick themselves from the group's members or type a name. Entering as a member attaches a new token to that member's existing claim; entering under a new name creates a new claim. The token is stored in that browser and a `dare_positions` row records the position. No account, no wallet, no signature, no email, no phone.

   **A link never authenticates.** A personal link is the creator's claim about who the recipient is, and it was minted by the creator, so if it logged the recipient in, the creator could log in as them by tapping it. It does not. An account-holder with a live session in that browser is recognized without any step, which is the normal case on their own phone. Without a session they either sign in (Dynamic sends the OTP; the device autofills the number and the code) or enter as a ghost and bind later, on the next login in that browser or on the phone hash. The OTP appears exactly when there is no session, which is exactly when it is the only thing separating the person from whoever else has the link.
5. **A position is acknowledged if its claim or user is a member of the market's group, and pending otherwise.** Pending positions do not score, do not count toward `N`, and generate no edges. A personal link, self-selection from the member list, or a returning claim all resolve to a member, so they are acknowledged automatically, as does any join while a room-code lobby is open, because the creator is watching it happen. A new typed name outside an open lobby is not a member and waits for a tap, which also adds it to the group. This is what stops one person with the link from filling the market with names: they get pending rows and nothing else, and the creator dismisses them in bulk.
6. The bet resolves. **The quorum still runs among the account-holders**, offchain: they vote with their governance wallets exactly as they would onchain, the signatures are verified against the same threshold, and the outcome is whatever reaches it. Nothing is submitted because the market is not onchain, but nobody's obligation arises from an outcome they had no vote on. Only when the creator is the sole account-holder does the creator record the outcome alone, or the AI resolve a checkable claim outright. An accountless participant can concede from the browser holding their token ("fine, you got me"), which is recorded on the proposal as a provisional acknowledgment, has no binding force, and pre-selects confirm for them at claim time. Scoring and pairwise transfers run offchain over the acknowledged participants, producing one `obligation_proposals` row per nonzero transfer, with `from_claim` or `to_claim` populated wherever a ghost is on that edge.
7. **Edges between two account-holders mint immediately** through the ordinary `confirm()` path, because pairwise settlement makes every edge independent. Silently, once delegated, when the debtor signed their own position, since they either voted on the outcome or were outvoted by a quorum they consented to at entry. On a prompt, always, when the position was typed for them (see "One phone"). Only edges involving a ghost wait. A ghost can delay their own obligations and nobody else's.
8. The creator's timeline shows the ghost edges as provisional. They are real to the creator and to nobody else yet.
9. Whenever that person creates an account, the claim token in their browser, a claim link sent to them later, or a phone login whose hash matches their claim binds every pending row to their new user. They see each one and confirm or dispute. Confirm mints through the ordinary `confirm()` path with `origin = 'dare'`. Dispute reopens the market for quorum resolution onchain if every participant now has an account. If other ghosts remain, dispute goes to offchain arbitration instead: the AI hears both sides and rules, and the claimant confirms or still declines. A ghost signed nothing at entry, so nothing can force them; the creator's recourse is the same as for any friend who will not pay.

**Dismissal.** The creator can dismiss a ghost from a market at any time, before or after resolution. Dismissal removes the position, re-runs the offchain scoring among the remaining acknowledged participants, and regenerates the proposals. Nothing was minted for that ghost, so nothing is unwound. The closing-the-books flow surfaces ghosts that never claimed as a prompt to dismiss them; that is the only place the app raises it.

**What a provisional market gives up.** Its terms hash and resolution never reach the chain; only the obligations it produced do. Since any market with a ghost is provisional, many early markets will exist onchain only as their obligations. That is the durable artifact, and the one that matters a year later.

**Why this satisfies Principle 10 with no new machinery.** A provisional resolution binds nobody who has not signed. The creator cannot write to another person's ledger, because there is no ledger until that person confirms. The claim-and-confirm step is Principle 2's debtor confirmation with an indefinitely long window, and dispute is the appeal path the quorum already provides.

**What is not possible and why.** Picking a group chat, or recognizing who is in one. A web app cannot read the participants of a conversation, and no messaging platform exposes that list for a chat it is not hosting. Contacts are people; the group link into the chat is how a whole group gets reached.

**Privacy of contact data.** A phone hash is stored for users (from their own login) and for people a creator picked, is salted with an app-wide secret so it is deterministic but not reversible, is never exposed through any API (a creator learns only that a picked contact "already has an account," never which account, and nobody can query whether an arbitrary number is in Dareful), is deleted when a ghost is dismissed, and is never displayed to anyone. The picker model, where the user selects specific people rather than uploading an address book, is the consent.

The unclaimed obligation is the growth mechanism. "You owe Justin a beer from the fence thing. Claim it." is the only signup prompt the product has, and it works because their friends generated it.

### Binding and merging

The common case is not one bet. It is Gabe being accountless across six bets with Justin over three weeks, then signing up. Every layer has to handle that, and each layer's answer is different.

**A claim is a first-class participant, not a per-link artifact.** The browser token is issued on first tap and reused on every subsequent tap from that browser, so Gabe on one phone is one `participant_claims` row with six `dare_positions` rows behind it. A claim can also be a group member: `group_members` accepts a `claim_id` in place of a `user_id`, so Justin can add "Gabe" to the poker group before Gabe exists, and every bet in that group with Gabe just works. Group membership is what makes a claim "returning": once acknowledged in a group, it is acknowledged in every later market there. Implicit dyads form between a user and a claim the same way they form between two users.

**Binding is one operation, applied everywhere.** When claim C binds to user U: `participant_claims.claimed_by` is set, and every row referencing C (`dare_positions`, `group_members`, `obligation_proposals` on either side) is rewritten to reference U in a single transaction. The creator's timeline, group lists, and person view re-render with U's identity on the next read, because they were reading the claim by id all along.

**Four ways a bind happens, in order of authority.**

1. *Phone.* Gabe signs up with phone login and the hash matches a claim. Every claim carrying that hash binds, across every creator who ever picked him from contacts. Justin's Gabe and Alex's Gabe were always the same phone, so they merge without anyone doing anything. Automatic, silent, exact.
2. *Token.* Gabe signs up in the browser holding the token. Automatic, silent, exact.
3. *Creator merge.* Justin sees a ghost "Gabe" in the poker group's member list or on any timeline row, taps it, and picks a user or another ghost. "This Gabe is that Gabe" rebinds everything. Two ghosts merge into one claim. This is the affordance for a friend who signed up on a different phone, or for the creator having typed the same person's name on two occasions, and it is the one the user actually reaches for.
4. *Claimant suggestion.* On signup, if pending rows exist under a display name matching the new user's name in groups they were invited to, offer them: "Justin has bets with a Gabe. Is that you?" Suggestion only, never automatic.

**Misbinding is safe on the debtor side and needs one check on the creditor side.** If a bind is wrong, the person now holding pending proposals where they are the debtor simply declines them, because Principle 2 already requires their confirmation before anything mints. The one asymmetry is a proposal where the claim was the creditor, meaning the creator lost to accountless Gabe and owes him. Binding that to the wrong person would mint a token to someone who is not owed. So at bind time, every proposal where the bound user is the creditor requires a fresh one-tap re-confirmation from the debtor: "You're about to owe this Gabe a beer. Confirm?" Cheap, rare, and it closes the only hole.

**The chain has nothing to overwrite.** Because nothing goes onchain for a person without a wallet, every one of Gabe's six bets is still a proposal at bind time. There is no claim-era identity on the chain to rewrite. What the chain needs instead is a way to mint six obligations with one signature, because the claim moment is the one time a user confirms many things at once and "confirm all" must be a single prompt. `DarefulLedger.confirmMany` takes arrays of the same arguments as `confirm`, verifies one EIP-712 signature over the whole batch, and mints through `_mintBatch`.

**The claimant's first screen.** After signup with pending rows, before anything else: every bound proposal listed, grouped by who it is with, each with confirm and dispute, and a confirm-all at the top. Confirm mints. Dispute follows the path in the accountless flow: onchain quorum if everyone now has an account, offchain arbitration otherwise. This screen is the payoff for signing up and it should look like one.

**Delivery from a fresh device.** A browser token is lost when the browser's storage is. So the creator can send a claim link to a specific ghost through the composer at any time (never through Dareful), and opening it on any device issues a new token bound to the same claim. Two tokens, one claim.

### One phone

At a bar, one person pulls out a phone and everyone else keeps drinking. The creator enters every position: "Gabe 70, Alex 50, John 0, ten bucks each." Nobody else touches anything. This is host mode, and it is the provisional machinery with the creator typing for people.

A position entered by someone other than its participant has no `Enter` signature, and `entered_by` records who typed it. That is the whole definition of proxied; ghosts are proxied by construction and always were. A market with any unsigned position runs provisionally, exactly as one with a ghost does: the creator (or the AI, for a checkable claim) resolves it, scoring and pairwise transfers run offchain, and every edge becomes a proposal.

Sign-off happens at either of two moments, and both already exist. Before lock, the group link shows each member "Justin has you at 70, ten bucks: confirm or change," and confirming is entering, since that tap is the `Enter` signature. If every member confirms before lock, the market goes onchain like any other. After settlement, each edge is the ordinary confirm-or-dispute, and dispute reopens the market the same way it does for a bound ghost.

**One rule is new, and it is the one that keeps this honest.** Delegation exists so the server can silently sign actions the person initiated. A position someone else typed is not one they initiated, and an obligation arising from it is not one they consented to at entry. So an edge from an unsigned position always prompts for confirmation, even for a user who has delegated. Delegation never confirms an obligation from a position its owner did not sign. This is the line between one phone, trustfully, and one phone deciding for everyone.

Blind reveal is meaningless in host mode, since the host sees every number as they type it; a hosted market is always open.

Live dare rounds (Phase 11) run almost entirely on this mode.

### The room code

Host mode exists because pulling out four phones is annoying. A room code makes it take five seconds, and that is strictly better, because everyone then enters and signs their own position, so the market is not provisional and goes onchain at lock.

The creator opens a lobby. Their screen shows a QR of the group link and a six-character code beneath it, since scanning fails across a table or in bad light and someone will always need to type it. Anyone present scans or types, lands on the entry screen, puts in their number, and the lobby fills in front of everyone. The count refreshes by polling every couple of seconds; this does not need Supabase Realtime and must not pull it forward from Phase 8.

**The lobby is the roll call.** A join while the lobby is open is acknowledged automatically, because the creator is holding the screen and watching it happen, and the creator can kick anyone from the lobby with one tap. Closing the lobby ends that window; a code used afterward resolves to the ordinary group link, where a non-member's position is pending like any other. Codes are six characters, scoped to one market, and expire with the lobby, so a guessed code buys nothing that the acknowledgment rule does not already refuse.

This also reaches people the composer cannot: a party, a larger table, the friend of a friend who is in the room but in nobody's group chat.

The QR encodes the existing group link and is generated client-side; it needs no backend. The code needs a short-lived row keyed to the market.

## 5. Domain model

Money is stored as integer cents everywhere offchain. Quantities are integers onchain. No floats touch a monetary value at any point.

### 5a. Onchain

#### DarefulLedger (ERC-1155)

One contract for all groups. The token id encodes the obligation edge, and the creditor holds the balance.

```solidity
// fungible obligations: N beers, $47.20 (as 4720 units of a USD denom)
id = uint256(keccak256(abi.encode(groupId, denomId, debtor)))

// unique obligations: one-off indivisible favors ("buys the next round")
id = uint256(keccak256(abi.encode(groupId, denomId, debtor, obligationId)))
```

`balanceOf(creditor, id)` is what `debtor` owes `creditor` in `denomId` within `groupId`. Two creditors may hold the same fungible id.

Unquantifiable denominations ("a next time") mint exactly one unit per obligation. The display layer never renders a count for them beyond "a next time" or "a few next times."

```solidity
struct Member  { address ledger; address governance; }    // both wallets, registered together
struct Group   { bytes32 id; Member[] members; }
struct Denom   { bytes32 id; bytes32 groupId; bool quantifiable; }

function governanceOf(bytes32 groupId) external view returns (address[] memory)   // read by DarefulDares

// mutations (all via relayer, all require a signature from the acting ledger wallet)
function confirm(bytes32 groupId, bytes32 denomId, address creditor, uint256 qty,
                 bytes16 obligationId, bool unique, bytes sig)         // debtor signs; mints to creditor
function confirmMany(bytes32[] groupIds, bytes32[] denomIds, address[] creditors,
                     uint256[] qtys, bytes16[] obligationIds, bool[] uniques,
                     bytes sig)                                        // debtor signs once over the batch; mints via _mintBatch
function close(uint256 id, uint256 qty, CloseReason reason,
               bytes16 obligationId, bytes sig)                        // creditor signs; burns
function net(bytes32 groupId, bytes32 denomId, address a, address b,
             bytes sig)                                                // either a or b signs; burns min of reciprocal edges
function mintFromDare(bytes32 groupId, bytes32 denomId, address debtor,
                      address creditor, uint256 qty, bytes16 obligationId)  // only DarefulDares may call

enum CloseReason { Settled, Forgiven }

// transfers revert unconditionally
function _update(address from, address to, uint256[] ids, uint256[] values) internal override {
    require(from == address(0) || to == address(0), "non-transferable");
    super._update(from, to, ids, values);
}
```

Every mint carries `obligationId` (the offchain uuid as `bytes16`) in the ERC-1155 `data` field so the offchain shadow row and the onchain token join without ambiguity. Every mutation requires both parties to the edge to be registered members of `groupId`; `confirm` reverts otherwise.

Events:

```solidity
event Confirmed(bytes32 indexed groupId, bytes32 indexed denomId, address indexed debtor,
                address creditor, uint256 id, uint256 qty, bytes16 obligationId, bool unique);
event Closed(uint256 indexed id, address indexed creditor, uint256 qty, CloseReason reason,
             bytes16 obligationId);
event Netted(bytes32 indexed groupId, bytes32 indexed denomId, address a, address b, uint256 qty);
event GroupCreated(bytes32 indexed groupId, address[] ledgers, address[] governances);
event MemberAdded(bytes32 indexed groupId, address ledger, address governance);
event DenomCreated(bytes32 indexed groupId, bytes32 indexed denomId, bool quantifiable);
```

#### DarefulDares

A market is a question with a scoring rule. Every participant states a value and a stake. After resolution every participant is scored on accuracy with a proper scoring rule, and every pair of participants settles against each other on the difference in their scores, with the stake at risk in each pair capped at the smaller of the two. There are no sides, no lines, no takers, no pot, and no group average.

```solidity
enum Kind      { Binary, Numeric, Categorical }
enum Pace      { Dare, Argument }              // Argument resolves the moment the second position is entered
enum Stalemate { Arbitrate, Void }
enum Status    { Locked, Resolved, Voided, Expired }   // no Open: the chain is first touched at lock, with every position
uint256 constant VOID = type(uint256).max;             // sentinel outcome a quorum may vote for; mints nothing, toll applies

struct Dare {
    bytes32   id;
    bytes32   groupId;
    Kind      kind;
    Pace      pace;
    address   creator;            // ledger wallet
    bytes32   termsHash;          // keccak256 of the human-approved terms text
    bytes32   denomId;
    uint256   range;              // Numeric only: the plausible span, set at creation
    uint8     options;            // Categorical only: number of outcomes
    Stalemate stalemate;          // set by creator, shown before anyone enters, signed by every participant at entry
    address[] quorum;             // governance wallets; snapshot read from DarefulLedger.governanceOf at create, never caller-supplied
    uint8     threshold;          // default floor(quorum.length / 2) + 1
    uint64    resolvesBy;
    Status    status;
    uint256   outcome;            // 0 or 1 for Binary, the number for Numeric, the index for Categorical; set on resolve
}

struct Position {
    address ledger;
    uint256 stake;                // units of denomId
    uint256 value;                // probability in bps for Binary, the guess for Numeric, the option index for Categorical
    uint16  confidenceBps;        // Categorical only; remaining mass spreads evenly over the other options
}

mapping(bytes32 => Position[]) positions;      // one position per ledger wallet per market; enter reverts on a second

function create(Dare calldata d, Position[] calldata ps, bytes[] calldata enterSigs,
                bytes creatorSig)                                                    // one atomic call at lock: market plus every position; quorum read from ledger
function resolve(bytes32 dareId, uint256 outcome, bytes[] votes)                    // anyone; verifies threshold votes for the same outcome; VOID is a valid outcome
function arbitrate(bytes32 dareId, uint256 outcome, bool voided, bytes32 rulingHash)  // relayer only; after resolvesBy; only if stalemate == Arbitrate; voided = terms could not decide it
function expire(bytes32 dareId)                                                     // anyone; after resolvesBy with no resolution; only if stalemate == Void
```

Entries are EIP-712 typed signatures over:

```
Enter(bytes32 dareId, uint256 stake, uint256 value, uint16 confidenceBps, uint8 stalemate)
```

so the participant's consent to the stalemate rule is in the same signature as their position. Each entry signature is collected when the person enters and submitted inside `create` at lock; there is no separate `enter` call and no partially-created market. Votes are EIP-712 typed signatures over:

```
Vote(bytes32 dareId, uint256 outcome)
```

**Scoring.** All scores are in basis points, 0 to 10000, and every kind uses a proper scoring rule so that stating your actual belief is the payout-maximizing strategy.

```
Binary       S = 10000 − (value − outcome·10000)² / 10000            Brier on a probability
Numeric      S = max(0, 10000 − |value − outcome| · 10000 / range)    absolute error over the range; elicits the median
Categorical  S = 10000 − Σ_k (p_k − o_k)² / 20000                     Brier on a distribution, all in bps; p_pick = confidenceBps,
                                                                      others share the rest evenly; a correct one-hot scores 10000,
                                                                      a wrong one-hot scores 0
```

**Payout.** Every pair `(i, j)` settles on the difference in their scores, with the stake at risk capped at the smaller stake and divided across the `N − 1` counterparties:

```
transfer_ij = min(s_i, s_j) × (S_i − S_j) / (N − 1) / 10000     positive means j pays i
net_i       = Σ_{j ≠ i} transfer_ij
```

Zero-sum by antisymmetry: `transfer_ij + transfer_ji = 0`. Bounded: the most `i` can lose to any one counterparty is `min(s_i, s_j) / (N − 1) ≤ s_i / (N − 1)`, and there are `N − 1` of them, so `|net_i| ≤ s_i` exactly. Truthful: `S_i` enters `net_i` with the positive coefficient `Σ_j min(s_i, s_j) / (N − 1)` and every other term is outside `i`'s control, so a proper scoring rule makes reporting your actual belief the payout-maximizing strategy. And you can only win from someone what they put up against you.

**Rounding.** Quantities are integers. Each `transfer_ij` is rounded to the nearest whole unit independently; antisymmetry survives rounding, so the sum stays exactly zero and no residual rule is needed. For monetary denominations the unit is cents and rounding is invisible. For unquantifiable denominations every stake is 1 and the whole market collapses to a single edge: the lowest scorer owes one unit to the highest, ties void.

**Edges.** The pairwise transfers are the edges. Each nonzero `transfer_ij` is one `mintFromDare` call from the lower scorer to the higher, so a market with `N` participants mints at most `N(N − 1) / 2` obligations. There is no allocation step. Netting in the ledger collapses tangles later, and the timeline renders the market as one story with its consequences beneath it.

**When the chain is touched.** Nothing is submitted until lock. Participants sign their `Enter` typed data as they enter, and the signatures wait offchain. At lock, if every acknowledged participant has a wallet, the relayer submits one `create` carrying the market and every position with its signature, and the market is onchain from then on. If any acknowledged participant is a ghost, nothing is submitted and the market stays provisional for its whole life. One decision, made once, with full information about who is in.

`resolve` recovers each signer, requires every signer to be in `quorum`, deduplicates by signer, and requires at least `threshold` votes for the same `outcome`. A quorum for `VOID` sets `Voided`, mints nothing, and applies the toll. `arbitrate` requires `stalemate == Arbitrate`, `block.timestamp > resolvesBy`, and no resolution; it records `rulingHash` (keccak256 of the AI's written ruling) alongside the outcome so the ruling is auditable against the chain. With `voided == true` it mints nothing and the toll applies. The relayer address is a trusted role set at deployment. `expire` requires `stalemate == Void` and mints nothing.

The quorum is the whole group at creation, not only the participants. In a five-person group with two participants, three signatures resolve it, which means the two participants plus one witness, or three witnesses. In a two-person group the threshold is two, and under the default `Arbitrate` setting a disagreement goes to the AI after both state their case; under `Void` it expires silently.

If `denomId` is unquantifiable, every stake must be 1.

Events:

```solidity
event DareCreated(bytes32 indexed dareId, bytes32 indexed groupId, Kind kind, Pace pace,    // emitted at lock; positions follow as Entered events in the same tx
                  address creator, bytes32 termsHash, bytes32 denomId, uint256 range,
                  uint8 options, Stalemate stalemate, uint64 resolvesBy);
event Entered(bytes32 indexed dareId, address participant, uint256 stake, uint256 value, uint16 confidenceBps);
event DareVoided(bytes32 indexed dareId, uint8 votes);
event DareResolved(bytes32 indexed dareId, uint256 outcome, uint8 votes);
event DareArbitrated(bytes32 indexed dareId, uint256 outcome, bool voided, bytes32 rulingHash);
event DareExpired(bytes32 indexed dareId);
event Scored(bytes32 indexed dareId, address participant, uint16 score);   // nets are the sum of the Confirmed edges the market minted
```

### 5b. Offchain (Postgres via Supabase, Drizzle)

```sql
users (
  id                 uuid pk,
  dynamic_user_id    text unique not null,
  phone_hash         bytea unique,              -- salted hash of the login phone, when phone login was used; lets a picked contact resolve to an existing user
  ledger_wallet      text unique not null,      -- lowercase hex
  governance_wallet  text unique not null,
  display_name       text not null,
  avatar_url         text,
  created_at         timestamptz not null default now()
)

groups (
  id                 uuid pk,
  onchain_id         bytea unique,              -- bytes32; null until the first confirmed mint registers it
  name               text,                      -- null for implicit dyads
  is_dyad            boolean not null default false,
  created_by         uuid fk users,
  created_at         timestamptz not null default now()
)

group_members (
  group_id           uuid fk groups,
  user_id            uuid fk users,             -- exactly one of user_id, claim_id is non-null
  claim_id           uuid fk participant_claims,
  joined_at          timestamptz not null default now(),
  left_at            timestamptz,               -- membership ends; obligations survive
  archived_at        timestamptz,               -- per-member view preference, never group state
  check ((user_id is null) <> (claim_id is null)),
  unique (group_id, user_id),
  unique (group_id, claim_id)
)

denominations (
  id                 uuid pk,
  group_id           uuid fk groups not null,   -- every denomination is group-scoped onchain
  onchain_id         bytea,                     -- bytes32; null until first use registers it onchain
  template           text,                      -- 'usd' | 'beer' | 'coffee' | 'round' | 'next_time' | null for custom
  label              text not null,
  plural_label       text not null,
  quantifiable       boolean not null,
  monetary           boolean not null,
  emoji              text,
  created_by         uuid fk users not null,
  last_used_at       timestamptz,
  unique (group_id, onchain_id)
)
```

A one-on-one relationship is an implicit two-person group created lazily on first obligation. `group_id` is never null. Groups and denominations are both registered on the ledger contract lazily, the first time an obligation in them is confirmed; a group whose members are all ghosts has no onchain presence yet, which is consistent with nothing going onchain for a person without a wallet.

**Denominations are custom, created inline, and reusable.** USD is the only built-in. Everything else is a label, a plural, an emoji, and two booleans, and the creator can make one at the moment they need it, from the bet or obligation screen, without leaving it. "Loser does the dishes," "a round," "a Wordle first try," "a coffee." Templates (beer, coffee, round, next time) are just pre-filled suggestions.

Reuse works at two levels. Within a group, a denomination persists and is offered first by `last_used_at`. Across groups, the creation screen offers the creator's own recent custom denominations from any group, and picking one registers a copy in the current group. So "does the dishes" invented in the roommates group is one tap away in the poker group, and the onchain scoping is preserved because the copy gets its own group-scoped id.

The shapes that matter, because they determine how a denomination renders and whether it supports odds:

| denomination | quantifiable | monetary | example |
|---|---|---|---|
| USD | true | true | owes $47.20 (4720 units onchain) |
| beer | true | false | owes 2 beers |
| a next time | **false** | false | owes a next time (1 unit onchain, count never rendered) |

The unquantifiable denomination is the central primitive of the whole product.

```sql
obligation_proposals (
  id                 uuid pk,                   -- becomes obligationId (bytes16) on confirm
  group_id           uuid fk groups not null,
  from_user          uuid fk users,             -- debtor; exactly one of from_user, from_claim is non-null
  from_claim         uuid fk participant_claims,
  to_user            uuid fk users,             -- creditor; exactly one of to_user, to_claim is non-null
  to_claim           uuid fk participant_claims,
  denom_id           uuid fk denominations not null,
  quantity           bigint,                    -- null iff denomination unquantifiable
  unique_obligation  boolean not null default false,
  amount_cents       bigint,                    -- magnitude, may be shadow
  origin             text not null,             -- 'manual' | 'expense' | 'dare' | 'roulette'
  origin_id          uuid,
  settle_expected    boolean not null,
  memo               text,
  status             text not null,             -- 'pending' | 'confirmed' | 'declined' | 'disputed'
  conceded_at        timestamptz,               -- accountless debtor tapped "you got me"; no binding force
  created_at         timestamptz not null,
  resolved_at        timestamptz,
  check ((from_user is null) <> (from_claim is null)),
  check ((to_user is null) <> (to_claim is null))
)

obligations (                                   -- the offchain shadow; one row per confirmed mint
  id                 uuid pk,                   -- same uuid as the proposal
  token_id           numeric(78,0) not null,
  group_id           uuid fk groups not null,
  from_user          uuid fk users not null,
  to_user            uuid fk users not null,
  denom_id           uuid fk denominations not null,
  quantity           bigint,
  unique_obligation  boolean not null,
  amount_cents       bigint,
  origin             text not null,
  origin_id          uuid,
  settle_expected    boolean not null,
  memo               text,
  photo_id           uuid fk photos,
  confirm_tx         bytea not null,
  created_at         timestamptz not null
)
```

Open, settled, and forgiven are not columns. They are derived from chain state via Envio: an obligation is open while its remaining quantity is nonzero, and the `Closed` event's `reason` says how it closed. The shadow row holds only what the chain does not.

`denom_id` + `quantity` is **the claim**. `amount_cents` is **the magnitude**. When someone logs a $47.20 receipt as "I got this one," the claim is one next-time and the magnitude is 4720, retained off the chain so parity estimates have something to work with. Magnitude is never displayed for non-monetary denominations and never leaves Postgres.

`settle_expected` is a property of each act of generosity. Default it from the group's historical close-reason ratio (settled versus forgiven, read from Envio), with a one-tap override at creation. Before a group has history, default `true` for monetary denominations and `false` for everything else.

```sql
dares (
  id                 uuid pk,
  onchain_id         bytea unique,              -- null before lock, and forever if provisional (any participant without an account)
  group_id           uuid fk groups not null,
  kind               text not null,             -- 'binary' | 'numeric' | 'categorical'
  pace               text not null,             -- 'dare' | 'argument'
  creator_id         uuid fk users not null,    -- always has an account
  title              text not null,
  terms_text         text not null,             -- AI-drafted, creator-approved; includes the criterion; hash goes onchain
  outcome_labels     text[] not null,           -- ['no','yes'] for binary; option names for categorical; unit name for numeric
  range              bigint,                    -- numeric only; the plausible span
  over_under         bigint,                    -- numeric shortcut: when set, the market is binary on "over"
  denom_id           uuid fk denominations not null,
  stalemate          text not null,             -- 'arbitrate' | 'void'; default 'arbitrate'
  reveal_mode        text not null,             -- 'open' | 'blind'; whether the group's number shows before lock; default 'open'
  anchor_value       bigint,                    -- AI suggestion shown while entering; no onchain effect
  anchor_at          timestamptz,
  resolves_by        timestamptz,               -- null for pace = 'argument' until the second position is entered, then that moment
  locked_at          timestamptz,
  threshold          smallint not null,
  ai_outcome         bigint,                    -- proposed outcome in the same encoding as the chain; null until proposed
  ai_confidence_bps  smallint,                  -- soft rulings state how strongly they favor the proposed outcome
  ai_rationale       text,
  ai_proposed_at     timestamptz,
  resolved_outcome   bigint,                    -- mirror of DareResolved or DareArbitrated for onchain markets; the provisional call otherwise
  resolved_by        text,                      -- 'quorum' | 'arbitration' | 'provisional' | null
  resolved_at        timestamptz,
  created_at         timestamptz not null
)

dare_positions (                                -- mirrors Entered for onchain markets; authoritative for provisional ones
  dare_id            uuid fk dares,
  user_id            uuid fk users,             -- exactly one of user_id, claim_id is non-null
  claim_id           uuid fk participant_claims,
  stake              bigint not null,
  value              bigint not null,           -- probability in bps, the guess, or the option index
  confidence_bps     smallint,                  -- categorical only
  enter_signature    bytea,                     -- the EIP-712 Enter signature, held here until lock; null for ghosts and for proxied positions
  entered_by         uuid fk users not null,    -- who typed it; equals user_id when self-entered, the host otherwise
  score              smallint,                  -- set on resolution, mirrors Scored
  net                bigint,                    -- set on resolution; sum of this participant's transfers
  entered_at         timestamptz not null,
  acknowledged_at    timestamptz,               -- always set for user_id rows; for claim_id rows, null means pending and the row does not count
  dismissed_at       timestamptz,               -- creator removed this ghost; the row stays for the record and does not count
  check ((user_id is null) <> (claim_id is null)),
  check (user_id is null or acknowledged_at is not null),
  unique (dare_id, user_id),
  unique (dare_id, claim_id)
)

dare_statements (                               -- what each participant said when a market went to arbitration
  dare_id            uuid fk dares,
  user_id            uuid fk users,
  statement          text not null,
  stated_at          timestamptz not null,
  primary key (dare_id, user_id)
)

room_codes (                                    -- a short spoken/scanned code for people in the room; lives as long as the lobby
  code               text pk,                   -- six characters, unambiguous alphabet (no O/0, I/1)
  dare_id            uuid fk dares not null,
  opened_by          uuid fk users not null,
  opened_at          timestamptz not null,
  closed_at          timestamptz                -- joins are auto-acknowledged only while this is null
)

personal_links (                                -- a per-person link for one market; the token is the creator's claim about who the recipient is, never authentication
  token_hash         bytea pk,
  dare_id            uuid fk dares not null,
  claim_id           uuid fk participant_claims,-- exactly one of claim_id, user_id is non-null
  user_id            uuid fk users,
  issued_at          timestamptz not null,
  check ((claim_id is null) <> (user_id is null))
)

participant_claims (                            -- an accountless participant, until they sign up
  id                 uuid pk,
  display_name       text not null,
  phone_hash         bytea,                     -- from the contact picker when the creator picked this person; null for typed names
  created_by         uuid fk users not null,    -- the creator whose link they first tapped
  claimed_by         uuid fk users,             -- set on bind; every row referencing this claim is rewritten to the user
  claimed_at         timestamptz,
  merged_into        uuid fk participant_claims,-- set when a creator merges two ghosts; the survivor is merged_into's target
  created_at         timestamptz not null
)

claim_tokens (                                  -- a claim may have several tokens: one per device it was opened on
  token_hash         bytea pk,                  -- sha256 of the browser token; the token itself is never stored
  claim_id           uuid fk participant_claims not null,
  issued_at          timestamptz not null
)

dare_votes (                                    -- collected offchain, submitted in one resolve() call
  dare_id            uuid fk dares,
  user_id            uuid fk users,
  outcome            bigint not null,
  signature          bytea not null,
  signed_at          timestamptz not null,
  primary key (dare_id, user_id)
)

plans (
  id                 uuid pk,
  group_id           uuid fk groups not null,
  created_by         uuid fk users not null,
  title              text not null,             -- "Beers Thursday?"
  occurs_at          timestamptz not null,
  location           text,
  status             text not null,             -- 'proposed' | 'confirmed' | 'happened' | 'cancelled'
  created_at         timestamptz not null
)

plan_rsvps (
  plan_id            uuid fk plans,
  user_id            uuid fk users,
  going              boolean not null,
  primary key (plan_id, user_id)
)

photos (
  id                 uuid pk,
  uploaded_by        uuid fk users not null,
  storage_path       text not null,
  taken_at           timestamptz,
  created_at         timestamptz not null
)

delegations (                                   -- sensitive; encrypted at rest with an app key, never logged
  user_id            uuid fk users not null,
  wallet_id          text not null,             -- Dynamic wallet id, ledger wallet only
  wallet_address     text not null,
  encrypted_share    bytea not null,
  encrypted_api_key  bytea not null,
  granted_at         timestamptz not null,
  revoked_at         timestamptz,
  primary key (user_id, wallet_id)
)
```

A `before insert` trigger on `delegations` rejects any row whose `wallet_address` matches that user's `governance_wallet`. Postgres does not allow subqueries in check constraints, so this is a trigger, not a check. It is belt and braces: the application never requests delegation for a governance wallet, and the database refuses to store one if it somehow arrives.

Expenses, receipts, and item claims are unchanged from the original design and live entirely offchain until finalization, at which point they produce obligation proposals:

```sql
expenses (
  id                 uuid pk,
  group_id           uuid fk groups not null,
  payer_id           uuid fk users not null,
  total_cents        bigint not null,
  subtotal_cents     bigint not null,
  tip_cents          bigint not null default 0,
  currency           char(3) not null default 'USD',
  merchant           text,
  merchant_address   text,                      -- geocoded lazily for the map view
  occurred_at        timestamptz not null,
  receipt_photo_id   uuid fk photos,
  source             text not null,             -- 'manual' | 'receipt' | 'roulette'
  status             text not null,             -- 'draft'|'parsed'|'needs_review'|'claiming'|'finalized'
  created_by         uuid fk users
)

expense_items (
  id                 uuid pk,
  expense_id         uuid fk expenses,
  name               text not null,
  qty                numeric not null default 1,
  unit_price_cents   bigint not null,
  line_total_cents   bigint not null,
  tax_line_id        uuid
)

expense_tax_lines (
  id                 uuid pk,
  expense_id         uuid fk expenses,
  label              text not null,
  amount_cents       bigint not null
)

item_claims (
  expense_item_id    uuid fk expense_items,
  user_id            uuid fk users,
  share_num          int not null default 1,
  share_den          int not null default 1,
  primary key (expense_item_id, user_id)
)
```

## 6. State machines

### Obligation

```
  proposed ──► confirmed (minted, open) ──┬──► settled   (creditor closes, reason = Settled, photo optional)
      │                                   └──► forgiven  (creditor closes, reason = Forgiven)
      ├──► declined (never minted)
      └──► disputed (a bound ghost contests a provisional market outcome; the market reopens)
```

`proposed`, `declined`, and `disputed` exist only in Postgres. `confirmed` is the mint. Open is a nonzero remaining balance. Netting is a partial close on two reciprocal obligations at once and is recorded as its own event, not as a settlement.

Terminal states are terminal. Nothing is ever deleted; settlement does not erase history, it timestamps it. The timeline is the asset.

### Dare

```
  draft ──► open ──► locked ──► pending ──┬──► resolved by quorum      ──► scores, pays, mints edges  (offchain states)     (first chain write)
    │                                     ├──► resolved by arbitration ──► scores, pays, mints edges (stalemate = arbitrate)
    │                                     ├──► voided by quorum        ──► mints nothing, toll applies
    │                                     └──► expired                 ──► mints nothing, no toll (stalemate = void)
    └──► abandoned (creator discards before anyone enters; never reaches chain)
```

`draft` is where the AI interrogates the terms with the creator only. `open` is when the link is live and people enter positions. `locked` fires at close time or on creator action, and it is the moment the chain decision is made: all wallets means onchain, any ghost means provisional. `pending` fires at `resolves_by`, when the AI proposes and voting opens. `resolved by quorum` requires `threshold` votes for one outcome. If `resolves_by` passes with no quorum, the stalemate rule decides: under `arbitrate`, every participant gets to state their case in one line, the AI rules with a written rationale, and `arbitrate()` executes it against the consents signed at entry; under `void`, `expire()` fires silently.

An **argument** is a market with `pace = 'argument'` and `resolves_by` set to the moment the second position is entered. `open` lasts exactly as long as it takes the other person to tap the link; `locked` fires on that entry; the AI proposes immediately and voting opens the same second. Same contract, same state machine, same resolution path, different pacing.

A **provisional market** (any acknowledged position without an `Enter` signature, whether a ghost or a proxied account-holder) runs the same states offchain with two substitutions: the quorum runs among the account-holders offchain with the same signatures and threshold (the creator decides alone only when they are the sole account-holder), and the scoring and pairwise transfers run offchain over the acknowledged participants to produce obligation proposals rather than mints. Edges between two account-holders confirm immediately; edges involving a ghost wait for the claim, and a confirmed one mints through `confirm()` while a disputed one reopens the market for onchain quorum if everyone now has an account or offchain arbitration otherwise. `onchain_id` is null throughout the provisional life.

**The void toll.** A quorum vote to void, or an arbitration ruling that the terms were unresolvable, is permanently recorded and counts against the creator's clean-resolution rate on their profile, because a market the group or the arbitrator decided could not be resolved was a badly written market. An argument voided because its criterion turned out not to decide it is the same failure and carries the same toll. Expiry carries no toll for anyone: a market nobody bothered to resolve was not important, and penalizing the people who did not vote is a nag.

### Expense

```
  draft ──► parsed ──► claiming ──► finalized ──► creates N obligation proposals
     │        ▲
     └──► needs_review ─┘
          (invariant failed; payer corrects against the photo)
```

`finalized` is gated on `unclaimed_cents == 0`.

### Plan

```
  proposed ──► confirmed ──► happened
      │            │
      └────────────┴──► cancelled
```

`confirmed` when at least one other member RSVPs going. `happened` is user-marked after the fact, optionally with a photo, and is what lets the plan anchor obligations created that day.

## 7. Signing tiers and delegation

### The rule

Actions that bind only the signer use the ledger wallet and are signed silently by the server with delegated shares. Actions that bind other people use the governance wallet and always prompt. Delegation covers only actions the person initiated: an obligation arising from a position they did not sign always prompts, delegated or not.

| Action | Wallet | Prompts? | Binds |
|---|---|---|---|
| Confirm an obligation against yourself | ledger | no | you |
| Close (settle or forgive) what you are owed | ledger | no | you |
| Net reciprocal obligations | ledger | no | you (your side) |
| Create a market, enter a position | ledger | no | you (the entry signature also carries your consent to the stalemate rule) |
| Vote on a market outcome | governance | yes | everyone in the market |
| Enter a position without an account | none | no | nobody, until claimed and confirmed |
| Confirm a batch at claim time | ledger | once for the batch | you |
| Confirm an edge from a position you did not sign (host mode, or entered as a ghost) | ledger | **yes, always, even when delegated** | you |

### Delegation lifecycle

1. On first login, Dynamic creates both embedded wallets. The app requests delegation for the ledger wallet only, with explicit consent copy explaining what will be signed silently.
2. Dynamic sends `wallet.delegation.created` to the registered HTTPS endpoint. The handler verifies the HMAC-SHA256 signature in `x-dynamic-signature-256` against the raw request body (not a re-serialized JSON object), decrypts the share and API key with the server's RSA private key, re-encrypts both with the application key, and stores them in `delegations`.
3. Routine actions call the delegated signer, which signs the EIP-712 message for the action and hands it to the relayer.
4. `wallet.delegation.revoked` sets `revoked_at`. From that moment the user's ledger actions prompt client-side instead of signing silently. Nothing else changes: obligations live in the contract, not in the server's ability to sign. Revocation degrades to prompted signing; it never breaks anything.
5. Re-granting clears `revoked_at` on a fresh row.

The delegation store is the most sensitive table in the system. It is encrypted at rest, never logged, never included in any export, and accessible only from `src/lib/chain/delegated-signer.ts`.

Delegated access is available in Dynamic sandbox environments. Production requires an enterprise plan. Through submission the app runs against Monad testnet with a sandbox Dynamic environment, which is internally consistent. Mainnet is a post-submission decision.

### Relayer

One server-controlled EOA funded with testnet MON. It submits every contract mutation, passes explicit gas from the per-function table, and records the transaction hash on the originating row. It holds no user keys and cannot originate any action; it can only forward messages users have signed.

## 8. Markets: dares, arguments, scoring, and calibration

### 8a. Drafting and the two kinds

A **dare** is about a future event and resolves on a timer. An **argument** is about a claim and resolves now. Both are markets: the same onchain object, the same scoring rule, the same resolution path. Only the pacing differs.

Two creation modes, chosen by the creator with one toggle and defaulting to quick.

**Quick.** One line of text, one tap, link out. The AI scopes the terms in the background and interrupts only if the claim is genuinely ambiguous. For a contestable argument, "ambiguous" always means the criterion is missing, and the interruption is a single pick from up to three proposed criteria (Section 8b). This is the mode for anything resolving within hours, and it is the mode most bets use. Three questions is too slow for "will John fall asleep during this movie."

**Careful.** The AI interrogates the terms with the creator only: three yes/no questions, fifteen seconds, then generated terms that everyone else just sees. For dares with real stakes or a long horizon, where a badly written term costs a void weeks later.

In both modes the creator approves the final text. `keccak256(terms_text)` goes onchain as `termsHash` when the dare is onchain; the text stays in Postgres and is displayed to everyone.

### 8b. The argument settler

Two people disagree, both state their case, the AI rules, the loser owes a beer. The whole loop runs in under a minute while everyone is still sitting there. This is the fast loop and the primary reason the app gets opened. An argument is a binary market whose two positions default to full confidence on opposite sides, so the loser loses the whole stake and "the loser owes a beer" is literally what happens; either party can soften their number before entering, and then it is scored like any other market.

The interrogation step triages every submission into three tiers:

| tier | example | ruling |
|---|---|---|
| **Checkable** | "The 2011 finals went seven games" | near-certain, with the reasoning stated |
| **Contestable** | "It is harder to hit a major league fastball than return a 130mph serve" | criterion first; then firm where the evidence decides it, soft where it still splits |
| **Interpersonal** | "I was wrong to text her back" | declined |

**Every contestable claim gets a criterion before it gets a ruling.** "Is it harder to hit a fastball or return a serve" is not a question an AI can settle; it is three or four questions wearing one sentence. Harder by elite success rate, by reaction window, by years to competence, by how many people have ever done it. Each has a different answer. So the scoping step for a contestable claim is criterion selection: the AI proposes up to three measurable criteria, the creator picks one (quick mode) or both parties agree on one (careful mode), and the chosen criterion becomes part of `terms_text`. The ruling is then made against that criterion and nothing else.

The criterion is on the share card before anyone enters. "Harder, measured by success rate of elite practitioners. Fastball or serve?" Entering a position is accepting the criterion, which is what lets the accountless quick path work: nobody negotiates, they see the terms and choose whether to play. If the AI cannot find a measurable criterion, the claim is not contestable, it is a matter of taste, and it is declined with the same offer to make it a dare instead.

This is why most rulings on contestable claims can be firm rather than soft. Once "harder" means "lower elite success rate," the fastball question has an answer with a citation. Softness is reserved for the cases where the criterion is fixed and the evidence still genuinely splits.

A **soft ruling** states its confidence rather than hiding it. "I favor the fastball, 60-40, and here is why" is a better social object than a verdict, because the 40 is what the loser argues with. A 95-5 ruling ends the argument and a 55-45 ruling extends it, and both are good outcomes for a product whose currency is arguments. `ai_confidence_bps` carries this.

**Interpersonal disputes are declined, always.** If the AI cannot identify a claim about the world, it refuses and offers to make the thing a dare instead. An AI ruling on a disagreement between two friends, with a stake attached and their group watching, is a verdict on someone's character. That is a product that hurts people, and no amount of hedging in the copy makes it safe.

The soft ruling is still only a proposal. Quorum overrides it by the same mechanism as any dare, which is the appeal path for the AI being confidently wrong about tennis.

### 8c. Markets and the scoring rule

There are no sides. Everyone who enters states what they believe and how much they are putting on it. After resolution, everyone is scored on how accurate they were, and every pair settles on the difference, with the stake at risk in each pair capped at the smaller of the two.

This is a competitive scoring rule, and it is what "if this were on Polymarket" actually means to a friend group. Not a price, which five people cannot produce. A number from everyone, a resolution, and a record of who was closest.

**Three kinds of question, one mechanism.**

*Binary.* "Does John fall asleep during the movie?" Everyone states a probability. Scored by Brier: `1 − (p − outcome)²`.

*Numeric.* "How many shirts can Gabe wear at once?" Everyone states a number. The creator sets a plausible range (the AI anchor suggests one). Scored by distance as a fraction of the range: `1 − |guess − actual| / range`, floored at zero. Absolute error is the right rule here because it elicits the median of your belief, and "probably twelve" is a median. This is "closest guess wins," and it needs no explanation to anyone.

*Categorical.* "Who falls asleep first?" Everyone picks an outcome and a confidence; the remaining mass spreads evenly over the other options. Scored by Brier over the distribution.

*Over/under* is a shortcut, not a fourth kind: set a threshold on a numeric question and it becomes a binary market on "over."

**The payout.** Friends bet against each other, not against an average, so the settlement is pairwise. With stakes `s_i` and scores `S_i` in `[0, 1]`, every pair `(i, j)` settles:

```
transfer_ij = min(s_i, s_j) × (S_i − S_j) / (N − 1)
```

and your net is the sum of your transfers. The cap at the smaller stake means you can only win from someone what they put up against you. The division by `N − 1` is what makes the most you can lose across everyone exactly your stake.

Your example, if John does fall asleep. Justin $15 at 20%, Gabe $20 at 70%, Alex $5 at 50%, John $50 at 0% on his own ability to stay awake:

```
             stake    p     S = 1 − (p − 1)²      net
  Justin      $15   0.20    0.36              −$1.60
  Gabe        $20   0.70    0.91              +$9.08
  Alex         $5   0.50    0.75              +$1.63
  John        $50   0.00    0.00              −$9.12
                                              ──────
                                               $0.00
```

Justin loses. He said 20% and it happened, and pairwise he was much worse than Gabe and only somewhat better than John, so he pays Gabe more than John pays him. That is the answer a person expects, and it is why the settlement is pairwise rather than against the group mean: scoring against an average produces results that are correct and baffling, like a wrong call that wins because someone else was more wrong. John loses $9 rather than his whole $50 because the others only had $40 between them to win from him, which is honest about what his stake actually exposed.

Four properties, each of which does real work. It is zero-sum by antisymmetry, so there is no pot and nothing held. It is truthful: a proper scoring rule means your expected score is maximized by reporting your actual belief, and every other term in your net is outside your control, so exaggeration can only cost you. Nobody can lose more than their stake. And it works for any number of participants with no matching, no clearing price, and no order book.

John betting on himself is a feature. He can put $50 at 0% and then stay awake, which makes the market a commitment device, and everyone can see he is in it.

**The resolution screen.** Not "Justin won" or "Justin lost." An accuracy leaderboard, everyone's number next to what actually happened, and the transfers beneath it. With two people the leaderboard is the bet. With five it is the reason the bet was fun.

**Rounding and edges.** Each transfer is rounded to whole units independently; antisymmetry means the sum stays exactly zero with no residual to assign. Unquantifiable denominations force every stake to 1 and collapse the market to one edge, the lowest scorer owing one unit to the highest. Every nonzero transfer is one obligation from the lower scorer to the higher, so a four-person market can mint up to six edges. They show on the timeline as one story with its consequences beneath it, and netting collapses tangles later.

**The group's number.** Once positions exist, the market has an aggregate: the stake-weighted mean probability for a binary market, the stake-weighted median guess for a numeric one, the stake-weighted distribution for a categorical one. It is a poll average, not a price. Nobody trades at it, it does not move on volume, and it is never called "implied," because that is the vocabulary of market-making and this product does none. The creator chooses at creation whether the number is **open** (live on the entry screen and the share card as people enter) or **blind** (hidden until lock; the share card shows only the count). Open is more social and gives late entrants more information than early ones. Blind is the condition under which crowd forecasts are most accurate, because the estimates are independent. Neither affects truthfulness: under pairwise settlement, seeing others' fixed numbers can change what you believe but never makes reporting your belief a worse strategy. Both modes show the number after lock, and the resolution screen shows it against the outcome, which over time gives a group its own calibration record.

**The AI anchor.** While someone enters a position, the app shows a suggested value with a one-line rationale, stored in `anchor_value`. In open mode it sits next to the group's number ("app says 56, group says 62"); in blind mode it is the only number on the screen. It is displayed, argued with, and discarded. It is not a price, it has no onchain effect, and it is never shown as anyone's position. "The app says 56, I am at 70 because the app has never met Johnny" is the interaction being designed for, and it is the share card. For numeric questions the anchor also proposes the range.

### 8d. Proposal, ratification, and arbitration

At `resolves_by` (immediately, for arguments), the AI reads the approved terms and any attached evidence (photos, a one-line update from any participant) and proposes an outcome with a two-sentence rationale and, for contestable claims, a confidence. Stored in `dares.ai_outcome`, displayed, no onchain effect.

Each quorum member votes with their governance wallet. Voting for the proposal is one tap plus the signature prompt. Voting against it requires entering a different outcome first. Signatures accumulate in `dare_votes`. When `threshold` signatures agree on one outcome, the server submits `resolve()` with that outcome and those signatures. If a different outcome reaches threshold first, that one resolves.

The AI proposal exists to make the common case one tap. It carries no authority. A quorum that disagrees with it wins.

**The voting flow.** Nobody should have to find the original link. When `resolves_by` arrives, the creator is notified first, because they set the deadline and its arrival is a consequence of their own action. Every vote after that notifies the remaining quorum members: "Gabe voted on the fence bet, 2 of 5, yours would not resolve it yet" or "3 of 5 have voted, yours resolves it." Every notification deep-links to the ballot with the AI proposal pre-selected, so the whole act is tap the notification, see the proposal, tap agree, sign. When threshold is reached, everyone who had not voted gets the result instead of a request, and the ballot closes; nobody is asked to vote on something already decided.

Three channels carry these, because no single one reaches everyone. Web Push reaches installed PWAs, which on iOS is the only way it reaches anything, and most users will not have installed. Transactional email reaches every account-holder who logged in by email, needs no carrier registration, and is the right channel for a slow-loop dare and the wrong one for an argument. And the voter can relay: the screen after a vote offers one tap that opens their own composer with "voted on the fence bet, 2 of 5, your turn" and the ballot link prefilled to the group chat, which reaches everyone actually in the conversation, ghosts included, through the same mechanism as every other share. Dareful sending SMS itself is app-originated messaging and requires A2P 10DLC registration against a business identity; it is the channel that eventually reaches everyone and it waits for the business identity (open question 7).

Markets awaiting your vote also surface in a "needs you" strip at the top of the person view and the group view. That is the pull path for anyone the channels above miss, and it is load-bearing rather than polish. Nothing in this flow is triggered by time passing except the creator's first notification, and that one is a scheduled consequence of the creator's own act.

**Stalemate.** If `resolves_by` passes with no quorum, the market's stalemate rule decides what happens next. The creator chooses it at creation, it is shown on the share card before anyone enters, and every participant consents to it in their entry signature.

*Arbitrate* (default). Every participant may state their case in one line, stored in `dare_statements`. The AI reads the terms, the positions, the statements, and any evidence, and writes a ruling: an outcome and a rationale, or a finding that the terms cannot decide it, which voids with the toll. The relayer submits `arbitrate()` with the outcome and the hash of the written ruling, so the ruling is auditable against the chain. This is the argument settler applied to a deadlock, and it is honest for the same reason an arbitration clause in a contract is honest: everyone agreed to the tiebreaker before knowing which way it would cut.

*Void.* `expire()` fires silently. No toll, nothing minted, the market stays in the timeline as unresolved.

The default is arbitrate because the fast loop needs resolution, and an argument that voids because one person sulked is a worse product than one where they agreed up front to let the AI hear both sides.

### 8e. Calibration

Every resolved market scores every participant, and the score is the same number that determined their payout. So calibration is not a separate computation; it is the running record of the scores each person has already been paid on.

Binary and categorical markets accumulate into a calibration curve: how often the things you call at 70% actually happen. Numeric markets accumulate into an accuracy stat: your average distance from the truth as a fraction of the range. Both sit on the profile next to the clean-resolution rate. Ghost positions are scored too, and they rebind on signup, so a person's record starts accumulating from their first accountless entry and their first screen as an account-holder already has history on it.

It is the answer to why anyone is still here in March. Someone opens the app tonight because there is an argument to settle. They come back in six months because they want to know whether they are right as often as they think they are, and there is nowhere else to find out. Unlike a win rate, it cannot be farmed by only taking easy bets, and it is what makes a habitual exaggerator visible without the app ever scolding anyone.

## 9. Receipt pipeline

Unchanged from the original design. Lives entirely offchain until finalization.

### Extraction

One vision-model call. Write no OCR code. Request structured output and validate it with Zod:

```json
{
  "merchant": "string",
  "occurred_at": "ISO 8601",
  "currency": "USD",
  "items": [{"name": "string", "qty": 1, "unit_price_cents": 0, "line_total_cents": 0}],
  "subtotal_cents": 0,
  "tax_lines": [{"label": "string", "amount_cents": 0}],
  "tip_cents": 0,
  "total_cents": 0
}
```

### Invariants

Both must hold to the cent before anything is shown to anyone:

```
sum(items.line_total_cents) == subtotal_cents
subtotal_cents + sum(tax_lines.amount_cents) + tip_cents == total_cents
```

On failure, route to `needs_review` and show the receipt photo beside the parsed table so the payer can correct it. A misread price that still reconciles is invisible and will silently overcharge a friend; a misread price that breaks reconciliation is catchable in three seconds.

### Allocation

For person `i` with claim set `C_i`, where `share_ij` is person i's fraction of item j:

```
s_i   = Σ_{j ∈ C_i} line_total_j × share_ij            (pre-tax subtotal)
S     = Σ_i s_i                                        (must equal subtotal_cents)

for each tax line t with applicable item set A_t:
  tax_i += T_t × (Σ_{j ∈ C_i ∩ A_t} line_total_j × share_ij) / (Σ_{j ∈ A_t} line_total_j)

tip_i  = tip_cents × s_i / S                           (proportional to PRE-tax)
total_i = s_i + tax_i + tip_i
```

Shared items are divided among claimants before subtotals are computed, not among everyone present. Tip allocates on pre-tax subtotals. Tax allocates per tax line across only the items that line applies to.

**Rounding.** Allocate in integer cents. `Σ total_i` must equal `total_cents` exactly; assign the residual to the payer.

**Unclaimed.** `unclaimed_cents = subtotal_cents - S`. Display it live during claiming. Never finalize while it is nonzero.

### Claiming UX constraint

Do not require simultaneity. The payer can claim on everyone's behalf from memory, the link goes out afterward, and people correct their own rows later. Items start pre-split equally.

### Finalization

Produces one `obligation_proposal` per non-payer with `origin = 'expense'`, and the discardable-precision prompt on each: `Log $47.20` or `Log "Justin got this one"`. The former sets a USD claim with matching magnitude; the latter sets a next-time claim with the magnitude retained as shadow.

## 10. Views and queries

### Person view (cross-group, the primary screen)

The ordering is load-bearing. This is the screen where an accounting affect would do the most damage.

**Header, one line.** Open obligations where `settle_expected = true`, grouped by denomination. "Gabe owes you $40 and two beers." Compact, not a dashboard.

**Body, the timeline.** Every event between the two people in chronological order, cross-group, with a small group chip per row. Past events with photos where they exist. Future events (confirmed plans) at the top of the body, above today. Markets render as stories (the question, everyone's number, the resolution, the leaderboard, the photo), never as ledger rows, even when one market produced several obligations.

**Footer, soft parity.** Drawn from `settle_expected = false`. Not a number. "You've covered a few more of these lately."

The header reads chain state through Envio joined to Postgres for `settle_expected`:

```graphql
# Envio: open edges between two ledger wallets, either direction, any group
query OpenBetween($a: String!, $b: String!) {
  Obligation(where: {
    remaining: { _gt: "0" },
    _or: [
      { debtor: { _eq: $a }, creditor: { _eq: $b } },
      { debtor: { _eq: $b }, creditor: { _eq: $a } }
    ]
  }) { id tokenId groupId denomId debtor creditor remaining unique }
}
```

```sql
-- Postgres: join on obligation id for settle_expected and magnitude, then group
select o.denom_id, o.settle_expected, sum(e.remaining) as qty, sum(o.amount_cents) as cents
from envio_open e
join obligations o on o.id = e.id
where (o.from_user, o.to_user) in ((:me, :them), (:them, :me))
group by o.denom_id, o.settle_expected;
```

The timeline is a `UNION ALL` over five sources: obligation events (Envio), market stories (Postgres `dares`, which mirrors chain state for onchain markets and is authoritative for provisional ones), expenses (Postgres), plans (Postgres), and photos (Postgres). Compose server-side per request through the hackathon. Materialize into a `timeline_events` table fed by an Envio sync job only if it is slow, and not before Phase 9.

### Group list and dormancy

Groups are secondary navigation. A group is **square** when Envio reports no open edges among its members; squareness is computed, never declared. The group list collapses square-and-quiet groups by default.

Archiving is `group_members.archived_at`, a per-member view preference. It hides the group for that member only. Any new event in the group clears it.

**Closing the books.** When a group goes square and has had no events for a while, offer a closing summary: how long the group ran, how many obligations passed through it, who covered the most, the photos. The summary is the reward for a group that finished well. It archives on confirm. The record is the product; an archive flow that shows you the record is a payoff, and one that hides a row is admin.

Leaving a group sets `left_at`. Obligations survive; the edge is between two people and the group is a namespace, not a container.

### Capture (group-scoped)

```sql
select payer_id,
       count(*) as tabs,
       sum(total_cents) as captured_cents,
       sum(total_cents)
         - (sum(sum(total_cents)) over () / count(*) over ()) as vs_equitable_cents
from expenses
where group_id = :g
  and status = 'finalized'
  and occurred_at > now() - interval '1 year'
group by payer_id;
```

Capture is per group because equitable share needs a denominator that does not exist globally. Tab count is the wrong unit; every group that describes this problem describes it in dollars.

**Netting display.** Capture is fiction if settlement is fiction. Display captured and outstanding side by side; never show a clean capture total while money is owed against it.

**Framing.** "Gabe should take this one" and "Gabe is $880 under equitable" are the same fact, and only one of them reads as an audit.

### Next-tab suggestion

Rank by `vs_equitable_cents` ascending, weighted by any active self-declared bonus window. Bonus windows are self-declared with a target and a deadline. Permanent multiplier differences are not modelled.

### Global personal capture

Total spend routed through your own card across all groups. Your own profile only, no comparison. This is the only place a private per-user multiplier lens is allowed to render, visible to nobody else.

### Share cards

Every share route (dare, plan, obligation confirm, group invite) renders an Open Graph card. A pasted link rendering as a card in a group chat is most of what makes the product feel native without a native app. This is not polish; it is the distribution mechanism, and it is a Phase 1 deliverable.

Every share action opens the user's own composer with the text and link prefilled, through the Web Share API where available and an `sms:` deep link as the fallback. The user picks the chat. Dareful never sends anything itself.

## 11. Stack

| layer | choice | why |
|---|---|---|
| Chain | Monad testnet (chain id 10143), mainnet (143) post-submission | EVM-equivalent; cheap enough for hundreds of tiny writes per group per month |
| Contracts | Solidity, Foundry, OpenZeppelin ERC-1155 | |
| Indexer | Envio HyperIndex | the only indexer in the stack; serves every chain read |
| RPC | Alchemy | one RPC provider; Alchemy supports Monad and its free tier covers this scale |
| Auth and wallets | Dynamic (sandbox environment), two embedded wallets per user | email, phone, social, passkey login; delegation for silent signing |
| Framework | Next.js (App Router), TypeScript strict | |
| DB | Postgres via Supabase | storage and realtime also needed later |
| ORM | Drizzle | SQL-first; the queries above are the interesting part |
| Storage | Supabase Storage | settlement and receipt photos |
| Realtime | Supabase Realtime | `item_claims` in Phase 8, live rounds in Phase 11; not wired before Phase 8 |
| Styling | Tailwind + shadcn/ui | |
| Model calls | Anthropic API, one module, Zod-validated | term interrogation, outcome proposal, receipt parse |
| Notifications | Web Push (VAPID) for installed PWAs; transactional email for email-login users; voter-relayed composer nudges | vote cascades, resolutions, entries, settlements; every notification has an in-app equivalent; app-sent SMS is post-submission, gated on 10DLC |
| Contacts | Contact Picker API (`navigator.contacts.select`) | Android Chrome and iOS Safari including installed PWAs; one-shot, user-selected, no address book access; typed names as the fallback everywhere it is missing |
| Deploy | Vercel, custom domain `dareful.app` from day one | preview URLs must not be used for anything auth-related |

## 12. Build phases

Checkpoint approval between every phase. Nothing proceeds without review. Dates are targets, not commitments; the submission gate is fixed.

**Phases 0 through 2 are the minimum viable submission.** At the end of Phase 2 the product is complete enough to be judged: real obligations, real markets, real resolution, accountless entry, host mode, chain writes through Envio. The first portal submission happens then, not at Phase 6, and every later phase resubmits. If anything after Phase 2 stalls, what exists at the deadline is still a finished product rather than a partial one.

**Testing is continuous from Phase 2, not a phase.** The Traction criterion asks for evidence of real people using it, and that evidence has to exist by October 13. From the first submittable build onward, real groups use it, and `docs/testing.md` records who, what broke, and what changed because of it. The cross-device passkey testing from September is the first entry. This log is a submission deliverable.

Rough targets, with 30 days from September 13: Phase 0 by the 17th, Phase 1 by the 21st, Phase 2 and first submission by the 26th, Phase 3 by the 30th, Phase 4 by October 4, Phase 5 by the 8th, Phase 6 by the 11th, final resubmission the 13th. Phases 4 and 5 are the ones to cut if the schedule slips; Phase 3 is the one to protect after Phase 2, because it carries the Dynamic bounty.

**Phase 0: Scaffolding, contracts, indexer.** Repo, `CLAUDE.md`, `.env.example`, `.gitignore`, `docs/decisions.md`. Next.js project. Drizzle schema and initial migration for everything in 5b. `DarefulLedger` and `DarefulDares` with Foundry tests covering: non-transferability, netting, batch confirmation under one signature, quorum sourced from the ledger and not from the caller, quorum threshold, duplicate-signer rejection, one position per wallet, atomic create with every position or none, a quorum for `VOID`, Brier and absolute-error scoring against hand-computed cases, pairwise transfers against the worked example in Section 8c, zero-sum after independent rounding, loss bounded by stake under unequal stakes, arbitration gated on the stalemate setting, expiry gated on the stalemate setting. Deploy to testnet. Envio indexer with `Obligation`, `Dare`, and event entities, serving GraphQL. Seed script producing two groups onchain and offchain, one always-square and one let-it-ride, each with months of plausible history. No UI. Checkpoint: contracts pass all tests on testnet, Envio returns correct balances for the seed, migration runs clean.

**Phase 1: Auth and ledger core.** Dynamic login with both wallets created invisibly. Groups and invite links. Inline custom denominations with in-group and cross-group reuse. Manual obligation propose and confirm with prompted signing through the relayer. Composer handoff on every share. Contact Picker with typed-name fallback, group and personal links, implicit groups matched from the member set. Accountless claiming end to end: `participant_claims`, `claim_tokens`, and `personal_links`, ghost members in groups, `users.phone_hash` so a picked contact resolves to an existing user, phone-hash binding on signup across creators, dismissal with re-scoring, rate limits, token binding on signup, creator merge from any ghost, the claimant's first screen with confirm-all through `confirmMany`, the creditor-side re-confirmation, and claim links sent through the composer. Person view header and timeline with group chips, including provisional rows. Open Graph cards on every share route. This is the whole thesis in one phase. Checkpoint: two people on two phones, one Android, create and confirm an obligation and both see it in the person view within one block; the creator picks a third person from contacts, logs "I got this one" against them, and that ghost's pending obligation binds and mints when they sign up a day later on the same phone number.

**Phase 2: The fast loop, and the first submission.** Quick creation mode. Binary markets end to end: positions with stake and probability, the AI anchor, the group's number with the open/blind setting, the argument settler's three-tier interrogation with criterion selection and interpersonal disputes declined, immediate AI proposal, governance-wallet voting with prompts, quorum resolve, scoring, payout, edge minting, and the accuracy leaderboard as the resolution screen. The voting flow: creator-first notification at the deadline, the vote cascade with counts over push and email, the voter-relayed composer nudge, deep-linked ballots with the proposal pre-selected, the "needs you" strip, and the result notification that closes the ballot. The stalemate setting with arbitration as default, including participant statements and the audited ruling. The room code: lobby with QR and six-character code, polled join count, auto-acknowledgment while open, kick from lobby. Host mode as the fallback: the creator enters every position, confirm-or-change on the group link as the entry signature, and the always-prompt rule for edges from unsigned positions. Provisional markets for accountless participants: membership-based acknowledgment, the pending state for unlisted names, dismissal with re-scoring, the offchain quorum among account-holders, real-real edges minting immediately, ghost edges resolving to proposals. Share cards for markets and rulings. This is the acquisition thesis and it comes before delegation deliberately: it is the first thing anyone would want to use, and delegation is the piece most likely to stall. At the end of this phase: the judge seed, a first cut of the README, the live deploy on `dareful.app`, and the first portal submission. Checkpoint: four account holders enter a binary market, it resolves by quorum with one dissenter, the leaderboard shows the scores, and every edge appears on the right timelines; a two-person argument deadlocks and arbitration resolves it against both statements; four people in one room join a market by scanning the lobby QR, every position is self-signed so the market goes onchain at lock; separately, a micro-bet with three account-holders and one ghost resolves by the account-holders' offchain quorum, the real-real edges mint that night, a stranger enters under an unlisted name and sits pending without touching the scoring, and the ghost's edges mint when they claim.

**Phase 3: Delegation.** Webhook receiver with raw-body HMAC verification, RSA decryption, re-encryption, `delegations` store. Delegated signer. Silent confirm, close, and market entry. Votes still prompt, always. Revocation handling that degrades to prompted signing. Checkpoint: confirm an obligation with no prompt; revoke from the Dynamic widget; confirm another with a prompt; re-grant; confirm silently again.

**Phase 4: Lifecycle.** Settlement and forgiveness closes with the settlement photo. Soft parity footer. Netting. Square detection and the closing-the-books flow. Checkpoint: a four-person group with tangled reciprocal obligations nets to minimal edges in one transaction, and a square group produces a closing summary.

**Phase 5: Slow-loop dares and numeric markets.** Future-event markets: link out, positions entered over days, lock, AI proposal at the deadline, expiry, the void toll, clean-resolution rate and calibration on the profile. Numeric markets with the range and the over/under shortcut. Most of the machinery already exists from Phase 2; this is the second scoring branch, the pacing, the waiting states, and the profile stats. Checkpoint: a numeric market in a five-person group resolves by three votes with one dissenter, pays by distance from the actual number, and every profile updates.

**Phase 6: Plans and the submission bundle.** Plan links, RSVPs, forward timeline, add-to-calendar export. Then the full submission bundle from Section 14: final README, logo, three-minute technical demo, two-minute pitch, the judge seed refreshed, `docs/testing.md` current, resubmission. Checkpoint: every item in Section 14 is present and the submission is live.

**Submission gate.** October 13, 2026, 23:59 ET. Every phase after this is post-hackathon unless earlier phases close ahead of schedule, in which case pull forward in order.

**Phase 7: Polish.** Bugs, copy, empty states, the design pass that open question 6 defers. Resubmit as often as the portal allows; the version at the deadline is the one judged. (Testing is not a phase; see above.)

**Phase 8: Receipts.** Upload, vision parse, invariant check, needs-review correction, claiming with live unclaimed counter, finalization into proposals, the discardable-precision prompt. Merchant geocoding for the map view.

**Phase 9: Capture.** Standings, equitable gap, next-tab suggestion, bonus windows, credit card roulette (fronting variant default). Timeline materialization if needed.

**Phase 10: Social layer.** Timeline polish, photo feed, scoreboard, categorical markets, Snapchat Creative Kit share-out, Farcaster mini app surface.

**Phase 11: Live dare rounds.** A group in one room plays a round of dares: rotating turn order, a timer, each turn spawning a market that resolves by quorum on the spot, side markets on whether the dared person follows through. Uses Supabase Realtime for the shared game state. No new contracts; the round is a UI and realtime layer over the existing markets and ledger. Checkpoint: five people in one room complete a round with a rotating turn, each dare resolving live by quorum, and the round's obligations appearing on everyone's timeline before the round ends.

Ordering rationale: the receipt scanner is the highest-frequency obligation generator and therefore tempting to build early, but it is the most engineering per unit of learning, and receipt splitting with no differentiation is a worse Splitwise. The fast loop is cheap, distinctive, and carries the acquisition thesis, so it lands before delegation and before anything expensive. Build the cheap distinctive thing before the expensive commodity thing, and build the reason to open the app before the plumbing that makes it pleasant.

## 13. Conventions

- TypeScript strict. No `any`. No non-null assertions without a comment justifying them.
- All money in integer cents offchain. All quantities as integers onchain. No float ever touches a monetary value.
- All timestamps `timestamptz`, stored UTC, rendered in the viewer's zone.
- Zod validation at every boundary: model responses, route handlers, form input, webhook payloads, Envio responses.
- Server Components by default; Client Components only where interactivity requires it.
- All model calls live in `src/lib/ai/` behind typed functions. No inline prompts in components.
- All chain interaction lives in `src/lib/chain/`: `contracts.ts` (ABIs, addresses per chain id), `relayer.ts`, `delegated-signer.ts`, `gas.ts` (per-function explicit gas limits), `typed-data.ts` (EIP-712 domains and types).
- Every relayer transaction passes explicit `gas`. Never `estimateGas` in a production path.
- Webhook signature verification hashes the raw request body bytes. Never `JSON.stringify` a parsed body for HMAC.
- Migrations checked in and never edited after being applied.
- Never store card numbers, card metadata, or payment credentials of any kind.
- Never store a phone number or email picked from contacts. Hash it with the app salt at the edge, use the raw value only to prefill the composer, and discard it.
- No `localStorage` for anything that belongs in the database or on the chain.
- Contract addresses and chain ids come from environment, never hardcoded.
- Every obligation mint includes the offchain uuid in the ERC-1155 `data` field.
- `docs/decisions.md` records every architectural decision with the date and the alternative rejected.
- Accountless entry is rate-limited: at most one position per claim token per market, and at most ten ghost entries per market link in total. Both limits are enforced server-side and surfaced as a plain message, not a silent drop.
- No em dashes in any generated documentation or copy. Use commas, parentheses, or colons.

**Git workflow:** stage changes and propose a commit message. Do not commit. Do not push. Wait for explicit authorization.

## 14. Submission

### What the hackathon requires

The hackathon requires all of the following. The first cut exists at the end of Phase 2 and the final at the end of Phase 6:

- Public GitHub repository with an OSI license (MIT), a README a third party can follow to run the project, an architecture overview, the technology stack, setup and deployment instructions, clear attribution of every external library, identification of any pre-existing components, disclosure of AI coding tools used, and a commit history covering the build window.
- Repository access granted to the hackathon's designated reviewer address.
- Deployed contract addresses on Monad testnet and a written explanation of why the project uses Monad specifically.
- Technical demo video, three minutes maximum, showing the product in actual operation including chain interactions.
- Pitch video, two minutes maximum: team, problem, why this.
- Live product link with judge test credentials.
- Logo.

The written "why Monad" answer, for reference when it comes time to write it: a group logs hundreds of tiny state changes a month, each confirmed obligation, settlement, and netting a write, and the product only works if those writes are cheap enough to be invisible and fast enough that both people see the result before they put their phones down. That is a throughput and cost argument, not a decentralization argument, and it should be made in those terms. Markets with ghosts or hosted positions never reach the chain as markets; their obligations do, and the obligations are the volume.

### The judge seed

Design and Craft is scored on the judges' own hands-on experience through the live link, so what they see in their first two minutes is most of that 20%. The judge credentials open an account that is already living in the product: a member of two groups with history, one always-square and one let-it-ride; a market awaiting their vote with the proposal ready; a pending claim on their first screen from a bet they "entered" as a ghost; a tangled set of reciprocal obligations one tap from netting; and a resolved market whose leaderboard is one tap away. Nothing empty, nothing that requires them to recruit anyone. The seed is built at the end of Phase 2 and refreshed at every resubmission.

### The founder

The founder-market fit is specific enough to state. Economics and data science by training, with an undergraduate concentration in logic and game theory, which is where a competitive scoring rule with pairwise settlement comes from rather than a payout table someone guessed at. Before this, a calibrated probability model for pari-mutuel horse racing: 317,000 training entries, gradient-boosted with isotonic and Platt calibration, pricing engines for exotic and multi-race wagers, and a live adjustment system. That is the same problem as this product, stated once for horses: elicit a probability, score it against what happened, and keep the numbers honest over time. Onchain, a credit-scoring hackathon entry that won the BNB Hack US College Edition DeFi track and was pitched at Consensus Miami, and a consent-based identity rail at ETHGlobal New York 2026 built on Dynamic auth and World ID, which is the account layer this product uses. Ran the university blockchain organization as president and director of research. The product itself came out of the author's own friend groups and the behaviors observed there, which is also where the testing log starts.

The pitch video tells this in the author's own voice. Current and former employers are not named anywhere in this repository or in the pitch.

### What the pitch video must carry

Two minutes on team, problem, and why. It leads with the behavioral insight, not the technology: the two regimes, the catalysts from Section 1, the phone coming out to settle something three times a night, "the app asks you to decide, not log." The named segment and the fact that the first users are the author's own groups. Then the mechanism in one sentence: everyone puts a number on it, everyone is scored, friends settle against each other. Then the founder paragraph above, compressed to twenty seconds, with the horse racing model as the through-line. Then why the chain: writes cheap enough to be invisible.

### What the technical demo must show

Three minutes, product in operation, chain interactions visible. In order: a lobby QR scanned by a second phone and a position entered in five seconds; a contact picked and a group link sent through the composer; a ghost entering from that link with no account; a binary market with four numbers on it and the group's number moving; a vote from a notification, the proposal pre-selected, the governance prompt; the resolution leaderboard and the transfers beneath it; the same obligations appearing in Envio and on the Monad explorer; a revoke from the Dynamic widget and the next confirm prompting; the ghost signing up and their pending obligations minting in one batch. Every beat is a thing that exists by the end of Phase 3.

### The distribution plan, stated

Traction and Path Forward asks for one. The plan is the product's own mechanics rather than a marketing channel: every share is a link that renders as a card in the group chat people already use; every accountless participant who loses a bet has an obligation waiting for them, and that obligation is the only signup prompt; every group forms from who you bet with, so the fourth person in a market is the next creator. The testing log is the early evidence that the loop closes.

## 15. Open questions

1. **Dynamic share isolation.** Whether delegated shares for the ledger wallet confer any capability over the governance wallet when both derive from one root. Ask Dynamic directly. Resolve before mainnet. Until then, log the operational-isolation assumption in `docs/decisions.md`.
2. **Alchemy depth.** RPC alone qualifies for the Alchemy bounty thinly. Alchemy webhooks for `DareResolved`, `DareArbitrated`, and delegation confirmations would make it a real integration. Decide at the end of Phase 6 based on time remaining.
3. **Timeline materialization.** Compose per request through Phase 8. Revisit at Phase 9.
4. **Photo retention and privacy.** Receipt photos contain merchant, date, and itemized spend. Decide a retention window and whether to strip EXIF before Phase 8.
5. **`settle_expected` inference tuning.** Starting priors are stated in 5b. Revisit once there is real close-reason data from Envio.
6. **Design language.** Deliberately not specified here. Pull in the frontend-design guidance at Phase 1, not before, and give it a real pass in Phase 7. The constraints: markets render as stories, not rows; the resolution screen is a leaderboard; the first screen after signup is the payoff; and nothing on any screen says "wallet," "transaction," "gas," or "chain."
7. **Telegram.** Two separate surfaces, both post-submission. A Telegram bot that joins group chats is the only inbound integration any platform permits, and it would let a group create bets without leaving the chat. A Telegram Mini App is gated on whether the Dynamic login flow works inside Telegram's webview. Neither is worth building before there is a business identity for SMS, which is the surface that actually reaches everyone.
8. **Mainnet migration.** Requires a Dynamic enterprise plan for production delegated access, a funded relayer, and the share-isolation answer. Post-submission.
9. **Anchor quality.** The AI's suggested value is a joke and an argument generator, not a forecast, but a suggestion that is obviously stupid undermines the feature. Decide at Phase 2 whether the model gets search access for the anchor or whether a visibly naive number is funnier. No onchain effect either way. For numeric questions the anchor also sets the default range, and a bad range compresses everyone's scores, so the range needs a sanity check the probability does not.
10. **Stalemate consent for accountless participants.** An accountless participant signs nothing at entry, so they have not consented to arbitration. A provisional market that deadlocks between the creator and a ghost resolves provisionally either way, and the ghost confirms or disputes on claim, so nothing binds them. Confirm this reasoning holds once the flow is built.
11. **Member-level spam.** An account-holder can create many markets in a group they belong to. Membership is creator-controlled and every creation is visible, so this is left alone until it happens. Revisit if it does.
12. **Contact Picker coverage.** The API is missing on desktop and on some Android browsers. Typed names are the fallback, and a typed name has no phone hash, so binding for those people is by token or creator merge only. Decide at Phase 1 whether to also accept a typed phone number, which restores hash binding at the cost of one more input.
13. **Batched voting.** Someone with three markets awaiting their vote signs three times. A `VoteBatch` typed-data shape and a `resolve` variant that verifies one signature across several markets would make it one prompt. Contract change; defer until three pending ballots is a thing that actually happens.
14. **Argument evidence.** Whether the settler accepts a link or screenshot as evidence, and what that does to the interrogation step. Deferred to Phase 5.
