CREATE TABLE "device_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"state" text NOT NULL,
	"standalone" boolean NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_states" ADD CONSTRAINT "device_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_states_user_created" ON "device_states" USING btree ("user_id","created_at");