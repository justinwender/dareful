# Decisions

Every architectural decision, with the date and the alternative rejected. Appended as decisions are made, not at the end of a phase. Newest at the bottom.

Format: what was decided, the alternative rejected, why. Where a decision fills a gap in `PLANNING.md` rather than following it, the entry says so, because those are the ones to review.

## 2026-09-16: Repository layout as proposed

Decision: the layout in the Phase 0 brief. Root is the Next.js app; `/contracts` is a Foundry project; `/indexer` is an Envio project with its own `package.json`; `/docs`, `/scripts`, `/src/db`, `/src/lib/chain`, `/src/lib/ai` as listed. The root `tsconfig.json` and ESLint config exclude `contracts/` and `indexer/`.

Alternative rejected: a package-manager workspace (`apps/web`, `packages/contracts`, `packages/indexer`). The three toolchains (npm for Next, Foundry for contracts, Envio's own codegen for the indexer) share no dependencies, so a workspace adds configuration and a level of nesting for nothing at this size.

## 2026-09-16: Foundry dependencies as git submodules under `contracts/lib`

Decision: `forge install` with submodules. forge-std v1.16.2 and OpenZeppelin Contracts v5.7.0, pinned by commit in `.gitmodules` and `contracts/foundry.lock`. Clone with `git clone --recurse-submodules` or run `git submodule update --init` after cloning.

Alternative rejected: Soldeer or an npm-installed OpenZeppelin with remappings. Submodules are the path every Foundry reader expects and what the hackathon reviewer will know how to build.

## 2026-09-16: Solidity 0.8.28

Decision: `solc_version = "0.8.28"` in `contracts/foundry.toml`. The EVM target is recorded in the next entry once confirmed against Monad's documented opcode support.

Alternative rejected: floating `^0.8.20`. A pinned compiler makes the deployed bytecode reproducible for verification.

## 2026-09-16: Container runtime for the Envio local run

Decision: Envio's local development stack (`envio dev`) needs Docker for its Postgres and Hasura containers. The machine had no container runtime, so the Docker CLI and Colima were installed through Homebrew (`brew install colima docker docker-compose`, then `colima start`). This is a development-environment fact, not product architecture, and it is recorded here because it is the one prerequisite a fresh clone will hit.

Alternative rejected: Docker Desktop. It requires a GUI installer and a privileged helper, and Colima gives the same Docker socket from the command line. Any Docker-compatible runtime works; nothing in the repository depends on Colima.

## 2026-09-16: Three environment variables added beyond the original `.env.local`

Decision: `MONAD_CHAIN_ID` (chain id from environment, never hardcoded, per the conventions), `ENVIO_GRAPHQL_URL` (where the server reads chain state from), and `SEED_MNEMONIC` (the BIP-39 mnemonic the seed script derives its test users' wallets from, so a re-run reproduces the same addresses and the same offchain rows). All three are blank in `.env.example`.

Alternative rejected for `SEED_MNEMONIC`: random wallets generated on each run. Seed users must sign EIP-712 messages (confirm, close, net, enter), so the seed needs private keys, and random keys would make the seed non-idempotent and leave orphaned onchain groups behind on every run. A mnemonic committed to the repository was also rejected: even a test mnemonic in a public repo invites copy-paste reuse.

## 2026-09-16: EVM target `cancun`, `via_ir` on

Decision: `evm_version = "cancun"`, `via_ir = true`, optimizer on at 200 runs. Monad's deployment summary states that all opcodes as of the Fusaka fork are supported, so Cancun-era opcodes (`PUSH0`, `MCOPY`, transient storage) are safe. `via_ir` is required because `confirmMany` takes six calldata arrays plus a signature, which exceeds the legacy pipeline's stack even after splitting the hashing and minting into helpers.

Alternative rejected: changing the `confirmMany` signature to a struct array. PLANNING.md 5a specifies parallel arrays, and the array form is what the batch EIP-712 message signs over.

## 2026-09-16: Registration of groups, members, and denominations is relayer-only (fills a gap)

Decision: `createGroup`, `addMember`, `createDenom`, and `setDares` on `DarefulLedger` are callable only by the relayer address fixed at deployment. PLANNING.md specifies the events and the `Member` struct but not who writes them. Membership determines the quorum of every market in the group, so it cannot be open.

Alternative rejected: requiring the new member's own signature to join. A ledger-wallet signature adds nothing once delegation exists (the server holds the delegated share and could sign the join itself), and a governance-wallet signature would violate the rule that the governance wallet signs exactly one kind of message. Residual risk, recorded for the mainnet review: a compromised server could register fresh attacker-controlled members into a group and inflate future quorums. It cannot re-pair an existing member's ledger wallet with a foreign governance wallet (next entry), and every registration is an onchain event the group can see.

## 2026-09-16: A ledger wallet is paired with one governance wallet for life, contract-wide

Decision: the ledger records `governanceOfLedger[ledger]` on a wallet's first registration and rejects any later registration of that ledger wallet with a different governance wallet, in any group. This is the onchain half of "two wallets per user": the pairing is a fact about the person, not about the group.

Alternative rejected: per-group pairing only. It would let the server register a known ledger wallet alongside an attacker's governance wallet in a new group, which is exactly the substitution the quorum rule exists to prevent.

## 2026-09-16: Signed ledger mutations may be submitted by anyone; the signature is the authorization

Decision: `confirm`, `confirmMany`, `close`, and `net` have no caller restriction. Each verifies an EIP-712 signature from the acting wallet and consumes a replay guard. PLANNING.md says these go "via relayer" because the relayer pays gas; it restricts only `arbitrate` to the relayer, and `resolve` and `expire` to anyone, and the ledger follows the same pattern.

Alternative rejected: an `onlyRelayer` modifier on every mutation. It would make a lost relayer key freeze every user's ability to act on their own obligations, which contradicts "obligations live in the contract, not in the server's ability to sign."

## 2026-09-16: Replay protection is scoped to the object, not the account (fills a gap)

Decision: `Confirm` and `ConfirmMany` are protected by the obligation id itself (each id mints once). `Close` carries a nonce equal to the number of prior closes on that obligation. `Net` carries a nonce equal to the number of prior nets on that (group, denomination, unordered pair). `Create` is protected by the dare id. `Enter` is bound to the dare id and one position per wallet. `Vote` is bound to the dare id and the market resolves once.

Alternative rejected: a global per-account nonce. It would serialize a user's independent actions (closing two obligations at once would require ordered signing) and complicate the delegated signer for no security gain.

## 2026-09-16: Per-obligation accounting on the ledger (extends the spec under Principle 9)

Decision: the ledger records, per obligation id, the token id, the creditor, the quantity minted, and the quantity closed. `close` requires the token id to match the obligation, the signer to be that obligation's creditor, and the cumulative closes not to exceed what was minted. The ERC-1155 balance remains the hard bound. Netting reduces balances without attributing the reduction to obligations; the indexer allocates it (see the Envio entry).

Alternative rejected: balances only. A close signed against the wrong token id, by the wrong creditor, or for more than the obligation would then fail only if the balance happened to be short, which is the silent-error class Principle 9 forbids.

## 2026-09-16: `confirmMany` groups by creditor and mints one batch per creditor

Decision: one signature covers the whole batch; the contract registers every obligation, then issues one `_mintBatch` per distinct creditor with that creditor's obligation ids ABI-encoded in `data`. The whole call reverts if any element fails.

Alternative rejected: one `_mint` per element. PLANNING.md specifies `_mintBatch`, and the claim moment ("confirm all") commonly spans several creditors, which a single `_mintBatch` cannot address.

## 2026-09-16: `mintFromDare` mints fungible edges; unique obligations are never created by markets

Decision: settled edges use the fungible token id and `unique = false`. Unique ids exist for one-off indivisible favors created through `confirm`.

Alternative rejected: unique per-edge tokens. They would defeat netting, which is how tangles from several markets collapse.

## 2026-09-16: Edge obligation ids are derived, not supplied (fills a gap)

Decision: an edge minted by a market carries `obligationId = bytes16(keccak256(abi.encode(dareId, debtor, creditor)))`, exposed as `edgeObligationId`. The server writes the `obligations` shadow row under the same 128-bit id, which a Postgres `uuid` column stores without complaint. Deterministic, needs no calldata, and anyone can call `resolve`.

Alternative rejected: passing an array of ids into `resolve`. It would make an "anyone" call depend on server-generated ids and open a mismatch between the ids submitted and the rows written.

## 2026-09-16: `threshold` is computed in the contract, never read from calldata (fills a gap)

Decision: `create` sets `threshold = floor(quorum.length / 2) + 1` and ignores `d.threshold`, `d.quorum`, `d.status`, and `d.outcome`. PLANNING.md calls this value a "default", which could be read as overridable; a caller-supplied threshold of one would let a creator resolve alone, so it is treated the same way as the quorum.

Alternative rejected: accepting a caller threshold at or above the majority. Not in the spec, and a second attack surface for the same rule. Revisit if unanimity markets are ever wanted.

## 2026-09-16: Markets need at least two positions; stakes are capped at `uint128`

Decision: `create` reverts with fewer than two positions (the payout divides by `N - 1`). Stakes above `2^128 - 1` are rejected so every product in the settlement arithmetic stays far inside `int256`.

Alternative rejected: allowing a one-position market. Nothing can be scored against nothing, and a market with one entrant is a proposal, not a market.

## 2026-09-16: Rounding is half away from zero, per transfer

Decision: each pairwise transfer is `round(min(s_i, s_j) x (S_i - S_j) / ((N - 1) x 10000))` with ties rounded away from zero. This is the only nearest-integer rule under which `round(-x) == -round(x)` holds exactly, which is what makes the market sum to zero after rounding with no residual.

Alternative rejected: round half up or banker's rounding, both of which break antisymmetry for negative values. Also noted, not adopted: truncation toward zero would additionally guarantee `|net_i| <= s_i` after rounding, at the cost of dropping sub-unit transfers entirely; under the specified nearest rounding, a stake of `s` units can lose up to `floor((N - 1) / 2)` units more than `s` when every transfer lands on a half. Invisible in cents, visible for a two-beer stake in a four-person market. Flagged at the Phase 0 checkpoint for a product decision.

## 2026-09-16: The worked example in PLANNING.md 8c has a rounding inconsistency

Decision: the contract implements the stated rule (round each transfer independently), under which the section 8c table gives nets of -160, +909, +163, -912 cents, summing to zero. The table prints Gabe at +$9.08, which is the unrounded net (908.33) rounded once at the end; the four printed figures sum to -$0.01, not $0.00. The test asserts +909. The document should be corrected to +$9.09.

## 2026-09-16: Categorical spread drops the integer remainder

Decision: the non-picked options each receive `(10000 - confidenceBps) / (options - 1)` in integer division; the remainder (at most `options - 2` basis points) is dropped, so the distribution can sum to slightly under 10000. The score error is below one basis point.

Alternative rejected: assigning the remainder to one option, which introduces an arbitrary asymmetry between options that should be treated identically.

## 2026-09-16: Unquantifiable ties mint nothing and the market still resolves

Decision: for an unquantifiable denomination the market collapses to one edge from the lowest scorer to the highest. If the highest score is shared or the lowest score is shared, no edge mints. The status is `Resolved` with the outcome recorded; the void toll does not apply.

Alternative rejected: setting `Voided`. The toll is for badly written markets; a tie is a fine market with no loser.

## 2026-09-16: Duplicate vote signatures count once

Decision: `resolve` deduplicates signers and counts distinct governance wallets against the threshold. A signature from an address outside the quorum reverts the call.

Alternative rejected: reverting on a duplicate. PLANNING.md says "deduplicates by signer"; a duplicate is a harmless resubmission, whereas an outside signer is a bug or an attack and should fail loudly.

## 2026-09-16: `arbitrate` with `voided = true` records the ruling hash and whatever outcome was passed

Decision: the emitted outcome on a voided arbitration is the caller's value (the server passes `VOID` by convention); the contract stores no outcome and mints nothing. `rulingHash` is required nonzero in both branches.

## 2026-09-16: One `setDares` call, immutable relayer, ECDSA only

Decision: the ledger and the dares contract reference each other, so the ledger is deployed first and `setDares` is called once by the relayer at deployment; a second call reverts. The relayer address is immutable in both contracts. Signatures are verified with ECDSA only (Dynamic embedded wallets are EOAs), so there is no ERC-1271 path.

Alternatives rejected: a rotatable relayer (a compromised relayer key would rotate itself first; a redeploy is the honest response, and mainnet is a redeploy anyway), and ERC-1271 support (no smart-contract wallets exist in this product).

## 2026-09-16: No onchain member removal

Decision: `DarefulLedger` has no `removeMember`. Leaving a group is `group_members.left_at` offchain; obligations survive and the person remains a registered member of the group onchain so their edges can still be closed and netted.

Alternative rejected: onchain removal. It would either orphan existing edges (the membership check on `close` and `net` would fail) or need an exception path that reintroduces the same member for those calls.

## 2026-09-16: Database invariants beyond the written check constraints (extends the spec under Principle 9)

Decision: in addition to every check constraint written in PLANNING.md 5b, the migration adds text-enumeration checks on every column the document annotates with a fixed vocabulary (`origin`, `status`, `kind`, `pace`, `stalemate`, `reveal_mode`, `resolved_by`, `template`, `source`), non-negativity checks on every cents column, positivity on `quantity` and `stake`, basis-point ranges on `confidence_bps`, `ai_confidence_bps`, and `score`, a six-character unambiguous-alphabet check on `room_codes.code`, `from_user <> to_user` on `obligations`, and a share fraction check on `item_claims`.

Alternative rejected: Postgres enums. Adding a value to an enum is an awkward migration and Drizzle's text-plus-check produces the same guarantee with a plain `alter table`.

## 2026-09-16: "quantity is null iff unquantifiable" is a trigger, not a check

Decision: the rule crosses tables (`obligation_proposals.quantity` against `denominations.quantifiable`), and Postgres does not allow subqueries in check constraints, so it is a `before insert or update` trigger on `obligation_proposals` and `obligations`, using the same reasoning PLANNING.md gives for the `delegations` trigger. A companion trigger makes `denominations.quantifiable` immutable so the invariant cannot be broken retroactively.

Alternative rejected: denormalizing `quantifiable` onto the obligation tables so a plain check could express it. That adds a column the spec does not have and a second copy of a fact that must never disagree with the first.

## 2026-09-16: The `delegations` trigger fires on update as well as insert

Decision: PLANNING.md specifies `before insert`. The trigger fires `before insert or update of wallet_address, user_id`, so a row cannot be edited into a governance wallet after the fact. Belt and braces on belt and braces.

## 2026-09-16: Migrations are applied through Supabase, and Drizzle only generates them

Decision: `drizzle-kit generate` produces the SQL and snapshots in `src/db/migrations`, which are committed and never edited after being applied. Application is through the Supabase migration API (the MCP `apply_migration` tool, or `supabase db push`), so Supabase's `supabase_migrations` history is the single record of what has run against the database. The `drizzle-kit migrate` command is not used and its journal table does not exist in the database.

Alternative rejected: `drizzle-kit migrate` over `DATABASE_URL`. It would keep a second, private history that Supabase's advisors and dashboard cannot see, and the session-pooler string is the only path it could use, which the Phase 0 brief reserved for exactly this kind of migration anyway. Either works; two histories do not.

## 2026-09-16: Foundry `broadcast/` is committed, `out/` and `cache/` are not

Decision: `contracts/broadcast/**/run-latest.json` and the run logs are committed (minus `dry-run/`). They are the deployment record the submission needs (contract addresses, deploy block, transaction hashes) and contain no secrets. Build output and cache are ignored.

## 2026-09-16: Gas limits are sized from the Foundry gas report with about a third of headroom

Decision: `src/lib/chain/gas.ts` holds one explicit limit per function, and a formula for the functions whose cost scales with an array (`createGroup`, `confirmMany`, `create`, `resolve`, `arbitrate`). Figures are the maximum observed in `forge test --gas-report` plus roughly 30 to 40 percent. Monad charges the declared limit, so headroom is a real cost and the table is re-measured whenever a contract changes.

Alternative rejected: `estimateGas` at submission time. Forbidden by the conventions, and an estimate on a chain that charges the limit would still need a margin.

## 2026-09-16: The relayer simulates before it submits

Decision: `submit()` in `src/lib/chain/relayer.ts` runs `eth_call` (viem `simulateContract`) with the relayer as sender before sending, then sends with the explicit gas limit, waits for the receipt, and throws if the status is not success. A revert is caught before the declared gas is charged, and a chain write that fails cannot fail silently.

Alternative rejected: send and hope. On a chain that charges the declared limit, a reverting transaction costs the full limit.

## 2026-09-16: The indexer syncs from the Alchemy RPC, not HyperSync, for now

Decision: `indexer/config.yaml` points the chain's `rpc` at `MONAD_RPC_URL` for sync. Envio's HyperSync endpoint for Monad testnet exists and would be faster, but `envio init` and HyperSync require an Envio API token that has not been created yet (the account exists, nothing is configured). The start block is the deployment block, so an RPC backfill is small. Switch to HyperSync once `ENVIO_API_TOKEN` exists; it is a config change only.

Alternative rejected: blocking Phase 0 on the token. The indexer's correctness does not depend on the data source.

## 2026-09-16: Envio attributes nets and over-closes to obligations first-in, first-out (fills a gap)

Decision: the `Netted` event carries a quantity but no obligation ids, because the contract nets fungible balances, not obligations. The indexer reduces the open obligations on each side of the pair oldest-first until the netted quantity is consumed. A `Closed` event names an obligation; if the named obligation's indexed remainder is smaller than the closed quantity (possible only after a net was attributed elsewhere), the excess is applied to the same edge's other open obligations oldest-first. If either allocation cannot be satisfied the handler throws, because the chain's balance check makes that state impossible and an impossible state must stop the indexer rather than drift.

Alternative rejected: emitting per-obligation detail from the contract on `net`. It would change the event signatures in PLANNING.md 5a and force the contract to hold the FIFO order the indexer can compute for free.

## 2026-09-16: Market edges are linked to their market through the settlement transaction

Decision: `Confirmed` events minted by `mintFromDare` carry no dare id. The indexer records a `SettlementTx` entity when it sees `DareResolved` or a non-voided `DareArbitrated`, keyed by transaction hash, and every `Confirmed` in the same transaction is linked to that dare. Log order within a transaction is deterministic (the market event precedes the mints), so the link is exact.

Alternative rejected: adding `dareId` to `Confirmed`. Same reason as above: the event signatures are the spec.

## 2026-09-16: Seed conventions

Decision: seed users have `dynamic_user_id = 'seed:<name>'` and wallets derived from `SEED_MNEMONIC` (account 0 for ledger wallets, account 1 for governance wallets, one address index per person). A re-run deletes only rows owned by seed users and registers fresh onchain groups (old testnet groups are left as orphans). Every seed obligation has `origin = 'manual'` even where the memo describes a lost bet, because no `dares` rows exist in Phase 0 and an `origin = 'dare'` with no market to point at would be a lie the timeline could trip on. Offchain `created_at` is backdated to tell a months-long story; onchain block timestamps are the seed's run time, which the person view will need to prefer the offchain timestamp for on seeded rows. The seed verifies every open edge against the chain before it exits.

Alternative rejected: random wallets per run (see the environment-variable entry) and a seed that only writes Postgres (Phase 1 would then be tested against a ledger Envio has never seen).

## 2026-09-16: `DATABASE_URL` corrected to the Session pooler string

Decision: the value in `.env.local` was the Direct connection string (`postgres@db.<ref>.supabase.co:5432`), not the Session pooler string the environment notes described. The Direct host publishes only an IPv6 address and this machine has no IPv6 route, so the seed failed on DNS before touching anything. The value was replaced with the Session pooler string for the project's pooler cluster (`postgres.<ref>@aws-0-us-east-1.pooler.supabase.com:5432`, `sslmode=require`), which is what the notes intended. Session mode on port 5432, not the transaction pooler on 6543, because migrations and prepared statements need a real session. The `aws-1` cluster was probed first and rejected the tenant, so the choice was verified, not guessed.

Alternative rejected: leaving the Direct string and adding IPv6 connectivity. Vercel's runtime and most home networks are IPv4, so the pooler string is the one the app has to work with anyway.

## 2026-09-16: Gas limits are sized from Monad, never from the Foundry gas report (supersedes the earlier gas entry)

Decision: the first gas table was sized from `forge test --gas-report` plus a third, and the seed's first `net` on Monad ran out of gas at exactly its 120,000 limit. Monad's opcode schedule differs from a local EVM in the direction these contracts feel most: cold storage costs 8100 per 128-slot page rather than 2100 per slot (every mapping lookup is its own page), cold account access is 10100 rather than 2600, and ecrecover is 6000 rather than 3000. Monad's own `eth_estimateGas` for the ledger functions, signed by seed wallets against real state (`scripts/gas-survey.ts`, calibration only), gave confirm 185,592, close 95,914, net 128,528, createDenom 125,298, and createGroup 368,341 (two members) and 794,829 (five). `net` is 1.65x its Foundry figure. `src/lib/chain/gas.ts` now carries those figures plus about 30 percent, and `RELAYER_LOG_GAS=1` prints gasUsed against the limit for every relayer transaction so the table can be tightened from real receipts. The DarefulDares limits are extrapolated at 2.1x the Foundry maxima and are flagged for measurement the first time a market goes onchain in Phase 2.

Alternative rejected: `estimateGas` at submission time, still, because the conventions forbid it in a production path and because on a chain that charges the declared limit an estimate needs a margin anyway. The calibration script is the one place estimation is allowed.

## 2026-09-16: The Alchemy free tier caps `eth_getLogs` at ten blocks on Monad; the indexer is pinned to that

Decision: Alchemy's free plan limits `eth_getLogs` to a 10-block range on Monad testnet. Envio's RPC source kept requesting larger ranges, failing, backing off, and accelerating again, so it fell behind a chain that produces two to three blocks a second. `indexer/config.yaml` now pins the RPC block interval at 10 with no acceleration and a short backoff, which at Monad's block rate is well inside the free tier's request budget. HyperSync, which is what Envio is built around, refuses requests without an Envio API token; creating one at https://envio.dev/app/api-tokens and setting `ENVIO_API_TOKEN` is the proper fix, after which the `rpc` block in the config comes out and HyperSync takes over. The application itself never scans logs (Envio is the only chain reader), so the cap does not affect it.

Alternative rejected: the public Monad testnet RPC as the sync source. It allows 100-block ranges, which would sync faster, but it is a second RPC provider in a stack that deliberately has one, and HyperSync is the real answer.

## 2026-09-16: The relayer transport retries transient HTTP failures before failing loudly

Decision: the viem HTTP transport behind the relayer retries up to six times with a 1.5 second delay and a 30 second timeout. The seed's second run failed on its first `createGroup` with an HTTP 429 from Alchemy, not a revert: the restarted indexer's backfill and the seed were sharing one free-tier key. A rate limit is not a chain error and should not surface as one. Reverts still fail on the first attempt because simulation catches them before anything is sent.

Alternative rejected: a second Alchemy key or provider for the indexer. One provider is a deliberate stack decision, and the shared budget only bites during an indexer backfill, which is rare once HyperSync is in use.

## 2026-09-16: Seeding waits for the indexer to reach the head

Decision: the seed is run only after the local indexer has caught up (a gap under 40 blocks), so the two do not compete for the same RPC budget. Not code, an operating rule, recorded so nobody debugs a 429 as a contract problem again.

## 2026-09-16: Monad receipts report `gasUsed` equal to the declared limit

Decision: every successful relayer transaction on Monad testnet came back with `gasUsed` exactly equal to the gas limit it was sent with (the deployment receipts, `createGroup` at 1,035,000, `createDenom` at 165,000). This follows from Monad charging the limit, and it means receipts carry no information about actual execution cost. Calibration therefore rests on `eth_estimateGas` through `scripts/gas-survey.ts` (never in a production path) and on the binary signal of a limit being enough. `RELAYER_LOG_GAS=1` still prints the limit and the receipt status, and its comment says exactly that.

## 2026-09-16: The seed runs with the local indexer stopped

Decision: on the Alchemy free tier the indexer's head polling alone saturates the request budget on Monad, and the seed's transactions then fail with sustained HTTP 429s even through six retries with backoff. The seed is run with the local indexer stopped, and the indexer is restarted afterwards to backfill the seed's blocks. This replaces the earlier "wait for the indexer to catch up" rule, which was not enough. Stopping means `npm run indexer:stop` (Envio's own stop, which also drops the local database) or Ctrl-C in the terminal that started it; killing the `npm` wrapper leaves the indexer child running, which is how one seed attempt failed with the indexer supposedly off. Once HyperSync is in use the indexer no longer touches the RPC for historical data and the rule can go.

## 2026-09-16: The local indexer syncs from the public Monad RPC until HyperSync has a token (supersedes the ten-block entry)

Decision: pinned to ten-block ranges on the Alchemy free tier, the indexer advanced 68 blocks in twelve minutes against a chain that produces two to three blocks a second, with hundreds of 429s and internal promise timeouts. That is a stall, not a slow sync. The indexer's source is now `MONAD_INDEXER_RPC_URL`, set locally to the public Monad testnet RPC (`https://testnet-rpc.monad.xyz`), which allows 100-block `eth_getLogs` ranges, with the interval pinned at 100. The application still uses Alchemy for everything it does; the indexer is the only reader of historical logs, and the public endpoint carries no key. This variable disappears once `ENVIO_API_TOKEN` exists and HyperSync takes over, which is the proper fix and a one-line change.

Alternative rejected: an Alchemy paid tier just for local indexing, and a second Alchemy key. Both spend money or complicate the stack for a component that is meant to run on HyperSync anyway.

# Phase 1 corrections to PLANNING.md (2026-09-17)

PLANNING.md froze at the Phase 0 kickoff. Everything below supersedes it where they conflict, and CLAUDE.md carries each correction wherever it changes a rule.

## 2026-09-17: The documents and what each is authoritative for

Decision: six documents. PLANNING.md is the architecture, frozen, authoritative except where this file records a correction. This file is authoritative over PLANNING.md on any conflict. `docs/marks-and-memories.md` is the product decision on marks and media and changes the schema. `docs/design.md` is the design specification. `docs/design/reference/UI Design.html` is the exported design, the source of truth for values and layout intent, never copied as markup. CLAUDE.md is the working brief and indexes the rest. Nothing but the app belongs in the repository root, so the design export and the marks document moved under `docs/`.

## 2026-09-17: Rounding is truncation toward zero (supersedes the half-away-from-zero entry)

Decision: each pairwise transfer is `trunc(min(s_i, s_j) x (S_i - S_j) / ((N - 1) x 10000))`, truncated toward zero, which is Solidity's native signed division. The Phase 0 counterexample stands: four participants at two units each, one exactly right, three transfers of two thirds each rounding to one, and the loser pays three against a stake of two. Bounded loss is the property pairwise settlement exists to provide, so it wins over sub-unit precision. Truncation is odd, so antisymmetry and zero-sum survive, and the sum of truncated magnitudes cannot exceed the sum of true magnitudes, so `|net_i| <= s_i` holds exactly. The fuzz test now asserts the exact bound.

The degenerate case is handled by generalizing a rule PLANNING.md already had for unquantifiable denominations: if every transfer truncates to zero, the market collapses to a single edge, the lowest scorer owing one unit to the highest, ties at either end void and mint nothing. Unquantifiable denominations are an instance of this rather than a special case, since a stake of 1 always truncates to nothing when `N >= 3`. The two-beer four-person case is a literal test asserting no participant's net exceeds their stake.

Alternative rejected: nearest rounding with a residual rule. There is no residual rule that preserves both zero-sum and the bound.

## 2026-09-17: The section 8c worked example under truncation

Decision: PLANNING.md printed Gabe at +$9.08 (the unrounded net rounded once). Under nearest rounding per transfer the figure was +$9.09, which the Phase 0 test asserted and the kickoff review confirmed. Under truncation, which the same review adopted, two transfers change: Alex to Gabe is 26 cents (26.67 truncated) and John to Gabe is 606 cents (606.67 truncated). The nets are Justin -160, Gabe +907, Alex +164, John -911, summing to zero. The tests assert those figures. Flagged at the seam check-in because the two corrections interact and the review confirmed +$9.09 before adopting the rule that makes it +$9.07.

## 2026-09-17: One market resolution per transaction, always

Decision: `resolve` and `arbitrate` are never batched. The indexer links every `Confirmed` in a settlement transaction to the market that resolved in that transaction, and that attribution is exact only when one market resolves per transaction. Accepted at the kickoff review as the invariant behind the Phase 0 attribution design.

## 2026-09-17: `threshold` and gas, confirmed

Decision: `threshold = floor(quorum.length / 2) + 1` computed in the contract, no caller input, and there are no unanimity markets; PLANNING.md's "default" was loose wording. The Monad-sized gas table and `scripts/gas-survey.ts` are the rule, not the Foundry report; the `DarefulDares` limits are re-measured the first time a market goes onchain in Phase 2.

## 2026-09-17: Membership registration, the full risk and the fix required before mainnet (supersedes the Phase 0 entry's risk note)

Decision: the Phase 0 entry understated the residual risk. A compromised relayer can register fabricated members into an existing group, enter positions for a real user with that user's delegated ledger share, vote with the fabricated members' governance wallets, and mint obligations against the real user. Existing markets are safe because the quorum is snapshotted at create; every future market in that group is not. An existing member's ledger signature does not help, because the server holds that share too.

The only key the server never holds is the governance key, so the fix extends the governance wallet's role from "votes" to "votes and membership changes." That is consistent with Principle 10 because adding a member changes who can vote in every future market in the group. The asynchrony (someone binds their claim at 2am and needs a signature from the creator) is solved by the creator pre-authorizing at contact-pick time, when they are already holding the phone, with the signature redeemed at bind. Required before mainnet. Not built in Phase 1: testnet, non-transferable tokens, and a deadline.

## 2026-09-17: `media` replaces `photos`; marks live on `dares` and `denominations`

Decision: `docs/marks-and-memories.md` is a product decision whose schema needed three corrections against this codebase. There is no `events` table, so `media` attaches through two nullable foreign keys, `dare_id` (a market, which the document calls a market) and `obligation_id` (where the Principle 6 settlement photo lands), with the same XOR check the schema uses for `user_id` and `claim_id`. `media` is strictly richer than `photos`, so `photos` is dropped, `obligations.photo_id` becomes `obligations.media_id`, and `expenses.receipt_photo_id` becomes `expenses.receipt_media_id`; nothing maintains both. Expenses and plans get their own parent columns on `media` when those phases arrive, not now.

Kept from the document: `kind` (photo or video), `storage_key`, `poster_key`, `width`, `height`, `duration_ms`, `author_id`, `captured_at` from EXIF, and `created_at`, with an index per parent on `(parent, created_at)`. `captured_at` is the only EXIF field retained; the rest of the block, GPS above all, is stripped at upload. Media is visible to the market's participants and the group it was asked in, which means a signed-URL path behind an authorization check, never a public bucket. Derivatives are 1080px long edge, 256px square, and a poster frame. Deleting media never deletes the event or the obligations it produced.

Marks are `mark_kind` (`emoji` or `image`, null for none) and `mark_value` (the emoji, or a media id as text) on `dares` and `denominations`, with a check that both are null or both set. Blank is the default and stays blank; nothing is suggested or defaulted; every screen reads with marks off.

Open question for the seam check-in: a picture mark on a denomination is a `media` row with no market and no obligation to attach to, which the XOR forbids. Emoji marks ship first per the document's phasing; when picture marks are built, `media` needs a `denomination_id` parent (exactly-one over three) or picture marks need their own home.

Alternative rejected: keeping `photos` alongside `media`, and a generic `events` table for media to hang from. Two media tables would drift, and an events table would be a second timeline model next to the union the person view already composes.

## 2026-09-17: The timeline orders by the offchain timestamp, never the chain timestamp

Decision: every event row sorts on its Postgres timestamp (`created_at`, or the event's own `occurs_at` or `resolved_at`). Block timestamps say when the relayer got around to it; the seed backdates months of history while its blocks are all from one afternoon, and ordering by chain time collapses the whole thing into today. This is a rule in CLAUDE.md for every query and view, not a behavior of one.

## 2026-09-17: Design tokens are CSS custom properties; the Tailwind theme reads them

Decision: every value in `docs/design.md` section 1 lives in `src/app/globals.css` as a custom property on `:root`, the shadcn variables map onto them as the document specifies, and Tailwind's theme reads the same properties, so a screen built in a later phase cannot drift from one built now. Fonts load through `next/font/google` (Young Serif 400; Hanken Grotesk 400 to 700) with `display: swap`. Dark is the only shipped theme; the light values are recorded as a second set for later. The exported HTML is consulted for layout intent and never copied: it is a self-extracting bundle with inline styles and absolute positioning.

## 2026-09-17: The indexer syncs from HyperSync (supersedes the public RPC entry)

Decision: an Envio API token now exists in `indexer/.env`, the `rpc` block is gone from `indexer/config.yaml`, and HyperSync is the source for both history and the head. `MONAD_INDEXER_RPC_URL` is retired from `.env.example`; the value can be deleted from `.env.local`. The Alchemy key is never touched by the indexer.

## 2026-09-17: `SUPABASE_URL`, and the Vercel framework preset

Decision: `NEXT_PUBLIC_SUPABASE_URL` was renamed to `SUPABASE_URL` in both env files, closing the Phase 0 note; there is no `NEXT_PUBLIC_SUPABASE_*` variable. Separately, every push since Phase 0 failed on Vercel with "no output directory named public" because the project was created before the app existed and its framework was never detected, so Vercel built it as a static site. `vercel.json` now declares `"framework": "nextjs"`, which is the repository-side fix and needs no dashboard change.

## 2026-09-17: The application session is a signed cookie the server issues after verifying the Dynamic token once

Decision: the client sends the Dynamic login token to `/api/session` once, the server verifies it against Dynamic's JWKS (`https://app.dynamic.xyz/api/v0/sdk/<environment>/.well-known/jwks`, RS256), and then issues its own httpOnly, sameSite-lax cookie: an HS256 JWT carrying only the user id, signed with `SESSION_SECRET`, thirty days. Pages and actions read the user through `currentUser()`. The Dynamic token is never stored; it can be several kilobytes and expires on Dynamic's schedule, which is not the app's.

Alternative rejected: storing the Dynamic token in the cookie and re-verifying it on every request. It couples every page load to Dynamic's availability and their session length, and a four-kilobyte cookie is over the limit some browsers enforce.

## 2026-09-17: The wallet Dynamic creates at signup is the ledger wallet; the one the app creates is the governance wallet

Decision: Dynamic creates one embedded wallet at signup. The client creates the second through `createWalletAccount` and then refreshes the token so both addresses are vouched for. On first login the server records the primary wallet as the ledger wallet and the other as the governance wallet; on every later login it only checks that the same two addresses are presented, in either order. The pairing is permanent, which is the same rule the ledger contract enforces.

Alternative rejected: letting the client name which wallet is which. The client is also the place a compromised page would run; the server assigns once and thereafter only verifies membership of the pair.

## 2026-09-17: Group invite links are signed, expiring tokens with no table behind them (fills a gap; question at the seam)

Decision: PLANNING.md puts "groups and invite links" in Phase 1 but has no table for invites. A link is `base64url({groupId, invitedBy, exp}).hmac`, signed with a key derived from `SESSION_SECRET`, valid fourteen days, and redeemed by any signed-in user, who becomes a member. Nothing is stored, so nothing can be revoked short of rotating the secret, and there is no use count.

Alternative, to decide at the seam: a `group_invites` table (token hash, group, creator, expiry, use count, revoked_at) that makes a link revocable and countable. Cheap to add later; the redeem path does not change.

## 2026-09-17: Person hues are derived from the user id

Decision: the six person hues are assigned by hashing the user id, which is stable across every group and needs no column. The design says "assigned at account creation"; a deterministic function of the id is that assignment.

Alternative rejected: a `hue` column. It would be one more thing to keep, for a value that never needs to change.

## 2026-09-17: The person-view timeline in Phase 1 shows obligations and pending proposals only

Decision: closes (settle, forgive) are Phase 4 and have no offchain row yet, so a settled obligation renders as its original card with a "Squared up" or "Called it even" caption read from the indexer, never as a separate timeline row and never struck through. Markets, plans, and photos arrive with their phases. The union stays composed per request.

## 2026-09-17: The indexer stores `bytes16` ids as sixteen bytes

Decision: HyperSync decodes fixed-size byte parameters right-padded to 32 bytes, so a `bytes16` obligation id arrives in a handler as 64 hex characters with sixteen trailing zero bytes. The handlers normalize to the canonical 16 bytes before storing, so an indexed obligation's id is the same 128 bits as its Postgres uuid and the application's parser stays strict. Found when the person view first read the indexer through the app; the Phase 0 verification compared quantities per edge, not ids, and did not catch it.

# Phase 1, second half (2026-09-18)

Rulings from the seam check-in, and the decisions made while building the accountless layer.

## 2026-09-18: The section 8c figures under truncation, confirmed

Decision: the figures in the 2026-09-17 entry stand, confirmed by an independent recomputation at the seam. Gabe is 275 plus trunc(26.67) plus trunc(606.67), which is 275 plus 26 plus 606, for +907. Alex is +164, John is -911, Justin is -160, and the column sums to zero. PLANNING.md is frozen and still prints +$9.08; this file is the correction, and the tests assert +907. The flag raised at the seam (that the review confirmed +$9.09 before adopting the rule that makes it +$9.07) is closed.

## 2026-09-18: Picture marks get their own table; the `media` XOR is not widened (closes the open question)

Decision: `media` keeps exactly two parents, `dare_id` and `obligation_id`. A `media` row carries an author, a capture time, a counter, a credit chip, and the rule that media belongs to the story. A denomination mark has none of those. If picture marks are built, they get their own small table. Emoji marks only for now, which is what `docs/marks-and-memories.md` phases anyway.

Alternative rejected: a third parent, `denomination_id`, with an exactly-one-of-three check. Every media query would then start by excluding marks, and a mark would inherit columns that mean nothing for it.

## 2026-09-18: Group invites are rows in `group_invites`, revocable and counted (supersedes the signed-token entry)

Decision: a group invite is a row: `token_hash`, `group_id`, `created_by`, `expires_at`, `use_count`, `revoked_at`, `created_at`. Joining a group is a bigger grant than a market link, because it makes someone a quorum member in every later market there. Read together with the membership-registration entry (2026-09-17), a fourteen-day token that nobody can revoke is the wrong default. Expiry stays at fourteen days. Migration `0004_group_invites`.

Two consequences follow from storing only the hash. A link cannot be shown again after it is made, so making one is an explicit action on the group page rather than something every page render does, which is also what keeps the count meaningful. And the signed tokens from the first half stop working; none was ever redeemed by a real login.

Redeeming locks the invite row for the transaction, so two redemptions of one link (a double tap, or an effect that runs twice) serialize and count once. Only an actual join is a use; an existing member tapping the link again is not. A revoked or expired link reads exactly like one that never existed, with no reason given.

Alternative rejected: keeping the stateless signed token and adding a revocation list. That is a table anyway, with none of the counting.

## 2026-09-18: Any current member can turn off any of the group's links (fills a gap)

Decision: the ruling made invites revocable and did not say by whom. Any current member of the group can revoke any of its links, not only the person who made it. A group has no roles anywhere in the schema, and a leaked link is every member's problem, since the person who joins through it votes in everyone's markets. Making a link also requires current membership. Flagged for review because it fills a gap.

Alternative rejected: only the link's creator can revoke it. That quietly introduces a per-link owner role into a model that has none, and it fails exactly when it matters: the creator is asleep and someone else noticed the leak.

## 2026-09-18: One token primitive for every link

Decision: `src/lib/ledger/tokens.ts` is the single place a link token is made or hashed: 32 random bytes as base64url, with only the sha256 stored. `group_invites` uses it now, and `claim_tokens` and `personal_links` use it as they are built, which is the convention the schema comments already stated for those two tables. A string that is not shaped like a token is rejected before it reaches a query. A token says which row a link points at and nothing about who is holding it: a link never authenticates.

Alternative rejected: a helper per table. Three copies of the same twenty lines would drift, and the one that drifted would be a security bug.

## 2026-09-18: A claim link is a row in `claim_links`, and its token is never the browser token (fills a gap; ruled)

Decision: PLANNING.md says a creator can send a claim link to a ghost and that opening it "issues a new token bound to the same claim", but specifies no table for the link. `personal_links.dare_id` is `not null`, so a personal link exists only for a market, and markets are Phase 2, while the Phase 1 checkpoint has a ghost from an "I got this one" receiving a link and binding later. A claim link is therefore its own small table: `token_hash`, `claim_id`, `created_by`, `issued_at`, `revoked_at`. Opening one issues a fresh `claim_tokens` row for that browser, which is "two tokens, one claim" as written. `personal_links` stays exactly as specified for Phase 2. Same reasoning as the picture-marks ruling: do not widen what a table means, give the new thing its own small table.

Alternatives rejected: making `personal_links.dare_id` nullable, which changes a specified column and makes every personal-link query branch on null; and letting the link token be a `claim_tokens` row, which makes the URL itself the browser credential, held by the creator who composed the message.

## 2026-09-18: An existing account binds to a claim on one explicit tap, never silently (fills a gap; ruled)

Decision: PLANNING.md makes token binding "automatic, silent, exact" at signup and does not cover someone who is already signed in opening a claim link. A link is minted by the creator and can be forwarded, so a silent bind would attach a ghost's pending rows to whoever tapped first. A signed-in person sees who the creator thinks they are and binds only on a yes. Signup in a browser already holding the token stays automatic, as specified. This is the second rule ("a link never authenticates") applied to binding: a link may say who the creator thinks you are, and only you can say they are right.

Alternatives rejected: binding silently like signup (consistent, and misbinding is already recoverable, but a forwarded link binds to the wrong person with nobody deciding anything), and never binding from a tap (leaves creator merge as the only path for a friend who signed up on another device, which makes the creator do the work in the common case).

## 2026-09-18: Phone numbers are parsed to E.164 with a default region before hashing (fills a gap; corrects the first half)

Decision: `normalizeE164` stripped non-digits and prepended a plus. A contact saved the way most people save numbers, `(212) 555-0142`, hashed as `+2125550142`, while the same person's login arrives from Dynamic as `+12125550142`. Two hashes for one phone, so a picked ghost would never bind on signup, and nothing would report it: the silent failure Principle 9 forbids, on the path the Phase 1 checkpoint ends with. Numbers are now parsed with `libphonenumber-js`. A number in national format is read in a default region, the country of the person who picked it (the platform's `x-vercel-ip-country` header, `US` when absent), on the reasoning that a contact saved without a country code is almost always in the saver's own country. Anything that does not parse to a valid number throws rather than hashing as something, and a national number with no region does not hash at all.

`phoneOf` had the same family of bug: it skipped the country code whenever the national number began with the code's digits, which is legitimate for some countries (`+7 7xx`). It now joins code and national number, validates, and accepts the bare digits only if the joined form is not a valid number.

This had to happen now. `PHONE_HASH_SALT` is permanent because a stored hash can never be recomputed, and the normalization is permanent for the same reason: a different spelling is a different hash. At the time of the change no phone hash was stored anywhere (zero on `users`, zero on `participant_claims`), so it was the last moment the rule could change for free. Verified with seven spellings of one US number giving one hash, a login matching a saved contact, and the `+7` case.

Alternative rejected: keeping digit-stripping and asking creators to save contacts in international format. Nobody does, and the failure would be invisible. Also rejected: storing each user's country code to use as the default region, which keeps a piece of the phone number the design otherwise discards.

Known limit, recorded: a contact saved in national format by someone travelling abroad is read in the wrong region and will not match. The typed-name and claim-link paths still bind that person; only the automatic phone match is missed.

## 2026-09-18: Proposals remember which side used to be a ghost (fills a gap)

Decision: binding rewrites `from_claim` or `to_claim` into a user, and the XOR checks force the claim column to null, so the rewrite destroys the one fact two later rules need: that this side used to be a ghost. `obligation_proposals` gains `from_bound_claim` and `to_bound_claim`, nullable, set only at bind, each checked to sit only beside a user on that side. A pending row with `to_bound_claim` set is the creditor-side re-confirmation PLANNING.md requires: the debtor confirms who the creditor turned out to be. A row with `from_bound_claim` set is an edge from a position entered as a ghost, which the third rule says always prompts, delegated or not; Phase 3's delegated signer reads this column and refuses. It also puts the claimant's first screen one query away.

The creditor-side re-confirmation needs no new state. The debtor's `Confirm` signature names the creditor's address, so for a row whose creditor was a ghost it can only be made after the bind, over the bound person's address. The re-confirmation is that tap; what the column adds is the framing ("this Gabe") and the guarantee that delegation never makes the tap for them.

Alternative rejected: deriving provenance from `participant_claims.claimed_by`. After the rewrite nothing on the proposal points at the claim, so there is nothing to join through.

## 2026-09-18: A browser token is issued on an explicit "that's me", never on a page view (fills a gap)

Decision: opening a claim link reads and changes nothing. A `claim_tokens` row is issued only when someone taps "that's me" without a session. This reconciles two things. PLANNING.md says a ghost binds "on the next login in that browser", automatically; the ruling says an existing account binds only on an explicit tap. With tokens issued only on a tap, holding one always means someone affirmatively said so in that browser, so binding at any login (new account or existing) is automatic and still never silent in the sense the ruling cares about. A signed-in person skips the token entirely: their tap binds directly. It also means a link-preview bot fetching the URL creates nothing. The token lives in an httpOnly cookie; a browser may hold several, since two creators' ghosts of one person are two claims until a phone login merges them.

Alternative rejected: issuing the token when the page loads. Every preview fetch would mint a token, and a forwarded link would arm whoever opened it first.

## 2026-09-18: Binding does not merge dyads; the oldest dyad wins (fills a gap; known limit)

Decision: a ghost and its creator share an implicit dyad. Binding rewrites the ghost's seat to the user, so when the user already had a dyad with that creator, the pair now has two. They are not merged: a denomination belongs to one group, so moving proposals across dyads means finding or creating an equivalent unit in the other and re-pointing every row, which is a second rewrite with its own failure modes for a case that only arises on a merge into an existing friend. The common case, a new signup, has no prior dyad and produces no duplicate. `ensureDyad` now picks the oldest matching dyad, so every caller lands on the same one. The cost, recorded: edges in the two dyads do not net against each other, since netting is per group and denomination. The person view is cross-group, so nothing is hidden.

Alternative rejected: collapsing dyads at bind time. Worth revisiting with netting in Phase 4, where the cost becomes visible.

## 2026-09-18: Only the person who added a ghost can link, merge, or dismiss them (fills a gap)

Decision: PLANNING.md calls the third bind path "creator merge" and lets "the creator" send claim links and dismiss. A ghost in a named group is visible to every member, but only `participant_claims.created_by` can act on them. Pointing a ghost at an account-holder also requires that the creator shares a group with that person, so a ghost's pending rows cannot be pushed onto an arbitrary account. A creator can never be their own ghost, by any path.

Alternative rejected: any member of a group the ghost is in. It would let one member rebind or dismiss a person another member added, and the ghost's rows are the adder's claims about what happened.

## 2026-09-18: Dismissing a ghost in Phase 1 (fills a gap)

Decision: PLANNING.md defines dismissal per market, with re-scoring, and markets are Phase 2. What Phase 1 can build is dismissing the ghost: their pending rows close as `declined` (the only terminal state that never mints; there is no separate "withdrawn"), they leave their groups through `left_at`, their claim links are revoked, and the phone hash is deleted, which is the one deletion the product makes because it was never ledger history. The ghost row stays. Picking the same number later starts a fresh ghost. The per-market half, removing a position and re-scoring, arrives with markets.

## 2026-09-18: A bind that would produce a cover of oneself closes the row instead

Decision: if a ghost binds to a user who is the other party on one of its pending rows, rewriting would produce a row from a person to themselves, which `obligations_not_self` would refuse at mint. Those rows close as `declined` inside the bind transaction rather than surviving as something that can never be confirmed.

## 2026-09-18: `ConfirmMany` typed data verified against the deployed ledger

Decision, and a gap closed: the seed never calls `confirmMany`, so until now the TypeScript `ConfirmMany` typed data had only ever been checked by Foundry, which builds its digest with its own hashing rather than viem's. EIP-712 array encoding is easy to get subtly wrong (the contract hashes each array with `abi.encodePacked`, which pads every element to 32 bytes, left for `address`, `uint256`, and `bool`, right for `bytes16`). Verified on chain 10143 with a read-only `eth_call`: the deployed ledger accepted a three-item batch across two creditors signed by a seed wallet through the app's typed data, and refused the same signature over an altered batch. Batches are capped at twelve, because the declared gas grows per item and Monad charges what is declared.

## 2026-09-18: Concern recorded: a picked number is an account-existence oracle

Not a decision, a flag for review. PLANNING.md specifies that a picked contact whose hash matches `users.phone_hash` resolves to that user, and also that "nobody can query whether an arbitrary number is in Dareful." These pull against each other. The Contact Picker constrains an honest client to real contacts, but the server action takes a number from the client, so a signed-in person with a modified client can submit arbitrary numbers and learn, from whether the result is an account or a ghost, which numbers have accounts, along with each account's display name. Built as specified. Mitigations to choose between: a per-user rate limit on new picks, or resolving to the account silently while showing the creator only the name they typed until the other person confirms.

## 2026-09-18: What a share card says, and what it never says (fills a gap)

Decision: PLANNING.md makes the Open Graph card "the distribution mechanism" and a Phase 1 deliverable, and does not say what goes on one. A card is fetched by a messaging app's preview bot with no session and then cached by it, so a card says only what the sender's own message already implies: for a claim link, the sender's first name and whether it is one thing or several ("Alex got these."); for a group invite, the group's name and how many are in. Never an amount, never a memo, never a phone, on the card or in the text metadata beside it. Count before amount applies to a preview more than anywhere. A dead, revoked, or unknown link gets the plain brand card, identical in every case, so a preview can never be used to learn whether a token is live. One renderer, `src/lib/ui/share-card.tsx`, serves every share route, and `metadataBase` is set at the root so the image URL is absolute; without it a pasted link renders as bare text.

Not done in Phase 1, stated plainly: the card's headline is in the renderer's default face, not Young Serif. The image renderer needs a font file on disk and cannot use `next/font`. That arrives with the Phase 2 share renderer and its emoji font. The `/o/[id]` confirm route has no card yet either: it requires a session, so a preview bot sees only the redirect, and a card for it needs a decision about what a signed-out visitor may learn.

Alternative rejected: a generic card with no names. It leaks nothing, and it also does nothing: a bare "Dareful" card in a group chat is not the mechanism PLANNING.md describes. The sender's first name reveals nothing the recipient does not already know from who texted them.

## 2026-09-18: The claimant's first screen comes first once, not every time (fills a gap)

Decision: PLANNING.md puts the claimant's screen "before anything else" after signup. The login flow routes there once, straight after a login that bound something. After that it is a strip at the top of the home screen, not a redirect. Redirecting home to it for as long as any row remains would trap someone who wants to look around before answering, and would make the app feel like it is collecting: the thing Principle 1 exists to prevent. Someone with nothing waiting never sees an empty inbox; `/welcome` sends them home to the ordinary empty state, as `docs/design.md` 3.10 says.

Confirm-all covers at most twelve, oldest first, and says so when there are more. Each row also opens on its own page for an individual yes or no. Dispute, as distinct from "not this one", belongs to rows that came from a market and arrives with markets in Phase 2.

# Phase 1, closing (2026-09-18)

Rulings on the second half, and the decisions made while closing the phase.

## 2026-09-18: Binding folds a ghost dyad into the pair's existing dyad (supersedes "the oldest dyad wins")

Decision: the earlier entry called two dyads for one pair a known limit. It is a bug. Obligations are scoped to a group in the token id, so two dyads between the same two people can never net against each other, and which one a screen prefers is cosmetic. On bind, if the other member of a ghost's dyad already has a dyad with the person binding, the ghost's dyad folds into that one inside the bind transaction: each of its units maps onto an equivalent unit in the surviving dyad (same template, or for a custom unit the same label, countability, and monetary flag) or moves there if there is none; every row that named the ghost dyad is repointed (`obligation_proposals`, `dares`, `plans`, `expenses`); and the ghost dyad, its seats, and its invites are deleted. A first-time signup has no prior dyad and nothing folds.

The fold is possible only because a ghost dyad has no onchain state by construction: nothing mints for a ghost, so the group and its units were never registered. That is checked rather than assumed. A ghost dyad with an `onchain_id`, a registered unit, or a minted obligation refuses to fold with an error, and the whole bind rolls back, because deleting a registered group would orphan its onchain state silently.

This deletes a `groups` row, which is compatible with "no deletion of ledger history": a ghost dyad holds only unconfirmed proposals, and those survive the fold in the other dyad.

Alternative rejected: keeping both dyads and merging them at netting time in Phase 4. Netting is onchain and per group id; by then the second dyad would have minted and the two could never be reconciled.

## 2026-09-18: The account-existence oracle: what was mitigated and what remains (correction to PLANNING.md)

PLANNING.md says a picked contact whose hash matches an account resolves to that account, and also that nobody can query whether an arbitrary number is in Dareful. Both cannot hold for a signed-in person with a modified client. This is a defect in the frozen document. The correction: resolution stays as specified, and the second sentence is weakened to "nobody can query it cheaply or in bulk."

Two mitigations, as ruled. First, the response to a request that resolves a number is identical whether it found an account or made a ghost: adding a person to a group always answers `{ ok: true }` with one message, and logging a cover for someone new always lands on the cover's own page, `/o/<id>`, never on a person page whose URL shape says which kind of person it is. Second, resolutions that carry a phone number are limited to twenty per person per rolling hour (`contact_resolutions`, migration `0006`), counted under a per-user advisory lock so a parallel burst cannot read the same count and all pass. The table records who asked and when and nothing about the number: not the number, not its hash, not the result. Hitting the limit is a plain message that offers adding by name, not a silent drop.

The residual, stated plainly because it is larger than "identical responses" suggests: the distinction is gone from the answer to the request, not from the app. The next page the creator loads shows a ghost ("not here yet") or an account with its display name. So the cost of one probe went from one request to two, and the real ceiling is the rate limit: at most twenty numbers an hour per account, each probe of a real account leaving a pending row in that person's app with the prober's name on it. Removing the residual means deferring resolution until the other person next opens the app, so the creator always sees a ghost until the other side acts. That changes what the people list and the group page mean and is post-hackathon work.

Alternative rejected: the deferral, now. It is the right design and a redesign of three screens two weeks before submission.

## 2026-09-18: A shared cover link has a card, and a signed-out page that says no more than the card

Decision: `/o/[id]` used to redirect a signed-out visitor home, so a preview bot saw a redirect and the link pasted as bare text. It now answers with a page and a card carrying the first name of the person who covered and that there is something to look at: "Alex got this one." No amount, no unit, no memo, and not the name of the person it is against. These links land in group chats where everyone sees the preview. An unknown id, a malformed one, and a cover that is no longer pending all get the plain brand card, byte-identical, and the signed-out page for them says nothing. The signed-out response was checked whole, serialized props included, not only its visible text. A cover against a ghost is now viewable by the person who logged it (it is where logging a cover for someone new lands).

The id in the URL is a uuid, not a secret. What it buys a stranger who guesses one is a first name. Accepted.

## 2026-09-18: Cards and preview metadata carry a first name, enforced in one place (a bug found by the audit)

The share-card decision said "the sender's first name". The claim card and its `og:title` carried the full display name, clipped to eighteen characters, and no check looked. `src/lib/ledger/share.ts` now builds what every share route shows a sessionless visitor, as data, so the rule is tested as data rather than by looking at a PNG.

## 2026-09-18: Times render in the viewer's zone, and "yesterday" is a calendar day

Decision: `whenLabel` formatted in the server's zone and called anything 24 to 48 hours old "yesterday", so something from last night could read as a weekday two days back. This violated the conventions rather than filling a gap. `whenLabel` now takes the zone and compares calendar days in it. A server cannot know the viewer's zone, so the browser reports it once in a cookie (`dareful_tz`, validated before use, a display preference and nothing else); the server paints with it, and a small client component (`When`) recomputes in the browser's own zone after mount and corrects the cookie if it was missing or stale. Only a first-ever visit paints in UTC for a moment. One "now" is read per request and passed down, so render stays pure.

Alternative rejected: formatting only on the client. Every timestamp would flash from empty or wrong on every load, and a timeline is mostly timestamps.

## 2026-09-18: After the first login the client's wallet pick is ignored (amends the wallet-pairing entry)

The test account has three embedded wallets because Dynamic's create-on-signup was briefly on alongside the app's own bootstrap. The `users` row recorded the intended pair. The client sends two of whatever it holds, and had it sent the orphan, the session route would have answered 409 and locked the account out. For an existing user the route now checks only that the login still vouches for the recorded ledger and governance wallets. Signing already selects the wallet by recorded address, so the orphan can never sign anything.

With create-on-signup now off, the app creates both wallets, and the first created (Dynamic's primary) is the ledger wallet. The earlier entry's "the wallet Dynamic creates at signup" reads as "the first wallet created".

## 2026-09-18: The checks are a permanent suite, and the suite is audited by mutation (Principle 9 applied to tests)

Decision: the accountless session verified its work with about a hundred checks in throwaway scripts that were deleted after they passed. They were recovered from that session's transcript. Two could not fail: one was `check(name, true)` for a test never written ("opening the link issued no token"), and one compared two string literals. They now live in `tests/` in three layers (`unit`, `db` against the real database with every row tracked by id and removed, `http` against a running server with forged sessions for temporary users), on Node's built-in test runner through `tsx`, with no new dependency.

`npm run test:audit` is the audit of the suite itself. Each mutant in `tests/mutation/mutants.ts` breaks one rule in the source (removes a guard, drops a filter, reverts a fix to the bug it fixed), runs the tests that claim to cover that rule, and requires every one of them to fail; then it restores the file and verifies the tree byte for byte. A test that no mutant kills is reported: nothing shows it can fail. Where a rule is guarded in two places, the mutant removes both, because a test should fail when the rule breaks, not when one of two redundant guards goes.

Two constraints on mutants, learned while writing them. A mutant must never widen what the code does to rows the test did not make: the "phone bind ignores the hash" mutant is confined to marker names, because the honest version of that break would bind every real ghost in the database to a temporary user. And a tampered control that exercises the deployed contract rather than this repository (the altered `confirmMany` batches) cannot be killed by any source mutant, so the controls live inside the acceptance test they give meaning to.

Alternative rejected: vitest for the app, as the indexer uses. It buys watch mode and costs a dependency and a config for a suite whose value is the audit, not the runner.

## 2026-09-18: `agentRules: false`

`next dev` (16.3.5) appends a generated block to `CLAUDE.md` when it detects a coding agent. The brief is written by hand and is the one document every session reads as authoritative; nothing else writes to it. Turned off in `next.config.ts`, file restored.

## 2026-09-18: The Dynamic dashboard and the code agree on Monad testnet; chain 143 is a label only

Read from Dynamic's public settings payload: Monad Testnet enabled with chain id 10143, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadexplorer.com`, identical to the three `NEXT_PUBLIC_MONAD_*` values the `evmNetworks` override is built from. Monad mainnet is not enabled. The only references to 143 in the code are the constant `MONAD_MAINNET_CHAIN_ID` in `contracts.ts` and one comparison in `networks.ts`, both used only to pick the display name for whatever chain id the environment supplies; nothing selects 143.

## 2026-09-18: What the audit of the checks found

Recorded because the findings are the argument for keeping the audit. Of the recovered checks and the ones written while porting them:

- Two could not fail by construction: `check("opening the link left no set-cookie and issued no token", true)`, and a phone check that compared two string literals. The first is now a real assertion (no `set-cookie` header, no `claim_tokens` row after fetching the page and its card) and its mutant, a page view that mints a token, kills it.
- One rule had no check at all and was broken: cards carried the full display name (previous entry).
- Five passed against deliberately broken code and were rewritten. The batch cap was checked with unknown ids, which are refused anyway, so removing the cap changed nothing; it now asserts the refusal is about the size. "That row is not on the claimant's first screen" asked about a screen the row could never be on. "A ghost in a group you are not in is not suggested" used a person with no groups at all, for whom nothing is ever suggested. "Someone with nothing waiting sees no strip" used a person whose home screen never reaches the strip. The burst test against the rate limit was a coin flip; it now spends nineteen and then fires ten at once, so exactly one may pass.
- One cannot be checked locally: `next dev` points a generated card's URL at localhost whatever `metadataBase` says. It is a separate test that runs only against a deployed origin, and is skipped locally rather than asserted in a form that cannot fail.
- Three rules are guarded twice (a creator binding their own ghost by token, merging a ghost into oneself, and tokens following a merge), so their mutants remove both guards.
- The tampered `confirmMany` batches test the deployed contract, which no source mutant can change, so they moved inside the acceptance test they are the controls for.

The audit also found two defects in the test harness itself, both of the kind it exists to catch. Cleanup threw on rows that broken code had created and the test had not tracked, and because it threw before closing the database client, the process never exited: a hang, not a failure. And a timed-out run killed the test runner's parent process but not its worker, which sat on three database connections. Cleanup now removes everything a temporary user created and always closes the client, audited tests run in one process, the runner journals originals to disk so a killed run is undone by the next, and `npm run test:sweep` removes orphaned test rows.

Final state: 130 tests (27 unit, 75 database, 27 HTTP, 1 deployed-only), 140 mutants, every locally runnable test killed by at least one.

## 2026-09-18: Concern recorded: fifteen pooler clients is the whole budget

Not a decision, a flag for review. The Supabase Session pooler on this plan admits fifteen clients (`EMAXCONNSESSION`, seen when three orphaned test workers held nine). `src/db/index.ts` opens up to five per process, so three warm serverless instances exhaust it, and a fourth request fails with an error rather than waiting. The Session pooler string is a fixed constraint of the project (migrations need session mode) and was not touched. Options, to choose before the Phase 2 submission puts real traffic on it: lower `max` to one or two per instance (one line, no new constraint broken), or keep the Session string for migrations and give the app runtime a second variable on the transaction pooler, which the kickoff rules currently forbid.

## 2026-09-18: The indexer is prepared for Envio Cloud

Envio Cloud builds whatever is pushed to a deploy branch (`envio` by default) with pnpm 10.32.0 on Node 24. Checked against its requirements before spending one of three deployments: `envio` is pinned at 3.12.0 in `indexer/package.json` dependencies (at least 2.21.5, not 2.29.x); the indexer imports nothing outside `indexer/`; the repository is 62 MB against a 100 MB limit; and from a clean copy of the tracked files, `pnpm@10.32.0 install`, `envio codegen`, and the seven handler tests all pass. `indexer/pnpm-lock.yaml` is committed so the cloud build resolves what was tested, and `engines.node` is now `>=24`. The only custom variable is `ENVIO_API_TOKEN`, which already carries the required `ENVIO_` prefix. Logging in to Envio and installing its GitHub App are the account owner's steps.

## 2026-09-18: The app runs on the transaction pooler (reverses the kickoff rule and the Phase 0 `DATABASE_URL` entry; closes the pooler concern)

Decision, ruled after production failed: `DATABASE_URL` is the Supabase transaction pooler (port 6543) with `prepare: false` and a twenty-second idle timeout. The session string moves to `DATABASE_URL_SESSION` and is used by DDL tooling only. The app refuses to start on the session string, with a message that says where it belongs.

What happened: the first HTTP run against production, one person making 28 requests in 14 seconds, returned five 500s. Vercel's function logs show one cause for all five, `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15`, on the first query of the request (the session's user lookup). The same pages had returned 200 seconds earlier in the same run, which rules out the session secret and the indexer URL. In session mode every client holds a server connection for as long as it is connected, a serverless instance stays connected for as long as it lives, and the client opened up to five per instance.

The kickoff rule's reason was that migrations need session mode. They do, and they never go through this client: drizzle-kit only generates SQL, and Supabase applies it. So the app never needed session mode. The cost of transaction mode is no session state, checked across the codebase: no prepared statements, no `set`, no `listen`, and the two locks the app takes are both transaction-scoped (`pg_advisory_xact_lock` in the rate limiter, `for update` inside the invite and bind transactions). The whole database layer, 77 tests including the three concurrency tests, passes over port 6543.

Alternative rejected: staying in session mode with one connection per instance. It moves the ceiling from three instances to fifteen and leaves the failure mode, an error instead of a wait, in place.

## 2026-09-18: `NEXT_PUBLIC_APP_URL` was localhost in production

The deployed-only test, skipped locally because `next dev` cannot exercise it, failed on its first run: production served `og:image` from `http://localhost:3000`. The value in Vercel had been copied from `.env.local`, and a `NEXT_PUBLIC_` value is inlined at build time, so it needs a rebuild and not only a change. It is also the origin of every invite and claim link the app composes, so the accountless half of the checkpoint would have failed at the first text message. Nothing in the code splices origins; the odd string in the first report ("locdarefulhost") was the test runner's character diff of the two URLs drawn over itself, and the assertion now prints both values in a sentence.

## 2026-09-18: Envio Cloud deploys on a push event, not on registration

The deploy branch was pushed before the indexer was registered, so Envio never saw an event and "deployed automatically" produced no deployment. Pushing the same commit again sends nothing. The next commit pushed to `envio` is the first deployment. Settings as stored: root `indexer`, config `config.yaml`, branch `envio`, auto-deploy on, development tier, public endpoint (everything it serves is already public onchain: addresses, ids, quantities, and no names or memos).

## 2026-09-19: Envio Cloud: the deployment budget, promotion, and the redeploy runbook

Settled before Phase 2A, which changes `schema.graphql` and the handlers and so forces an indexer redeploy. Sources: Envio's hosted-service deployment, features, and billing pages, the Envio Cloud CLI page, and the CLI itself. What each source says is separated from what was observed, because they do not fully agree.

**The budget.** Three deployments per indexer, on the free Development plan. One is used: commit `ad29726`, deployed 2026-09-19, synced, verified against the chain (210 edges, 0 mismatches). The limit counts live deployments, not deploys ever made: the deployment guide says "Deployments can be deleted in Envio Cloud to make space for more deployments." So a failed or superseded deployment is deleted and its slot comes back. The budget is therefore "never more than three alive at once", not "three attempts". That does not make a deploy free: a broken build still costs the time to notice, delete, fix, and resync, and deletion is permanent ("The deployment and its data will be permanently removed"). Never delete the deployment production reads from until its replacement is verified.

**Every push to `envio` deploys.** Auto-deploy is on, so a typo pushed to that branch is a deployment. Nothing is ever pushed to `envio` that has not passed `npm run indexer:test` and a clean `pnpm@10.32.0 install` plus `envio codegen` from the tracked files (the check in the 2026-09-18 Envio entry). `envio-cloud indexer settings set --auto-deploy=false` plus `envio-cloud deployment deploy <indexer> <commit>` makes deploying a deliberate act instead of a side effect of a push; recommended, not yet set, because it is an account setting.

**Redeploy window.** The old deployment keeps serving while the new one syncs from its start block: "Keep your previous deployment running and serving queries until the new one is fully synced", and "there is no downtime during updates". Each deployment has its own endpoint and its own data, so nothing the app reads changes until the app is pointed at the new one. There is no window in which production shows an empty ledger, provided the old deployment is left alone until the cutover. Sync from block 63431111 took under a minute on 2026-09-19.

**Promotion and the static endpoint: documented, not yet confirmed for this plan.** The features page says "Each indexer gets a static production endpoint that remains consistent" and that "Promote to Production" routes it to any deployment with zero downtime. Observed on 2026-09-19: `envio-cloud deployment promote dareful ad29726` reported success, and afterwards the indexer record still shows `prod_status: none` and the only endpoint the CLI or its API returns is the per-deployment one, `https://indexer.dev.hyperindex.xyz/2c68360/v1/graphql`, whose hash belongs to that deployment. Neither the docs nor the CLI print the static URL or say which plans have it (the same page marks API keys, IP whitelisting, and alerts "Paid plans only"; an earlier remark in this session that an API key could be added later was wrong for the free plan). The static URL, if the Development plan has one, is shown only in the signed-in dashboard. Until someone reads it there and a query through it returns the ledger, the app is pointed at the per-deployment URL and the runbook below assumes the URL changes on every redeploy. If the static URL is confirmed, step 5 becomes "promote" and steps 6 and 7 disappear.

**Lifespan.** The Development plan has "a maximum life span of 30 days", and the deployment guide lists seven days of inactivity as a deletion trigger. The current deployment ages out around 2026-10-19, after the October 13 gate and possibly during judging. Plan one redeploy of an unchanged commit in the week before submission so the deployment judges hit is young, and check the dashboard for an expiry notice when doing it.

### Runbook: redeploying the indexer

1. Change the indexer on `main`. Run `npm run indexer:test`. From a clean copy of the tracked `indexer/` files run `npx pnpm@10.32.0 install`, then `envio codegen`, then the tests again. Commit.
2. Count live deployments: `npx envio-cloud indexer get dareful`. If there are three, delete one that production does not read (`npx envio-cloud deployment delete dareful <commit>`), never the one in `ENVIO_GRAPHQL_URL`.
3. Deploy: `git push origin main:envio`. (With auto-deploy off: push, then `npx envio-cloud deployment deploy dareful <commit>`.)
4. Watch it: `npx envio-cloud deployment logs dareful <commit> --build`, then `npx envio-cloud deployment status dareful <commit> --watch-till-synced`. A failed build is deleted, fixed, and retried; production is untouched because it still reads the old deployment.
5. Verify before cutting over: `npx envio-cloud deployment endpoint dareful <commit>`, then `ENVIO_GRAPHQL_URL=<that url> npx tsx --env-file=.env.local scripts/verify-envio.ts`. Zero mismatches or stop.
6. Cut over: set `ENVIO_GRAPHQL_URL` in Vercel to the new URL and redeploy the app (no rebuild needed; it is not a `NEXT_PUBLIC_` value). If the app's code depends on the new schema, the app deploy and this step are the same deploy, and the app must not ship before step 5 passes.
7. Confirm production reads through it: a signed-in person page and group page show the ledger, then `TEST_BASE_URL=https://dareful.app node --import tsx --env-file=.env.local --test tests/http/pages.test.ts`.
8. Keep the old deployment for a day as the rollback (pointing `ENVIO_GRAPHQL_URL` back is the whole rollback), then delete it so the slot is free.

# Phase 2A (2026-09-19)

## 2026-09-19: The Phase 1 checkpoint on the record, and the two bugs it found

Checked criterion by criterion against the database, the chain, the hosted indexer, and Dynamic's API rather than against the session notes.

Met: two people on two phones, one Android, created and confirmed an obligation. Three confirmed covers exist between real accounts (two in the iPhone session, one where the Android account is the debtor). For each: the proposal is `confirmed`, the shadow row carries the confirm transaction, the transaction succeeded on chain 10143, `obligationOf` returns the minted quantity with the right creditor, the hosted indexer returns the same obligation with the same parties, and `governanceOfLedger` for all three accounts matches the `users` row, so the pairing registered at first mint as designed. The mint landed about a second after the confirm was recorded (block timestamp 13:58:32 against `resolved_at` 13:58:33). Not evidenced: that both people saw it in the person view within one block. Nothing records what a screen showed; the session notes do not say.

Not met, and not run: the creator picks a third person from contacts, logs a cover, and that ghost binds and mints on a phone signup a day later. No ghost has ever been created by a real account. It would have failed if it had been: see the first bug.

Bug one, no phone login ever stored a phone hash. The account that signed up by phone has a null `phone_hash`. Dynamic serializes most credential keys in snake_case and the phone ones in camelCase (`phoneNumber`, `phoneCountryCode`, `isoCountryCode`); the code read `phone_number` and found nothing, silently. The unit tests passed because their fixture was written by hand with the same wrong spelling: the test agreed with the code and both were wrong. The fixture is now built by Dynamic's own serializer (`JwtVerifiedCredentialToJSON`), a mutant restores the wrong spelling and kills four tests, and an unreadable phone credential is logged rather than skipped. The existing phone account gets its hash on its next login (the route already backfills a missing hash).

Bug two, every login on a new device made two more wallets. The Android account, which signed in once, has two embedded wallets. The email account has five and the phone account four. The bootstrap counted `useUserWallets()`, which fills in slowly after a login, saw fewer than two, and created more. The count now comes from the login token Dynamic signed, read on the server (`src/lib/auth/login.ts`, a pure decision with its own tests and mutants): an existing account is never told to make wallets, a new one is told exactly how many are missing, and the server, not the client, assigns ledger and governance (the first two the token lists; two fresh wallets are interchangeable until one is recorded). The orphans are harmless (signing selects the recorded address, and login requires only that the recorded pair is still vouched for) and cannot be removed with a read-only API token.

Alternative rejected for bug two: waiting for the SDK's wallet list to settle before counting. There is no event that says it has settled, so any wait is a guess and a slower login.

## 2026-09-19: A new person is asked what their friends call them; the email local part is never a name

Decision: signup asks one question, "What do your friends call you?", while the two wallets are being made behind it, so the few seconds that step takes are spent answering something instead of watching nothing. No account is created without a name. Dynamic's `given_name` is offered as a starting value when it has one. The local part of an email address is no longer used: it is an identifier, and it was landing on share cards in other people's group chats. An account still named "Friend" is asked once at its next login. Someone already signed in with a name never meets the bootstrap at all: the layout tells it they are settled, which also removes a session round trip from every page load.

## 2026-09-19: Testing bugs one and three were one bug: a refusal that read as a prompt

Reproduced before fixing, because the report and the code disagreed. The cover form did validate a missing amount in a group exactly as it did between two people, and it never had a second amount field for dollars. What it had was its error, "How much was it?", rendered as ordinary body text at the bottom of a long form, phrased as a question. Read in the hand, that is a second prompt, and a tap that produces a question far from the field reads as a tap that did nothing. So: every refusal in the app is now a statement of what to do ("Add the amount first."), shown at the field it is about with the field marked and scrolled into view, repeated beside the button, in one shared look (ink text behind a marigold rule, the focus ring's color; there is no red). The server action makes the same check again so a request that skips the form gets the same sentence rather than the ledger's generic one. The sibling search found the same styling on every other form and one other error phrased as a question; all were changed. For a non-monetary unit the dollar field is labeled as what it is, an optional private note of what the thing cost.

`docs/design.md` specifies error states for cards ("one body-sm line... Never a red state") and not for form fields. This is derived from that and from the token already used for focus, not a new pattern; flagged for review because it is a derivation.

## 2026-09-19: A unit named while composing is registered when the cover is saved (fills a gap; ruled "pick one")

Decision: the form no longer creates denominations. It describes the unit (a preset, or a name and an optional mark), and the server finds or makes it in the group the cover lands in, in the same request that saves the cover. Between two people that group is the dyad, created at that moment if it does not exist, which is why a one-on-one cover now offers a next time, a beer, a round, a coffee, and something else, the same as a group.

Alternative rejected: creating the dyad when composing begins. Every abandoned form would leave an empty group, and for "someone new" there is nobody to form a dyad with until the form is submitted. The pending unit also removes a server round trip per chip tap and stops abandoned forms leaving orphan units in named groups.

## 2026-09-19: Covering several people is one expense, split, with the odd cent on the payer

Decision: in a group, tapping more than one person turns the form into one total split between them, in the expense shape PLANNING.md section 5b defines and section 9 allocates: an `expenses` row (`source = manual`, `status = finalized`), one item, `item_claims` as exact fractions of the total, and one `expense`-origin proposal per person who was there. Even by default; "someone had more or less" pins individuals and the rest split what is left; "I was in on it too" decides whether the payer's share comes out of the total. Integer cents, truncating division, and the residual goes to the payer, as section 9 says, so nobody is asked for a cent that division invented. The allocation is a pure function with hand-computed tests; the write checks that what it wrote sums to the total or keeps none of it.

Scope limit, stated: a split is dollars only, and only account-holders can be in one, because `item_claims.user_id` has no claim column. A ghost is still covered one at a time. Widening `item_claims` to ghosts is a schema decision for 2D, when ghosts enter markets too.

## 2026-09-19: A group's invite link can be sent again, without the link ever being stored (supersedes "shown once")

Decision: an invite token is now derived, `HMAC(server secret, seed)`, and the row stores the seed beside the hash (migration `0007_invite_seed`). A current member sees each live link again, with Send and Copy on every row, and the main button re-sends the newest live link instead of minting another; making a separate link is a secondary action. Rows are labeled by when they were made. A database read still yields no working link, which is the property "only the hash is stored" existed to protect: the seed is useless without the secret. The re-derived token is shown only if it still hashes to what was stored. Links made before this have no seed; they still work and can be turned off, and say they cannot be shown again.

Alternatives rejected: storing the token (a database read would hand out standing seats in every later market), and encrypting it at rest (the same secret dependency as derivation, plus a ciphertext column and an IV to get wrong).

## 2026-09-19: Where the time goes, measured, and what changed because of it

Measured before changing anything. On production, signed in, from a laptop: the first request after idle took 2.3 seconds (a cold start), and warm pages took 80 to 320 ms, the person view slowest because it waits on the indexer (about 280 ms a query from outside; one per load). A chain write through the relayer, in a group that is already registered, is about half a second end to end (simulate 20 ms, send 75 ms, receipt 340 ms); the first cover in a new group is three such writes in a row (group, unit, confirm). Scoping a question with the model is about four seconds. What could not be measured from here is inside Dynamic: creating the two wallets at signup (the session reported three to five seconds) and each approval prompt. Those are now timed in the browser (`src/lib/ui/timing.ts`, on the Performance timeline and the console), and every relayer phase, indexer query, and model call writes one `[timing]` line to the function log, always on, so the next "why did that take three seconds" is answered from yesterday's logs.

So the honest summary of the session's complaint is: nothing on the server took three seconds except a cold start; the wallet bootstrap did; and nothing anywhere told the person that a tap had registered. Changes: signup asks the name while the wallets are made, so the irreducible seconds are spent answering a question; a tapped link dims and pulses at once (`LinkPending`, from Next's `useLinkStatus`); every button that starts work shows it; a settled, signed-in person no longer pays a session round trip on every page load, and the layout and the page share one user lookup; and the relayer looks for a receipt every 400 ms instead of viem's default four seconds, which on a chain with sub-second blocks turned any first miss into a four-second stall.

Alternative rejected, after trying it: a route-level `loading.tsx` skeleton. It makes every navigation instant, and it makes the response stream, and a streamed response cannot answer 404 or redirect: the HTTP suite caught "someone else gets a 404 for that ghost" returning 200 with not-found content inside. Nothing leaked, but a status code that lies is the kind of thing the next privacy check would trust. Pending state on the link gives the same feedback and keeps the codes honest.

Two relayer defects surfaced by the first onchain markets, both from a load-balanced RPC answering from a node one block behind: a read straight after `create` said the market did not exist (now read at the block the transaction was mined in, and the lock is recorded before that read so nothing after it can leave a market locked onchain and open here), and a simulate straight after the relayer's own previous transaction can revert against stale state (now asked again briefly, only within five seconds of that transaction; a real revert is still a revert half a second later).

## 2026-09-19: The scoring rule was verified by hand before any test was trusted

As instructed, because the tests are written by the same reasoning that writes the code. Worked with the formulas in PLANNING.md 5a and the truncation correction, before running anything. Section 8c, outcome yes, stakes in cents: scores are 10000 minus the squared miss over 10000, so Justin (20%) 3600, Gabe (70%) 9100, Alex (50%) 7500, John (0%) 0. With N minus 1 equal to 3 the divisor is 30000: Justin to Gabe 1500 x 5500 / 30000 = 275; Justin to Alex 500 x 3900 / 30000 = 65; John to Justin 1500 x 3600 / 30000 = 180; Alex to Gabe 500 x 1600 / 30000 = 26.67, truncated to 26; John to Gabe 2000 x 9100 / 30000 = 606.67, truncated to 606; John to Alex 500 x 7500 / 30000 = 125. Nets: minus 160, plus 907, plus 164, minus 911, summing to zero. Two beers each among the same four: the largest possible transfer is 2 x 10000 / 30000 = 0.67, which truncates to zero, so every transfer is zero and the market collapses to one beer from the lowest scorer (John) to the highest (Gabe); with three tied at the bottom nothing moves.

Those figures are the expectations in `tests/unit/scoring.test.ts`, with the working in the comments. They were then met four independent ways: a TypeScript mirror written from the specification rather than from the contract (`src/lib/ledger/scoring.ts`); the deployed contract's own `scoreBinary` and `pairwiseTransfer`, called read-only and compared with the mirror across the range, including where truncation bites; a real four-person market on Monad testnet with exactly those stakes and numbers and one dissenting vote, whose six minted edges and four nets match the hand figures to the cent; and `verify-envio`, which now recomputes, for every market the indexer knows, the edges the rule produces from the chain's own positions and outcome, and compares them with what was minted. A mutant that restores nearest rounding kills five tests.

## 2026-09-19: Binary markets, the offchain half: what the frozen schema did not say (fills gaps)

Built as PLANNING.md 5a, 5b, 6, and 8 specify. These are the places the documents were silent, each decided the way that forecloses least, and each flagged for review.

- The creator's `Create` signature has to wait somewhere until lock, as every `Enter` signature waits on its position. `dares.creator_signature` (migration `0008`). It also defines the states the table has no column for: no signature is a draft only its creator can see, a signature is open, `locked_at` is locked, `resolved_at` is decided. Alternative rejected: the creator signing at lock. It would make lock impossible without the creator's device in hand, and close-time locking (later) needs the signature to exist already.
- "Nobody can tell" is the largest uint256 onchain, which a bigint column cannot hold. Offchain it is minus one (`VOID_OUTCOME`) in `dare_votes.outcome`, `dares.ai_outcome`, and `dares.resolved_outcome`, converted only where a vote is signed or sent. A voided market is therefore `resolved_by = 'quorum'` with `resolved_outcome = -1`, and the void toll is that row: permanent, and countable against the creator's clean-resolution rate when profiles exist.
- The anchor's one-line rationale is specified as displayed and had no column: `dares.anchor_rationale`.
- The outcome proposal reads "a one-line update from any participant", which had no table. `dare_statements` holds it: one line per person about what happened, before arbitration as well as during it. The model was not there, so with nothing said it proposes nothing and the ballot opens with nothing picked; it never guesses an outcome from the question.
- "The creator may state a line, and it defaults to 50 percent" is read as the creator's own number, which starts at 50 like everyone's. There is no separate creator's line beside the AI anchor. If a distinct line was meant, it needs a column and a place on the card.
- A number can be changed until lock, each change a fresh signature over the new numbers (the signature is what goes onchain). A vote can be changed until the market is decided.
- Lock is the creator's action in 2A. Close-time locking needs a timer, and nothing here runs on a timer yet.
- A market takes at most twelve positions. Sixty-six edges is 10.7 million gas at the measured rate, inside Monad's per-transaction limit with room; the cap is where the declared cost stops being reasonable, not where it stops being possible.
- The threshold shown before lock is computed from the group's account-holders; at lock the contract's own figure, from its own snapshot of the ledger, replaces it. A vote is accepted only from a governance wallet in that snapshot, read from the chain at vote time, so someone who joined after lock is told plainly that it is not theirs to call.
- If a settlement succeeds onchain and its mirror write fails, or two final votes arrive together, the market page reconciles from the indexer: the chain's answer is taken, never recomputed.

Who sees numbers before lock: in an open market, someone who has put their own number in sees everyone's, and someone who has not sees only who is in, so an early number never anchors a later one by accident ("Their average shows once you pick", docs/design.md 3.13). A blind market hides every number from everyone until lock.

A question's share card is the question and an invitation. Never a number anyone gave, what is on it, or a name. A draft's preview is the plain card.

Not in 2A, stated so nobody assumes otherwise: `arbitrate` and `expire` are in the contract and have no screen yet (2C); arguments, careful mode, numeric and categorical questions; close-time lock; notifications of any kind (the pull path, "Needs you", is built); provisional markets and ghosts in markets (2D).

## 2026-09-19: Model calls

`src/lib/ai/` holds every model call behind two typed functions: scope a line into a question, terms, an optional set of criteria, and a number to argue with; and propose an outcome from the terms and what people said happened. Output is forced through a tool call and parsed with Zod; a wrong shape throws (the first live call returned a list as a string, which the parse caught and the schema now reads either way). Drafting uses `claude-sonnet-5`, rulings `claude-fable-5-1`, both overridable by environment; the ruling model refuses a forced tool choice, so the wrapper asks instead and the parse still enforces the shape. A model is never on the critical path: scoping that is slow, down, or malformed falls back to the line as typed, and says so on the screen; a failed proposal leaves the ballot open with nothing picked. Typed text reaches the model inside tags as data, with an instruction to treat it as data. The anchor prompt forbids claiming to know anyone's habits, after the first draft invented "John's history of dozing off".

## 2026-09-19: DarefulDares gas, re-measured on Monad

`scripts/gas-survey-dares.ts`, Monad's own `eth_estimateGas` against real locked markets: `create` is 365k plus 104k a position (quorum of five); `resolve` in its worst case is 167k plus 107k an edge; a VOID resolve is 74k flat. The Phase 0 extrapolation was about 2.3 times too high, which on a chain that charges the declared limit was a 2.3 times overpayment on every market. New limits are the measurements plus about thirty percent, with extra room per edge for first mints into empty slots, and VOID has its own small limit so it never pays for edges it cannot mint. The first fresh-group market (every slot empty) locked and resolved inside the new limits. `arbitrate` and `expire` are derived, not measured; measure them in 2C.

## 2026-09-19: Envio: no redeploy was needed for 2A; auto-deploy is off; two risks recorded

The market handlers and schema shipped with Phase 0, so the hosted indexer had them already and had simply never seen a market event. The first real markets indexed correctly on first contact (status, outcome, every score, all six edges linked to their market through the settlement transaction, voids with nothing minted), and `verify-envio` against the hosted endpoint checks them. Deployment two of three is unspent. `auto-deploy` is now off, so a push to `envio` no longer spends a slot by itself; deploys are `envio-cloud deployment deploy dareful <commit>`, per the runbook above.

Risk, judging window: the hosted endpoint is limited to 100 queries a minute, about 1.6 a second across every user, and every person-view, group-view, and market reconcile is one query. A handful of judges clicking at once could hit it, and a refused query is a page error. Mitigations available without an upgrade: cache a pair's open edges for a few seconds, and let the group page and the person page share one query.

Decision recorded: upgrade to Production Small (70 dollars a month) around 2026-10-10. The Development deployment made on 2026-09-19 ages out after thirty days, which is 2026-10-19 and plausibly mid-judging, and the paid tier also lifts the rate limit. Upgrading before the gate rather than at it leaves time to move `ENVIO_GRAPHQL_URL` by the runbook and verify.

## 2026-09-19: The 2A audit of the checks

Every test added in 2A arrived with a mutant, and the whole suite was run through the audit at the end: 213 mutants, every locally runnable test killed by at least one, tree restored. Three things it found. A test of mine, "forty queries at once all succeed, so a prepared-statement clash would show", kept passing with prepared statements switched back on, so its claim was false; deleted. "A draft is listed to nobody" survived its first mutant because drafts are excluded twice, so its mutant removes both guards. And a mutant went stale when the code beside it changed, which the runner reports as an error rather than a pass. The onchain market tests are audited only with mutants that fail on the way to the chain, so the audit proves those tests can fail without paying gas to do it.

# Phase 2B (2026-09-19)

## 2026-09-19: Rulings carried into 2B

There is no creator's "line": `lineBps` went out with cut-and-choose, the creator states a probability like everyone else, and the AI anchor is the only other number on the screen. `dare_statements` is reused for "here is what happened" and gains a `kind` column (`update`, `statement`), because arbitration in 2C must not be handed one as the other. Lock stays the creator's action in 2B; required before 2C: a scheduled job (Vercel Cron is the obvious one) that locks at close time and gives `expire()` a caller, because a market nobody locks hangs forever. Not built now. Field and form errors are now specified (docs/design.md 5.1) and the marigold rule invented in 2A is gone: marigold means what happened, today, and the next tap, so an error in it competed with the button. Ink carries errors.

## 2026-09-19: The "still setting up" blocker: a session without a Dynamic login, which is the normal state of a second device

Two of four accounts could not enter or create a market for hours. Diagnosed before anything changed. Every `users` row had both keys recorded; both existed in Dynamic for every account; nothing had failed partway. The gate was reading something transient: the three signing paths looked the recorded address up in the SDK's in-browser `useUserWallets()` list, which the SDK builds from its own logged-in user, and called an empty list "still setting up. Give it a second." The Dareful session is a thirty-day cookie. The Dynamic login lives in one runtime's storage, exists only where the person actually typed a code, and lasted two hours. So someone who arrives on a phone already signed in to Dareful has no Dynamic login there; one account failed identically in an installed PWA and in a browser tab on the same phone while working on the desktop where it had authenticated. This is the ordinary path, not an edge. It was also two Principle 9 violations in one sentence: a permanent state reported as transient, and blamed on setup that had succeeded. Every signature that ever worked on any account was made within minutes of a login in that same browser, which is why a single-sitting test never saw it.

Fixed, designed for that path first. What a device can do is decided in one place (`src/lib/auth/device.ts`, pure and tested; `useDevice`), when a screen loads and not when someone taps to approve, because the worst place to discover it is a ballot. A person with a session and no Dynamic login here sees a notice at the top of every screen saying this device has not checked it is them and offering the code step; they can read everything. A tap to approve in that state opens the code step and carries on with the signature when it completes. A Dynamic login for a different account than the session makes the session follow the login, through the same server check as any login (the code is the stronger fact; a cookie never outranks it). A confirmed login whose recorded keys do not appear within eight seconds is called what it is, permanent until they sign in again, with that action offered; nothing anywhere says to wait. Each of these states is logged once per page load (`/api/device-state`: state, installed or tab, user agent, user id), because the database could not show any of it.

Rejected: checking only at the moment of signing (the interruption lands mid-action); signing the person out of Dareful when Dynamic is absent (they lose read access to their own ledger on every second device, and a link tap lands on a login wall); carrying the Dynamic login across devices (not possible, and it is the property that makes a vote un-forgeable by the server); server-side signing as a fallback (breaks rule one). Delegation in Phase 3 removes the prompt for ledger actions on any device; a vote will always need the code step on a new device, by design.

The pattern, swept: the only readers of SDK in-browser state are the login bootstrap, the sign-in and sign-out buttons, and the three signing paths, which now all go through `useSigner`. Rule: nothing but `useDevice` reads the SDK to decide what a person can do.

## 2026-09-19: Two session lifetimes that must stay matched

Dynamic's `jwtDuration` is set to 30 days in its dashboard to equal the Dareful session cookie (`SESSION_DAYS` in `src/lib/auth/session.ts`). They were 2 hours and 30 days, and diverged silently. Change one only with the other. Matching them does not fix the case above (a runtime that never had a login); it only stops a working device from lapsing into it every two hours.

## 2026-09-19: Fixtures that stand in for an external system are derived from that system

The phone-hash bug passed every test and every mutant because the fixture shared the code's misspelling; mutation testing validates a shared misunderstanding against itself. Rule: a fixture for anything an external system sends is recorded from it or built by its own serializer, never typed. Audit: the phone credential (serializer-built, and now checked against a real phone credential from Dynamic's API: `phoneNumber`, `phoneCountryCode`, read and hashed by the fixed code); the wallet credential had no fixture at all and now has one recorded from Dynamic, with a test that its keys equal the serializer's; model responses had no tests and now have three responses recorded from the API (`scripts/dev/record-ai.ts`), with the parser split from the call so it runs against them; Envio and the chain have no fixtures because tests use the real ones; the Vercel region header's name was from documentation only and its absence on Vercel is now logged.

Contact picker output is the open one, and it is the phone-hash shape exactly: seven hand-written spellings, no real sample, on the binding path that has never worked in production. Contact parsing is unverified whatever its tests say, and the test file says so at the top. Every picked number now logs its shape with every digit masked to 9 (`picked number shape`), which carries nothing of the number; the ghost checkpoint produces real shapes and they replace the guesses. Rejected: logging or storing a raw sample, even once.

## 2026-09-19: Four gaps in the event-first rework and notifications, asked and ruled

An unnamed group's chip. Asking with no group picked makes a group of whoever joins, with no name. Its chip reads as its most recent market's title, truncated; first names ("You, Priya, Theo") when it has no titled market yet; and the second or third market with the same members offers to name it. Rejected: first names always (reads as a list, not an occasion); a "where are you" field on the ask screen (a field in the fastest flow in the app).

A market link or code joins an account-holder at once. PLANNING.md line 171 says a non-member's position is pending until the creator taps; its schema says a user's position is always acknowledged (`check (user_id is null or acknowledged_at is not null)`). The schema wins for account-holders: the link or code makes them a member of the market's group and they can enter, the same exposure as a group invite link, and the creator can remove anyone before lock. Pending-until-tapped remains the rule for ghosts and arrives with them in 2D. Rejected: relaxing the check and adding an approve step to the fast loop.

No scheduler in 2B. 8d's first notice (the creator, when `resolves_by` arrives) needs a timer, and none exists. The market instead appears in the creator's "Needs you" from `resolves_by`, computed at read time. Everything after it is caused by a person and is sent: each vote notifies the remaining quorum with the count, and reaching the threshold sends the result to everyone who had not voted. The scheduler required before 2C (lock at close, `expire()`, this notice) is one job.

Email is Resend. The address is read from Dynamic at send time with the read-only API token and is never stored: `users` has no email column and does not gain one. Rejected: storing the login email (personal data the app has no other use for); Postmark (approval delay). Until `RESEND_API_KEY` is set the channel is off and says so in the log; push, the voter-relayed nudge and "Needs you" carry everything.

Two tables PLANNING.md's schema did not have: `push_subscriptions` (endpoint and the two keys Web Push needs; deleted when the push service reports it gone) and `notification_log` (who was told about which market, by whose act, over which channels, never the words). The log's unique key is what stops a retry telling someone twice, and `caused_by` is never null, which is Principle 1 as a constraint: nothing is sent because time passed.

`dare_statements` gained `kind`, and its key widened to include it. The 2A build in production upserts on (market, person), so a unique index on that pair stays until 2C's migration first writes a `statement`. The app and the database deploy at different moments; a migration has to leave the running build working.

## 2026-09-19: Home is event-first, and a group is a chip

Built against `docs/design.md` 4.7 and the home, joining, link-arrival and first-run boards. Home is: Ask something (the one marigold control), a code field directly under it, "Needs you", "Just happened", people with one token each, and groups as chips that filter the screen (`/?g=`). Selecting a chip shows who is in it and the three things a group can have done to it (name it, its people and links, hide it); `/g/[id]` survives only as that "people and links" screen, reached from the chip, never from navigation. The whole screen costs one indexer query (`openTouching`), against a hosted limit of a hundred a minute.

A question can be asked with no group. That makes a group with no name and one member; whoever joins is in it. It is not a group to anyone until the question is sent, so an abandoned draft leaves no chip behind, and the draft itself is a "Finish" row for its creator only. Rejected: requiring a group first (session 3's finding: groups as the way in is why nobody could join anything and why a one-night group was permanent).

"Needs you" is assembled as data (`src/lib/ledger/home.ts`) so its rules have tests: soonest deadline first, then longest waiting, then fastest to finish; at most four rows and a plain "N more"; the section is absent when empty; and no row, heading or label counts or ages. A time that has passed reads "soon", never as lateness. The creator's "Lock" row appears when everyone is in or the time they set has passed; with no scheduler in 2B it is computed when the screen is read, and it is the only row time produces, as a consequence of the creator's own act.

Three derivations the boards did not draw, from the rationales: the verb "Lock" (3.15 lists Vote, Enter, Yep, Finish); the "Hidden" disclosure under the chips, which is how a hidden group is found again; and the device notice from the blocker fix, which uses the 5.1 summary block because it is a statement about a problem with its way out inside it.

## 2026-09-19: The room code, moved forward from 2D

`room_codes` as PLANNING.md has it: six characters, one live code per question, made on first ask by anyone in the question's group, closed when numbers lock. The alphabet is the design specification's (A to Z and 2 to 9 without O, I and Z, 31 characters), which is later than PLANNING.md's and also drops Z. A wrong shape is refused in the browser and again on the server, in words that say what is wrong, and costs nothing; a well-formed code that matches nothing costs one of twenty guesses an hour per person (`code_attempts`, a row per miss and nothing about the code), so codes cannot be walked. 31 to the sixth is 887 million; at twenty an hour against a handful of live codes that is not an attack. Already a member is not an error: straight in. The QR is drawn in the browser from the question's own link. Not built, and 2D's: the lobby as a roll call with a polled count, kick, and what a code does for someone with no account.

Joining requires a session in 2B. A signed-out person with a link is asked to sign in and lands back on the invitation. Accountless entry is 2D and is unchanged by this.

## 2026-09-19: An invitation names who asked, by first name (narrows a 2A rule)

2A's rule was that someone outside a question's group sees the question and nothing else. The design's invitation (3.17) shows who asked, the group's name if it has one, how many are in as words ("Four friends are in"), when it decides, and how it works, and never a stake, a number, the terms, or any other name. The specification wins: a signed-in person holding the link now sees the asker's first name. The share card and its preview metadata, which a bot or anyone can fetch, are unchanged: the question only. I did not draw the participant avatars the board shows, because initials are a weak form of "who is in" and the rule that an outsider never sees who is in still stands; the count is words.

## 2026-09-19: Hiding a group is built; leaving one is blocked on the contract

Hiding is `group_members.archived_at`, exactly as PLANNING.md has it: that member's view only, cleared for everyone by any new event there (a question opened, a cover logged). A hidden group asks for nothing in "Needs you" and is reachable under "Hidden".

Leaving is not built, and it is a finding rather than an omission. `DarefulLedger` has `addMember` and no way to remove one, and `DarefulDares.create` reads the quorum from `governanceOf(groupId)`. Someone who leaves offchain remains a voter onchain: they still count toward `floor(n/2)+1` on every later question in that group, and enough departures make a group unable to resolve anything. `left_at` exists offchain and is honored everywhere offchain, which is the trap: it would look like it worked. Options for a ruling, none chosen: a `removeMember` on a redeployed ledger (relayer-only like `addMember`, with the same pre-mainnet caveat about membership being relayer-controlled); or leaving as "start the next question in a new group of whoever is still here", which needs no contract change and fits groups-as-consequences; or accepting it through submission with leave hidden.

## 2026-09-19: Notifications: the cascade, three channels, and what is not sent

Every vote tells the rest of the chain's quorum snapshot, with the count and whether the reader's vote could decide it ("could", because it only does if they agree); reaching the threshold tells everyone who had not voted the result instead, and nobody is asked about something decided. Sent after the voter has their answer (`after()`), never before it and never instead of it; a channel failing costs nobody their vote. Messages and the recipient rule are pure functions with tests. No notification, and no relay text, carries an amount, a unit, or anyone's number: they land on lock screens and in group chats.

Web Push: a service worker that shows a notification and opens this app's own page when tapped, and does nothing else. No fetch handler and no cache, because every screen is rendered per person per request and a cached one is somebody's stale ledger. The subscribe route takes an endpoint only on a real push service's host over https, since an endpoint is a URL this server later POSTs to. The app gained a manifest and icons, which it never had: "installed" in sessions 2 and 3 was a bare home-screen bookmark. The permission prompt appears on the screen after a vote, once the person has done something, never on arrival. On an iPhone in a browser tab Web Push does not exist, so the screen says how to install and asks for nothing.

Email: Resend, the address read from Dynamic at send time. Off until `RESEND_API_KEY` and `EMAIL_FROM` are set and the domain is verified.

The voter-relayed nudge: the screen after a vote opens the voter's own composer with "Called '…', 2 of 5 so far. Your turn:" and the ballot link. Every notification and the nudge deep-link to `#ballot`, where the proposal is already selected.

Not sent in 2B: the creator's deadline notice (no scheduler; it is a "Needs you" row); entries, locks, covers and settlements (PLANNING.md's notification row lists them; 8d's flow is what the checkpoint and the demo need, and the rest reuse this machinery); anything to a ghost.

## 2026-09-19: Waiting, per the specification

Buttons follow 5.2: past 300ms the label stays where it was and a 2px line runs along the bottom edge; at three seconds "Still going." appears under it. The 2A button swapped its label for an ellipsis, which the specification rules out. Not built: the ten-second step that turns a wait into the 5.1 summary block with "Try again"; every action here already reports its own failure in that block, and none has been seen to run ten seconds.

# Post-2B testing (2026-09-20)

## 2026-09-20: Verification means a real signed-in session, and what that changed

Every bug in the first 2B session on production was behind a login, and none reached me because I could not hold an authenticated session. From here on the browser used for development holds real sessions on both origins (the person signs in and types the code; a credential is never handled for them), and no fix lands without being exercised through one on the surface where it was reported. A forged session cookie and a library-level check are not verification: a forged cookie is precisely the state that has no Dynamic login, so it cannot sign, and everything past a signature went unseen. Anything that cannot be exercised that way (iOS WebKit, an installed app's insets, a push actually arriving) is reported as unverified, with the exact check for a phone.

The first real two-account run (one account asking on production, the other joining, entering, nudging and voting on the development build, against the one database and the real chain) created, locked and resolved a market from a brand-new unnamed group, and is how the rest of this section was checked.

## 2026-09-20: The iOS freeze on creating a question was Dynamic's own sheet, twice; its sheet is turned off and a vote gets ours

Diagnosed in a real session before anything changed. Dynamic's dashboard had `showEmbeddedWalletActionsUI` on, so every signature opened Dynamic's "Signature request" sheet, which sets `overflow: clip` on the body while open. Creating a question signs twice (the question, then the asker's own number), so two sheets open back to back with the lock held across both. Chromium shows both. On iOS, entering someone else's question (one sheet) worked and creating (two) froze: the second sheet never appeared and the lock from the first stayed, with nothing on screen to dismiss, which is exactly "taps work, scrolling and navigation are dead". Two drafts from that evening never received their creator's signature. It was not the 2B code step, which was the first suspect.

That sheet was also a standing violation of the copy rule: "Signature request", "Termshash" and raw hex in front of a person on every confirm, entry and vote, in a product whose rule is that no screen says signature, transaction, gas, or chain.

Ruling: the sheet is turned off in Dynamic's dashboard. Rule one is about who holds the key and that the person deliberately approves, not about whose modal renders; "prompts" in the signing table means a conscious approval. So: a confirm and an entry bind only the signer, and their own button is the approval. A vote binds everyone in the question and gets a deliberate moment of its own, in the app's words: pick an answer, then a short sheet says what is being called, that it counts for everyone, how many agreeing decide it, and that nobody, the app included, can say it for them. That sheet (`src/components/ui/sheet.tsx`) never locks the page's scroll: the scrim takes the touches and the panel contains its own overscroll, so if it ever failed to render, nothing about the page underneath would have changed. Rejected: keeping Dynamic's sheet and splitting creation into one signature per tap (the hex stays, and the fix would rest on an unproven guess about which sheet iOS drops).

## 2026-09-20: Safe-area insets, paid once at the body

The back control sat under the clock in the installed app. `viewport-fit=cover` had been set since Phase 1 and 2B added a translucent status bar with the manifest; no `env(safe-area-inset-*)` existed anywhere, and earlier "installed" tests were bookmarks that kept the browser's chrome, so the page had never drawn under the status bar. The top and side insets are now paid once on `body`, so no screen can forget them; the screen's bottom padding, the sticky action area and the full-screen signup overlay pay the bottom inset themselves. Nothing is sized from `100vh`; layouts size from the parent's height.

## 2026-09-20: Three more notifications, a nudge anyone can send, and the permission ask moved earlier

No device had ever subscribed and nothing had ever been sent: joining was never an event, and the permission ask sat on the screen after a vote, which is after the first notification would have been useful. Added: a question opened in your group, to the group ("Priya asked something"), which is the canonical send-worthy notice under Principle 1; someone got in, to the asker, once per person and never for a changed number; and a nudge, one tap from someone who is in to whoever is not ("Maya is waiting on you"), to get-in while numbers are open and to the ballot once locked. The nudge is a person acting, so Principle 1 allows it where a timer would not be, and it is a notification anyone can trigger on demand. Because a person can tap twice, each recipient hears about each question at most once per six hours, whoever is asking; only someone who is in can send one; and the screen says honestly how many devices it reached, offering the sender's own composer for the rest. The permission ask now appears after asking or entering.

## 2026-09-20: Prefetch is off by default

Every screen is rendered per person per request, so a prefetched link is a full server render, and a person or market page also queries an indexer capped at a hundred a minute. Home was firing about a dozen on every load (seen in the production request log), which is both the likeliest cause of the slowness testers reported and a rate-limit risk with several people browsing. Prefetch is now off on every link, and on by opt-in for exactly two that are cheap and likely: the joining screen and the primary "Ask something". To be measured on production after deploy, before any other performance work.

## 2026-09-20: Device states are kept in a table

`device_states`: who, which state, installed or not, and one of four platform words. The host keeps log lines for an hour on this plan, and a sign-out problem that recurs over days needs evidence that outlives that. Never the user agent string. The sessions-ending report itself: Dynamic's API now reports `jwtDuration` as thirty days and a fresh login carries a thirty-day token; tokens issued before the change kept their two-hour life, and an installed app and the phone's browser each need their own code, which looks the same from a phone. If it recurs, this table says which.

## 2026-09-20: Leaving a group: deferred, with a correction recorded so it is not lost

Deferred while groups are being redesigned. Recorded because the premise matters when it returns: `DarefulDares.create` sets the quorum to `ledger.governanceOf(groupId)`, every member ever registered onchain for that group, and calldata cannot narrow it. An offchain `left_at` therefore cannot keep a departed member out of a new question's quorum or threshold. The contract's member list is a record of everyone who was ever in, never the current truth. A removal function stays rejected (a compromised relayer that can shrink a quorum is worse than one that can inflate a group). The shape that needs no contract change: after someone leaves, the next question in that group starts in a new group of whoever is still there.

# The market screen, the picker, and home without groups (2026-09-20)

`docs/design.md` and the design export were replaced wholesale. Where the specification and PLANNING.md disagree the specification wins on anything visual and this log wins on anything structural.

## 2026-09-20: Prefetch, measured on production

One load of home in a real signed-in session, counted in the host's request log: the home render, plus `/m/new` and `/join` (two requests each, the two opted-in links), and nothing against the indexer. Before the change the same load was about a dozen renders including every person and market page on the screen. No other performance work is planned until someone reports slowness again.

## 2026-09-20: A notification opened whatever question the phone was last on

The worker's tap handler navigated the existing window and then focused it, and where navigating is refused (iOS does, at times) it did nothing further, so the app came forward on the screen it already had. Now: focus, then navigate; if navigating is refused or missing, the page is told where to go and goes; and with the app fully closed a window is opened at the address, which is also left in the one cache this app keeps (for a minute, used once, own-origin only) because some installed apps open at their start page and ignore the address. The page collects it on start and whenever it returns to the front. The handler is run in tests against stand-ins for the browser's objects, which is a contract and not a phone: the backgrounded and cold-start cases are on the checkpoint for a device. Rejected: a query parameter on the start page (it would survive in history and reopen an old question), and keeping state in the worker's memory (a worker is killed between events).

## 2026-09-20: Home holds markets, people, and what needs this person. Groups are not on it

Order: ask (the one marigold control), join (a field and an outlined button), "I got this one" (text), needs you, just happened, people. Three tiers in three weights. People with something open get a row each; everyone square is one row with an avatar stack and a sentence, because four rows that each say "nothing open" is four repetitions of nothing, and that rule applies to any list with an empty case. Sign out lives behind the avatar, in a sheet derived as the app's smallest: the person's name, a way to their own page, and sign out.

The group list is gone, and with it `/g/[id]` and `/g/new` (an old address goes home), the chips on home, hiding a group, and the group page's controls. Leaving and archiving are not built and stop needing to be: a set of people that stops asking questions stops being mentioned. `group_members.archived_at` and `left_at` stay in the schema, unused by any screen. A group does its work in two places only, the picker and the band on a person view. Superseded: 2B's chip-filtered home, "hide it for me", and the rule that an unnamed group is called by its latest question. A set nobody named is now a description of some people ("Priya, Gabe and you"), and nothing anywhere says unnamed or untitled. Consequence recorded: with the group page gone there is no screen for a group's invite links or for adding a ghost to a group; people get into a set by being picked or by joining a question, and a ghost is made from "I got this one".

## 2026-09-20: The same-people picker, and what picking people does

Asking is three steps: the question, who's in, the terms. The terms are written up while the person chooses who's in, so the wait is spent on the one decision that needs them anyway. The most recently asked set is preselected; sets order by last asked, then by how often. Named and unnamed sets are the same row in the same weight; the caption carries the difference ("Last time, on Friday", "Six of you, back in August"). The naming question appears under the selected row when that set is asking its second question, never blocks, and is never asked again after two not-nows (`groups.name_prompt_dismissals`, a property of the set, since the point is that the set stops being asked).

"Someone else" opens a list of people the asker already shares something with. Picking them resolves to the set that already has exactly those people, or makes one; one other person is the two of them. An id the asker shares nothing with is refused, because a member of a question's set is a voter in its quorum and an id must never be a way to make one. "Whoever I send it to" is a set of one that grows as people join by link or code. Everyone picked is a member at once, hears that it was asked, and counts toward the quorum at lock whether or not they get in, which is how a named set already behaved. Rejected: making picked people members only once they enter (the quorum would then be whoever entered, and a question could be resolved by its entrants alone before the others had seen it).

## 2026-09-20: The market screen is one object in two states, weighted by stake

The entry control and the picture of where everyone landed are the same ten tenths: a 5 by 2 grid of 56px tiles filling cumulatively while choosing, one row of ten 120px columns filling per tenth by how much is riding there once in. The grid merges into the row in 200ms, the chosen tiles collapse into one column in 240ms, everyone else's weight rises staggered 30ms apart, and the marker draws last, under 800ms; with reduced motion the resting state renders directly. What confirms an entry is not the animation but the line it leaves, which is there on every visit: "You're in at 7 in 10", the stake, and "yours to change until it closes". No toast.

Weight, not count, and that is the point rather than a detail. The specification's example is a test: six numbers averaging 6 in 10 with a group's number of 4 in 10 because one person holds half of what is riding at the bottom of the range (425 / 95 = 4.47, by hand). `src/lib/ledger/weight.ts` holds the arithmetic in integers: `bucket(v) = ceil(v/10)`, heights in thousandths of the tallest column, the group's number as the stake-weighted mean shown to the nearest whole tenth with the exact figure in the setup sheet, a marker from the third entry, and a caption that says in words what the picture says in shapes and names any one stake over half of what is riding. The caption and everything around it stay inside the vocabulary boundary (4.6): the group's number, where the stake sits, what's riding. Never odds, price, pot, or "the market says". A test holds the market screen to that list.

The anchor leaves the screen once someone is in (three numbers on one screen is one too many), returns inside Change because that is choosing again, and stays readable in "How this was set up". Change is a 44px tertiary on the receipt line and never primary: once in, the screen's primary act is getting other people in, until everyone is, and then it is the asker's lock, so there is still one marigold control. After lock Change is gone and the line reads "Locked at 11pm", with nothing greyed.

Blind: outlined columns with no heights, the viewer's tenth marked with their avatar and a small cap, a centred lock chip reading "Weights show when everyone's in", an honest count of who is in, and no group's number, since an aggregate leaks the shape. The reveal is at lock. The specification's chip says "when everyone's in" and its state is named "blind until lock"; in a question anyone with the link can still join, "everyone" is only defined by the asker locking, so lock is the moment and the copy is the specification's. Asking gained the one control that makes a blind question possible ("Shows once you've picked" or "Hidden until it's locked").

The sparkline is drawn only when a question has been open more than 24 hours and has at least four in, both checked at render. It plots `dare_number_series`, a new table written on every entry and change: the group's number at that moment and a headcount, and nothing about whose entry moved it, because plotting entries would out people's timing.

## 2026-09-20: Positions are editable until lock, never after

Already true in the build (an entry is an upsert with a fresh signature, and nothing is onchain before the one atomic `create` at lock); the receipt line now promises it and Change delivers it. The reasoning: the scoring rule is proper, so reporting what you actually believe maximizes your expected score whatever anyone else said. Updating after seeing other numbers is what a forecaster does, not an exploit. It also removes a real asymmetry: in an open question the last person in sees everything and nobody gets to react; letting anyone revise until lock makes everyone a last mover. After lock the outcome may already be knowable, so lock is a hard cutoff with no exceptions, enforced in `enterMarket` and again by the contract, which has no way to change a position at all.

## 2026-09-20: One stake unit per question: an existing property, now load-bearing

No new restriction was added. A question has always carried one `denom_id` (`dares.denom_id`, and `Dare.denomId` onchain, with every position's stake in units of it), so positions could never mix beers with dollars. It matters now because the weight line weighs stakes against each other, which only means something within one unit. The terms step says so in a line, and the setup sheet repeats it.

## 2026-09-20: A stake of nothing is drawn but cannot be entered

The specification draws a no-stake entry as an 8px hollow dot on the baseline of its tenth: a person with a view and no exposure. The scoring rule handles it (every transfer involving a zero stake is zero). The deployed contract does not: `_enter` reverts `BadStake` on a stake of zero, and `create` is atomic, so one such position would fail the whole lock for everyone. Ruled: the weight line draws and tests the dot and the all-zero picture (a row of dots, and a group's number that falls back to the plain mean so the picture still says something true), and the entry screen's minimum stays one unit. Zero becomes enterable at the next contract deploy, which mainnet needs anyway for governance-signed membership. Rejected: keeping zero-stake people offchain and out of `create` (N in the pairwise rule would then exclude them, making everyone else's transfers larger than agreed, and the chain's record of who was in would be incomplete); redeploying now (orphans the onchain history mid-testing and spends an indexer deployment).

## 2026-09-20: What the real session found that a forged one could not

Dynamic's SDK caches the project's settings in the browser, so after the signing sheet was switched off in the dashboard (and confirmed off through both the environment API and the public settings endpoint browsers load), the development browser kept showing it across reloads. Phones had picked up the change. Worth knowing the next time a dashboard change "did not take".
