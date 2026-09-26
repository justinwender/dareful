CREATE TABLE "public_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"terms_text" text NOT NULL,
	"outcome_labels" text[] NOT NULL,
	"range" bigint,
	"typical" bigint,
	"shift" bigint,
	"decided_by_score" boolean DEFAULT false NOT NULL,
	"outcome_words" text[],
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_questions_game_key" UNIQUE("game_id","key"),
	CONSTRAINT "public_questions_key_known" CHECK ("public_questions"."key" in ('home_wins', 'margin', 'total', 'first_drive')),
	CONSTRAINT "public_questions_kind_known" CHECK ("public_questions"."kind" in ('binary', 'numeric', 'categorical')),
	CONSTRAINT "public_questions_range_numeric" CHECK (("public_questions"."kind" <> 'numeric') or ("public_questions"."range" is not null and "public_questions"."range" > 0)),
	CONSTRAINT "public_questions_outcome_words_four" CHECK ("public_questions"."outcome_words" is null or array_length("public_questions"."outcome_words", 1) = 4)
);
--> statement-breakpoint
ALTER TABLE "public_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sports_feed_reads" (
	"source" text NOT NULL,
	"sport" text NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "sports_feed_reads_source_sport_pk" PRIMARY KEY("source","sport")
);
--> statement-breakpoint
ALTER TABLE "sports_feed_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sports_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"time_valid" boolean DEFAULT true NOT NULL,
	"venue" text,
	"home_id" text NOT NULL,
	"home_abbr" text NOT NULL,
	"home_name" text NOT NULL,
	"home_short" text NOT NULL,
	"away_id" text NOT NULL,
	"away_abbr" text NOT NULL,
	"away_name" text NOT NULL,
	"away_short" text NOT NULL,
	"play_by_play" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"final_seen_at" timestamp with time zone,
	"final_confirmed_at" timestamp with time zone,
	"check_home_score" integer,
	"check_away_score" integer,
	"checked_at" timestamp with time zone,
	"expected_end_at" timestamp with time zone NOT NULL,
	"polled_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_games_source" UNIQUE("source","source_id"),
	CONSTRAINT "sports_games_sport_known" CHECK ("sports_games"."sport" in ('nfl', 'mlb', 'nba', 'nhl')),
	CONSTRAINT "sports_games_status_known" CHECK ("sports_games"."status" in ('scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'unknown')),
	CONSTRAINT "sports_games_scores_together" CHECK (("sports_games"."home_score" is null) = ("sports_games"."away_score" is null)),
	CONSTRAINT "sports_games_check_together" CHECK (("sports_games"."check_home_score" is null) = ("sports_games"."check_away_score" is null)),
	CONSTRAINT "sports_games_final_has_scores" CHECK ("sports_games"."final_seen_at" is null or "sports_games"."home_score" is not null)
);
--> statement-breakpoint
ALTER TABLE "sports_games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" DROP CONSTRAINT "dares_range_source_known";--> statement-breakpoint
ALTER TABLE "dares" DROP CONSTRAINT "dares_resolved_by_known";--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "feed_outcome" bigint;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "feed_outcome_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "backstop_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public_questions" ADD CONSTRAINT "public_questions_game_id_sports_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."sports_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sports_games_starts" ON "sports_games" USING btree ("sport","starts_at");--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_template_id_public_questions_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."public_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_range_source_known" CHECK ("dares"."range_source" is null or "dares"."range_source" in ('asker', 'ai', 'template'));--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_resolved_by_known" CHECK ("dares"."resolved_by" is null or "dares"."resolved_by" in ('quorum', 'arbitration', 'provisional', 'expired', 'feed'));