-- Region for every map place that has none (owner, Nov 2026).
--
-- The Nov 2026 import (scripts/import-new-places.ts) left many places with no
-- region, so the /map count chips skipped them. Same rule as the importer's
-- `regionFor()` (src/lib/place-content/new-places.ts):
--   1. the smallest active region whose circle (center_lat/center_lon/radius_km)
--      contains the point;
--   2. else the nearest active LEAF region (no sub-areas) whose centre is
--      within 25 km;
--   3. else left NULL (Studio).
-- Only rows where region_id IS NULL are touched, so it is idempotent and an
-- owner's choice is never overwritten.

UPDATE "map_places" mp
SET "region_id" = pick."region_id", "updated_at" = now()
FROM (
  SELECT p."id" AS "place_id",
    coalesce(
      (SELECT r."id" FROM "regions" r
        WHERE r."status" = 'active'
          AND r."center_lat" IS NOT NULL AND r."center_lon" IS NOT NULL
          AND r."radius_km" IS NOT NULL AND r."radius_km" > 0
          AND 6371.0 * 2 * asin(sqrt(
                power(sin(radians(p."lat" - r."center_lat") / 2), 2)
                + cos(radians(r."center_lat")) * cos(radians(p."lat"))
                  * power(sin(radians(p."lon" - r."center_lon") / 2), 2)
              )) <= r."radius_km"
        ORDER BY r."radius_km" ASC, r."sort_order" ASC, r."key" ASC
        LIMIT 1),
      (SELECT d."id" FROM (
         SELECT r."id", r."key", 6371.0 * 2 * asin(sqrt(
                power(sin(radians(p."lat" - r."center_lat") / 2), 2)
                + cos(radians(r."center_lat")) * cos(radians(p."lat"))
                  * power(sin(radians(p."lon" - r."center_lon") / 2), 2)
              )) AS km
         FROM "regions" r
         WHERE r."status" = 'active'
           AND r."center_lat" IS NOT NULL AND r."center_lon" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "regions" c WHERE c."parent_id" = r."id")
       ) d
       WHERE d.km <= 25
       ORDER BY d.km ASC, d."key" ASC
       LIMIT 1)
    ) AS "region_id"
  FROM "map_places" p
  WHERE p."region_id" IS NULL
) pick
WHERE mp."id" = pick."place_id"
  AND mp."region_id" IS NULL
  AND pick."region_id" IS NOT NULL;
