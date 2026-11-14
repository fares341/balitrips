-- Activities are a map section again (site audit, Nov 2026).
--
-- scripts/import-activities-final.ts files one map place per activity under
-- the category `activities`, yet live /map had no «activities» chip and
-- `/api/map/places?cat=activities` answered with no places: the map lists a
-- category only when it is active, has a map level (`map_tier`) and has no
-- parent (src/lib/map/queries.ts → listMapCategories), and the live row no
-- longer met one of the three (migration 0026 created it as free and active;
-- it was changed later in Studio while it had no places).
--
-- 1. The `activities` category exists and is an active, free, top-level map
--    category, first in the list (0026's order).
-- 2. Look: the «bolt» glyph on green and the 0026 label, written only where
--    nothing is set, so a value chosen in Studio is kept.
-- 3. Its places open for everyone: is_free recomputed with the same
--    expression as syncPlaceAccessSql (src/lib/content/map-access.ts).
-- Only rows that differ are written. Idempotent.

INSERT INTO "categories" ("key","label","icon","sort_order","status","map_tier","map_order","map_color")
VALUES ('activities', '{"en":"Activities","ar":"الأنشطة والفعاليات","id":"Aktivitas"}'::jsonb,
        'bolt', 20, 'active', 'free', 1, '#2E7D4F')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

UPDATE "categories" SET
  "status" = 'active',
  "map_tier" = 'free',
  "parent_id" = NULL,
  "map_order" = CASE WHEN "map_tier" IS NULL OR "map_order" <= 0 THEN 1 ELSE "map_order" END,
  "updated_at" = now()
WHERE "key" = 'activities'
  AND ("status" IS DISTINCT FROM 'active'
    OR "map_tier" IS DISTINCT FROM 'free'
    OR "parent_id" IS NOT NULL
    OR "map_order" <= 0);
--> statement-breakpoint

UPDATE "categories" SET
  "icon" = CASE WHEN "icon" IS NULL OR "icon" = '' THEN 'bolt' ELSE "icon" END,
  "map_color" = coalesce("map_color", '#2E7D4F'),
  "label" = '{"en":"Activities","ar":"الأنشطة والفعاليات","id":"Aktivitas"}'::jsonb || coalesce("label", '{}'::jsonb),
  "updated_at" = now()
WHERE "key" = 'activities'
  AND ("icon" IS NULL OR "icon" = ''
    OR "map_color" IS NULL
    OR NOT (coalesce("label", '{}'::jsonb) ?& array['ar','en','id']));
--> statement-breakpoint

UPDATE "map_places" mp SET
  "is_free" = (coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem",
  "updated_at" = now()
WHERE mp."category_id" = (SELECT "id" FROM "categories" WHERE "key" = 'activities')
  AND mp."is_free" IS DISTINCT FROM ((coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem");

-- To check the cause before deploying (read-only):
--   SELECT c."key", c."status", c."map_tier", c."map_order",
--          p."key" AS parent_key, c."icon", c."map_color", c."updated_at",
--          (SELECT count(*) FROM "map_places" mp
--             WHERE mp."category_id" = c."id" AND mp."deleted_at" IS NULL) AS places
--   FROM "categories" c LEFT JOIN "categories" p ON p."id" = c."parent_id"
--   WHERE c."key" = 'activities';
