CREATE TABLE "pass_the_phone" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pin_hash" "bytea" NOT NULL,
	"pin_salt" "bytea" NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_tries" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"lockouts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pass_the_phone" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pass_the_phone" ADD CONSTRAINT "pass_the_phone_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;