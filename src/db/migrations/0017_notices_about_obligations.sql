DROP INDEX "notification_log_once";--> statement-breakpoint
ALTER TABLE "notification_log" ALTER COLUMN "dare_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "obligation_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_once_obligation" ON "notification_log" USING btree ("user_id","obligation_id","kind","seq") WHERE "notification_log"."obligation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_once_pair" ON "notification_log" USING btree ("user_id","caused_by","kind","seq") WHERE "notification_log"."kind" = 'netted';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_once" ON "notification_log" USING btree ("user_id","dare_id","kind","seq") WHERE "notification_log"."dare_id" is not null;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_about_one" CHECK (("notification_log"."kind" = 'netted' and "notification_log"."dare_id" is null and "notification_log"."obligation_id" is null) or ("notification_log"."kind" <> 'netted' and ("notification_log"."dare_id" is null) <> ("notification_log"."obligation_id" is null)));