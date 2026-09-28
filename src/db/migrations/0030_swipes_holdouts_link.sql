CREATE TABLE "claim_number_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_number_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "now_archive" (
	"user_id" uuid NOT NULL,
	"dare_id" uuid NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "now_archive_user_id_dare_id_pk" PRIMARY KEY("user_id","dare_id")
);
--> statement-breakpoint
ALTER TABLE "now_archive" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" DROP CONSTRAINT "dares_resolved_by_known";--> statement-breakpoint
ALTER TABLE "dare_positions" ADD COLUMN "bound_claim" uuid;--> statement-breakpoint
ALTER TABLE "claim_number_attempts" ADD CONSTRAINT "claim_number_attempts_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "now_archive" ADD CONSTRAINT "now_archive_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "now_archive" ADD CONSTRAINT "now_archive_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_number_attempts_claim_created" ON "claim_number_attempts" USING btree ("claim_id","created_at");--> statement-breakpoint
ALTER TABLE "dare_positions" ADD CONSTRAINT "dare_positions_bound_claim_participant_claims_id_fk" FOREIGN KEY ("bound_claim") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_resolved_by_known" CHECK ("dares"."resolved_by" is null or "dares"."resolved_by" in ('quorum', 'arbitration', 'provisional', 'expired', 'feed', 'removed'));