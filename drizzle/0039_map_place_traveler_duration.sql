-- Map reference UX (owner, Nov 2026): two optional facts per map place so the
-- map can offer «Traveler type» and «Duration» filters from real data.
-- Additive and guarded: nullable columns, added only if missing, no data
-- written. A filter chip stays hidden until at least one place has a value.
--   traveler_types   — e.g. {families,couples,friends,solo,kids}
--   duration_minutes — typical visit length in minutes

ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "traveler_types" text[];
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "duration_minutes" integer;

-- To undo:
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "traveler_types";
--   ALTER TABLE "map_places" DROP COLUMN IF EXISTS "duration_minutes";
