CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid,
	"claim_id" uuid,
	"device_id" uuid,
	"dare_id" uuid,
	"game_id" uuid,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"once_key" text,
	CONSTRAINT "usage_events_name_short" CHECK (char_length("usage_events"."name") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "excluded_from_counts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_claim_id_participant_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."participant_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_game_id_sports_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."sports_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_name_at" ON "usage_events" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "usage_events_dare" ON "usage_events" USING btree ("dare_id");--> statement-breakpoint
CREATE INDEX "usage_events_user" ON "usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_once" ON "usage_events" USING btree ("once_key") WHERE "usage_events"."once_key" is not null;