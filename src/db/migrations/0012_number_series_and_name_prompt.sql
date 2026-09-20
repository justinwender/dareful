CREATE TABLE "dare_number_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dare_id" uuid NOT NULL,
	"value_bps" integer NOT NULL,
	"entries" smallint NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dare_number_series_range" CHECK ("dare_number_series"."value_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "dare_number_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "name_prompt_dismissals" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dare_number_series" ADD CONSTRAINT "dare_number_series_dare_id_dares_id_fk" FOREIGN KEY ("dare_id") REFERENCES "public"."dares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dare_number_series_dare_at" ON "dare_number_series" USING btree ("dare_id","at");