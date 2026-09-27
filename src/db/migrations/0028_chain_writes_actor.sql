ALTER TABLE "chain_writes" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "chain_writes" ADD COLUMN "told_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chain_writes" ADD CONSTRAINT "chain_writes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chain_writes_actor_idx" ON "chain_writes" USING btree ("actor_id","created_at");