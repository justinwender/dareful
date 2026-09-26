CREATE TABLE "picture_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"stamp_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"ink" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picture_marks_kind_known" CHECK ("picture_marks"."kind" in ('sticker', 'image')),
	CONSTRAINT "picture_marks_ink_known" CHECK ("picture_marks"."ink" is null or "picture_marks"."ink" in ('clay', 'ochre', 'olive', 'sea', 'slate', 'iris', 'plum', 'rose')),
	CONSTRAINT "picture_marks_dimensions_positive" CHECK ("picture_marks"."width" > 0 and "picture_marks"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "picture_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dares" DROP CONSTRAINT "dares_mark_kind_known";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "role" text DEFAULT 'memory' NOT NULL;--> statement-breakpoint
ALTER TABLE "picture_marks" ADD CONSTRAINT "picture_marks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "picture_marks_owner_created" ON "picture_marks" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "dares" ADD CONSTRAINT "dares_mark_kind_known" CHECK ("dares"."mark_kind" is null or "dares"."mark_kind" in ('emoji', 'image', 'sticker'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_role_known" CHECK ("media"."role" in ('memory', 'evidence'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_evidence_on_market" CHECK ("media"."role" = 'memory' or "media"."dare_id" is not null);