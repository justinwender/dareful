# Submission facts

For the two videos and the submission form. The videos, both unlisted:

- The demo: https://youtu.be/hXyMfEGSLRw
- The pitch: https://youtu.be/LCKwCI77st0

The README's numbers keep counting (its picture is drawn by the app as it runs); the numbers here are fixed, read from production at the moment given beside them. Nothing here names a real person but the owner.

## The numbers

Read from production at 12:21pm Eastern on October 13, 2026 (16:21 UTC), by `scripts/ops/stats-now.ts`, which runs /stats's own queries, with the chain's counts read from the indexer production reads (the October 10 deployment). Accounts, guests, questions asked, settled and played, came by a link then asked, sets with two or more questions, clean resolutions, photos and stickers, and the two channel numbers since launch come from the ledger's own tables and reach back to launch; the rest are counted from the events table, which began on October 2, when the counting shipped. The README's picture leads with questions played, its split, and the groups that came back; it keeps counting after this moment.

| Number | Since launch | Last 7 days | What it counts |
| --- | --- | --- | --- |
| Accounts | 17 | 5 | Accounts made in the window, excluded ones left out. |
| Guests | 8 | 3 | People who first joined a question in the window with a name and no account, on a question someone counted asked; a guest who has since made an account counts as that account, and excluded guests are left out. |
| Active people | 14 | 8 | Distinct accounts with any counted event in the window. |
| Askers | 5 | 5 | Distinct accounts that asked a question in the window. |
| Questions asked | 46 | 16 | Questions sent in the window by counted askers, from the ledger's own table, which holds every question since the first; a question its asker called off before anyone joined is not counted. |
| Questions settled | 15 | 3 | Questions by counted askers that ended in a decision in the window: by the vote of the people in, the tiebreaker, the final score or the app's ruling standing, "nobody can tell" included; one called off or expired is not settled. |
| Questions played | 18 | 5 | Questions asked in the window that someone besides their asker got into: two or more in, counting counted people and guests only. |
| Played, settled | 13 | 2 | Of the questions played in the window, those that have ended in a decision, as "Questions settled" counts one. |
| Played, still open | 5 | 3 | Of the questions played in the window, those that have not ended yet: open, or closed and waiting on the call. |
| Played, ended without a decision | 0 | 0 | Of the questions played in the window, those that ended with nothing decided: nobody called it in time. |
| Entries | 27 | 22 | Numbers put on questions in the window, by accounts and through pass the phone. |
| Guest entries | 8 | 6 | Numbers put on questions in the window by people with no account. |
| Reached voting | 14 | 10 | Questions closed in the window, by the asker, the time or both sides in. |
| Settled by vote | 5 | 5 | Questions the people in them decided in the window. |
| Settled by the tiebreaker | 1 | 0 | Questions the tiebreaker called in the window. |
| Settled by the final score | 3 | 1 | Questions the feed's backstop settled in the window. |
| Expired | 19 | 9 | Questions that ended with nothing decided in the window, on a question a counted person asked or is in. |
| Link opens | 90 | 69 | Links opened in the window, once per person or device per link, fetchers never; a phone with no account counts only on a question a counted person asked or is in. |
| Shares | 25 | 20 | Taps on share, copy, the result's share, the chalk and the relay in the window. |
| Notices by push | 38 | 21 | Notifications that went out by push (or by both) in the window. |
| Notices by email | 3 | 3 | Notifications that went out by email alone in the window. |
| Notices to nobody | 55 | 7 | Notifications with no channel to send on in the window. |
| Notices opened | 5 | 3 | Taps on a notification's link in the window, by channel. |
| Errors shown | 90 | 89 | Problems shown on a screen in the window, by cause. |
| People with a channel | 10 | 3 | Counted accounts a notice can reach, by a push subscription or an email sign-in: of everyone since launch, and of the people active in the window otherwise. |
| Share with a channel | 59% | 38% | People with a channel as a percent of the same people: everyone since launch, or the people active in the window. |
| Came by a link, then asked | 5 | 2 | Counted accounts whose first question was asked in the window and who were already in a question someone else asked before it: they arrived through a friend's question and went on to ask their own. |
| Sets with two or more questions (the groups that came back) | 3 | 0 | Sets of people in which two or more questions were asked in the window by counted askers; a game's questions count once, and a question called off does not count. |
| Clean resolutions | 73% | 100% | Of the counted askers' questions two or more people were in that ended in the window by a vote, the tiebreaker or the final score, the percent that ended with an answer, as the profile counts it: a void by vote or tiebreaker counts against it, and an expiry or the final score's own void is in neither number. |
| Photos and stickers added | 17 | 6 | Photos put on a question or a settlement, and stickers made, in the window by counted accounts. |

"Since launch" is from midnight Eastern on September 13, 2026, the day the build began; the first question came on the 19th. Every count leaves out the owner's test accounts, the development account, the seed's accounts, the canary's two accounts and every account and guest a test made. The daily snapshots the stats page keeps carry the same definitions: every day already taken was brought in line on October 9 (`scripts/ops/snapshot-people.ts`).

On Monad, from real use, at the same moment: 22 records, 18 questions, 12 people and 17 sets, and no question in a group of its own. These count only what counted people did: the questions on the chain with a counted account in them, and the counted accounts' own wallets, the records on either side of them and the sets they're registered in. A question with a guest in it is decided and settled off the chain and is not in them.

The test suites run against the live contracts, so most of the contracts' transactions are tests. At 16:22 UTC on October 13, 2026, 3,284 transactions had gone through: 77 real use (2.3%), 38 testing by hand on the excluded accounts (1.2%), 105 the seed script's (3.2%) and 3,064 the suites' and the audits' (93.3%), read from the indexer's events and whose wallets they name (`scripts/ops/chain-tests.ts`), and 9 more had reverted (counted from `chain_writes`, kept since September 27). On October 9, after the full audit, real use was 52 of 2,309 (2.3%).

## The contracts

Monad testnet, chain 10143. Every action a person takes on the chain is a message signed by their own wallet, which one relayer submits and pays for. The relayer's own calls are registering a set's people and units, recording a ruling (the tiebreaker's, the final score's, or the app's own standing) and an expiry. It holds nothing but gas. Both contracts' source is verified on Sourcify, a full match of the creation and runtime code (solc 0.8.28, cancun, optimizer 200 runs, via IR), checked on October 9: [DarefulLedger](https://repo.sourcify.dev/10143/0x8E200d344fA233d85b78f85aC78c3F778397F26D) and [DarefulDares](https://repo.sourcify.dev/10143/0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0). Both are verified on Monadscan too, since October 13: `forge verify-contract` through Etherscan's API, with the same settings and each contract's constructor arguments from its deployment, passed for both, so Monadscan names the function each transaction called.

The explorer links here and in the README go to Monadscan (testnet.monadscan.com), where every one was opened on October 13 and showed its transaction or address. MonadVision, where the old testnet.monadexplorer.com now redirects, answered NODE_REQUEST_ERROR with nothing loaded when the owner opened the README's two links to a question going on the chain and its settlement on October 12, though the chain has both: every transaction linked here has a receipt with status success on Monad's public RPC. Why MonadVision can't show them is not known: its bot check refuses an automated browser, so the owner's reading is the only one.

Monadscan names each transaction's function: Create puts a question on the chain with every signed call, Resolve settles it with the votes and mints its records, Arbitrate records a ruling, Confirm is a person confirming a record, and Create Group, Add Member and Create Denom register a set, a person added to a set and a unit.

The question from the demo, which the README's "Check it yourself" recomputes: it went on the chain at 9:57pm Eastern on October 12 ([0x39c3479b…](https://testnet.monadscan.com/tx/0x39c3479b5379916fe2e58bde70ff956edf4ac1a8afdf30db372bd1677689c86b), Create) with three signed calls (90% on $20, 10% and 35% on $10 each), and settled at 9:58pm ([0xf3d85015…](https://testnet.monadscan.com/tx/0xf3d85015fb4f6cf1612ceac4f3d8a938420b28c5461574aa2cd44fe51d897e23), Resolve): two votes for no, scores 1900, 9900 and 8775, and three records minted, $4, $3.43 and $0.56. Its asker and one other account are left out of every count and the third is counted, so /stats counts it as real use on the chain.

| Contract | Address |
| --- | --- |
| DarefulLedger | [0x8E200d344fA233d85b78f85aC78c3F778397F26D](https://testnet.monadscan.com/address/0x8E200d344fA233d85b78f85aC78c3F778397F26D) |
| DarefulDares | [0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0](https://testnet.monadscan.com/address/0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0) |
| Relayer | [0x4534C3f805F1cc483C0b0193F754C16E0d2cdaA7](https://testnet.monadscan.com/address/0x4534C3f805F1cc483C0b0193F754C16E0d2cdaA7) |

## One transaction from real use for each kind of event

Each was the newest from real use of its kind when read (`scripts/ops/real-use-txs.ts`), on October 9 for seven of them and on October 13 for the person added to a set and the app's ruling standing, which the October 9 list didn't have, and each was checked on the chain: status 1, sent by the relayer to the contract named. A test's transaction never stands in for one. The events in parentheses are the contracts' own names, which the indexer stores.

| Event | Monadscan's method | Transaction |
| --- | --- | --- |
| A question put on the chain with its signed calls (`DareCreated`, `Entered`) | Create | [0x36e7c059…89dc2a](https://testnet.monadscan.com/tx/0x36e7c05906882392a30a35b220d7598d6c763b00d13fcf1dae918a17d889dc2a), October 9 |
| A set registered with its people (`GroupCreated`) | Create Group | [0x16d5a6ad…c6b195a](https://testnet.monadscan.com/tx/0x16d5a6ada77e2062bc3781ef48535c053f74cb0d86adce34bc928f779c6b195a), October 9 |
| A person added to an existing set (`MemberAdded`) | Add Member | [0x35b87400…b70e49](https://testnet.monadscan.com/tx/0x35b874000acb5316e817ab3ba39dae7e8063a804bea047921ea22891e5b70e49), October 11 |
| A unit registered (`DenomCreated`) | Create Denom | [0xe755e4c7…c4bf0c](https://testnet.monadscan.com/tx/0xe755e4c77bf380dcaa0dcdee1e92998ad71f84cadfd394506fbfaebc32c4bf0c), October 9 |
| Settled by the vote of the people in, with each score and the record it minted (`DareResolved`, `Scored`, `Confirmed`) | Resolve | [0x903db4d3…dd180f5](https://testnet.monadscan.com/tx/0x903db4d37f4876cb8491410069ceaeface2b48081ba385dac12fbd02add180f5), September 26 |
| Settled by the final score, recorded by the relayer, with each score and the records it minted (`DareArbitrated`, `Scored`, `Confirmed`) | Arbitrate | [0x0f1add16…7c41ef4](https://testnet.monadscan.com/tx/0x0f1add16cc1a5510ca9bb3f9a9ebe75b86301c6e8d540627bc0000b2b7c41ef4), September 28 |
| An argument settled by the app's ruling standing, recorded by the relayer with its text's hash (`DareArbitrated`, `Scored`, `Confirmed`) | Arbitrate | [0xe00814e6…be0830](https://testnet.monadscan.com/tx/0xe00814e6ed2bf6e5e2387a41c277edbab724972df531ddeb3b8cf3dd89be0830), October 9 |
| Voided by the tiebreaker (`DareArbitrated`) | Arbitrate | [0x26238897…f89cb3](https://testnet.monadscan.com/tx/0x2623889754eb5a792042e6dc78d3520d57df2ea9a382b2b6f9bdf69e41f89cb3), October 4 |
| A record confirmed by the person who owes it (`Confirmed`) | Confirm | [0xe04a5e06…a154f2](https://testnet.monadscan.com/tx/0xe04a5e06afcb3b3a2d716d6f647b9f7722e8b3c788b337444aadb9a833a154f2), October 8 |
| Voided by the vote (`DareVoided`) | | Real use has none yet. |
| Expired (`DareExpired`) | | Real use has none yet. |
| Settled, or called even (`Closed`) | | Real use has none yet. |
| Cancelled out (`Netted`) | | Real use has none yet. |
| A sealed ruling (the seal inside the terms' hash that goes on the chain with the question) | | Real use has none yet: the three arguments real use has on the chain were asked before rulings were sealed, on October 8. |

## Where each sponsor lives in the code

Dynamic: two embedded wallets per person and the sign-in sheet in `src/components/auth/` (`wallet-bootstrap.tsx` makes the wallets, `sign-in-sheet.tsx` and `account-step.tsx` sign in on Dynamic's headless hooks, `governance-denied.ts` asks Dynamic to deny delegation to the voting wallet); Monad registered in code in `src/lib/dynamic/networks.ts` and `src/components/providers.tsx`; Dynamic's JWT verified against the environment's JWKS in `src/lib/auth/jwt.ts`, and the wallets counted from its credentials in `src/lib/auth/login.ts`, the first the everyday wallet and the second the voting wallet (`ledgerWallet` and `governanceWallet` in the code); delegated signing for pass the phone in `src/lib/chain/delegated-signer.ts`, its webhook in `src/app/api/delegation/route.ts`, and pass the phone itself in `src/lib/ledger/pass-the-phone.ts` and `src/lib/ledger/hand-over.ts`, where a right PIN joins the friend to the question's group before their own share signs (since pre-submission bug fixes 2). The figures: 17 accounts since launch, every one with both wallets (October 13); the sandbox holds 49 of its 1,000 users (production's runway reading, October 13), warned at 700 and urgent at 900; a Dareful session and Dynamic's `jwtDuration` (a dashboard setting) are both thirty days; the gate against Dynamic's sandbox passed on September 27.

Envio: the indexer in `indexer/` (`config.yaml`, `schema.graphql`, `indexer/src/handlers`, and seven handler tests in `indexer/src/indexer.test.ts`), envio 3.12.0, reading 13 kinds of event from the two contracts through HyperSync with no RPC in its config. Production has read the 81dc636 deployment on Envio Cloud since the owner switched `ENVIO_GRAPHQL_URL` on October 11 (production's own runway line on October 13: "started 2026-10-10, 27 days before the Development plan deletes it"); it caught up with the chain at 18:26 UTC on October 10 with 6,131 events, had processed 7,766 by October 13, and lasts to about November 9. The first deployment, ad29726, caught up on September 19 and is deleted around 02:19 UTC on October 19. `scripts/verify-envio.ts` against the October 10 deployment found no mismatch across 966 edges (the seed's seven people, against the contract's balances) and 660 questions (63 number questions, 79 pick-one) with their 937 minted payments (against the chain and the scoring rule). Every query the app makes is in `src/lib/ledger/envio.ts`, each parsed with Zod; the health check's lag and the runway's days left are in `src/lib/ops/health.ts` and `src/lib/ops/runway.ts`.

Alchemy: the relayer's RPC in `src/lib/chain/relayer.ts` (a simulation before every send, the nonce, the signature, the record in Postgres and the broadcast under one advisory lock, receipts polled every 400 ms and a write pending after twenty seconds, a transport that retries up to six times backing off from 1.5 seconds with 30 seconds a request), each function's explicit gas in `src/lib/chain/gas.ts` (netting measured 78k in Foundry and 128k on Monad, and the questions contract's first limits were about 2.3 times too high until measured), the balance watch in `src/lib/chain/watch.ts`, every call weighed in compute units against the month's allowance in `src/lib/ops/rpc-usage.ts`, and the key kept out of every error by `src/lib/redact.ts`. The figures: 21,650 calls for 489,802 compute units from October 9 to 16:23 UTC on October 13 (`rpc_calls`), 1.6% of the free plan's 30 million a month; production's browser code names Monad's public RPC and no Alchemy address (its scripts read on October 13).

## What the AI costs

Measured on October 9 by replaying every question counted people have written (26) on the models in use, at list prices (`scripts/dev/compare-models.ts --part=current`), since until the ops round the app stored no usage. From the ops round on, every answer's tokens and searches are kept (`ai_calls`) and priced at the published rates (`src/lib/ai/spend.ts`), and the credit left counts down from what the owner enters on /stats:

| What | Model | Cost |
| --- | --- | --- |
| A question's terms, written from one line | Haiku 5.5 | $0.0004 on average, $0.0005 at most |
| An argument's check, whether facts can settle it | Sonnet 5.5 | $0.005 |
| An argument's ruling, sealed at the ask | Sonnet 5.5 | $0.011 |
| A question, in all | | about $0.0004 |
| An argument, in all | | about $0.017 |
| The tiebreaker, only when the people in don't decide | Opus 5.5 | $0.010 to $0.013 a ruling (every past ruling, October 6) |
| An outcome proposal, when someone says what happened | Sonnet 5.5 | about $0.004 (October 4; no counted question has one yet) |
| Help define the terms, with a web search | Haiku 5.5 and Sonnet 5.5 | 2 to 11 cents more (October 8) |

## The founder, for the form

The facts of the README's "Who's building it", in the owner's own words there. By the owner's ruling (docs/decisions.md, 2026-10-09, the ops round), that README section is the one place in the repository that names him and his employers; this sheet carries its facts without the employers, and his work history is in the README alone.

- Justin Wender, a team of one: he designed Dareful, wrote the brief and the specifications it's built from, tested it with his own friend groups, and directed Claude Code through every phase. The build took a month: it began on September 13, 2026.
- Politics, Philosophy and Economics at Northeastern (summa cum laude), with a concentration in logic and game theory; finishing a master's in Economics and Data Science there. Dareful runs on a proper scoring rule, the piece of mechanism design that makes an honest number everyone's best move.
- President of NEU Blockchain, Northeastern's blockchain club.
- Won the BNB Hack: US College Edition with Credence, an onchain credit scoring algorithm (AUC 0.82 on 115,687 Venus Protocol borrowers), first place at Bentley FinTech Day with research on Uniswap's fee switch, and the Visualization and Insights track at Optimum Hacknet.
- Built a horse racing handicapper that prices races with gradient-boosted models and calibrates their probabilities, the same test Dareful puts to every call: say a number, and see how often you're right at it.

## How production watches itself

Built in the ops round, for the weeks of judging when nobody is watching it by hand.

- `/api/health` answers every system as ok, slow or down, each within its own time limit, with nothing secret in the answer, and 200 only while every core system is up (503 otherwise). Each environment keeps and reads only its own runs (production, a preview or a laptop, from `VERCEL_ENV`), and only production's reach the owner. Core: the database (`select 1`, 4 seconds), the scheduler (its last run under 3 minutes ago), the chain's node (its latest block under 2 minutes old), code at both contract addresses, the relayer over its 3 MON floor, and the hosted indexer within a minute of the chain's head. Reported beside them, deciding nothing: the model API (a one-token call, at most hourly), email (the sending domain's records), sign-in (Dynamic's read-only API), storage (a signed address for a known object), both scoreboards (today's games parse), push (the share of sends failing over the last day), and the numbers picture and a link tile drawn. The answer is shared for a minute, every run is kept in `health_runs`, the scheduler runs it every five minutes, and a core system down for ten minutes is told to the owner by email and push, once until it recovers.
- A GitHub workflow outside the app (`.github/workflows/watch.yml`) fetches the health check, the home page and the numbers picture, and fails when a core system is down, the health answer isn't production's own run, or any of the three doesn't answer. It is scheduled every fifteen minutes, which GitHub runs far less often: 21 scheduled runs from October 10 to 13, from 24 minutes to 7.7 hours apart, beside one run after each of the 9 production deploys, all 30 passing. Every six hours it is also to sign in through the app in a real browser with the Dynamic test account and open a question and a person's page; that pass is skipped until the account's two secrets (`WATCH_EMAIL`, `WATCH_CODE`) are in the repository, and it was skipped on all eight of its runs to 14:04 UTC on October 13.
- The canary, every six hours as a job of its own (`/api/canary`, by pg_cron at 17 minutes past), runs one question through every system as two accounts it signs for itself, both left out of every count: the write-up, both calls, the close onto the chain, the vote and settlement there, the indexer showing it, and its rows removed. A failed step emails the owner at once with the step and its error. Its first run, by hand from the development machine on October 9 at 22:52 UTC, passed in about ten seconds: the two accounts registered ([0x7eec1b93…](https://testnet.monadscan.com/tx/0x7eec1b93f3dc8df21432a55a84745d69a1a9c85a6aff7b4de6b1a2b774790808), [0x3acd0f0f…](https://testnet.monadscan.com/tx/0x3acd0f0f2f619e1d92a00caf9c7d44b8724447c5bc2085b5ec2b5395edd31640)), the question went on the chain with both signed calls ([0xac38b852…](https://testnet.monadscan.com/tx/0xac38b8520acf379ff58b276de35f77d3d7341be6da14ef296f9283629d6edd9e)) and settled by both votes ([0x5d643ad3…](https://testnet.monadscan.com/tx/0x5d643ad3e93dc0868b3a8be13489e96874375f76cd43842b0da6093a0e88b41a)). Then every scheduled run from October 10 at 18:17 UTC to October 13 at 12:17 UTC, twelve in a row, failed at its first step with "the account canary:a holds other keys than the mnemonic gives": `CANARY_MNEMONIC` had been pasted into Vercel's production environment with its quotes, which became part of the mnemonic and gave other keys, and each failure reached the owner by email. The owner replaced it with the bare value and redeployed at 12:15pm Eastern on October 13 (the local value gives exactly the four stored wallets), and a run of production's own canary at 16:38 UTC passed in 7.6 seconds: the write-up, both calls, the question on the chain ([0x3864f58b…](https://testnet.monadscan.com/tx/0x3864f58b2e569b523577e4f5e7a463de30c825550b78159035caf67631a0e731)) and settled ([0xa289ea86…](https://testnet.monadscan.com/tx/0xa289ea86cb9f96cadde2cb95f2041db8af27b7715b0e7d3e57bbb0ace1076ce9)), the hosted indexer showing it settled, and its rows removed.
- Every resource the app can run out of has a warning line and an urgent one, kept in `src/lib/ops/lines.ts`: the relayer under 10 and 5 MON (or under three days at the past week's rate); the model API's credit under $5 and $2 (or any answer saying the balance is too low); the database and storage at 70% and 90% of the free plan's 500 MB and 1 GB; email at 70 and 90 a day or 2,100 and 2,700 a month; Alchemy's compute units at 70% and 90% of 30 million a month (or a refusal); the hosted indexer at 7 and 3 days left of its 30 (or a refusal); Dynamic's sandbox at 700 and 900 of its 1,000 users, past which nobody new can sign in until test accounts are deleted. Each line is told once when crossed, by email and a push to the owner's phone, and again only after it recovers and crosses again.
- At 8am Eastern the scheduler emails the owner the last day: every level against its lines, Vercel's Active CPU and Supabase's egress to check by hand with their links, each system's state with every failure and when, the canary's runs, the model API's cost, the errors people saw by cause, and yesterday's numbers.

## The rounds

Built is the commit's date; deployed is when Vercel put it in production, Eastern time.

| Round | Commit | Built | Deployed |
| --- | --- | --- | --- |
| Pre-submission docs changes: the wording settled for the form, today's numbers and production's state, the canary's setting, and every document in line with the others | this commit | October 13 | not yet deployed |
| Pre-submission bug fixes 4: the two videos' links, the criteria without weights, the sticker in its screenshots, the explorer links on Monadscan, and the demo's question to check | `e5eb0da` | October 13 | October 13, 7:52am, and again at 12:15pm with the canary's setting |
| Pre-submission bug fixes 3: the 54 mutants bug fixes 2 left, the sports tests on their own clock, the README for submission (the demo, a notice arriving, a sticker from a photo) | `32ff760` | October 12 | October 12, 9:43pm, and again at 10:28pm with the model API's new key |
| Pre-submission bug fixes 2: pass the phone lets a friend in (a right PIN joins them to the question's group before anything is signed; it had refused every friend on a question asked without naming anyone since October 7), the PIN's wait, why nobody can be picked, a guest's seat at sign-up | `590823d` | October 12 | October 12, 7:24pm |
| Pre-submission bug fixes 1: a new account's first screens, every screen's tips in one run, email that sends, a pool that never stalls, cents, test sign-ins left out, the indexer's redeploy | `584d051` | October 10 and 11 | October 11, 11:25am |
| The ops round: runway, health, the outside watch, the canary, the morning email, a market's result never a cover, a margin question past four that no longer crashes, and the README for judging | `49dd454` | October 9 and 10 | October 10, 10:22am |
| The submission round: a code like its link, pass the phone for the asker, a market's tips in one run, the numbers in public, keys out of every error | `63e7499` | October 9 | October 9, 4:14pm |
| The final round: the field above the keyboard, tips that show, every link, a game's photos, units of your own, marks, silence only where signed | `206d3f1` | October 9 | October 9, 7:56am |
| The touch-ups round: the close first, the app's rulings sealed at the ask, every tap, one sheet | `9bbafe8` | October 8 | October 8, 8:53pm |
| Games and the reveal: signed questions on the chain, calls are in, the reveal, the live score | `961a48a` | October 7 | October 7, 10:45pm |
| First contact, second pass: the name you typed, Google first, only the people in decide | `fdac1cf` | October 7 | October 7, 5:55pm |
| First contact: joining, asking, the sheets, voting, Google | `a05fb63` | October 5 | October 5, 7:05pm |
| The field round, parts 0 to 3: counting, the owner's findings, the sheet, /stats | `e91514f`, `87e1db6`, `d34f2a4` | October 2 and 3 | October 3, 7:42pm |
| The QA round | `9abd717` | September 30 | September 30, 7:57am |
| The logo round | `2137591` | September 29 | September 29, 5:37pm |
| Round D, how it feels | `9b8f472` | September 28 | September 28, 11:09pm |
| Round C, and its part 2 | `c12ff68`, `75a3ff2` | September 28 | September 28, 8:32pm and 9:26pm |
| Round B, parts 2 and 3: pass the phone and handing it over | `c550c02`, `9478fe1` | September 28 | September 28, 8:58am and 7:16pm |
| Round A and Round B, part 0 | `5048f06`, `969e196` | September 27 | September 27, 9:36pm and 10:59pm |
| Polish, parts one and two | `bc05571`, `f14b2f8` | September 27 | September 27, 5:43pm and 6:55pm |
| Delegation's gate, and the front door: entering without an account | `17b56bb` to `eae9327` | September 27 | September 27, 11:18am to 4:14pm |
| What's on and the game page | `f1f5f5a` | September 26 | September 26, 9:49pm |
| Public markets, and the photo while a question is open | `82ebea2`, `c20f746` | September 26 | September 26, 5:56pm |
| Pick one | `9b03d3e` | September 26 | September 26, 3:19pm |
| Photos, and the media phase | `36bc0c9`, `1a21186` | September 26 | September 26, 11:25am and 2:09pm |
| Phase 5: number markets, refresh, the mark picker | `7affc8f` | September 25 | September 25, 5:18pm |
| Lifecycle: settling, calling it even, cancelling out | `3155e2a` | September 25 | September 25, 2:41pm |
| The design's second version, in two halves | `fcf7cc8`, `eaf38c2` | September 25 | September 25, 9:52am and 11:53am |
| Phase 2C: arguments, the settler, the scheduler | `2c2d3d8` | September 24 | September 24, 5:36pm |
| Phase 2B: room codes, event-first home, the vote | `5b2a666` | September 19 | September 19, 5:50pm |
| Phase 2A: markets | `f1dc4c0` | September 19 | September 19, 12:35pm |
| Phase 1: accounts, groups, covers, guests and claims | `46c358f`, `d246268` | September 17 and 18 | September 18, 7:43pm and 9:35pm |
| Phase 0: the contracts, the schema, the indexer | `5878c30` | September 17 | Its own build failed on Vercel; it went out with Phase 1, September 18, 7:43pm |

## Five moments that demo best

1. Asking in one line. Screen: the ask flow's terms step. On Now tap "Ask something", type "Will Maya finish the crossword before the train gets in?", keep Quick setup, tap "Set the terms": the terms arrive as they're written, with a mark suggested and "Tonight" picked from the date in them; tap "Send it".
2. Joining from a link with just a name. Screen: the question's link on a friend's phone. Send the link from the who's-in row; on the other phone slide to a number, tap "I'm in at", type a name, tap "Join as", then "Not now". No account, no app to install.
3. The reveal. Screen: the question after it closes. With two or more in, tap "Close it with" (or "Calls are in" from someone else in): "Who said what" shows every call in its owner's colour, where until the close nobody could see whose was whose.
4. The app's sealed ruling. Screen: an argument once both sides are in. Ask "Is a major league pitch harder to hit than a penalty kick is to save?" as Settle an argument and pick the success-rate reading when the app asks which one is meant; it closes the moment both sides have called, and shows the app's ruling with its reasons, "Agree", "I see it differently", and "How to check it", which shows the seal from the signed terms, the salt and the text, so anyone can hash them and check.
5. Settled, and on the chain. Screen: the settled question, then the explorer. Both vote what happened ("It's happened", then "Say it"), the question shows closest first and who's got who, add a photo, then open DarefulDares on Monadscan: its newest transactions are Create, the question going on the chain with both signed calls, and Resolve, its settlement with both votes, which mints the record on DarefulLedger.
