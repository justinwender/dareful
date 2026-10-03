CREATE TABLE "usage_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "usage_snapshots_day_unique" UNIQUE("day")
);
