ALTER TABLE "code_attempts" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "code_attempts" ADD COLUMN "network_hash" text;--> statement-breakpoint
CREATE INDEX "code_attempts_network_created" ON "code_attempts" USING btree ("network_hash","created_at");--> statement-breakpoint
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_someone" CHECK ("code_attempts"."user_id" is not null or "code_attempts"."network_hash" is not null);