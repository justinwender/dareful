CREATE TABLE "chain_failures" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"first_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_why" text NOT NULL,
	"failures" integer DEFAULT 1 NOT NULL,
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chain_failures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "chain_pending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "chain_tried_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "chain_tries" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "chain_gave_up" text;--> statement-breakpoint
CREATE INDEX "chain_failures_first_idx" ON "chain_failures" USING btree ("first_failed_at");