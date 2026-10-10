# Dareful

Dareful settles the small bets a friend group already makes: someone asks a question, everyone puts a number on it, and the people in it decide what happened. Each person is scored on how close they came, and what that leaves between friends goes into a ledger of records on Monad that nobody can move or sell, signed by the people it binds, with no money held anywhere.

Live at [dareful.app](https://dareful.app) · [The demo, in two minutes](VIDEO_DEMO_LINK) · [How it's built](VIDEO_BUILD_LINK) · [Try it yourself](#try-it-yourself)

## Where each criterion is answered

| Criterion | Weight | Read |
| --- | --- | --- |
| Founder and market readiness | 25% | [Who it's for](#who-its-for), [Who's building it](#whos-building-it) |
| Traction and path forward | 20% | [Traction](#traction), [Where this goes](#where-this-goes), [How it grows](#how-it-grows) |
| Technical execution | 20% | [Why the chain isn't decoration](#why-the-chain-isnt-decoration), [Check it yourself](#check-it-yourself), [How it works](#how-it-works), [Quality](#quality) |
| Design and craft | 20% | [What it looks like](#what-it-looks-like), [Design and craft](#design-and-craft) |
| Originality and track insight | 15% | [Why the chain isn't decoration](#why-the-chain-isnt-decoration), [Sponsors](#sponsors), [The AI](#the-ai) |

## Who it's for

Dareful is for a friend group of four to eight people who share a group chat and see each other most weeks. I'm in several groups like that, and they already bet: beers on the game, a round on whether someone finishes the pizza, five dollars on an argument at dinner. Today those bets live in the group chat and in people's memories, and "I got you next time" covers whatever gets forgotten. Sportsbooks and prediction markets price events anyone can look up, and neither has a place for a bet about things your friends bet on, like whether Chris finishes the pizza or whether John falls asleep during the movie.

Groups like mine will switch because Dareful asks for nothing they don't already do. A question is a link dropped into the chat they already have, anyone joins with just a name, it works the same on Android, and the app helps maintain a ledger of who owes what to whom. Every bet starts with a decision the group was already making, and the record is what that decision leaves behind.

What real groups changed in their first weeks on dareful.app:

- October 2. Questions on a game never closed. The scoreboard's day was read in UTC, so an evening game in the East was looked up under the next day's date and its final never came, and the scheduler's queue kept skipping questions that couldn't close, so one with five people in it never reached the front. The day is now the scoreboard's own, the queue leaves out what can't close, and a game's questions close at kickoff.
- October 2. People didn't come back to vote. Of the first fourteen questions to reach voting, four sent anyone a request to vote, and those reached nobody: most people had never allowed notifications. Everyone in a question now hears that voting has opened, from whoever closed it, and anyone still out gets one reminder twelve hours in, the one notice the app sends because time passed.
- October 4. Joining from a link asked for more than a name: a phone number, and a check against it when someone picked a name already there. Now a name is all it takes: the call is saved first, and keeping it in an account is offered after, with Google, email or a phone.
- October 4. A question about something months away came back with no terms, because the write-up stopped at four months. It now names the date it's decided by, up to three years out, and says so plainly when a question can't be known that soon.

## Who's building it

I'm Justin Wender, and Dareful is a team of one: I designed it, wrote the brief and the specifications it's built from, tested it with my own friend groups, and directed Claude Code through every phase.
- I studied Politics, Philosophy and Economics at Northeastern (summa cum laude), with a concentration in logic and game theory, and I'm finishing a master's in Economics and Data Science there. Dareful runs on a proper scoring rule, the piece of mechanism design that makes an honest number everyone's best move.
- I was president of NEU Blockchain, Northeastern's blockchain club. I won the BNB Hack: US College Edition with Credence, an onchain credit scoring algorithm (AUC 0.82 on 115,687 Venus Protocol borrowers), first place at Bentley FinTech Day with research on Uniswap's fee switch, and won the Visualization and Insights track at Optimum Hacknet.
- In my spare time, I built a horse racing handicapper that prices races with gradient-boosted models and calibrates their probabilities, the same test Dareful puts to every call: say a number, and see how often you're right at it.
- After a short stint at Allium, a blockchain data company, I now work in research and operations at Fireblocks Financial Services, a subsidiary of Fireblocks. Dareful is my own project, built on my own time, and isn't affiliated with or endorsed by either.

## Traction

<img src="https://dareful.app/numbers" alt="Dareful's numbers, drawn by the app as it runs: people with accounts and guests, questions played (settled, still open, ended without a decision), groups that came back for a second question, and the chain's counts from real use" width="720">

The picture above is drawn by the app as it runs, at [dareful.app/numbers](https://dareful.app/numbers), so it keeps counting through judging. It reads the database and the indexer at most once every five minutes and says when it last did.

It leads with questions played, since a question only one person is in is an ask, not a bet. At 10:07pm Eastern on October 9, 17 questions had been played since launch: 12 settled, 5 still open and none ended without a decision. 15 people had made accounts, 9 more had joined as guests, and 3 groups had come back for a second question.

The numbers are the owner's stats page's own, with every test account left out, counted since launch (midnight Eastern, September 13, 2026):

- People with accounts: accounts made since launch.
- Guests: people who joined a question with a name and no account, on a question a counted person asked. A guest who later made an account counts as that account.
- Questions played: questions a counted person asked that someone besides the asker got into. Settled is those that ended in a decision, by the vote of the people in, the tiebreaker, the final score or the app's ruling standing, "nobody can tell" included. Still open is those not yet ended, open or closed and waiting on the call. Ended without a decision is those that expired: nobody called them in time.
- Groups that came back: sets of people that asked a second question. A game's questions count once, and a question called off doesn't count.
- Questions asked, on the stats page and the facts sheet: questions counted people sent, leaving out any called off before anyone else got in.
- On Monad, from real use: the obligations with a counted person on either side, the questions on the chain with a counted person in them, the counted people registered on the chain, and the sets they're registered in.

The test suites run against the live testnet contracts, so most of the contracts' transactions are tests. On October 9, 2026, after the full mutation audit, real use was 2.3% of the transactions that had gone through (52 of 2,309), read from the indexer's events and whose wallets they name ([`scripts/ops/chain-tests.ts`](scripts/ops/chain-tests.ts)). Every chain number in this README counts real use only. A question with a guest in it is decided and settled off the chain, so it isn't in the chain's counts.

## Path Forward

Today, Dareful settles the small bets friends already make: whether Chris finishes the pizza, who wins Red Sox at Yankees, whether a major league pitch is harder to hit than a Premier League penalty kick is to save. Calls from people with accounts are signed, and when everyone in a question has an account, it's settled on Monad. Whatever anyone owes goes into a ledger the group can trust without anyone holding the money.

The ledger is the part I want to grow. Friend groups already keep one in their heads: who covered dinner, who owes a round, whose turn it is to pay. Next, Dareful adds the games groups already play around that ledger, starting with credit card roulette. Then, I'll add more social ledger features such as splitting a receipt by what each person ordered, and later shared questions for big events, where everyone still plays only against their own friends. These features will make the "You" page much more robust than it is in the current iteration of Dareful.

I've ruled out two things in this version: one for now and one permanently. For now, no money moves through Dareful: what anyone owes is a record, and people pay each other however they already do (the "dollars" are non-monetary non-transferrable ERC-1155 tokens for now). The app would work better if it could settle in dollars itself, and with the proper money transmitter licenses it could. Permanently, Dareful will not take a cut of anyone's bet. A cut would turn the app from a bystander into the house, paid more the more everyone bets. That's how a sportsbook makes its money, and Dareful is a social app.

Revenue can come from two places that take nothing out of anyone's bet. One is sponsored live events, where a brand puts its name on the questions around a big event (e.g. the Miller Lite ads when you log into ESPN Fantasy). The other, once Dareful holds a proper money transmission license like Venmo's, is the float: the yield on money waiting between payments, which could sit in a vault on Monad.

Most apps on a phone are built to hold your attention, which pulls you out of the room. I want Dareful to be the app that engages a room of people and brings them closer together: an argument, dare, or friendly wager on a football game, where everyone gets involved on Dareful and the app keeps record of the event afterward.

## How it grows

Growth is built into how a question travels. Every question goes out as a link into a group chat, anyone in that chat joins with a name, and what a guest is owed waits until they make an account to collect it, so every group that plays brings its whole chat in.

Next I'm seeding groups where the bets already happen: my fantasy football league, NEU Blockchain and its alumni, and watch parties through the NFL season and the MLB playoffs, which my 'What's On' page already lists. Additionally, I'll try to push the app out through family, other friends, and secondary channels (friends of friends, other blockchain clubs, etc.). The numbers I'm watching are groups that ask a second question, guests who make an account to collect what they're owed, and groups that come back the next week.

## What it looks like

<table>
  <tr>
    <td width="25%"><img src="docs/readme/asking.jpg" alt="The terms step: the question, the terms the app wrote, and when it's decided"></td>
    <td width="25%"><img src="docs/readme/joining.jpg" alt="Joining from a link: a number, then a name"></td>
    <td width="25%"><img src="docs/readme/calls-are-in.jpg" alt="A guest's view after saying calls are in"></td>
    <td width="25%"><img src="docs/readme/the-reveal.jpg" alt="Who said what, once the question closed"></td>
  </tr>
  <tr>
    <td>Asking: one line in, the terms written for it.</td>
    <td>Joining from a link: a number and a name.</td>
    <td>Calls are in: it closes when enough of the people in say so.</td>
    <td>The reveal: every call, and whose it is, once it's closed.</td>
  </tr>
  <tr>
    <td><img src="docs/readme/ruling.jpg" alt="The app's ruling on an argument, with Agree"></td>
    <td><img src="docs/readme/game-page.jpg" alt="A game page: who wins and by how much, with each team's stamp and a photo from the stands"></td>
    <td><img src="docs/readme/person.jpg" alt="A friend's page: a round covered, and the question you were both in"></td>
    <td><img src="docs/readme/settled.jpg" alt="A settled question with a photo of the finished crossword"></td>
  </tr>
  <tr>
    <td>An argument no search settles: the app's ruling, sealed when it was asked, shown at the close with Agree.</td>
    <td>A game page: who wins and by how much, before kickoff.</td>
    <td>A friend who joined as a guest: a round covered, and the question you were both in as its story.</td>
    <td>Settled: she did, with a photo of the finished grid.</td>
  </tr>
</table>

The screenshots are from the iOS 26 and iOS 27 simulators and a development browser, in light appearance, on walk data with made-up names. The crossword was drawn for this README. The game page's photo is ["Packers - Bears Game"](https://www.flickr.com/photos/briangiesen/6575070991/) by Brian Giesen, licensed under [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), from a 2011 game at Lambeau Field.

## Try it yourself

A question with a guest in it is settled off the chain, so this path uses two accounts. The second account's sign-in is in the submission form, and never in this repository.

1. On a phone or a desktop browser, open [dareful.app](https://dareful.app), tap “Get started”, then “Continue with Google”.
2. Tap “Ask something” and type a question, for example “Will Chris finish the whole pizza?”. Keep “Yes or no” and “Quick setup”, tap “Set the terms”, read the terms the app wrote, pick when it's decided and the stakes, and tap “Send it”.
3. Tap “Copy the link” (the icons at the end of the row of who's in) and open the link in a private window. Slide to a prediction, tap “I'm in at”, then “I already have an account”, and sign in with the account from the submission form; the call goes in as that account.
4. Back on the first account, make your own call: slide to a different prediction and tap “I'm in at”.
5. Close it: as the asker, tap “Close it with 2”, then “Close it now”.
6. See who said what: once it's closed, every call shows under “Who said what”, with whose it is.
7. Settle it: tap “It's happened”, pick what happened, tap “Say it”, and confirm in the sheet. Do the same from the other account. When the two agree it's settled: closest first, and who's got who.
8. Find it on the explorer: open [the Dares contract](https://testnet.monadvision.com/address/0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0). Its newest transactions are your question's `create`, carrying both signed entries, and its `resolve`, carrying both votes, each sent by the app's relayer. The record of what one of you owes the other is minted on [the Ledger contract](https://testnet.monadvision.com/address/0x8E200d344fA233d85b78f85aC78c3F778397F26D) inside the `resolve` transaction.

To join as a guest instead, open the question's link in a private window, slide to a number, tap “I'm in at”, type a name, and tap “Join as”. A name is all it takes. A question with a guest in it is decided and settled off the chain, and what it leaves waits until the guest makes an account and confirms it.

## Design and craft

Five of the principles the product was specified against ([`PLANNING.md`](PLANNING.md), section 2), and where each shows:

- Notify about what people did, never about states of the world. Every notice names a person and what they did ("JP closed …", "Rae is in on …"); Now never counts, badges or says how long anything has waited, and its one citron dot means only that something has a clock. The one exception, a reminder to vote twelve hours in, was ruled in by name for real groups that never came back to vote.
- The creditor authors, the debtor confirms. "I got this one" is logged from the friend's page by whoever paid, never "Gabe owes me", and nothing reaches the ledger until the other person taps yep on Now.
- Count before amount. What's between two people reads as tallies and words ("Theo's got you" with a round's glyph); dollars show whole in lists, and the cents stay in the detail.
- Forgiveness is a status move. "Call it even" sits beside "Settled" as an equal choice on every record its creditor holds, and it closes the record on the chain the same way.
- One account per bet, not one per person. Joining a friend's question takes a name and nothing else; the account comes later, and only to collect what the guest is owed.

The design itself is specified in [`docs/design.md`](docs/design.md): every token as a literal value, a dark and a light appearance from one set of tokens, nine type tokens and a lint that holds every screen to four sizes, and the motion, layers and sheets drawn for a phone held in one hand.

## Why the chain isn't decoration

A friend group's ledger only works if nobody, the app included, can quietly change it. The chain carries exactly the parts two people have to agree on, and the app can't forge any of them:

- A call is signed by its owner over the exact number they sent, and every signed call lands in the question's `create` together, so nobody can change a number after the close, and nobody can say they called something they didn't.
- A vote is signed by a wallet the server never holds, so the server can write the ledger but can never decide a question. The contract reads the voters from the wallets of exactly the people in, and counts a majority of them.
- When the app rules on an argument, it seals the ruling when the question is asked: the seal goes into the terms everyone signs, and so into the hash in `create`, before anyone has called. The app can't change its ruling after seeing who's on which side.
- What a question leaves is a record (an ERC-1155 token) that can't be transferred, sold or redeemed; the contract refuses every transfer. There's no market for it and nothing of value is held, so it stays a record between friends.

Everything one person controls stays off the chain: the question's words, the photos, the names. A question with a guest in it waits off the chain too, since nobody signed for the guest, and what it leaves goes on the chain only as each person makes an account and confirms.

## Check it yourself

Recompute a real question from the chain. On September 26, two people put $10 each on a yes-or-no question, one at 74% and one at 88%, and it happened. Its [`create`](https://testnet.monadvision.com/tx/0xbb12705fae816c10a86b123847a1d612eceeea34befec80649755d06bb2c042d) carries both signed calls (`Entered`, stake 1000 cents, values 7400 and 8800 in basis points), and its [`resolve`](https://testnet.monadvision.com/tx/0x903db4d37f4876cb8491410069ceaeface2b48081ba385dac12fbd02add180f5) carries both votes for yes, then a `Scored` event for each person and the one record it minted:

- Each score is the Brier rule in basis points: 10000 − (10000 − 7400)² / 10000 = 9324, and 10000 − (10000 − 8800)² / 10000 = 9856.
- Each pair settles on the difference: the smaller stake × (9856 − 9324) / (people in − 1) / 10000 = 1000 × 532 / 1 / 10000 = 53.2, truncated toward zero to 53. So the 74% caller owes the 88% caller 53 cents, which is the record minted in the `resolve`.

The contract's scoring functions are public, so the same numbers come from the deployed contract itself (Foundry's `cast`, on Monad's public RPC):

```bash
cast call 0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0 "scoreBinary(uint256,uint256)(uint16)" 7400 1 --rpc-url https://testnet-rpc.monad.xyz
```

```bash
cast call 0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0 "pairwiseTransfer(uint256,uint256,uint16,uint16,uint256)(int256)" 1000 1000 9324 9856 2 --rpc-url https://testnet-rpc.monad.xyz
```

The first answers 9324; the second answers -53, the first person paying the second.

Check a sealed ruling. When an argument closes, "How to check it" under the app's ruling shows the seal from the terms everyone signed, the salt and the ruling's text. Save the text to `text.txt` and, from a clone of this repository after `npm install`:

```bash
node -e 'const fs=require("fs"),{keccak256,concat,stringToHex}=require("viem");console.log(keccak256(concat([process.argv[1],stringToHex(fs.readFileSync("text.txt","utf8").replace(/\n+$/,""))])))' 0xTHE_SALT
```

It prints the seal: keccak-256 of the salt's 32 bytes followed by the text, whose first line is the verdict and the rest the reasons ([`src/lib/ledger/seal.ts`](src/lib/ledger/seal.ts)).

Check every question at once. [`scripts/verify-envio.ts`](scripts/verify-envio.ts) recomputes every question on the chain from its entries and outcome with the contract's rule, compares each payment with the chain and with what the indexer recorded, and checks the indexer's open records between every pair of the seed's people against the contract's own balances. It reads the app's database and the chain, so it runs with the app's environment (`npm run verify:envio`); the scoring check above needs only Foundry's `cast`, and the seal check a clone of this repository.

The contracts' source is verified on Sourcify, a full match for both: [DarefulDares](https://repo.sourcify.dev/10143/0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0) and [DarefulLedger](https://repo.sourcify.dev/10143/0x8E200d344fA233d85b78f85aC78c3F778397F26D), built with solc 0.8.28 from [`contracts/`](contracts).

## How it works

Next.js 16 (App Router, React 19) on Vercel at dareful.app; Postgres on Supabase through Drizzle; two Solidity contracts on Monad testnet (Foundry, OpenZeppelin 5's ERC-1155); Envio HyperIndex, the only thing that reads the chain; Dynamic for sign-in and two embedded wallets per person; Anthropic's models for writing terms and weighing outcomes; Web Push and email (Resend) for notifications; and one scheduler, a once-a-minute call to `/api/tick`.

The rule that splits the two halves: anything two people must agree on goes on the chain, and anything one person controls stays off it. Nobody holds a key that can move value, and the records can't be transferred, sold or redeemed; the contract refuses every transfer.

What goes on the chain, and why:

- Signed entries. A call is an EIP-712 message signed by its owner's ledger wallet over exactly the numbers they sent. At the close, one `create` carries the question's terms hash and every signed entry, and they land together or not at all.
- Each question's own voters. The contract reads the quorum from the governance wallets of exactly the people in: the question goes in its set's group when that group is exactly them, and otherwise in a group of its own registered at the close. Nobody outside a question can vote on it.
- Resolutions. A vote is a signature from the voter's governance wallet, which the server never holds, so the server can write the ledger but can never cast a vote; `resolve` checks a majority of the people in. When they don't decide, `arbitrate` records the tiebreaker's ruling, the final score or the app's ruling standing, with the ruling's hash, and `expire` ends a question nobody called, minting nothing.
- Obligations. Each person is scored (Brier for yes or no, the miss over the scale for a number, all or nothing for pick one), and the lower scorer pays the higher, pair by pair, never more than their stake. Each payment is a non-transferable ERC-1155 record (`mintFromDare`), carrying the app's own id for the row it mirrors. A cover ("I got this one") is minted when the person who owes it confirms it (`confirm`); settling and calling it even (`close`) and cancelling out (`net`) burn them.
- The sealed ruling. When an argument is asked and facts can settle it, the app rules at once and seals the ruling: the seal is keccak-256 of a random 32-byte salt followed by the ruling's text, and it ends the terms everyone signs. The terms' hash goes on the chain in `create`, so the ruling is fixed before anyone calls.

| Contract (Monad testnet, chain 10143) | Address |
| --- | --- |
| DarefulLedger: the records, sets, members and units | [0x8E200d344fA233d85b78f85aC78c3F778397F26D](https://testnet.monadvision.com/address/0x8E200d344fA233d85b78f85aC78c3F778397F26D) |
| DarefulDares: questions, entries, votes, scores | [0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0](https://testnet.monadvision.com/address/0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0) |
| The relayer, which pays gas and holds nothing else | [0x4534C3f805F1cc483C0b0193F754C16E0d2cdaA7](https://testnet.monadvision.com/address/0x4534C3f805F1cc483C0b0193F754C16E0d2cdaA7) |

One transaction from real use for each kind of event (from [`scripts/ops/real-use-txs.ts`](scripts/ops/real-use-txs.ts); a test's transaction never stands in for one):

| Event | Real use |
| --- | --- |
| A question created with its signed entries (`DareCreated`, `Entered`) | [October 9](https://testnet.monadvision.com/tx/0x36e7c05906882392a30a35b220d7598d6c763b00d13fcf1dae918a17d889dc2a) |
| A set registered (`GroupCreated`) | [October 9](https://testnet.monadvision.com/tx/0x16d5a6ada77e2062bc3781ef48535c053f74cb0d86adce34bc928f779c6b195a) |
| A unit registered (`DenomCreated`) | [October 9](https://testnet.monadvision.com/tx/0xe755e4c77bf380dcaa0dcdee1e92998ad71f84cadfd394506fbfaebc32c4bf0c) |
| Decided by the vote of the people in (`DareResolved`) | [September 26](https://testnet.monadvision.com/tx/0x903db4d37f4876cb8491410069ceaeface2b48081ba385dac12fbd02add180f5) |
| Decided by `arbitrate`, with each score and the records it minted (`DareArbitrated`, `Scored`, `mintFromDare`) | [September 28](https://testnet.monadvision.com/tx/0x0f1add16cc1a5510ca9bb3f9a9ebe75b86301c6e8d540627bc0000b2b7c41ef4) |
| Voided by `arbitrate` | [October 4](https://testnet.monadvision.com/tx/0x2623889754eb5a792042e6dc78d3520d57df2ea9a382b2b6f9bdf69e41f89cb3) |
| A record confirmed by the person who owes it (`confirm`) | [October 8](https://testnet.monadvision.com/tx/0xe04a5e06afcb3b3a2d716d6f647b9f7722e8b3c788b337444aadb9a833a154f2) |

Real use has none yet of a person added to an existing set, a void by vote, an expiry, settling or calling it even, cancelling out, or a sealed ruling (the one argument real use has on the chain was asked before rulings were sealed).

## Sponsors

### Dynamic

Every person gets two Dynamic embedded wallets on Monad, made without a word about wallets at their first sign-in (Google, email, or phone, in the app's own sheet): a ledger wallet, which signs what binds only its owner (their calls, confirming what they owe, closing what they're owed), and a governance wallet, which signs one thing, a vote, and always asks. Pass the phone, where a friend makes their call on your phone with their own PIN, delegates the ledger wallet alone through Dynamic's delegated access; the governance wallet is refused by address in the signer, by a database trigger, and marked denied at Dynamic when the account is made. Monad is registered in code ([`src/lib/dynamic/networks.ts`](src/lib/dynamic/networks.ts), [`src/components/providers.tsx`](src/components/providers.tsx)); the sheet and the wallets' creation are in [`src/components/auth/`](src/components/auth); wallets are counted from the login token on the server ([`src/lib/auth/login.ts`](src/lib/auth/login.ts)); delegated signing is [`src/lib/chain/delegated-signer.ts`](src/lib/chain/delegated-signer.ts), with its webhook at [`src/app/api/delegation/route.ts`](src/app/api/delegation/route.ts) and pass the phone in [`src/lib/ledger/pass-the-phone.ts`](src/lib/ledger/pass-the-phone.ts) and [`src/lib/ledger/hand-over.ts`](src/lib/ledger/hand-over.ts).

### Envio

HyperIndex is the only thing that reads the chain. It indexes both contracts' events into the records (with what remains open on each), sets, members, units, questions and entries, plus one entity per event, and serves a person's open records, the chain's counts and the transactions above. It syncs through HyperSync and runs on Envio Cloud, and the app's health check watches it stay within a minute of the chain's head. The indexer is [`indexer/`](indexer) (its config, schema and handlers); the app's queries, each checked with Zod, are [`src/lib/ledger/envio.ts`](src/lib/ledger/envio.ts); and [`scripts/verify-envio.ts`](scripts/verify-envio.ts) recomputes every question's payments from the scoring rule and checks them against the indexer.

### Alchemy

Alchemy's Monad testnet RPC is what the relayer sends through. Every contract call is a message signed by a person's wallet and submitted by one relayer that pays gas, with an explicit gas limit for each function, since Monad charges the declared limit. Its free tier allows `eth_getLogs` over ten blocks at a time, which is why Envio and not the app reads the chain. The app weighs every call it makes in compute units and warns its owner long before the month's allowance runs out. The key is server-only and is cut out of every error the app logs, stores or shows. See [`src/lib/chain/relayer.ts`](src/lib/chain/relayer.ts), [`src/lib/chain/gas.ts`](src/lib/chain/gas.ts), [`src/lib/ops/rpc-usage.ts`](src/lib/ops/rpc-usage.ts) and [`src/lib/redact.ts`](src/lib/redact.ts).

## The AI

- Haiku 5.5 drafts: it writes a question's terms from one line (its type, the date it's decided by, the outcomes in the question's own words, a mark if none was picked), and asks the questions under Help define the terms.
- Sonnet 5.5 weighs: it decides whether facts can settle an argument (and declines a matter of taste or one between two people, offering to make it a dare), rules on it at the ask, proposes an outcome from what people said happened, writes Help define's final terms, and answers again for any draft that fails its shape or runs out of time.
- Opus 5.5 is the tiebreaker: it rules only when the people in a question don't decide it and they agreed to a tiebreaker when they entered, and it voids unless what's in front of it clearly supports one outcome.

Every call is in [`src/lib/ai/`](src/lib/ai) behind a typed function, its answer checked with Zod, with a plain fallback, so a model is never on the critical path: it proposes, the asker approves the terms, and the people in decide. A draft that fails is asked once of Sonnet and counted. No test or audit process can call the live API; the one model call the app makes on a schedule is the health check's one-token ping, once an hour while the API answers and on every check while it doesn't. Every answer's tokens and searches are now kept, priced at the published rates, so the app knows what it has spent.

What a question costs, measured on October 9 by replaying every question counted people have written (26) on the models in use, at list prices ([`scripts/dev/compare-models.ts --part=current`](scripts/dev/compare-models.ts)): $0.0004 for a question's terms on average ($0.0005 at most), and $0.017 for an argument (the terms, the check at $0.005 and the sealed ruling at $0.011). The tiebreaker, when it runs, cost $0.010 to $0.013 a ruling on Opus 5.5 (every past ruling replayed on October 6). An outcome proposal measured about $0.004 on Sonnet 5.5 on October 4. Help define the terms with a web search adds 2 to 11 cents (measured October 8).

## Quality

[![Production watch](https://github.com/justinwender/dareful/actions/workflows/watch.yml/badge.svg)](https://github.com/justinwender/dareful/actions/workflows/watch.yml)

Every fifteen minutes and after every deploy, a GitHub workflow outside the app fetches the health check, the home page and the numbers picture, and fails when any of them doesn't answer, a core system is down, or the health answer isn't production's own.

- Production watches itself. [`/api/health`](https://dareful.app/api/health) answers every system as ok, slow or down: the database, the scheduler, the chain's node, both contracts, the relayer's gas and the indexer decide it, and the model API, email, sign-in, storage, both scoreboards, push and the two images the app draws are reported beside them. Every six hours a canary runs one real question through every system as two accounts that count for nothing, on the chain and back through the indexer, and removes it. Every resource the app could run out of has a warning line and an urgent one, and the owner gets an email and a push the moment one is crossed or a core system has been down for ten minutes, and a summary every morning.
- The suites run against the real database and the live testnet contracts: 541 unit tests, 246 database tests and 131 tests against the running server (one of them only against a deployed app), 918 in all, every one passing on October 10; two sports tests can race production's own scheduler on the shared tables, and each passed when run again. Their rows are made for a run and removed after it, and their accounts are left out of every count.
- Every test has a mutant, but the one that runs only against a deployed app: a change to the code that breaks the rule the test names, which the test has to catch. The full audit runs each one alone against the live database and contract.
- Every round was walked by hand and recorded with what broke and what changed in [`docs/testing.md`](docs/testing.md), 44 sessions in all: on the owner's phones and in signed-in development browsers, and from the QA round on also on the iOS 26 and iOS 27 simulators, in Safari, private tabs and installed copies. The checks that need a real phone are listed and numbered there.

| Audit | Date | Mutants | Result |
| --- | --- | --- | --- |
| Scoped, the ops round | October 10 | 146: 86 unit, 47 database, 13 http | 145 killed; one survived, the http copy of an edit the database test kills, which the local server can't show until this build's scheduler is running |
| Full, the submission round | October 9 | 1,682: 997 unit, 427 database, 258 http | 1,679 killed on the run. Three survived and twelve kills could not be vouched for, because their tests also failed on the unbroken code (below); with those tests fixed, all fifteen are killed |
| Scoped, the final round | October 9 | 398: 182 unit, 207 database, 9 http | 395 killed; three survived, their tests strengthened, all killed |
| Scoped, the touch-ups round | October 8 | 432: 164 unit, 262 database, 6 http | 430 killed; two survived, their tests strengthened, both killed |
| Scoped, games and the reveal | October 7 | 400: 138 unit, 229 database, 33 http | 399 killed; one survived, its test fixed, killed |
| Full, first contact's second pass | October 6 | 1,480 | 1,477 killed in the run and three run alone after the development server crashed six hours in, all killed |

The full audit ran one mutant at a time against the live contract and the production database, with its chain calls on Monad's public RPC and the local indexer so production kept its own RPC key and its indexer's queries, and spent 8.10 MON in four hours. Its closing run of every suite on the unbroken code found eight tests failing for reasons outside the product: the runner's one-process mode had left the live-API guard off (the runner now turns live calls off by name, held by a test of its own), the public RPC answers fifteen requests a second and the chain-scoring tests read faster than that (they now pace their reads), and two tests were written before this round's changes (updated). Nothing the audit did moved a number on the stats page, and every account it made is left out of every count.

## Limits

- It runs on Monad testnet. Nothing on it is worth anything, and the contracts have had no outside security review.
- A question with a guest in it is decided and settled off the chain; what it leaves goes on the chain only as each person makes an account and confirms.
- The test suites share the live contracts and the production database, so most of the contracts' transactions are tests (above), and the counts leave every test account out.
- Sign-in runs on Dynamic's sandbox environment, and delegated signing for pass the phone is a sandbox feature; production use needs Dynamic's Enterprise plan.
- The relayer alone registers people in sets. A compromised relayer could register someone who isn't real into an existing set; membership changes signed by the governance wallet are needed before mainnet. Whether Dynamic keeps each wallet's key material cryptographically apart is not proven; the server never receives the governance wallet's share.
- There's no native app: it's a web app you can add to the home screen, and on an iPhone, notifications arrive only in the added app.
- The indexer runs on Envio Cloud's free plan, which answers 100 queries a minute and keeps a deployment for 30 days; the app reads how many days this one has left and warns its owner a week ahead.

The depth: [`PLANNING.md`](PLANNING.md) is the architecture, [`docs/design.md`](docs/design.md) the design, [`docs/decisions.md`](docs/decisions.md) every decision with the alternative rejected, and [`docs/testing.md`](docs/testing.md) every round of testing. [`CLAUDE.md`](CLAUDE.md) is the working brief, and the code was written with Claude Code working from it, one approved phase at a time. MIT licensed.
