ALTER TABLE "health_runs" ADD COLUMN "env" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
CREATE INDEX "health_runs_env_at" ON "health_runs" USING btree ("env","at");