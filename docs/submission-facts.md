# Submission facts

For the two videos and the submission form. The README's numbers keep counting (its picture is drawn by the app as it runs); the numbers here are fixed, read from production at the moment given beside them. Nothing here names a real person or a real question.

## The numbers

Read from production at 3:17pm Eastern on October 9, 2026 (19:17 UTC), after this round's sweeps and the mutation audit, by `scripts/ops/stats-now.ts`, which runs /stats's own queries. Accounts, guests, questions asked and settled, questions with two or more in, came by a link then asked, sets with two or more questions, clean resolutions, photos and stickers, and the two channel numbers since launch come from the ledger's own tables and reach back to launch; the rest are counted from the events table, which began on October 2, when the counting shipped.

| Number | Since launch | Last 7 days | What it counts |
| --- | --- | --- | --- |
| Accounts | 15 | 5 | Accounts made in the window, excluded ones left out. |
| Guests | 9 | 5 | People who first joined a question in the window with a name and no account, on a question someone counted asked; a guest who has since made an account counts as that account, and excluded guests are left out. |
| Active people | 12 | 12 | Distinct accounts with any counted event in the window. |
| Askers | 4 | 4 | Distinct accounts that asked a question in the window. |
| Questions asked | 54 | 26 | Questions sent in the window by counted askers, from the ledger's own table, which holds every question since the first. |
| Questions settled | 13 | 4 | Questions by counted askers that ended in a decision in the window: by the vote of the people in, the tiebreaker, the final score or the app's ruling standing, "nobody can tell" included; one called off or expired is not settled. |
| Questions with two or more in | 17 | 6 | Questions asked in the window that reached two entries. |
| Entries | 17 | 17 | Numbers put on questions in the window, by accounts and through pass the phone. |
| Guest entries | 8 | 8 | Numbers put on questions in the window by people with no account. |
| Reached voting | 12 | 12 | Questions closed in the window, by the asker, the time or both sides in. |
| Settled by vote | 0 | 0 | Questions the people in them decided in the window. |
| Settled by the tiebreaker | 1 | 1 | Questions the tiebreaker called in the window. |
| Settled by the final score | 3 | 3 | Questions the feed's backstop settled in the window. |
| Expired | 28 | 28 | Questions that ended with nothing decided in the window. |
| Link opens | 74 | 73 | Links opened in the window, once per person or device per link, fetchers never. |
| Shares | 15 | 15 | Taps on share, copy, the result's share, the chalk and the relay in the window. |
| Notices by push | 25 | 25 | Notifications that went out by push (or by both) in the window. |
| Notices by email | 0 | 0 | Notifications that went out by email alone in the window. |
| Notices to nobody | 51 | 51 | Notifications with no channel to send on in the window. |
| Notices opened | 2 | 2 | Taps on a notification's link in the window, by channel. |
| Errors shown | 65 | 65 | Problems shown on a screen in the window, by cause. |
| People with a channel | 9 | 7 | Counted accounts a notice can reach, by a push subscription or an email sign-in: of everyone since launch, and of the people active in the window otherwise. |
| Share with a channel | 60% | 58% | People with a channel as a percent of the same people: everyone since launch, or the people active in the window. |
| Came by a link, then asked | 5 | 2 | Counted accounts whose first question was asked in the window and who were already in a question someone else asked before it: they arrived through a friend's question and went on to ask their own. |
| Sets with two or more questions | 3 | 0 | Sets of people in which two or more questions were asked in the window by counted askers; a game's questions count once, and a question called off does not count. |
| Clean resolutions | 69% | 75% | Of the counted askers' questions two or more people were in that ended in the window by a vote, the tiebreaker or the final score, the percent that ended with an answer, as the profile counts it: a void by vote or tiebreaker counts against it, and an expiry or the final score's own void is in neither number. |
| Photos and stickers added | 11 | 0 | Photos put on a question or a settlement, and stickers made, in the window by counted accounts. |

"Since launch" is from midnight Eastern on September 13, 2026, the day the build began; the first question came on the 19th. Every count leaves out the owner's test accounts, the development account, the seed's accounts and every account and guest a test made.

On Monad, from real use, at the same moment: 10 obligations, 12 questions, 10 people and 12 sets, and no question in a group of its own. These count only what counted people did: the questions on the chain with a counted account in them, and the counted accounts' own wallets, the obligations on either side of them and the sets they're registered in. A question with a guest in it is decided and settled off the chain and is not in them.

The test suites run against the live contracts, so most of the contracts' transactions are tests. On October 9, 2026, after the audit (19:17 UTC), 2,309 transactions had gone through: 52 real use (2.3%), 34 testing by hand on the excluded accounts (1.5%), 105 the seed script's (4.5%) and 2,118 the suites' and the audits' (91.7%), read from the indexer's events and whose wallets they name (`scripts/ops/chain-tests.ts`).

## The contracts

Monad testnet, chain 10143. The relayer only submits what people's wallets signed, and pays the gas; it holds nothing else.

| Contract | Address |
| --- | --- |
| DarefulLedger | [0x8E200d344fA233d85b78f85aC78c3F778397F26D](https://testnet.monadexplorer.com/address/0x8E200d344fA233d85b78f85aC78c3F778397F26D) |
| DarefulDares | [0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0](https://testnet.monadexplorer.com/address/0xd621c7770B96d2bF94638a28A15B3636cC0a3Fa0) |
| Relayer | [0x4534C3f805F1cc483C0b0193F754C16E0d2cdaA7](https://testnet.monadexplorer.com/address/0x4534C3f805F1cc483C0b0193F754C16E0d2cdaA7) |

## One transaction from real use for each kind of event

Each is the newest from real use when read on October 9 (`scripts/ops/real-use-txs.ts`), and each was checked on the chain: status 1, sent by the relayer to the contract named. A test's transaction never stands in for one.

| Event | Transaction |
| --- | --- |
| A question created with its signed entries (`DareCreated`, `Entered`) | [0x36e7c059…89dc2a](https://testnet.monadexplorer.com/tx/0x36e7c05906882392a30a35b220d7598d6c763b00d13fcf1dae918a17d889dc2a), October 9 |
| A set registered (`GroupCreated`) | [0x16d5a6ad…c6b195a](https://testnet.monadexplorer.com/tx/0x16d5a6ada77e2062bc3781ef48535c053f74cb0d86adce34bc928f779c6b195a), October 9 |
| A unit registered (`DenomCreated`) | [0xe755e4c7…c4bf0c](https://testnet.monadexplorer.com/tx/0xe755e4c77bf380dcaa0dcdee1e92998ad71f84cadfd394506fbfaebc32c4bf0c), October 9 |
| Decided by the vote of the people in (`DareResolved`) | [0x903db4d3…dd180f5](https://testnet.monadexplorer.com/tx/0x903db4d37f4876cb8491410069ceaeface2b48081ba385dac12fbd02add180f5), September 26 |
| Decided by `arbitrate`, with each score and the records it minted (`DareArbitrated`, `Scored`, `mintFromDare`) | [0x0f1add16…7c41ef4](https://testnet.monadexplorer.com/tx/0x0f1add16cc1a5510ca9bb3f9a9ebe75b86301c6e8d540627bc0000b2b7c41ef4), September 28 |
| Voided by `arbitrate` | [0x26238897…f89cb3](https://testnet.monadexplorer.com/tx/0x2623889754eb5a792042e6dc78d3520d57df2ea9a382b2b6f9bdf69e41f89cb3), October 4 |
| A record confirmed by the person who owes it (`confirm`) | [0xe04a5e06…a154f2](https://testnet.monadexplorer.com/tx/0xe04a5e06afcb3b3a2d716d6f647b9f7722e8b3c788b337444aadb9a833a154f2), October 8 |
| A person added to an existing set (`MemberAdded`) | Real use has none yet. |
| Voided by the vote (`DareVoided`) | Real use has none yet. |
| Expired (`DareExpired`) | Real use has none yet. |
| Settled, or called even (`Closed`) | Real use has none yet. |
| Cancelled out (`Netted`) | Real use has none yet. |
| A sealed ruling (the seal inside the terms' hash in `create`) | Real use has none yet: the one argument real use has on the chain was asked before rulings were sealed. |

## Where each sponsor lives in the code

Dynamic: two embedded wallets per person and the sign-in sheet in `src/components/auth/` (`wallet-bootstrap.tsx` makes the wallets, `sign-in-sheet.tsx` and `account-step.tsx` sign in, `governance-denied.ts` marks the governance wallet denied for delegation); Monad registered in code in `src/lib/dynamic/networks.ts` and `src/components/providers.tsx`; wallets counted from the login token in `src/lib/auth/login.ts`; delegated signing for pass the phone in `src/lib/chain/delegated-signer.ts`, its webhook in `src/app/api/delegation/route.ts`, and pass the phone itself in `src/lib/ledger/pass-the-phone.ts` and `src/lib/ledger/hand-over.ts`.

Envio: the indexer in `indexer/` (`config.yaml`, `schema.graphql`, `src/handlers`), hosted on Envio Cloud (deployment `ad29726`; up and four blocks behind the chain's head on October 9); every query the app makes in `src/lib/ledger/envio.ts`; the check of every question's payments against the chain in `scripts/verify-envio.ts`.

Alchemy: the relayer's RPC in `src/lib/chain/relayer.ts`, with each function's explicit gas in `src/lib/chain/gas.ts`, the balance watch in `src/lib/chain/watch.ts`, and the key kept out of every error by `src/lib/redact.ts`.

## What the AI costs

Measured on October 9 by replaying every question counted people have written (26) on the models in use, at list prices (`scripts/dev/compare-models.ts --part=current`), since the app stores no usage:

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

## The rounds

Built is the commit's date; deployed is when Vercel put it in production, Eastern time.

| Round | Commit | Built | Deployed |
| --- | --- | --- | --- |
| The submission round: a code like its link, pass the phone for the asker, a market's tips in one run, the numbers in public, keys out of every error | this commit | October 9 | not yet deployed |
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
4. The app's sealed ruling. Screen: an argument once both sides are in. Ask "Is the Golden Gate Bridge longer than the Brooklyn Bridge?" as Settle an argument; it closes the moment both sides have called, and shows "The app's ruling: yes." with its reasons, "Agree", "I see it differently", and "How to check it", which shows the seal from the signed terms, the salt and the text, so anyone can hash them and check.
5. Settled, and on the chain. Screen: the settled question, then the explorer. Both vote what happened ("It's happened", then "Say it"), the question shows closest first and who's got who, add a photo from that night, then open the Dares contract on the explorer: the newest transactions are its `create` with both signed entries and its `resolve` with both votes, and the record minted on the Ledger.
