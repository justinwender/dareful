CREATE TABLE "chain_writes" (
	"hash" "bytea" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"nonce" integer NOT NULL,
	"raw" "bytea" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"block_number" bigint,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "chain_writes_status_known" CHECK ("chain_writes"."status" in ('pending', 'mined', 'reverted', 'dropped'))
);
--> statement-breakpoint
ALTER TABLE "chain_writes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "chain_writes_status_idx" ON "chain_writes" USING btree ("status","created_at");