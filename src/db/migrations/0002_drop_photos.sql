-- media replaces photos (docs/decisions.md 2026-09-17). CASCADE drops the two foreign keys that referenced photos.
DROP TABLE "photos" CASCADE;--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "receipt_photo_id";--> statement-breakpoint
ALTER TABLE "obligations" DROP COLUMN "photo_id";
