CREATE TABLE "delegated_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"digest" "bytea" NOT NULL,
	"request" text NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegated_signatures_action_known" CHECK ("delegated_signatures"."action" in ('confirm', 'confirm_many', 'close', 'net', 'create', 'enter', 'check'))
);
--> statement-breakpoint
ALTER TABLE "delegated_signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delegations" ADD COLUMN "share_set_id" text;--> statement-breakpoint
ALTER TABLE "delegations" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "delegations" ADD COLUMN "event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delegated_signatures" ADD CONSTRAINT "delegated_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delegated_signatures_user_idx" ON "delegated_signatures" USING btree ("user_id","created_at");