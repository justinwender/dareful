CREATE TABLE "code_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_attempts_user_created" ON "code_attempts" USING btree ("user_id","created_at");