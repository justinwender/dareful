CREATE TABLE "dare_close_calls" (
	"dare_id" uuid NOT NULL,
	"user_id" uuid,
	"claim_id" uuid,
	"said_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dare_close_calls_dare_user" UNIQUE("dare_id","user_id"),
	CONSTRAINT "dare_close_calls_dare_claim" UNIQUE("dare_id","claim_id"),
	CONSTRAINT "dare_close_calls_user_xor_claim" CHECK (("dare_close_calls"."user_id" is null) <> ("dare_close_calls"."claim_id" is null))
);
--> statement-breakpoint
ALTER TABLE "dare_close_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "happened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "happened_user" uuid;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "happened_claim" uuid;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "closes_after_first" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dare_close_calls" ADD CONSTRAINT "dare_close_calls_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_close_calls" ADD CONSTRAINT "dare_close_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dare_close_calls" ADD CONSTRAINT "dare_close_calls_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_happened_user_users_id_fk" FOREIGN KEY ("happened_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_happened_claim_participant_claims_id_fk" FOREIGN KEY ("happened_claim") REFERENCES "public"."participant_claims"("id") ON DELETE no action ON UPDATE no action;