ALTER TABLE "dares" ADD COLUMN "feed_ending" text;--> statement-breakpoint
ALTER TABLE "public_questions" ADD COLUMN "decided_by_feed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "home_color" text;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "away_color" text;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "season_type" smallint;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "first_drive_result" text;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "first_drive_raw" text;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "first_drive_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "first_drive_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_games" ADD COLUMN "summary_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_feed_ending_known" CHECK ("dares"."feed_ending" is null or "dares"."feed_ending" in ('agreed', 'alone', 'conflict', 'tie', 'drive', 'drive_unknown'));--> statement-breakpoint
ALTER TABLE "sports_games" ADD CONSTRAINT "sports_games_first_drive_known" CHECK ("sports_games"."first_drive_result" is null or "sports_games"."first_drive_result" in ('Touchdown', 'Field goal', 'Punt', 'Turnover', 'Something else'));