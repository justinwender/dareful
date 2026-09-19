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
    /** ['no','yes'] for binary; option names for categorical; unit name for numeric. */
    outcomeLabels: text("outcome_labels").array().notNull(),
    /** Numeric only; the plausible span. */
    range: money("range"),
    /** Numeric shortcut: when set, the market is binary on "over". */
    overUnder: money("over_under"),
    denomId: uuid("denom_id")
      .notNull()
      .references(() => denominations.id),
    /** 'arbitrate' | 'void'; default 'arbitrate'. */
    stalemate: text("stalemate").notNull().default("arbitrate"),
    /** 'open' | 'blind'; default 'open'. */
    revealMode: text("reveal_mode").notNull().default("open"),
    /** AI suggestion shown while entering; no onchain effect. */
    anchorValue: money("anchor_value"),
    anchorAt: ts("anchor_at"),
    /** The one-line reason shown beside the anchor. Displayed, argued with, discarded; no onchain effect. */
    anchorRationale: text("anchor_rationale"),
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
    /** 'quorum' | 'arbitration' | 'provisional' | null. */
    resolvedBy: text("resolved_by"),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    /** 'emoji' | 'image' | null for no mark. Blank is the default and stays blank. */
    markKind: text("mark_kind"),
    /** The emoji, or a media id as text for a picture mark. */
    markValue: text("mark_value"),
  },
  (t) => [
    check("dares_mark_kind_known", sql`${t.markKind} is null or ${t.markKind} in ('emoji', 'image')`),
    check("dares_mark_both_or_neither", sql`(${t.markKind} is null) = (${t.markValue} is null)`),
    check("dares_kind_known", sql`${t.kind} in ('binary', 'numeric', 'categorical')`),
    check("dares_pace_known", sql`${t.pace} in ('dare', 'argument')`),
    check("dares_stalemate_known", sql`${t.stalemate} in ('arbitrate', 'void')`),
    check("dares_reveal_mode_known", sql`${t.revealMode} in ('open', 'blind')`),
    check(
      "dares_resolved_by_known",
      sql`${t.resolvedBy} is null or ${t.resolvedBy} in ('quorum', 'arbitration', 'provisional')`,
    ),
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
    /** Who typed it; equals user_id when self-entered, the host otherwise. */
    enteredBy: uuid("entered_by")
      .notNull()
      .references(() => users.id),
    /** Set on resolution, mirrors Scored. */
    score: smallint("score"),
    /** Set on resolution; sum of this participant's transfers. */
    net: money("net"),
    enteredAt: ts("entered_at").notNull().defaultNow(),
    /** Always set for user_id rows; for claim_id rows, null means pending and the row does not count. */
    acknowledgedAt: ts("acknowledged_at"),
    /** Creator removed this ghost; the row stays for the record and does not count. */
    dismissedAt: ts("dismissed_at"),
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
    // The app and the database are deployed at different moments, and the 2A build upserts on (dare, person).
    // This keeps that build working after the key widened. 2C drops it in the migration that first writes a
    // `statement`, by which time no running build targets it.
    uniqueIndex("dare_statements_one_per_person_until_2c").on(t.dareId, t.userId),
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
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("media_parent_xor", sql`(${t.dareId} is null) <> (${t.obligationId} is null)`),
    check("media_kind_known", sql`${t.kind} in ('photo', 'video')`),
    check("media_dimensions_positive", sql`${t.width} > 0 and ${t.height} > 0`),
    check("media_duration_video_only", sql`${t.kind} = 'video' or ${t.durationMs} is null`),
    index("media_dare_created").on(t.dareId, t.createdAt),
    index("media_obligation_created").on(t.obligationId, t.createdAt),
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
    encryptedShare: bytea("encrypted_share").notNull(),
    encryptedApiKey: bytea("encrypted_api_key").notNull(),
    grantedAt: ts("granted_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.walletId] })],
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
    dareId: uuid("dare_id")
      .notNull()
      .references(() => dares.id),
    kind: text("kind", { enum: ["vote_request", "result"] }).notNull(),
    /** How many had voted when this was sent; 0 for a result. */
    seq: integer("seq").notNull().default(0),
    /** The person whose act caused this. Never null: nothing is sent because time passed. */
    causedBy: uuid("caused_by")
      .notNull()
      .references(() => users.id),
    /** Which channels took it: any of push, email. Empty means only the in-app strip carries it. */
    channels: text("channels").array().notNull().default(sql`'{}'`),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_log_once").on(t.userId, t.dareId, t.kind, t.seq)],
).enableRLS();

/** When someone typed a room code that matched nothing, and nothing about the code. For the hourly guess limit. */
export const codeAttempts = pgTable(
  "code_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("code_attempts_user_created").on(t.userId, t.createdAt)],
).enableRLS();
