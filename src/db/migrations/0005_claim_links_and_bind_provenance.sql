CREATE TABLE "claim_links" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "claim_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD COLUMN "from_bound_claim" uuid;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD COLUMN "to_bound_claim" uuid;--> statement-breakpoint
ALTER TABLE "claim_links" ADD CONSTRAINT "claim_links_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_links" ADD CONSTRAINT "claim_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_links_claim" ON "claim_links" USING btree ("claim_id");--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_from_bound_claim_participant_claims_id_fk" FOREIGN KEY ("from_bound_claim") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_to_bound_claim_participant_claims_id_fk" FOREIGN KEY ("to_bound_claim") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_claims_phone_hash" ON "participant_claims" USING btree ("phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_claims_creator_phone" ON "participant_claims" USING btree ("created_by","phone_hash") WHERE "participant_claims"."phone_hash" is not null and "participant_claims"."claimed_by" is null and "participant_claims"."merged_into" is null;--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_from_bound_is_user" CHECK ("obligation_proposals"."from_bound_claim" is null or "obligation_proposals"."from_user" is not null);--> statement-breakpoint
ALTER TABLE "obligation_proposals" ADD CONSTRAINT "obligation_proposals_to_bound_is_user" CHECK ("obligation_proposals"."to_bound_claim" is null or "obligation_proposals"."to_user" is not null);