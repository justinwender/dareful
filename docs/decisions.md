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
