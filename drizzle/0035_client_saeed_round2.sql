-- Owner requests, round 2 (Mr. Saeed, Oct 2026). Additive and guarded: a fresh
-- database (CI, before the seed) passes straight through, a second run changes
-- nothing more, and nothing is deleted. Every value this file changes on an
-- existing row is first copied to "migration_row_backups", so it can be put
-- back exactly (see «To undo» at the end).

-- (3b) Itinerary levels: economy / mid / luxury, each with its own price
-- (minor units). Empty until the owner fills them in Studio.
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "tier_prices" jsonb;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "migration_row_backups" (
  "id" bigserial PRIMARY KEY,
  "migration" varchar(64) NOT NULL,
  "table_name" varchar(64) NOT NULL,
  "row_id" uuid NOT NULL,
  "column_name" varchar(64) NOT NULL,
  "old_value" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("migration", "table_name", "row_id", "column_name")
);--> statement-breakpoint

-- (1) Barbers: off the map and the lists for now (the owner's call). The
-- category goes inactive (no chip, no guide card) and its places are hidden —
-- kept, not deleted.
INSERT INTO "migration_row_backups" ("migration","table_name","row_id","column_name","old_value")
SELECT '0035', 'categories', c."id", 'status', to_jsonb(c."status")
FROM "categories" c
WHERE c."key" = 'barbers' AND c."status" <> 'inactive'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "migration_row_backups" ("migration","table_name","row_id","column_name","old_value")
SELECT '0035', 'map_places', mp."id", 'is_hidden', to_jsonb(mp."is_hidden")
FROM "map_places" mp
WHERE mp."category_id" = (SELECT "id" FROM "categories" WHERE "key" = 'barbers')
  AND mp."is_hidden" = false
  AND mp."deleted_at" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "categories" SET "status" = 'inactive', "updated_at" = now()
WHERE "key" = 'barbers' AND "status" <> 'inactive';--> statement-breakpoint
UPDATE "map_places" SET "is_hidden" = true, "updated_at" = now()
WHERE "id" IN (
  SELECT "row_id" FROM "migration_row_backups"
  WHERE "migration" = '0035' AND "table_name" = 'map_places' AND "column_name" = 'is_hidden'
)
  AND "is_hidden" = false;--> statement-breakpoint

-- (1) Malls and popular markets are two separate lists. 0031 moved markets
-- out of malls but left «malls» as their sub-category (so they still showed
-- under ?cat=malls). Drop the other one of the pair from each place's
-- sub-categories.
INSERT INTO "migration_row_backups" ("migration","table_name","row_id","column_name","old_value")
SELECT '0035', 'map_places', mp."id", 'sub_category_ids', mp."sub_category_ids"
FROM "map_places" mp
JOIN "categories" own ON own."id" = mp."category_id" AND own."key" IN ('malls','markets')
JOIN "categories" other ON other."key" IN ('malls','markets') AND other."key" <> own."key"
WHERE coalesce(mp."sub_category_ids", '[]'::jsonb) ? other."id"::text
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "map_places" mp SET
  "sub_category_ids" = mp."sub_category_ids" - other."id"::text,
  "updated_at" = now()
FROM "categories" own, "categories" other
WHERE own."id" = mp."category_id" AND own."key" IN ('malls','markets')
  AND other."key" IN ('malls','markets') AND other."key" <> own."key"
  AND coalesce(mp."sub_category_ids", '[]'::jsonb) ? other."id"::text;

-- To undo (by hand, if the owner asks):
--   UPDATE categories c SET status = b.old_value #>> '{}' FROM migration_row_backups b
--     WHERE b.migration = '0035' AND b.table_name = 'categories' AND b.row_id = c.id;
--   UPDATE map_places p SET is_hidden = (b.old_value #>> '{}')::boolean FROM migration_row_backups b
--     WHERE b.migration = '0035' AND b.table_name = 'map_places' AND b.column_name = 'is_hidden' AND b.row_id = p.id;
--   UPDATE map_places p SET sub_category_ids = b.old_value FROM migration_row_backups b
--     WHERE b.migration = '0035' AND b.table_name = 'map_places' AND b.column_name = 'sub_category_ids' AND b.row_id = p.id;
