/**
 * Drizzle schema for every table in PLANNING.md section 5b.
 *
 * Every table has row-level security enabled with no policies, which denies everything to the Supabase API
 * roles. The application connects over DATABASE_URL as the table owner, which bypasses RLS. The browser gets
 * no Supabase connection at all.
 *
 * Money is integer cents (bigint). Quantities are integer units (bigint). Timestamps are timestamptz.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  index,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const money = (name: string) => bigint(name, { mode: "bigint" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ------------------------------------------------------------------------------------------------------
// Identity
// ------------------------------------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  dynamicUserId: text("dynamic_user_id").notNull().unique(),
  /** Salted hash of the login phone, when phone login was used. Lets a picked contact resolve to a user. */
  phoneHash: bytea("phone_hash").unique(),
  /** Lowercase hex. */
  ledgerWallet: text("ledger_wallet").notNull().unique(),
  governanceWallet: text("governance_wallet").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  /** When the one ask for the phone's permission was answered, whichever way (docs/design.md 4.10): asked once, on the account, never again. */
  headsUpAnsweredAt: ts("heads_up_answered_at"),
  /** When the one explainer for passing the phone was seen, whichever way it went (docs/design.md 3.42, 3.45): asked once, on the account. */
  handOverExplainedAt: ts("hand_over_explained_at"),
  /** When the one card offering an email or Google to an account the app cannot reach was shown (the first-contact round, 2026-10-04): once, on the account. */
  reachCardAt: ts("reach_card_at"),
  /** The screens whose first-visit tips this person has seen (docs/design.md 10.9), by their shape ("/m/[id]"): a screen counts once its first tip has shown. */
  tipsSeen: text("tips_seen").array().notNull().default(sql`'{}'::text[]`),
  /** Stake units this person added on You (the touch-ups round, section 11), offered beside Dollars, beers, rounds and a next time when they ask: each a word, lower case. */
  ownUnits: text("own_units").array().notNull().default(sql`'{}'::text[]`),
  /**
   * Left out of every count (the field round, 2026-10-02): the owner's own accounts, the simulator's and the
   * localhost sessions, the QA accounts. Set by hand, never by the app; a market counts only when someone counted
   * is in it.
   */
  excludedFromCounts: boolean("excluded_from_counts").notNull().default(false),
  /** The zone this person's browser last reported (an IANA name), kept on each open of the app: a notice held for the night is held in the recipient's own night (the field round, 1.8 as amended). Null until a browser has reported one. */
  zone: text("zone"),
  createdAt: ts("created_at").notNull().defaultNow(),
}).enableRLS();

export const participantClaims = pgTable(
  "participant_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    /** From the contact picker when the creator picked this person; null for typed names. */
    phoneHash: bytea("phone_hash"),
    /** The creator whose link they first tapped. */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    /** Set on bind; every row referencing this claim is rewritten to the user. */
    claimedBy: uuid("claimed_by").references(() => users.id),
    claimedAt: ts("claimed_at"),
    /** Set when a creator merges two ghosts; the survivor is merged_into's target. */
    mergedInto: uuid("merged_into").references((): AnyPgColumn => participantClaims.id),
    /** A guest left out of every count, as `users.excluded_from_counts` leaves out an account (the final round, section 9): set by hand only, for a test made as a guest. */
    excludedFromCounts: boolean("excluded_from_counts").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Phone binding looks claims up by hash across every creator who ever picked that person.
    index("participant_claims_phone_hash").on(t.phoneHash),
    // One creator picking the same contact twice reuses the ghost instead of racing into a second one.
    uniqueIndex("participant_claims_creator_phone")
      .on(t.createdBy, t.phoneHash)
      .where(sql`${t.phoneHash} is not null and ${t.claimedBy} is null and ${t.mergedInto} is null`),
  ],
).enableRLS();

export const claimTokens = pgTable("claim_tokens", {
  /** sha256 of the browser token; the token itself is never stored. */
  tokenHash: bytea("token_hash").primaryKey(),
  claimId: uuid("claim_id")
    .notNull()
    .references(() => participantClaims.id),
  issuedAt: ts("issued_at").notNull().defaultNow(),
}).enableRLS();

/**
 * A link a creator sends a ghost through their own composer. Its token is never the browser token: opening
 * the link issues a fresh claim_tokens row for that browser, so one claim can have several tokens
 * (docs/decisions.md 2026-09-18). Like every link, it never authenticates.
 */
export const claimLinks = pgTable(
  "claim_links",
  {
    /** sha256 of the link token; the token itself is never stored. */
    tokenHash: bytea("token_hash").primaryKey(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => participantClaims.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("claim_links_claim").on(t.claimId)],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Groups and denominations
// ------------------------------------------------------------------------------------------------------

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** bytes32; null until the first confirmed mint registers it. */
  onchainId: bytea("onchain_id").unique(),
  /** Null for implicit dyads. */
  name: text("name"),
  isDyad: boolean("is_dyad").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  /**
   * How many times "want to call them something?" has been waved away for this set. It is offered when a set
   * asks its second question and never again after two (docs/design.md 3.20). A property of the set, not of a
   * person: the point is that the set stops being asked.
   */
  namePromptDismissals: smallint("name_prompt_dismissals").notNull().default(0),
}).enableRLS();

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    /** Exactly one of user_id, claim_id is non-null. */
    userId: uuid("user_id").references(() => users.id),
    claimId: uuid("claim_id").references(() => participantClaims.id),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    /** Membership ends; obligations survive. */
    leftAt: ts("left_at"),
    /** Per-member view preference, never group state. */
    archivedAt: ts("archived_at"),
  },
  (t) => [
    check("group_members_user_xor_claim", sql`(${t.userId} is null) <> (${t.claimId} is null)`),
    unique("group_members_group_user").on(t.groupId, t.userId),
    unique("group_members_group_claim").on(t.groupId, t.claimId),
  ],
).enableRLS();

/**
 * A link that lets a signed-in person join a group. Joining makes someone a quorum member in every later
 * market there, so a link is revocable and its joins are counted (docs/decisions.md 2026-09-18). Like every
 * link, it never authenticates.
 */
export const groupInvites = pgTable(
  "group_invites",
  {
    /** sha256 of the link token; the token itself is never stored. */
    tokenHash: bytea("token_hash").primaryKey(),
    /**
     * What the token is derived from, with a server secret, so a member can be shown the same link again
     * without the link ever being stored. Useless without the secret. Null on links made before 2026-09-19,
     * which still work and can be turned off but cannot be shown again.
     */
    seed: uuid("seed"),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    /** Joins through this link. An existing member tapping it again is not a use. */
    useCount: integer("use_count").notNull().default(0),
    /** Set by any current member of the group; a revoked link reads as expired. */
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("group_invites_use_count_nonnegative", sql`${t.useCount} >= 0`),
    index("group_invites_group_created").on(t.groupId, t.createdAt),
  ],
).enableRLS();

export const denominations = pgTable(
  "denominations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Every denomination is group-scoped onchain. */
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    /** bytes32; null until first use registers it onchain. */
    onchainId: bytea("onchain_id"),
    /** 'usd' | 'beer' | 'coffee' | 'round' | 'next_time' | null for custom. */
    template: text("template"),
    label: text("label").notNull(),
    pluralLabel: text("plural_label").notNull(),
    quantifiable: boolean("quantifiable").notNull(),
    monetary: boolean("monetary").notNull(),
    emoji: text("emoji"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    lastUsedAt: ts("last_used_at"),
    /** 'emoji' | 'image' | null for no mark. Blank is the default and stays blank. */
    markKind: text("mark_kind"),
    /** The emoji, or a media id as text for a picture mark. */
    markValue: text("mark_value"),
  },
  (t) => [
    unique("denominations_group_onchain").on(t.groupId, t.onchainId),
    check(
      "denominations_template_known",
      sql`${t.template} is null or ${t.template} in ('usd', 'beer', 'coffee', 'round', 'next_time')`,
    ),
    check("denominations_mark_kind_known", sql`${t.markKind} is null or ${t.markKind} in ('emoji', 'image')`),
    check("denominations_mark_both_or_neither", sql`(${t.markKind} is null) = (${t.markValue} is null)`),
  ],
).enableRLS();

/**
 * One row per contact resolution that carried a phone number, for the per-user hourly limit. A picked number
 * resolving to an account or to a ghost is an account-existence oracle (docs/decisions.md 2026-09-18); the
 * limit caps how fast one signed-in person can ask. The row holds who asked and when, and nothing about the
 * number: not the number, not its hash, not what it resolved to.
 */
export const contactResolutions = pgTable(
  "contact_resolutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("contact_resolutions_user_created").on(t.userId, t.createdAt)],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Obligations
// ------------------------------------------------------------------------------------------------------

export const obligationProposals = pgTable(
  "obligation_proposals",
  {
    /** Becomes obligationId (bytes16) on confirm. */
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    /** Debtor; exactly one of from_user, from_claim is non-null. */
    fromUser: uuid("from_user").references(() => users.id),
    fromClaim: uuid("from_claim").references(() => participantClaims.id),
    /** Creditor; exactly one of to_user, to_claim is non-null. */
    toUser: uuid("to_user").references(() => users.id),
    toClaim: uuid("to_claim").references(() => participantClaims.id),
    denomId: uuid("denom_id")
      .notNull()
      .references(() => denominations.id),
    /** Null iff the denomination is unquantifiable (enforced by trigger; see the custom migration). */
    quantity: money("quantity"),
    uniqueObligation: boolean("unique_obligation").notNull().default(false),
    /** Magnitude, may be shadow. Never rendered for a non-monetary denomination. */
    amountCents: money("amount_cents"),
    /** 'manual' | 'expense' | 'dare' | 'roulette'. */
    origin: text("origin").notNull(),
    originId: uuid("origin_id"),
    settleExpected: boolean("settle_expected").notNull(),
    memo: text("memo"),
    /** 'pending' | 'confirmed' | 'declined' | 'disputed'. */
    status: text("status").notNull(),
    /** Accountless debtor tapped "you got me"; no binding force. */
    concededAt: ts("conceded_at"),
    /**
     * Provenance, set only when a claim binds. Binding rewrites from_claim or to_claim into a user, and these
     * keep the one fact that rewrite would lose: this side used to be a ghost. A pending row with
     * to_bound_claim set needs the debtor's fresh confirmation of who the creditor turned out to be, and a
     * row with from_bound_claim set always prompts, delegated or not (docs/decisions.md 2026-09-18).
     */
    fromBoundClaim: uuid("from_bound_claim").references(() => participantClaims.id),
    toBoundClaim: uuid("to_bound_claim").references(() => participantClaims.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    check("obligation_proposals_from_xor", sql`(${t.fromUser} is null) <> (${t.fromClaim} is null)`),
    // Provenance describes a side that is now a user, so it can never sit beside a live claim on that side.
    check("obligation_proposals_from_bound_is_user", sql`${t.fromBoundClaim} is null or ${t.fromUser} is not null`),
    check("obligation_proposals_to_bound_is_user", sql`${t.toBoundClaim} is null or ${t.toUser} is not null`),
    check("obligation_proposals_to_xor", sql`(${t.toUser} is null) <> (${t.toClaim} is null)`),
    check("obligation_proposals_quantity_positive", sql`${t.quantity} is null or ${t.quantity} > 0`),
    check("obligation_proposals_amount_nonnegative", sql`${t.amountCents} is null or ${t.amountCents} >= 0`),
    check("obligation_proposals_origin_known", sql`${t.origin} in ('manual', 'expense', 'dare', 'roulette')`),
    check(
      "obligation_proposals_status_known",
      sql`${t.status} in ('pending', 'confirmed', 'declined', 'disputed')`,
    ),
  ],
).enableRLS();

/** The offchain shadow; one row per confirmed mint. Open, settled, and forgiven are derived from Envio. */
export const obligations = pgTable(
  "obligations",
  {
    /** Same uuid as the proposal. */
    id: uuid("id").primaryKey(),
    tokenId: numeric("token_id", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    fromUser: uuid("from_user")
      .notNull()
      .references(() => users.id),
    toUser: uuid("to_user")
      .notNull()
      .references(() => users.id),
    denomId: uuid("denom_id")
      .notNull()
      .references(() => denominations.id),
    quantity: money("quantity"),
    uniqueObligation: boolean("unique_obligation").notNull(),
    amountCents: money("amount_cents"),
    origin: text("origin").notNull(),
    originId: uuid("origin_id"),
    settleExpected: boolean("settle_expected").notNull(),
    memo: text("memo"),
    /** The settlement photo (Principle 6), once one is captured. */
    mediaId: uuid("media_id").references((): AnyPgColumn => media.id),
    confirmTx: bytea("confirm_tx").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    /**
     * When the creditor closed it, written by the app at that moment (docs/decisions.md 2026-09-25): the offchain
     * clock the timeline orders by, so a settlement or a forgiveness can sit in "Just happened". Whether it was
     * settled or forgiven stays derived from the chain, as does what is still open.
     */
    closedAt: ts("closed_at"),
  },
  (t) => [
    check("obligations_quantity_positive", sql`${t.quantity} is null or ${t.quantity} > 0`),
    check("obligations_amount_nonnegative", sql`${t.amountCents} is null or ${t.amountCents} >= 0`),
    check("obligations_origin_known", sql`${t.origin} in ('manual', 'expense', 'dare', 'roulette')`),
    check("obligations_not_self", sql`${t.fromUser} <> ${t.toUser}`),
  ],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Markets
// ------------------------------------------------------------------------------------------------------

export const dares = pgTable(
  "dares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null before lock, and forever if provisional (any participant without an account). */
    onchainId: bytea("onchain_id").unique(),
    /**
     * The onchain group the market was created in, read back from the chain at its lock (the games-and-the-reveal
     * round, 2026-10-07): its set's own group when that was exactly the people in, else the question's own group of
     * exactly them. Null while it is not on the chain.
     */
    chainGroup: bytea("chain_group"),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    /** 'binary' | 'numeric' | 'categorical'. */
    kind: text("kind").notNull(),
    /** 'dare' | 'argument'. */
    pace: text("pace").notNull(),
    /** Always has an account. */
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    /** AI-drafted, creator-approved; includes the criterion; hash goes onchain. */
    termsText: text("terms_text").notNull(),
    /** ['no','yes'] for binary; the answers, in the asker's order, for categorical (two to six); unit name for numeric. */
    outcomeLabels: text("outcome_labels").array().notNull(),
    /**
     * Categorical only (docs/design.md 3.29): which answers are people, aligned with `outcome_labels`, the person's
     * id where the answer is a person and null where it is words. A person answer can be anyone the asker knows in
     * the app, whether or not they end up in the market. Null when no answer is a person.
     */
    answerPeople: uuid("answer_people").array().$type<Array<string | null>>(),
    /**
     * Numeric only: the scoring scale, fixed when the question is asked and never derived from entries
     * (docs/decisions.md 2026-09-24). Scoring divides a miss by it; a miss of the whole scale scores zero.
     */
    range: money("range"),
    /** 'asker' | 'ai' for a number market: whose scale it is. Only an asker's is ever shown (docs/design.md 3.26). */
    rangeSource: text("range_source"),
    /**
     * The model's most likely answer for a number market, when it scoped the question: the reference for the
     * far-off check on an entry (Phase 5), and never shown. Null when the model did not answer.
     */
    typical: money("typical"),
    /** Dead: the over/under shortcut was dropped (Phase 5 audit). Nothing reads it; the column comes out after the build that stops selecting it is deployed. */
    overUnder: money("over_under"),
    denomId: uuid("denom_id")
      .notNull()
      .references(() => denominations.id),
    /** 'arbitrate' | 'void'; default 'arbitrate'. */
    stalemate: text("stalemate").notNull().default("arbitrate"),
    /** 'open' | 'blind'; default 'open'. */
    revealMode: text("reveal_mode").notNull().default("open"),
    /**
     * The creator's EIP-712 `Create` signature, held here until lock, as every `Enter` signature is held on its
     * position. Null while the market is a draft only its creator can see: signing is what opens it.
     */
    creatorSignature: bytea("creator_signature"),
    /** Null for pace = 'argument' until the second position is entered, then that moment. */
    resolvesBy: ts("resolves_by"),
    lockedAt: ts("locked_at"),
    threshold: smallint("threshold").notNull(),
    /** Proposed outcome in the same encoding as the chain; null until proposed. */
    aiOutcome: money("ai_outcome"),
    aiConfidenceBps: smallint("ai_confidence_bps"),
    aiRationale: text("ai_rationale"),
    aiProposedAt: ts("ai_proposed_at"),
    /** Mirror of DareResolved or DareArbitrated for onchain markets; the provisional call otherwise. */
    resolvedOutcome: money("resolved_outcome"),
    /**
     * How it ended: 'quorum' | 'arbitration' | 'provisional' | 'expired' | 'feed' | null. 'expired' is the void
     * rule's silent end: no outcome, nothing minted, no toll, and the question stays in the timeline as
     * unresolved. 'feed' is the final score settling a What's on market nobody voted on, the way everyone agreed
     * at entry (docs/decisions.md, public markets): recorded on the chain through `arbitrate`, counted clean,
     * and never a void that counts against anyone.
     */
    resolvedBy: text("resolved_by"),
    /**
     * What the triage made of the line (PLANNING.md 8b): 'checkable' | 'contestable', or null for a dare. There is
     * no 'interpersonal' row: that tier is declined before anything is written.
     */
    tier: text("tier"),
    /** The measurable criterion a contestable claim is ruled against. It is also inside `terms_text`, and so inside the hash. */
    criterion: text("criterion"),
    /** 'quick' | 'careful': how the terms were written. */
    mode: text("mode").notNull().default("quick"),
    /** The arbitrator's written ruling, exactly as hashed. `keccak256` of these bytes is `rulingHashOf` onchain. */
    rulingText: text("ruling_text"),
    rulingHash: bytea("ruling_hash"),
    /** Set once when the asker has been told the time they set has come. What makes the scheduler's tick idempotent. */
    deadlineNotifiedAt: ts("deadline_notified_at"),
    /** Set once when everyone in the quorum was told voting opened, whichever way it closed (the field round, 1.8): the action that closed it or the tick, whichever got there first. */
    voteAskedAt: ts("vote_asked_at"),
    /**
     * When someone in it said it has happened (the games-and-the-reveal round, 2026-10-07; docs/design.md 3.24, calls
     * are in): the vote waits for the thing to happen, and this, the final score, or the decided date opens it for
     * everyone at once. Who said it is one of the two after it, a person or a guest; both null otherwise.
     */
    happenedAt: ts("happened_at"),
    happenedUser: uuid("happened_user").references(() => users.id),
    happenedClaim: uuid("happened_claim").references(() => participantClaims.id),
    /**
     * A question started on a game already being played (the games-and-the-reveal round, section 5): it closes five
     * minutes after its first entry, and never after the final, so its close time is set by that entry and its asker
     * signs a close of zero, as an argument does.
     */
    closesAfterFirst: boolean("closes_after_first").notNull().default(false),
    /**
     * A close recorded here whose chain write has not landed yet (the touch-ups round, section 0): from this moment the
     * question is closed for the people in it, and the tick sends the write again until it lands. Null once it has,
     * and for a question decided here. While it stands the question is neither on the chain nor provisional.
     */
    chainPendingAt: ts("chain_pending_at"),
    /** When the tick last tried that write, and how many times it has. */
    chainTriedAt: ts("chain_tried_at"),
    chainTries: smallint("chain_tries").notNull().default(0),
    /** Why a close the chain never took settled here as confirmations instead: the revert it met, or the day it ran out of. Null otherwise. */
    chainGaveUp: text("chain_gave_up"),
    /**
     * An argument's ruling made at the ask and sealed until the close (the touch-ups round, section 2): its outcome in the
     * chain's encoding (`VOID_OUTCOME` when the facts cannot settle it), its confidence and its reasons. Never sent to
     * anyone, the asker included, before the close; at the close it becomes the market's ruling (`ai_*`). Null when the
     * argument is ruled at the close instead (one that needs what the people in it saw), or the ruling failed.
     */
    sealedOutcome: money("sealed_outcome"),
    sealedConfidenceBps: smallint("sealed_confidence_bps"),
    sealedRationale: text("sealed_rationale"),
    /** The seal's random salt and its hash, `keccak256(salt || the ruling's text)`, which the terms everyone signs carry. */
    sealSalt: bytea("seal_salt"),
    sealHash: bytea("seal_hash"),
    /** When the app's ruling was shown to the people in it: the close, for a sealed one. Silence agrees a day after it. */
    rulingRevealedAt: ts("ruling_revealed_at"),
    /**
     * What settles an argument, as the check at the ask found (the touch-ups round, section 2): 'facts', which the app
     * rules on at the ask and seals, or 'evidence', what its people saw or can show, which it rules on at the close with
     * that. Null for a dare, and for an argument asked before the round.
     */
    settledBy: text("settled_by"),
    /** Set once when the people still to vote were reminded, twelve hours into voting and never at night; never a second (the field round, 1.8). */
    voteRemindedAt: ts("vote_reminded_at"),
    /**
     * A What's on market (docs/design.md 3.33; docs/decisions.md, public markets): the public question it was
     * started from. Its terms, kind, unit, scale and close time are the template's, copied at draft so the market
     * stands on its own; the row is kept for "Question from | What's on", the use count, and the feed.
     */
    templateId: uuid("template_id").references(() => publicQuestions.id),
    /**
     * What the final score proposes, in the chain's encoding (3.35), written by the tick once the game is complete
     * and rewritten if the score is corrected before the quorum is reached; `VOID_OUTCOME` for a tie the contract
     * cannot score. Null until the game is complete, and on a question the score does not answer.
     */
    feedOutcome: money("feed_outcome"),
    feedOutcomeAt: ts("feed_outcome_at"),
    /** Set once when everyone in it has been warned that the backstop is about to act (the one warning, never a second). */
    backstopWarnedAt: ts("backstop_warned_at"),
    /**
     * Which of the feed's endings it took (docs/design.md 3.35), for the settled screen's line: 'agreed' (both
     * results, a day on), 'alone' (one result that held three days), 'conflict' (the two disagreed: void), 'tie'
     * (a tie the contract cannot score: void), 'drive' (the play-by-play, three days on) or 'drive_unknown' (the
     * play-by-play could not say: void). Null on every other ending.
     */
    feedEnding: text("feed_ending"),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    /**
     * The market's ink (docs/design.md 1.8): one of eight colour families, decided when it is asked (the mark's
     * hue, or a hash of the id) or picked by the creator from its screen, and stored so balance can be checked
     * without pixels. Null on rows written before inks existed; those read as the hash they would have got.
     */
    ink: text("ink"),
    /** 'pick' | 'mark' | 'hash'. */
    inkSource: text("ink_source"),
    /**
     * The asker's time zone when it was asked (an IANA name), so the link tile can say an absolute close time
     * for a preview that gets frozen into a chat with no viewer to render it for (docs/design.md 3.27). Null on
     * rows from before; those tiles say the time in UTC and say so.
     */
    zone: text("zone"),
    /** 'emoji' | 'image' | 'sticker' | null for no mark. Blank is the default and stays blank. */
    markKind: text("mark_kind"),
    /** The emoji, or a `picture_marks` id as text for a picture or a sticker (docs/decisions.md 2026-09-18). */
    markValue: text("mark_value"),
    /**
     * A yes-or-no market's outcomes in the question's own words (docs/design.md 3.25), written with the terms:
     * the two wells and the two outcome lines, in the order yes well, no well, yes line, no line ("He fell
     * asleep", "He stayed up", "He did.", "He didn't."). Null on markets made before, and when the write-up
     * returned none; those say "Yes" and "No".
     */
    outcomeWords: text("outcome_words").array(),
  },
  (t) => [
    check("dares_outcome_words_four", sql`${t.outcomeWords} is null or array_length(${t.outcomeWords}, 1) = 4`),
    check("dares_mark_kind_known", sql`${t.markKind} is null or ${t.markKind} in ('emoji', 'image', 'sticker')`),
    check("dares_mark_both_or_neither", sql`(${t.markKind} is null) = (${t.markValue} is null)`),
    check("dares_kind_known", sql`${t.kind} in ('binary', 'numeric', 'categorical')`),
    check("dares_answers_two_to_six", sql`${t.kind} <> 'categorical' or array_length(${t.outcomeLabels}, 1) between 2 and 6`),
    check("dares_answer_people_aligned", sql`${t.answerPeople} is null or array_length(${t.answerPeople}, 1) = array_length(${t.outcomeLabels}, 1)`),
    check("dares_range_source_known", sql`${t.rangeSource} is null or ${t.rangeSource} in ('asker', 'ai', 'template')`),
    check("dares_range_with_source", sql`(${t.kind} <> 'numeric') or (${t.range} is not null and ${t.range} > 0 and ${t.rangeSource} is not null)`),
    check("dares_pace_known", sql`${t.pace} in ('dare', 'argument')`),
    check("dares_tier_known", sql`${t.tier} is null or ${t.tier} in ('checkable', 'contestable')`),
    check("dares_mode_known", sql`${t.mode} in ('quick', 'careful')`),
    check("dares_ruling_both_or_neither", sql`(${t.rulingText} is null) = (${t.rulingHash} is null)`),
    check("dares_feed_ending_known", sql`${t.feedEnding} is null or ${t.feedEnding} in ('agreed', 'alone', 'conflict', 'tie', 'drive', 'drive_unknown')`),
    check("dares_stalemate_known", sql`${t.stalemate} in ('arbitrate', 'void')`),
    check("dares_reveal_mode_known", sql`${t.revealMode} in ('open', 'blind')`),
    check(
      "dares_resolved_by_known",
      sql`${t.resolvedBy} is null or ${t.resolvedBy} in ('quorum', 'arbitration', 'provisional', 'expired', 'feed', 'removed', 'ruling')`,
    ),
    check("dares_settled_by_known", sql`${t.settledBy} is null or ${t.settledBy} in ('facts', 'evidence')`),
    check("dares_threshold_positive", sql`${t.threshold} > 0`),
    check(
      "dares_ai_confidence_bps_range",
      sql`${t.aiConfidenceBps} is null or (${t.aiConfidenceBps} between 0 and 10000)`,
    ),
  ],
).enableRLS();

/** Mirrors Entered for onchain markets; authoritative for provisional ones. */
export const darePositions = pgTable(
  "dare_positions",
  {
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    /** Exactly one of user_id, claim_id is non-null. */
    userId: uuid("user_id").references(() => users.id),
    claimId: uuid("claim_id").references(() => participantClaims.id),
    stake: money("stake").notNull(),
    /** Probability in bps, the guess, or the option index. */
    value: money("value").notNull(),
    /** Categorical only. */
    confidenceBps: smallint("confidence_bps"),
    /** The EIP-712 Enter signature, held here until lock; null for ghosts and for proxied positions. */
    enterSignature: bytea("enter_signature"),
    /**
     * The entrant's EIP-712 `Create` over the question's own group (the games-and-the-reveal round, 2026-10-07):
     * signed with the entry, so whoever is in can stand as the market's creator on the chain when its set's
     * registered voters are not exactly the people in. Null for ghosts and on entries made before.
     */
    questionSignature: bytea("question_signature"),
    /** Who typed it; equals user_id when self-entered, the host otherwise. */
    enteredBy: uuid("entered_by")
      .notNull()
      .references(() => users.id),
    /** Set on resolution, mirrors Scored. */
    score: smallint("score"),
    /** Set on resolution; sum of this participant's transfers. */
    net: money("net"),
    enteredAt: ts("entered_at").notNull().defaultNow(),
    /**
     * When the entry last changed (the field round, the owner's rule on late closes): written on every entry and
     * every change. Null on a row from before the column existed, which then reads as `entered_at`. The close
     * time ends editing whether or not the close has run, so at any close after it an entry changed after it
     * does not count.
     */
    changedAt: ts("changed_at"),
    /** Always set for user_id rows; for claim_id rows, null means pending and the row does not count. */
    acknowledgedAt: ts("acknowledged_at"),
    /** Creator removed this ghost; the row stays for the record and does not count. */
    dismissedAt: ts("dismissed_at"),
    /** The ghost this position came from when a phone login bound it to the user (docs/design.md 3.17, 3.38): the claimant screen lists it by the name typed, and leaving it out sends it back to a fresh ghost under that name. Null once signed or when it was never a ghost's. */
    boundClaim: uuid("bound_claim").references(() => participantClaims.id),
  },
  (t) => [
    check("dare_positions_user_xor_claim", sql`(${t.userId} is null) <> (${t.claimId} is null)`),
    check("dare_positions_user_acknowledged", sql`${t.userId} is null or ${t.acknowledgedAt} is not null`),
    check("dare_positions_stake_positive", sql`${t.stake} > 0`),
    check(
      "dare_positions_confidence_bps_range",
      sql`${t.confidenceBps} is null or (${t.confidenceBps} between 0 and 10000)`,
    ),
    check("dare_positions_score_range", sql`${t.score} is null or (${t.score} between 0 and 10000)`),
    unique("dare_positions_dare_user").on(t.dareId, t.userId),
    unique("dare_positions_dare_claim").on(t.dareId, t.claimId),
  ],
).enableRLS();

/**
 * "Calls are in" (the games-and-the-reveal round, 2026-10-07; docs/design.md 3.24 and 3.42): someone in an open market
 * saying it can close. When as many of the people in have said it as it takes to settle a vote, it closes; the sheet
 * names who has, never as a count. A person or a guest, one row each, taken back by deleting it while it is open.
 */
export const dareCloseCalls = pgTable(
  "dare_close_calls",
  {
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    userId: uuid("user_id").references(() => users.id),
    claimId: uuid("claim_id").references(() => participantClaims.id),
    saidAt: ts("said_at").notNull().defaultNow(),
  },
  (t) => [
    check("dare_close_calls_user_xor_claim", sql`(${t.userId} is null) <> (${t.claimId} is null)`),
    unique("dare_close_calls_dare_user").on(t.dareId, t.userId),
    unique("dare_close_calls_dare_claim").on(t.dareId, t.claimId),
  ],
).enableRLS();

/**
 * A finished market this person swiped off their Now (docs/design.md 3.15, archive): it changes nothing but this
 * person's Now, and the market, its story and its photos stay where they were for everyone.
 */
export const nowArchive = pgTable(
  "now_archive",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    archivedAt: ts("archived_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dareId] })],
).enableRLS();

/**
 * A wrong number offered for a picked name on the link page (docs/design.md 3.17, frame 5): the check confirms or
 * denies a number, so tries are counted per name and refused past a few an hour. Nothing about the number is kept.
 */
export const claimNumberAttempts = pgTable(
  "claim_number_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => participantClaims.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("claim_number_attempts_claim_created").on(t.claimId, t.createdAt)],
).enableRLS();

/** What each participant said when a market went to arbitration. */
export const dareStatements = pgTable(
  "dare_statements",
  {
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /**
     * `update` is "here is what happened", read by the outcome proposal. `statement` is "here is my case", read by
     * arbitration (2C). One table because both are a participant's words about a market; two kinds because an
     * arbitrator handed one as the other rules on the wrong input.
     */
    kind: text("kind", { enum: ["update", "statement"] }).notNull().default("update"),
    statement: text("statement").notNull(),
    statedAt: ts("stated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.dareId, t.userId, t.kind] }),
    check("dare_statements_kind", sql`${t.kind} in ('update', 'statement')`),
  ],
).enableRLS();

/**
 * Agreeing with the app's ruling on an argument (the touch-ups round, section 2): a tap, by anyone in it, a guest
 * included, and no signature, since everyone in agreed at entry, in the terms they signed, that the app's ruling settles
 * it unless someone in it sees it differently. Everyone in agreeing settles it at once. One per participant.
 */
export const dareAgreements = pgTable(
  "dare_agreements",
  {
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => participantClaims.id, { onDelete: "cascade" }),
    /** The ruling's outcome as it stood when agreed, so an agreement never carries over to a different ruling. */
    outcome: money("outcome").notNull(),
    agreedAt: ts("agreed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dare_agreements_user").on(t.dareId, t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("dare_agreements_claim").on(t.dareId, t.claimId).where(sql`${t.claimId} is not null`),
    check("dare_agreements_who", sql`(${t.userId} is null) <> (${t.claimId} is null)`),
  ],
).enableRLS();

/**
 * Seeing the app's ruling differently (the touch-ups round, section 2): what the person says it got wrong, required,
 * shown to everyone in it, and sent with the ruling and any photo to the tiebreaker, whose ruling settles it. One per
 * participant.
 */
export const dareDisputes = pgTable(
  "dare_disputes",
  {
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => participantClaims.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    disputedAt: ts("disputed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dare_disputes_user").on(t.dareId, t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("dare_disputes_claim").on(t.dareId, t.claimId).where(sql`${t.claimId} is not null`),
    check("dare_disputes_who", sql`(${t.userId} is null) <> (${t.claimId} is null)`),
    check("dare_disputes_text", sql`char_length(${t.text}) between 2 and 400`),
  ],
).enableRLS();

/** A short spoken/scanned code for people in the room; lives as long as the lobby. */
export const roomCodes = pgTable(
  "room_codes",
  {
    /** Six characters, unambiguous alphabet (no O/0, I/1). */
    code: text("code").primaryKey(),
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id),
    openedAt: ts("opened_at").notNull().defaultNow(),
    /** Joins are auto-acknowledged only while this is null. */
    closedAt: ts("closed_at"),
  },
  (t) => [check("room_codes_six_unambiguous", sql`${t.code} ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'`)],
).enableRLS();

/** A per-person link for one market. The token is the creator's claim about who the recipient is, never authentication. */
export const personalLinks = pgTable(
  "personal_links",
  {
    tokenHash: bytea("token_hash").primaryKey(),
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    /** Exactly one of claim_id, user_id is non-null. */
    claimId: uuid("claim_id").references(() => participantClaims.id),
    userId: uuid("user_id").references(() => users.id),
    issuedAt: ts("issued_at").notNull().defaultNow(),
  },
  (t) => [check("personal_links_claim_xor_user", sql`(${t.claimId} is null) <> (${t.userId} is null)`)],
).enableRLS();

/** Collected offchain, submitted in one resolve() call. */
export const dareVotes = pgTable(
  "dare_votes",
  {
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    outcome: money("outcome").notNull(),
    signature: bytea("signature").notNull(),
    signedAt: ts("signed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dareId, t.userId] })],
).enableRLS();


// ------------------------------------------------------------------------------------------------------
// Media (docs/marks-and-memories.md, corrected in docs/decisions.md 2026-09-17)
// ------------------------------------------------------------------------------------------------------

/**
 * Photos and video on a market (`dare_id`) or an obligation (`obligation_id`, the settlement photo), exactly
 * one of the two. Replaces `photos`. `captured_at` is the only EXIF field retained; everything else, GPS above
 * all, is stripped at upload. Served through signed URLs behind an authorization check, never a public bucket.
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dareId: uuid("dare_id").references(() => dares.id),
    obligationId: uuid("obligation_id").references(() => obligations.id),
    /** 'photo' | 'video'. */
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    /** Video first frame. */
    posterKey: text("poster_key"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Video only. */
    durationMs: integer("duration_ms"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    /** From EXIF when present. */
    capturedAt: ts("captured_at"),
    /**
     * 'memory' | 'evidence' (docs/decisions.md, the media phase). A memory is a photo of the night, added to a
     * settled market and shown in its frame. Evidence is a screenshot attached to "what happened" while the
     * question is being called: read by the outcome proposal and the arbitrator, shown beside the claim, and
     * never in the frame. Set by the control it came through, stored so no query has to infer it.
     */
    role: text("role").notNull().default("memory"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("media_parent_xor", sql`(${t.dareId} is null) <> (${t.obligationId} is null)`),
    check("media_role_known", sql`${t.role} in ('memory', 'evidence')`),
    check("media_evidence_on_market", sql`${t.role} = 'memory' or ${t.dareId} is not null`),
    check("media_kind_known", sql`${t.kind} in ('photo', 'video')`),
    check("media_dimensions_positive", sql`${t.width} > 0 and ${t.height} > 0`),
    check("media_duration_video_only", sql`${t.kind} = 'video' or ${t.durationMs} is null`),
    index("media_dare_created").on(t.dareId, t.createdAt),
    index("media_obligation_created").on(t.obligationId, t.createdAt),
  ],
).enableRLS();

/**
 * Picture marks (docs/marks-and-memories.md; docs/design.md 1.7, 3.28; docs/decisions.md 2026-09-18): a sticker
 * (a cutout with transparency) or a square picture someone made, to use as a market's mark. Their own table, not
 * `media`: a mark has no author credit, no capture time and no counter, and it belongs to the person who made it,
 * not to one event. `source_key` is the 512px PNG with alpha; `stamp_key` the 256px derivative with the cream
 * die-cut edge baked in. `ink` is measured from the opaque pixels at upload, or null when too few carry colour
 * (the market then hashes). Both objects live in the private bucket behind `/api/mark/[id]`.
 */
export const pictureMarks = pgTable(
  "picture_marks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    /** 'sticker' | 'image'. */
    kind: text("kind").notNull(),
    sourceKey: text("source_key").notNull(),
    stampKey: text("stamp_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ink: text("ink"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("picture_marks_kind_known", sql`${t.kind} in ('sticker', 'image')`),
    check("picture_marks_ink_known", sql`${t.ink} is null or ${t.ink} in ('clay', 'ochre', 'olive', 'sea', 'slate', 'iris', 'plum', 'rose')`),
    check("picture_marks_dimensions_positive", sql`${t.width} > 0 and ${t.height} > 0`),
    index("picture_marks_owner_created").on(t.ownerId, t.createdAt),
  ],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Plans
// ------------------------------------------------------------------------------------------------------

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    /** "Beers Thursday?" */
    title: text("title").notNull(),
    occursAt: ts("occurs_at").notNull(),
    location: text("location"),
    /** 'proposed' | 'confirmed' | 'happened' | 'cancelled'. */
    status: text("status").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [check("plans_status_known", sql`${t.status} in ('proposed', 'confirmed', 'happened', 'cancelled')`)],
).enableRLS();

export const planRsvps = pgTable(
  "plan_rsvps",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    going: boolean("going").notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] })],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Delegation (sensitive; encrypted at rest with an app key, never logged)
// ------------------------------------------------------------------------------------------------------

export const delegations = pgTable(
  "delegations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Dynamic wallet id, ledger wallet only. A before-insert trigger rejects the governance wallet. */
    walletId: text("wallet_id").notNull(),
    walletAddress: text("wallet_address").notNull(),
    /** The share and the per-wallet key, sealed under the app's own key (`DELEGATION_STORE_KEY`), bound to this row; empty once revoked. */
    encryptedShare: bytea("encrypted_share").notNull(),
    encryptedApiKey: bytea("encrypted_api_key").notNull(),
    /** Dynamic's id for the delegated share set, when the event carries one; the signer passes it back. */
    shareSetId: text("share_set_id"),
    /** The last event applied to this row and when Dynamic says it happened, so a replay or an older event changes nothing. */
    eventId: text("event_id"),
    eventAt: ts("event_at"),
    grantedAt: ts("granted_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.walletId] })],
).enableRLS();

/**
 * Every transaction the relayer signs, recorded before it is broadcast, with what completes it once the receipt
 * is in (docs/decisions.md 2026-09-27, "a send is never lost"). The hash is known before the send because the
 * relayer signs locally; a send the node never answered is pending here, the tick re-broadcasts the signed bytes
 * and reads the receipt, and the kind's completion writes the mirror the action would have written. Nothing here
 * is secret: a signed transaction is public the moment it is broadcast.
 */
export const chainWrites = pgTable(
  "chain_writes",
  {
    hash: bytea("hash").primaryKey(),
    label: text("label").notNull(),
    /** What completes it: confirm, close, net, create, resolve, arbitrate, feed, expire, register, other. */
    kind: text("kind").notNull(),
    /** The ids the completion needs, as JSON. */
    subject: text("subject").notNull(),
    nonce: integer("nonce").notNull(),
    /** The signed transaction, for re-broadcast. */
    raw: bytea("raw").notNull(),
    /** pending until a receipt is read; then mined or reverted; dropped when the network consumed the nonce with something else or the write aged out. */
    status: text("status").notNull().default("pending"),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    attempts: integer("attempts").notNull().default(1),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** When the kind's completion finished; a mined write without one is retried by the tick. */
    completedAt: ts("completed_at"),
    /** Whose tap this was: the person acting in the request that signed it, or null for the scheduler. */
    actorId: uuid("actor_id").references(() => users.id),
    /** When the person was told the send was on its way (their request ended pending). A drop or a revert after this reaches their screen (src/lib/ledger/again.ts). */
    toldAt: ts("told_at"),
  },
  (t) => [index("chain_writes_status_idx").on(t.status, t.createdAt), index("chain_writes_actor_idx").on(t.actorId, t.createdAt), check("chain_writes_status_known", sql`${t.status} in ('pending', 'mined', 'reverted', 'dropped')`)],
).enableRLS();

/**
 * A chain write that keeps failing (the touch-ups round, section 0): one row per thing being written (its kind and
 * subject), from its first failure until a send for it succeeds, so the tick can tell the owner once it has been
 * failing for more than fifteen minutes. Written by `submit` on every failure but a pending receipt, cleared by its success.
 */
export const chainFailures = pgTable(
  "chain_failures",
  {
    key: text("key").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    firstFailedAt: ts("first_failed_at").notNull().defaultNow(),
    lastFailedAt: ts("last_failed_at").notNull().defaultNow(),
    /** The first line of the last failure, without the RPC's address, which carries a key. */
    lastWhy: text("last_why").notNull(),
    failures: integer("failures").notNull().default(1),
    /** When the owner was told; told again only after it has gone on failing for a further day. */
    alertedAt: ts("alerted_at"),
  },
  (t) => [index("chain_failures_first_idx").on(t.firstFailedAt)],
).enableRLS();

/**
 * Every signature the server made with a delegated share, with the request that caused it (docs/decisions.md
 * 2026-09-27): delegation removes the prompt, never the person, so each one traces to an authenticated request
 * from that user for that action in that moment. Holds the digest signed and nothing secret.
 */
/**
 * Pass the phone (docs/design.md 3.45; docs/decisions.md 2026-09-28): the PIN a person set on their own phone,
 * with a slow hash and a salt of its own, never the PIN; how many wrong tries in a row, and until when it is
 * locked after too many. One row per person, kept while the PIN is set; cleared when pass the phone is turned
 * off. Pass the phone is on when this row exists beside a usable delegation of the ledger wallet.
 */
export const passThePhone = pgTable("pass_the_phone", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  pinHash: bytea("pin_hash").notNull(),
  pinSalt: bytea("pin_salt").notNull(),
  setAt: ts("set_at").notNull().defaultNow(),
  failedTries: integer("failed_tries").notNull().default(0),
  lockedUntil: ts("locked_until"),
  /** How many lockouts so far, which makes each lockout's notice its own. */
  lockouts: integer("lockouts").notNull().default(0),
}).enableRLS();

export const delegatedSignatures = pgTable(
  "delegated_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    walletId: text("wallet_id").notNull(),
    /** The ledger action: confirm, confirm_many, close, net, create, enter; or check, the gate's own signature. */
    action: text("action").notNull(),
    /** What it was about: the obligation, proposal or market the request named. */
    subject: text("subject").notNull(),
    /** The EIP-712 digest that was signed. */
    digest: bytea("digest").notNull(),
    /** The request that caused it: the server action or route, and the platform's request id when it stamped one. */
    request: text("request").notNull(),
    requestId: text("request_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("delegated_signatures_user_idx").on(t.userId, t.createdAt), check("delegated_signatures_action_known", sql`${t.action} in ('confirm', 'confirm_many', 'close', 'net', 'create', 'enter', 'check')`)],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Expenses (offchain until finalization produces obligation proposals)
// ------------------------------------------------------------------------------------------------------

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id),
    totalCents: money("total_cents").notNull(),
    subtotalCents: money("subtotal_cents").notNull(),
    tipCents: money("tip_cents").notNull().default(sql`0`),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    merchant: text("merchant"),
    /** Geocoded lazily for the map view. */
    merchantAddress: text("merchant_address"),
    occurredAt: ts("occurred_at").notNull(),
    receiptMediaId: uuid("receipt_media_id").references(() => media.id),
    /** 'manual' | 'receipt' | 'roulette'. */
    source: text("source").notNull(),
    /** 'draft' | 'parsed' | 'needs_review' | 'claiming' | 'finalized'. */
    status: text("status").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [
    check("expenses_source_known", sql`${t.source} in ('manual', 'receipt', 'roulette')`),
    check(
      "expenses_status_known",
      sql`${t.status} in ('draft', 'parsed', 'needs_review', 'claiming', 'finalized')`,
    ),
    check("expenses_cents_nonnegative", sql`${t.totalCents} >= 0 and ${t.subtotalCents} >= 0 and ${t.tipCents} >= 0`),
  ],
).enableRLS();

export const expenseItems = pgTable(
  "expense_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    name: text("name").notNull(),
    qty: numeric("qty").notNull().default("1"),
    unitPriceCents: money("unit_price_cents").notNull(),
    lineTotalCents: money("line_total_cents").notNull(),
    taxLineId: uuid("tax_line_id"),
  },
  (t) => [check("expense_items_cents_nonnegative", sql`${t.unitPriceCents} >= 0 and ${t.lineTotalCents} >= 0`)],
).enableRLS();

export const expenseTaxLines = pgTable(
  "expense_tax_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    label: text("label").notNull(),
    amountCents: money("amount_cents").notNull(),
  },
  (t) => [check("expense_tax_lines_cents_nonnegative", sql`${t.amountCents} >= 0`)],
).enableRLS();

export const itemClaims = pgTable(
  "item_claims",
  {
    expenseItemId: uuid("expense_item_id")
      .notNull()
      .references(() => expenseItems.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    shareNum: integer("share_num").notNull().default(1),
    shareDen: integer("share_den").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.expenseItemId, t.userId] }),
    check("item_claims_share_valid", sql`${t.shareNum} >= 0 and ${t.shareDen} > 0 and ${t.shareNum} <= ${t.shareDen}`),
  ],
).enableRLS();

/**
 * A browser that agreed to be told things. Web Push only: the endpoint and the two keys the push service needs
 * to encrypt to it. Not in PLANNING.md's schema (docs/decisions.md 2026-09-19). A subscription the push service
 * reports gone is deleted; it was never ledger history.
 */
// ------------------------------------------------------------------------------------------------------
// What's on: games from a public scoreboard, and the questions written for each
// (docs/design.md 3.32, 3.33, 3.35; docs/decisions.md, public markets)
// ------------------------------------------------------------------------------------------------------

/**
 * A game as the schedule source lists it, behind the adapter in `src/lib/sports`. One row per (source, game),
 * refreshed by the tick: the schedule a few days ahead, then, after the game's expected end, its final score,
 * read again once to catch a correction, and the second source's score beside it for the backstop. A score is
 * only ever written from a response whose status says the game is complete. Nothing here is a person's.
 */
export const sportsGames = pgTable(
  "sports_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'espn' today; the adapter is the only thing that knows the shape. */
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    /** 'nfl' | 'mlb' | 'nba' | 'nhl'. */
    sport: text("sport").notNull(),
    /** "Titans at Giants": the away side first, as the sport says it. */
    name: text("name").notNull(),
    startsAt: ts("starts_at").notNull(),
    /** Whether the source has confirmed the start time; a game is not listed with a close time until it has. */
    timeValid: boolean("time_valid").notNull().default(true),
    venue: text("venue"),
    homeId: text("home_id").notNull(),
    homeAbbr: text("home_abbr").notNull(),
    homeName: text("home_name").notNull(),
    homeShort: text("home_short").notNull(),
    awayId: text("away_id").notNull(),
    awayAbbr: text("away_abbr").notNull(),
    awayName: text("away_name").notNull(),
    awayShort: text("away_short").notNull(),
    /** Each team's colour as the feed supplies it, six hex digits: for its stamp and nowhere else (docs/design.md 1.7, 4.5). */
    homeColor: text("home_color"),
    awayColor: text("away_color"),
    /** The feed's season type (2 is the regular season): the first-drive question is offered by coverage, the NFL regular season. */
    seasonType: smallint("season_type"),
    /** Whether the source reports play-by-play for it. Read off a game in play or finished; false on every upcoming game, so nothing is gated on it. */
    playByPlay: boolean("play_by_play").notNull().default(false),
    /** 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled' | 'unknown'. */
    status: text("status").notNull().default("scheduled"),
    /** The source's own word that the game is over. `winner` means nothing until this is true. */
    completed: boolean("completed").notNull().default(false),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    /** When the final was first read, or last changed: the clock the backstop counts from. */
    finalSeenAt: ts("final_seen_at"),
    /** When a later read found the same final: the one confirmation re-read, after which polling stops. */
    finalConfirmedAt: ts("final_confirmed_at"),
    /** The second source's final, read once the backstop is due; null where it has none (hockey always). */
    checkHomeScore: integer("check_home_score"),
    checkAwayScore: integer("check_away_score"),
    checkedAt: ts("checked_at"),
    /**
     * The first drive, read from the play-by-play once the game has it (docs/decisions.md, the game page): the
     * answer it maps to ('Touchdown' | 'Field goal' | 'Punt' | 'Turnover' | 'Something else'), the source's own
     * word for the record, when it was first read, and when a later read found it unchanged. A result the adapter
     * does not recognise is no result: the answer stays null and the raw word is kept.
     */
    firstDriveResult: text("first_drive_result"),
    firstDriveRaw: text("first_drive_raw"),
    firstDriveSeenAt: ts("first_drive_seen_at"),
    firstDriveConfirmedAt: ts("first_drive_confirmed_at"),
    summaryPolledAt: ts("summary_polled_at"),
    /** The start plus the sport's usual length: when polling for a final begins. */
    expectedEndAt: ts("expected_end_at").notNull(),
    /**
     * The live score while the game is on (the games-and-the-reveal round, section 3): the scores and where the game is,
     * in the app's own words by sport, as last read; `live_read_at` is that read, and `live_tried_at` the last attempt,
     * which a request claims so a game is read once per interval however many are watching. Shown only while fresh.
     */
    live: jsonb("live"),
    liveReadAt: ts("live_read_at"),
    liveTriedAt: ts("live_tried_at"),
    polledAt: ts("polled_at"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("sports_games_source").on(t.source, t.sourceId),
    index("sports_games_starts").on(t.sport, t.startsAt),
    check("sports_games_sport_known", sql`${t.sport} in ('nfl', 'mlb', 'nba', 'nhl')`),
    check("sports_games_status_known", sql`${t.status} in ('scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'unknown')`),
    check("sports_games_scores_together", sql`(${t.homeScore} is null) = (${t.awayScore} is null)`),
    check("sports_games_check_together", sql`(${t.checkHomeScore} is null) = (${t.checkAwayScore} is null)`),
    check("sports_games_final_has_scores", sql`${t.finalSeenAt} is null or ${t.homeScore} is not null`),
    check("sports_games_first_drive_known", sql`${t.firstDriveResult} is null or ${t.firstDriveResult} in ('Touchdown', 'Field goal', 'Punt', 'Turnover', 'Something else')`),
  ],
).enableRLS();

/**
 * A public question (docs/design.md 3.32): a template written for one game, from a fixed set per sport (who
 * wins, the margin, the total, and the first drive where play-by-play is reported). Its question, terms, kind,
 * unit, scale and close time are written once; a person starts an ordinary market from it, and the market copies
 * everything so it stands on its own. `decided_by_score` is set when the template is written and never inferred.
 */
export const publicQuestions = pgTable(
  "public_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => sportsGames.id),
    /** 'home_wins' | 'margin' | 'total' | 'first_drive', or 'own:' and the question's id for a question someone wrote on the game page (the final round, section 5), which only its own people settle. */
    key: text("key").notNull(),
    /** 'binary' | 'numeric' | 'categorical'. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    termsText: text("terms_text").notNull(),
    /** The unit for a number question, the answers for a pick-one question, ['no', 'yes'] otherwise. */
    outcomeLabels: text("outcome_labels").array().notNull(),
    /** A number question's scoring scale, the template's (`range_source = 'template'` on the market). */
    range: money("range"),
    /** The number the far-off check measures against, where the question has one. */
    typical: money("typical"),
    /** The signed margin's offset: what is added before storing and taken off for display, half the scale. */
    shift: money("shift"),
    /** Whether the final score answers it, so the ballot opens on a source card and the feed is its backstop (3.35). */
    decidedByScore: boolean("decided_by_score").notNull().default(false),
    /** Whether the feed proposes and settles it at all: the score's questions, and the first drive from the play-by-play (docs/decisions.md, the game page). */
    decidedByFeed: boolean("decided_by_feed").notNull().default(false),
    /** A yes-or-no question's outcomes in its own words (3.25), in the stored order. */
    outcomeWords: text("outcome_words").array(),
    /** The curators' order within a game. */
    sort: smallint("sort").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("public_questions_game_key").on(t.gameId, t.key),
    check("public_questions_key_known", sql`${t.key} in ('home_wins', 'margin', 'total', 'first_drive') or ${t.key} like 'own:%'`),
    check("public_questions_kind_known", sql`${t.kind} in ('binary', 'numeric', 'categorical')`),
    check("public_questions_range_numeric", sql`(${t.kind} <> 'numeric') or (${t.range} is not null and ${t.range} > 0)`),
    check("public_questions_outcome_words_four", sql`${t.outcomeWords} is null or array_length(${t.outcomeWords}, 1) = 4`),
  ],
).enableRLS();

/** When each source was last read for each sport, and how it went: what the failed-feed state reads (3.32, C and D). */
export const sportsFeedReads = pgTable(
  "sports_feed_reads",
  {
    source: text("source").notNull(),
    sport: text("sport").notNull(),
    lastOkAt: ts("last_ok_at"),
    lastErrorAt: ts("last_error_at"),
    lastError: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.source, t.sport] })],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user").on(t.userId)],
).enableRLS();

/**
 * What was sent to whom about which market, and never what it said. One row per person per market per kind per
 * vote count, so a retry or a double submit cannot tell someone twice, and so "nothing is ever sent because
 * time passed" can be checked: every row names the person whose act caused it.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** What it is about: a question, or an obligation (settled, forgiven), or neither for a netting between two people. */
    dareId: uuid("dare_id").references(() => dares.id),
    obligationId: uuid("obligation_id").references(() => obligations.id),
    kind: text("kind", { enum: ["vote_request", "result", "opened", "joined", "nudge", "deadline", "ruling", "settled", "forgiven", "netted", "backstop_warning", "backstop_result", "pin_locked", "entered_from", "voting_opened", "vote_reminder", "all_in"] }).notNull(),
    /**
     * What makes "the same thing" the same, per kind: how many had voted (vote_request), how many were in
     * (joined), a six-hour window (nudge), 0 otherwise.
     */
    seq: integer("seq").notNull().default(0),
    /** The person whose act caused this. Never null: nothing is sent because time passed. */
    causedBy: uuid("caused_by")
      .notNull()
      .references(() => users.id),
    /** Which channels took it: any of push, email. Empty means only the in-app strip carries it. */
    channels: text("channels").array().notNull().default(sql`'{}'`),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_log_once").on(t.userId, t.dareId, t.kind, t.seq).where(sql`${t.dareId} is not null`),
    uniqueIndex("notification_log_once_obligation").on(t.userId, t.obligationId, t.kind, t.seq).where(sql`${t.obligationId} is not null`),
    // A netting is between two people and about no one row: once per pair per window, keyed by who did it.
    uniqueIndex("notification_log_once_pair").on(t.userId, t.causedBy, t.kind, t.seq).where(sql`${t.kind} = 'netted'`),
    // About a question or an obligation, one of the two; or about neither: a netting between two people, or a PIN locked on someone's phone (3.45).
    check("notification_log_about_one", sql`(${t.kind} in ('netted', 'pin_locked') and ${t.dareId} is null and ${t.obligationId} is null) or (${t.kind} not in ('netted', 'pin_locked') and (${t.dareId} is null) <> (${t.obligationId} is null))`),
  ],
).enableRLS();

/**
 * When someone typed a room code that matched nothing, and nothing about the code. For the hourly guess limit: an
 * account's by its id, and a guest's, who has none, by a keyed hash of the network it came from (the submission round,
 * section 0: a code opens its question for a guest as its link does), never the address itself.
 */
export const codeAttempts = pgTable(
  "code_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    networkHash: text("network_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("code_attempts_user_created").on(t.userId, t.createdAt),
    index("code_attempts_network_created").on(t.networkHash, t.createdAt),
    check("code_attempts_someone", sql`${t.userId} is not null or ${t.networkHash} is not null`),
  ],
).enableRLS();

/**
 * What a signed-in person's device could not do, once per page load (docs/decisions.md 2026-09-19, 2026-09-20).
 * It began as a log line, and the host keeps log lines for an hour: a sign-out problem that recurs over days
 * needs evidence that outlives that. The state, whether the app was installed, a coarse platform, and the
 * person. Never the user agent string, an address, or anything typed.
 */
export const deviceStates = pgTable(
  "device_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    state: text("state", { enum: ["signed-out", "other-account", "keys-missing"] }).notNull(),
    standalone: boolean("standalone").notNull(),
    platform: text("platform", { enum: ["ios", "android", "desktop", "other"] }).notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("device_states_user_created").on(t.userId, t.createdAt)],
).enableRLS();

/**
 * The group's number over time, for the sparkline a slow question gets (docs/design.md 3.22). One row each time
 * someone gets in or changes their number: the aggregate at that moment and how many were in. The aggregate
 * only, never whose entry moved it, because plotting entries would out people's timing.
 */
export const dareNumberSeries = pgTable(
  "dare_number_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    /** Stake-weighted mean, in basis points. */
    valueBps: integer("value_bps").notNull(),
    entries: smallint("entries").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("dare_number_series_dare_at").on(t.dareId, t.at), check("dare_number_series_range", sql`${t.valueBps} between 0 and 10000`)],
).enableRLS();

/**
 * What people did, counted (the field round, 2026-10-02). Separate from the ledger's own log and append-only: a
 * row says when, what, who (an account, a guest claim, or neither, with the device that reported it), which market
 * or game, and a few properties from fixed sets. Written only on the server; the browser reports through one door
 * (`/api/usage`) that takes names from an allowlist and properties by a schema per name. Never question text, a
 * name, a phone number, an email address or an amount. `once_key` makes an event count once (a link opened once
 * per person or device per link): the server composes it and the insert does nothing on a repeat.
 */
/**
 * A day's numbers (the field round, 3.1): every count of `src/lib/usage/stats.ts` for one UTC day, written by the
 * owner's snapshot button or the backfill, one row per day and replaced when the day is taken again. Kept apart
 * from the events so the week's line survives the events table growing or being trimmed.
 */
export const usageSnapshots = pgTable("usage_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The UTC day, YYYY-MM-DD. */
  day: text("day").notNull().unique(),
  takenAt: ts("taken_at").notNull().defaultNow(),
  counts: jsonb("counts").notNull().default(sql`'{}'::jsonb`),
});

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    name: text("name").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => participantClaims.id, { onDelete: "cascade" }),
    /** The device that reported it, from its own cookie: a random id, nothing else. Null for the server's own rows. */
    deviceId: uuid("device_id"),
    dareId: uuid("dare_id").references(() => dares.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").references(() => sportsGames.id, { onDelete: "cascade" }),
    /** Small, from fixed sets, per name (src/lib/usage/events.ts). */
    props: jsonb("props").notNull().default(sql`'{}'::jsonb`),
    onceKey: text("once_key"),
  },
  (t) => [
    index("usage_events_name_at").on(t.name, t.at),
    index("usage_events_dare").on(t.dareId),
    index("usage_events_user").on(t.userId),
    uniqueIndex("usage_events_once").on(t.onceKey).where(sql`${t.onceKey} is not null`),
    check("usage_events_name_short", sql`char_length(${t.name}) between 1 and 40`),
  ],
).enableRLS();

// ------------------------------------------------------------------------------------------------------
// Operations (the ops round, 2026-10-09): what production uses up, how it is, and what it told the owner.
// Nothing here is the product's: no screen but the owner's reads it, and no count reads it.
// ------------------------------------------------------------------------------------------------------

/**
 * A few named facts the operations code keeps between runs, one row each: the tick's last run (`tick`), the last time a
 * system refused for rate or credit (`refused:alchemy`, `refused:indexer`, `refused:anthropic`), the hourly checks'
 * last answers (`check:<name>`), and each day's morning email once sent (`morning:<day>`).
 */
export const opsState = pgTable("ops_state", {
  key: text("key").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  value: jsonb("value").notNull().default(sql`'{}'::jsonb`),
}).enableRLS();

/**
 * One alert's state (src/lib/ops/alerts.ts): a runway line or a core system, keyed by name. `since` is when it began and
 * is null while all is well; `told_at` is when the owner was told, once per crossing; `cleared_at` when it last came back.
 */
export const opsAlerts = pgTable("ops_alerts", {
  key: text("key").primaryKey(),
  since: ts("since"),
  toldAt: ts("told_at"),
  clearedAt: ts("cleared_at"),
  /** What the level read when it was last looked at, in words, for the owner's email. */
  reading: text("reading"),
}).enableRLS();

/** Every health run's answer (src/lib/ops/health.ts), kept through judging: each check's state and time, as the route answered it. */
export const healthRuns = pgTable(
  "health_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    /** Who asked: the tick, or a request to /api/health. */
    source: text("source").notNull(),
    /**
     * Where the run was made (`hereEnv` in src/lib/ops/health.ts): production, a preview, or anywhere else. Every
     * environment shares this table and reads only its own; a row written without one is nobody's but a laptop's.
     */
    env: text("env").notNull().default("local"),
    coreOk: boolean("core_ok").notNull(),
    checks: jsonb("checks").notNull(),
  },
  (t) => [index("health_runs_at").on(t.at), index("health_runs_env_at").on(t.env, t.at), check("health_runs_source_known", sql`${t.source} in ('tick', 'request')`)],
).enableRLS();

/** Every answer the model API gave, by its usage (src/lib/ai/spend.ts): what the credit the owner entered has gone on. Never the prompt or the answer. */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    label: text("label").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    searches: integer("searches").notNull().default(0),
  },
  (t) => [index("ai_calls_at").on(t.at)],
).enableRLS();

/** The model API's credit as the owner entered it on /stats after a top-up, in cents: the latest row is the balance at its moment. */
export const anthropicCredit = pgTable(
  "anthropic_credit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cents: money("cents").notNull(),
    enteredAt: ts("entered_at").notNull().defaultNow(),
    enteredBy: uuid("entered_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [check("anthropic_credit_not_negative", sql`${t.cents} >= 0`)],
).enableRLS();

/** Every email the app sent through Resend and every push it tried, with whether it went (src/lib/notify/channels.ts): the email quota's count and the push failure rate. Never who to or what. */
export const channelSends = pgTable(
  "channel_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    channel: text("channel").notNull(),
    /** A notice to a person, or a line to the owner. */
    kind: text("kind").notNull(),
    ok: boolean("ok").notNull(),
  },
  (t) => [index("channel_sends_at").on(t.at), check("channel_sends_channel_known", sql`${t.channel} in ('email', 'push')`), check("channel_sends_kind_known", sql`${t.kind} in ('notice', 'ops')`)],
).enableRLS();

/** The app's own calls to the RPC provider, by UTC day and method, with the compute units they cost (src/lib/ops/rpc-usage.ts). */
export const rpcCalls = pgTable(
  "rpc_calls",
  {
    day: text("day").notNull(),
    method: text("method").notNull(),
    calls: integer("calls").notNull().default(0),
    cu: bigint("cu", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.method] })],
).enableRLS();

/** Every canary run (src/lib/ops/canary.ts): when, how far it got, what failed and the transactions it sent. */
export const canaryRuns = pgTable(
  "canary_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    ok: boolean("ok"),
    /** The step it was on when it finished: the last one on a pass, the failing one otherwise. */
    step: text("step"),
    error: text("error"),
    /** Its question, for as long as the run keeps it. */
    dareId: uuid("dare_id"),
    txs: jsonb("txs").notNull().default(sql`'[]'::jsonb`),
    /** Each step's time in milliseconds, in order. */
    steps: jsonb("steps").notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index("canary_runs_started").on(t.startedAt)],
).enableRLS();
