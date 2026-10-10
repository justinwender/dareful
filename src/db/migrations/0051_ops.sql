CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"label" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"searches" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "anthropic_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cents" bigint NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entered_by" uuid,
	CONSTRAINT "anthropic_credit_not_negative" CHECK ("anthropic_credit"."cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "anthropic_credit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "canary_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"step" text,
	"error" text,
	"dare_id" uuid,
	"txs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canary_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "channel_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"ok" boolean NOT NULL,
	CONSTRAINT "channel_sends_channel_known" CHECK ("channel_sends"."channel" in ('email', 'push')),
	CONSTRAINT "channel_sends_kind_known" CHECK ("channel_sends"."kind" in ('notice', 'ops'))
);
--> statement-breakpoint
ALTER TABLE "channel_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "health_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"core_ok" boolean NOT NULL,
	"checks" jsonb NOT NULL,
	CONSTRAINT "health_runs_source_known" CHECK ("health_runs"."source" in ('tick', 'request'))
);
--> statement-breakpoint
ALTER TABLE "health_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"since" timestamp with time zone,
	"told_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"reading" text
);
--> statement-breakpoint
ALTER TABLE "ops_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_state" (
	"key" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rpc_calls" (
	"day" text NOT NULL,
	"method" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"cu" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "rpc_calls_day_method_pk" PRIMARY KEY("day","method")
);
--> statement-breakpoint
ALTER TABLE "rpc_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anthropic_credit" ADD CONSTRAINT "anthropic_credit_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_at" ON "ai_calls" USING btree ("at");--> statement-breakpoint
CREATE INDEX "canary_runs_started" ON "canary_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "channel_sends_at" ON "channel_sends" USING btree ("at");--> statement-breakpoint
CREATE INDEX "health_runs_at" ON "health_runs" USING btree ("at");