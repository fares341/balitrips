-- Free place photos (owner, Nov 2026): the Google photos integration needs a
-- paid key, so map places get photos from free, openly-licensed sources
-- instead — Wikimedia Commons / Wikidata and Openverse (re-hosted on our
-- media pipeline with their credit), and optionally Unsplash (hotlinked,
-- per its API guidelines).
--
-- Additive and guarded: nullable columns and a new table, created only if
-- missing; no existing row is written. A second run changes nothing.
--
-- media (provenance of every imported photo; NULL source = an upload):
--   source       commons | openverse | unsplash
--   author, author_url, license, license_url, source_url
--   external_url the hotlinked URL (Unsplash only; never re-hosted)
--   sha256, dhash  content hashes (cross-place duplicate guard)
--
-- place_photo_candidates: what the «Find free photos» job found per place,
-- with its score, for review in Studio → Places → Free photos.
--   status  new | applied | rejected | duplicate
--
-- map_places.free_photos_checked_at: when the job last looked at a place.

ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "source" varchar(16);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "author" text;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "author_url" text;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "license" varchar(64);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "license_url" text;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "external_url" text;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sha256" varchar(64);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "dhash" varchar(16);
CREATE INDEX IF NOT EXISTS "media_sha256_idx" ON "media" ("sha256");

ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "free_photos_checked_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "place_photo_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "place_id" uuid NOT NULL REFERENCES "map_places"("id") ON DELETE CASCADE,
  "source" varchar(16) NOT NULL,
  "external_id" text NOT NULL,
  "found_via" varchar(16) NOT NULL,
  "title" text,
  "thumb_url" text NOT NULL,
  "image_url" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "distance_m" integer,
  "name_score" real NOT NULL DEFAULT 0,
  "score" real NOT NULL DEFAULT 0,
  "tier" varchar(8) NOT NULL,
  "author" text,
  "author_url" text,
  "license" varchar(64) NOT NULL,
  "license_url" text,
  "source_url" text NOT NULL,
  "download_location" text,
  "sha256" varchar(64),
  "dhash" varchar(16),
  "status" varchar(16) NOT NULL DEFAULT 'new',
  "duplicate_of" uuid,
  "media_id" uuid REFERENCES "media"("id"),
  "auto_applied" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "place_photo_candidates_uq" UNIQUE ("place_id", "source", "external_id")
);

DO $$ BEGIN
  ALTER TABLE "place_photo_candidates" ADD CONSTRAINT "place_photo_candidates_status_chk"
    CHECK ("status" IN ('new', 'applied', 'rejected', 'duplicate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "place_photo_candidates_place_idx" ON "place_photo_candidates" ("place_id");
CREATE INDEX IF NOT EXISTS "place_photo_candidates_sha_idx" ON "place_photo_candidates" ("sha256");

-- To undo:
--   DROP TABLE IF EXISTS "place_photo_candidates";
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "free_photos_checked_at";
--   DROP INDEX IF EXISTS "media_sha256_idx";
--   ALTER TABLE "media" DROP COLUMN IF EXISTS "dhash", DROP COLUMN IF EXISTS "sha256",
--     DROP COLUMN IF EXISTS "external_url", DROP COLUMN IF EXISTS "source_url",
--     DROP COLUMN IF EXISTS "license_url", DROP COLUMN IF EXISTS "license",
--     DROP COLUMN IF EXISTS "author_url", DROP COLUMN IF EXISTS "author",
--     DROP COLUMN IF EXISTS "source";
