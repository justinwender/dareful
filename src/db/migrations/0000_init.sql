CREATE TABLE "claim_tokens" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dare_positions" (
	"dare_id" uuid NOT NULL,
	"user_id" uuid,
	"claim_id" uuid,
	"stake" bigint NOT NULL,
	"value" bigint NOT NULL,
	"confidence_bps" smallint,
	"enter_signature" "bytea",
	"entered_by" uuid NOT NULL,
	"score" smallint,
	"net" bigint,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "dare_positions_dare_user" UNIQUE("dare_id","user_id"),
	CONSTRAINT "dare_positions_dare_claim" UNIQUE("dare_id","claim_id"),
	CONSTRAINT "dare_positions_user_xor_claim" CHECK (("dare_positions"."user_id" is null) <> ("dare_positions"."claim_id" is null)),
	CONSTRAINT "dare_positions_user_acknowledged" CHECK ("dare_positions"."user_id" is null or "dare_positions"."acknowledged_at" is not null),
	CONSTRAINT "dare_positions_stake_positive" CHECK ("dare_positions"."stake" > 0),
	CONSTRAINT "dare_positions_confidence_bps_range" CHECK ("dare_positions"."confidence_bps" is null or ("dare_positions"."confidence_bps" between 0 and 10000)),
	CONSTRAINT "dare_positions_score_range" CHECK ("dare_positions"."score" is null or ("dare_positions"."score" between 0 and 10000))
);
--> statement-breakpoint
ALTER TABLE "dare_positions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dare_statements" (
	"dare_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"stated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dare_statements_dare_id_user_id_pk" PRIMARY KEY("dare_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "dare_statements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dare_votes" (
	"dare_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"outcome" bigint NOT NULL,
	"signature" "bytea" NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dare_votes_dare_id_user_id_pk" PRIMARY KEY("dare_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "dare_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onchain_id" "bytea",
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"pace" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"terms_text" text NOT NULL,
	"outcome_labels" text[] NOT NULL,
	"range" bigint,
	"over_under" bigint,
	"denom_id" uuid NOT NULL,
	"stalemate" text DEFAULT 'arbitrate' NOT NULL,
	"reveal_mode" text DEFAULT 'open' NOT NULL,
	"anchor_value" bigint,
	"anchor_at" timestamp with time zone,
	"resolves_by" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"threshold" smallint NOT NULL,
	"ai_outcome" bigint,
	"ai_confidence_bps" smallint,
	"ai_rationale" text,
	"ai_proposed_at" timestamp with time zone,
	"resolved_outcome" bigint,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dares_onchain_id_unique" UNIQUE("onchain_id"),
	CONSTRAINT "dares_kind_known" CHECK ("dares"."kind" in ('binary', 'numeric', 'categorical')),
	CONSTRAINT "dares_pace_known" CHECK ("dares"."pace" in ('dare', 'argument')),
	CONSTRAINT "dares_stalemate_known" CHECK ("dares"."stalemate" in ('arbitrate', 'void')),
	CONSTRAINT "dares_reveal_mode_known" CHECK ("dares"."reveal_mode" in ('open', 'blind')),
	CONSTRAINT "dares_resolved_by_known" CHECK ("dares"."resolved_by" is null or "dares"."resolved_by" in ('quorum', 'arbitration', 'provisional')),
	CONSTRAINT "dares_threshold_positive" CHECK ("dares"."threshold" > 0),
	CONSTRAINT "dares_ai_confidence_bps_range" CHECK ("dares"."ai_confidence_bps" is null or ("dares"."ai_confidence_bps" between 0 and 10000))
);
--> statement-breakpoint
ALTER TABLE "dares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delegations" (
	"user_id" uuid NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"encrypted_share" "bytea" NOT NULL,
	"encrypted_api_key" "bytea" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "delegations_user_id_wallet_id_pk" PRIMARY KEY("user_id","wallet_id")
);
--> statement-breakpoint
ALTER TABLE "delegations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "denominations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"onchain_id" "bytea",
	"template" text,
	"label" text NOT NULL,
	"plural_label" text NOT NULL,
	"quantifiable" boolean NOT NULL,
	"monetary" boolean NOT NULL,
	"emoji" text,
	"created_by" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "denominations_group_onchain" UNIQUE("group_id","onchain_id"),
	CONSTRAINT "denominations_template_known" CHECK ("denominations"."template" is null or "denominations"."template" in ('usd', 'beer', 'coffee', 'round', 'next_time'))
);
--> statement-breakpoint
ALTER TABLE "denominations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" numeric DEFAULT '1' NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"line_total_cents" bigint NOT NULL,
	"tax_line_id" uuid,
	CONSTRAINT "expense_items_cents_nonnegative" CHECK ("expense_items"."unit_price_cents" >= 0 and "expense_items"."line_total_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expense_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expense_tax_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "expense_tax_lines_cents_nonnegative" CHECK ("expense_tax_lines"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expense_tax_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"total_cents" bigint NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tip_cents" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"merchant" text,
	"merchant_address" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"receipt_photo_id" uuid,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"created_by" uuid,
	CONSTRAINT "expenses_source_known" CHECK ("expenses"."source" in ('manual', 'receipt', 'roulette')),
	CONSTRAINT "expenses_status_known" CHECK ("expenses"."status" in ('draft', 'parsed', 'needs_review', 'claiming', 'finalized')),
	CONSTRAINT "expenses_cents_nonnegative" CHECK ("expenses"."total_cents" >= 0 and "expenses"."subtotal_cents" >= 0 and "expenses"."tip_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"claim_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "group_members_group_user" UNIQUE("group_id","user_id"),
	CONSTRAINT "group_members_group_claim" UNIQUE("group_id","claim_id"),
	CONSTRAINT "group_members_user_xor_claim" CHECK (("group_members"."user_id" is null) <> ("group_members"."claim_id" is null))
);
--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onchain_id" "bytea",
	"name" text,
	"is_dyad" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_onchain_id_unique" UNIQUE("onchain_id")
);
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item_claims" (
	"expense_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"share_num" integer DEFAULT 1 NOT NULL,
	"share_den" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "item_claims_expense_item_id_user_id_pk" PRIMARY KEY("expense_item_id","user_id"),
	CONSTRAINT "item_claims_share_valid" CHECK ("item_claims"."share_num" >= 0 and "item_claims"."share_den" > 0 and "item_claims"."share_num" <= "item_claims"."share_den")
);
--> statement-breakpoint
ALTER TABLE "item_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "obligation_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"from_user" uuid,
	"from_claim" uuid,
	"to_user" uuid,
	"to_claim" uuid,
	"denom_id" uuid NOT NULL,
	"quantity" bigint,
	"unique_obligation" boolean DEFAULT false NOT NULL,
	"amount_cents" bigint,
	"origin" text NOT NULL,
	"origin_id" uuid,
	"settle_expected" boolean NOT NULL,
	"memo" text,
	"status" text NOT NULL,
	"conceded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "obligation_proposals_from_xor" CHECK (("obligation_proposals"."from_user" is null) <> ("obligation_proposals"."from_claim" is null)),
	CONSTRAINT "obligation_proposals_to_xor" CHECK (("obligation_proposals"."to_user" is null) <> ("obligation_proposals"."to_claim" is null)),
	CONSTRAINT "obligation_proposals_quantity_positive" CHECK ("obligation_proposals"."quantity" is null or "obligation_proposals"."quantity" > 0),
	CONSTRAINT "obligation_proposals_amount_nonnegative" CHECK ("obligation_proposals"."amount_cents" is null or "obligation_proposals"."amount_cents" >= 0),
	CONSTRAINT "obligation_proposals_origin_known" CHECK ("obligation_proposals"."origin" in ('manual', 'expense', 'dare', 'roulette')),
	CONSTRAINT "obligation_proposals_status_known" CHECK ("obligation_proposals"."status" in ('pending', 'confirmed', 'declined', 'disputed'))
);
--> statement-breakpoint
ALTER TABLE "obligation_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_id" numeric(78, 0) NOT NULL,
	"group_id" uuid NOT NULL,
	"from_user" uuid NOT NULL,
	"to_user" uuid NOT NULL,
	"denom_id" uuid NOT NULL,
	"quantity" bigint,
	"unique_obligation" boolean NOT NULL,
	"amount_cents" bigint,
	"origin" text NOT NULL,
	"origin_id" uuid,
	"settle_expected" boolean NOT NULL,
	"memo" text,
	"photo_id" uuid,
	"confirm_tx" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligations_quantity_positive" CHECK ("obligations"."quantity" is null or "obligations"."quantity" > 0),
	CONSTRAINT "obligations_amount_nonnegative" CHECK ("obligations"."amount_cents" is null or "obligations"."amount_cents" >= 0),
	CONSTRAINT "obligations_origin_known" CHECK ("obligations"."origin" in ('manual', 'expense', 'dare', 'roulette')),
	CONSTRAINT "obligations_not_self" CHECK ("obligations"."from_user" <> "obligations"."to_user")
);
--> statement-breakpoint
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "participant_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"phone_hash" "bytea",
	"created_by" uuid NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"merged_into" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "personal_links" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"dare_id" uuid NOT NULL,
	"claim_id" uuid,
	"user_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_links_claim_xor_user" CHECK (("personal_links"."claim_id" is null) <> ("personal_links"."user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "personal_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_rsvps" (
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"going" boolean NOT NULL,
	CONSTRAINT "plan_rsvps_plan_id_user_id_pk" PRIMARY KEY("plan_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "plan_rsvps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"occurs_at" timestamp with time zone NOT NULL,
	"location" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_status_known" CHECK ("plans"."status" in ('proposed', 'confirmed', 'happened', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"dare_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "room_codes_six_unambiguous" CHECK ("room_codes"."code" ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$')
);
--> statement-breakpoint
ALTER TABLE "room_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dynamic_user_id" text NOT NULL,
	"phone_hash" "bytea",
	"ledger_wallet" text NOT NULL,
	"governance_wallet" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_dynamic_user_id_unique" UNIQUE("dynamic_user_id"),
	CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash"),
	CONSTRAINT "users_ledger_wallet_unique" UNIQUE("ledger_wallet"),
	CONSTRAINT "users_governance_wallet_unique" UNIQUE("governance_wallet")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claim_tokens" ADD CONSTRAINT "claim_tokens_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_positions" ADD CONSTRAINT "dare_positions_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_positions" ADD CONSTRAINT "dare_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_positions" ADD CONSTRAINT "dare_positions_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_positions" ADD CONSTRAINT "dare_positions_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_statements" ADD CONSTRAINT "dare_statements_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_statements" ADD CONSTRAINT "dare_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_votes" ADD CONSTRAINT "dare_votes_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_votes" ADD CONSTRAINT "dare_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_denom_id_denominations_id_fk" FOREIGN KEY ("denom_id") REFERENCES "public"."denominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denominations" ADD CONSTRAINT "denominations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denominations" ADD CONSTRAINT "denominations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tax_lines" ADD CONSTRAINT "expense_tax_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_photo_id_photos_id_fk" FOREIGN KEY ("receipt_photo_id") REFERENCES "public"."photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_claims" ADD CONSTRAINT "item_claims_expense_item_id_expense_items_id_fk" FOREIGN KEY ("expense_item_id") REFERENCES "public"."expense_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_claims" ADD CONSTRAINT "item_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_from_user_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_from_claim_participant_claims_id_fk" FOREIGN KEY ("from_claim") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_to_user_users_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_to_claim_participant_claims_id_fk" FOREIGN KEY ("to_claim") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_denom_id_denominations_id_fk" FOREIGN KEY ("denom_id") REFERENCES "public"."denominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_from_user_users_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_to_user_users_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_denom_id_denominations_id_fk" FOREIGN KEY ("denom_id") REFERENCES "public"."denominations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_claims" ADD CONSTRAINT "participant_claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_claims" ADD CONSTRAINT "participant_claims_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_claims" ADD CONSTRAINT "participant_claims_merged_into_participant_claims_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_links" ADD CONSTRAINT "personal_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rsvps" ADD CONSTRAINT "plan_rsvps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rsvps" ADD CONSTRAINT "plan_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_codes" ADD CONSTRAINT "room_codes_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_codes" ADD CONSTRAINT "room_codes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;