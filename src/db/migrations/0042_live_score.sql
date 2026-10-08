ALTER TABLE "sports_games" ADD COLUMN "live" jsonb;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "live_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "live_tried_at" timestamp with time zone;