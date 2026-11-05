-- Itineraries phase 1 (owner, Nov 2026 — corrected spec «الجداول السياحية»):
-- preview stats and day teasers, versioned uploaded PDFs, e-mail download
-- tokens, and per-vehicle driver fields. The `itinerarySales` and `driver`
-- settings live in `site_settings` (zod-validated; a missing row = default),
-- so they need no DDL here.
--
-- Additive and guarded: nullable/defaulted columns and a new table, created
-- only if missing. The one index change swaps `itinerary_doc_unique` for a
-- partial index over generated rows only — the same rows it covered before,
-- since every existing row is generated. A second run changes nothing.
--
-- itineraries:
--   preview_stats       [{icon, value, label{en,ar,id}}] — «وش بتحصل عليه»
--   gallery_captions    {mediaId: {en,ar,id}} — generic captions, no place names
--   teaser_days_visible days shown in «لمحة سريعة على أيامك» (default 3)
--   is_popular          «الأكثر طلبًا» badge
--   seo_title / seo_description
-- itinerary_days:
--   teaser_image_id, teaser_mood {en,ar,id} — the only day fields made public
-- itinerary_documents:
--   source              generated | uploaded. Uploaded rows are stored with
--                       version = 0, which no itinerary version ever equals
--                       (versions start at 1), so every existing reader keyed
--                       on (itinerary, version, locale) keeps seeing only the
--                       generated files; the current upload is still pointed
--                       to by itineraries.uploaded_pdf_keys as before.
--   file_version        uploaded: 1, 2, 3… per itinerary+locale (0 for generated)
--   is_current          the uploaded file delivered now; older ones archived
--   download_filename   the name the buyer's file is saved as
--   notify_buyers       whether this upload notified earlier buyers
--   uploaded_by_id
-- download_tokens: e-mail download links (hash only), per order item.
-- driver_vehicles: notice_days_override, hours_per_day.

ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "preview_stats" jsonb;
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "gallery_captions" jsonb;
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "teaser_days_visible" integer NOT NULL DEFAULT 3;
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "is_popular" boolean NOT NULL DEFAULT false;
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "seo_title" jsonb;
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "seo_description" jsonb;

ALTER TABLE "itinerary_days" ADD COLUMN IF NOT EXISTS "teaser_image_id" uuid REFERENCES "media"("id") ON DELETE SET NULL;
ALTER TABLE "itinerary_days" ADD COLUMN IF NOT EXISTS "teaser_mood" jsonb;

ALTER TABLE "itinerary_documents" ADD COLUMN IF NOT EXISTS "source" varchar(16) NOT NULL DEFAULT 'generated';
ALTER TABLE "itinerary_documents" ADD COLUMN IF NOT EXISTS "file_version" integer NOT NULL DEFAULT 0;
ALTER TABLE "itinerary_documents" ADD COLUMN IF NOT EXISTS "is_current" boolean NOT NULL DEFAULT true;
ALTER TABLE "itinerary_documents" ADD COLUMN IF NOT EXISTS "download_filename" varchar(160);
ALTER TABLE "itinerary_documents" ADD COLUMN IF NOT EXISTS "notify_buyers" boolean NOT NULL DEFAULT false;
ALTER TABLE "itinerary_documents" ADD COLUMN IF NOT EXISTS "uploaded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE "itinerary_documents" ADD CONSTRAINT "itinerary_documents_source_chk"
    CHECK ("source" IN ('generated', 'uploaded'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Generated rows keep their (itinerary, version, locale) uniqueness; uploaded
-- rows are unique per (itinerary, locale, file_version).
DROP INDEX IF EXISTS "itinerary_doc_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "itinerary_doc_unique"
  ON "itinerary_documents" ("itinerary_id", "version", "locale") WHERE "source" = 'generated';
CREATE UNIQUE INDEX IF NOT EXISTS "itinerary_doc_upload_unique"
  ON "itinerary_documents" ("itinerary_id", "locale", "file_version") WHERE "source" = 'uploaded';

CREATE TABLE IF NOT EXISTS "download_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "max_uses" integer NOT NULL DEFAULT 5,
  "uses" integer NOT NULL DEFAULT 0,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "download_tokens_hash_uq" UNIQUE ("token_hash")
);
CREATE INDEX IF NOT EXISTS "download_tokens_item_idx" ON "download_tokens" ("order_item_id");

ALTER TABLE "driver_vehicles" ADD COLUMN IF NOT EXISTS "notice_days_override" integer;
ALTER TABLE "driver_vehicles" ADD COLUMN IF NOT EXISTS "hours_per_day" integer NOT NULL DEFAULT 10;

-- To undo:
--   ALTER TABLE "driver_vehicles" DROP COLUMN IF EXISTS "hours_per_day", DROP COLUMN IF EXISTS "notice_days_override";
--   DROP TABLE IF EXISTS "download_tokens";
--   DROP INDEX IF EXISTS "itinerary_doc_upload_unique";
--   DELETE FROM "itinerary_documents" WHERE "source" = 'uploaded';
--   DROP INDEX IF EXISTS "itinerary_doc_unique";
--   CREATE UNIQUE INDEX "itinerary_doc_unique" ON "itinerary_documents" ("itinerary_id", "version", "locale");
--   ALTER TABLE "itinerary_documents" DROP CONSTRAINT IF EXISTS "itinerary_documents_source_chk",
--     DROP COLUMN IF EXISTS "uploaded_by_id", DROP COLUMN IF EXISTS "notify_buyers",
--     DROP COLUMN IF EXISTS "download_filename", DROP COLUMN IF EXISTS "is_current",
--     DROP COLUMN IF EXISTS "file_version", DROP COLUMN IF EXISTS "source";
--   ALTER TABLE "itinerary_days" DROP COLUMN IF EXISTS "teaser_mood", DROP COLUMN IF EXISTS "teaser_image_id";
--   ALTER TABLE "itineraries" DROP COLUMN IF EXISTS "seo_description", DROP COLUMN IF EXISTS "seo_title",
--     DROP COLUMN IF EXISTS "is_popular", DROP COLUMN IF EXISTS "teaser_days_visible",
--     DROP COLUMN IF EXISTS "gallery_captions", DROP COLUMN IF EXISTS "preview_stats";
