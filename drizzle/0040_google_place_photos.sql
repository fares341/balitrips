-- Google place photos (owner, Nov 2026): instead of uploading ~600 photos by
-- hand, a map place can be matched to its Google Maps place and show that
-- place's Google photos, fetched live through Places API (New).
--
-- Google's Places API policies allow storing ONLY the place ID ("exempt from
-- the caching restrictions"). Photo names, photo URIs, photo bytes, author
-- attributions, names and coordinates returned by Google are NOT stored here
-- or anywhere else: they are fetched per request. So this migration adds the
-- place ID and our own match bookkeeping, nothing from Google beyond the ID.
--
-- Additive and guarded: nullable columns / a new table, created only if
-- missing; no existing data is written. A second run changes nothing.
--   google_place_id      — Google place ID (stored indefinitely, per policy)
--   google_match_status  — none | auto | confirmed | rejected | review
--                          (review = a candidate waiting for a person)
--   google_match_score   — our confidence 0..1 for the candidate
--   google_checked_at    — when the matcher last looked at this place
--   google_api_usage     — daily request counters per call kind (cost guard)

ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "google_place_id" text;
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "google_match_status" varchar(16) NOT NULL DEFAULT 'none';
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "google_match_score" real;
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "google_checked_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "map_places" ADD CONSTRAINT "map_places_google_match_status_chk"
    CHECK ("google_match_status" IN ('none', 'auto', 'confirmed', 'rejected', 'review'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "map_places_google_status_idx" ON "map_places" ("google_match_status");

CREATE TABLE IF NOT EXISTS "google_api_usage" (
  "day" date NOT NULL,
  "kind" varchar(32) NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_api_usage_pk" PRIMARY KEY ("day", "kind")
);

-- To undo:
--   DROP TABLE IF EXISTS "google_api_usage";
--   DROP INDEX IF EXISTS "map_places_google_status_idx";
--   ALTER TABLE "map_places" DROP CONSTRAINT IF EXISTS "map_places_google_match_status_chk";
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "google_checked_at";
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "google_match_score";
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "google_match_status";
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "google_place_id";
