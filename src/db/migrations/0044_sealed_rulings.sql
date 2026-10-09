CREATE TABLE "dare_agreements" (
	"dare_id" uuid NOT NULL,
	"user_id" uuid,
	"claim_id" uuid,
	"outcome" bigint NOT NULL,
	"agreed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dare_agreements_who" CHECK (("dare_agreements"."user_id" is null) <> ("dare_agreements"."claim_id" is null))
);
--> statement-breakpoint
ALTER TABLE "dare_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dare_disputes" (
	"dare_id" uuid NOT NULL,
	"user_id" uuid,
	"claim_id" uuid,
	"text" text NOT NULL,
	"disputed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dare_disputes_who" CHECK (("dare_disputes"."user_id" is null) <> ("dare_disputes"."claim_id" is null)),
	CONSTRAINT "dare_disputes_text" CHECK (char_length("dare_disputes"."text") between 2 and 400)
);
--> statement-breakpoint
ALTER TABLE "dare_disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "sealed_outcome" bigint;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "sealed_confidence_bps" smallint;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "sealed_rationale" text;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "seal_salt" "bytea";--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "seal_hash" "bytea";--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "ruling_revealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dare_agreements" ADD CONSTRAINT "dare_agreements_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_agreements" ADD CONSTRAINT "dare_agreements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_agreements" ADD CONSTRAINT "dare_agreements_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_disputes" ADD CONSTRAINT "dare_disputes_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_disputes" ADD CONSTRAINT "dare_disputes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_disputes" ADD CONSTRAINT "dare_disputes_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dare_agreements_user" ON "dare_agreements" USING btree ("dare_id","user_id") WHERE "dare_agreements"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dare_agreements_claim" ON "dare_agreements" USING btree ("dare_id","claim_id") WHERE "dare_agreements"."claim_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dare_disputes_user" ON "dare_disputes" USING btree ("dare_id","user_id") WHERE "dare_disputes"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dare_disputes_claim" ON "dare_disputes" USING btree ("dare_id","claim_id") WHERE "dare_disputes"."claim_id" is not null;