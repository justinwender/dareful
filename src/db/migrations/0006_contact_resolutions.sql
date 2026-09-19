CREATE TABLE "contact_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_resolutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_resolutions" ADD CONSTRAINT "contact_resolutions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_resolutions_user_created" ON "contact_resolutions" USING btree ("user_id","created_at");