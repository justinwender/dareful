ALTER TABLE "dares" DROP CONSTRAINT "dares_resolved_by_known";--> statement-breakpoint
DROP INDEX "dare_statements_one_per_person_until_2c";--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "criterion" text;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "mode" text DEFAULT 'quick' NOT NULL;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "ruling_text" text;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "ruling_hash" "bytea";--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "deadline_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_tier_known" CHECK ("dares"."tier" is null or "dares"."tier" in ('checkable', 'contestable'));--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_mode_known" CHECK ("dares"."mode" in ('quick', 'careful'));--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_ruling_both_or_neither" CHECK (("dares"."ruling_text" is null) = ("dares"."ruling_hash" is null));--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_resolved_by_known" CHECK ("dares"."resolved_by" is null or "dares"."resolved_by" in ('quorum', 'arbitration', 'provisional', 'expired'));