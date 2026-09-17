CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dare_id" uuid,
	"obligation_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"poster_key" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer,
	"author_id" uuid NOT NULL,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_parent_xor" CHECK (("media"."dare_id" is null) <> ("media"."obligation_id" is null)),
	CONSTRAINT "media_kind_known" CHECK ("media"."kind" in ('photo', 'video')),
	CONSTRAINT "media_dimensions_positive" CHECK ("media"."width" > 0 and "media"."height" > 0),
	CONSTRAINT "media_duration_video_only" CHECK ("media"."kind" = 'video' or "media"."duration_ms" is null)
);
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "mark_kind" text;--> statement-breakpoint
ALTER TABLE "dares" ADD COLUMN "mark_value" text;--> statement-breakpoint
ALTER TABLE "denominations" ADD COLUMN "mark_kind" text;--> statement-breakpoint
ALTER TABLE "denominations" ADD COLUMN "mark_value" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_media_id" uuid;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_dare_created" ON "media" USING btree ("dare_id","created_at");--> statement-breakpoint
CREATE INDEX "media_obligation_created" ON "media" USING btree ("obligation_id","created_at");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_media_id_media_id_fk" FOREIGN KEY ("receipt_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_mark_kind_known" CHECK ("dares"."mark_kind" is null or "dares"."mark_kind" in ('emoji', 'image'));--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_mark_both_or_neither" CHECK (("dares"."mark_kind" is null) = ("dares"."mark_value" is null));--> statement-breakpoint
ALTER TABLE "denominations" ADD CONSTRAINT "denominations_mark_kind_known" CHECK ("denominations"."mark_kind" is null or "denominations"."mark_kind" in ('emoji', 'image'));--> statement-breakpoint
ALTER TABLE "denominations" ADD CONSTRAINT "denominations_mark_both_or_neither" CHECK (("denominations"."mark_kind" is null) = ("denominations"."mark_value" is null));