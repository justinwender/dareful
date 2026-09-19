CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dare_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"caused_by" uuid NOT NULL,
	"channels" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dare_statements" ADD COLUMN "kind" text DEFAULT 'update' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dare_statements_one_per_person_until_2c" ON "dare_statements" USING btree ("dare_id","user_id");--> statement-breakpoint
ALTER TABLE "dare_statements" DROP CONSTRAINT "dare_statements_dare_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "dare_statements" ADD CONSTRAINT "dare_statements_dare_id_user_id_kind_pk" PRIMARY KEY("dare_id","user_id","kind");--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_caused_by_users_id_fk" FOREIGN KEY ("caused_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_once" ON "notification_log" USING btree ("user_id","dare_id","kind","seq");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "dare_statements" ADD CONSTRAINT "dare_statements_kind" CHECK ("dare_statements"."kind" in ('update', 'statement'));