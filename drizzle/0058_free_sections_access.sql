-- The owner's free sections are truly free (owner, Nov 2026).
--
-- Mosques, hospitals & clinics, popular markets, malls and pharmacies are free
-- map sections, yet live showed 21 mosques and 4 hospitals locked. Causes
-- covered here: a stale `is_free`, `is_hidden_gem` on those places (a hidden
-- gem is never free), a non-default `required_entitlement`, or the category
-- tier drifting from 'free'.
--
-- 1. The five categories are map_tier 'free'.
-- 2. Their places: is_hidden_gem = false (owner: a mosque/hospital is never a
--    hidden gem), required_entitlement = 'map_access'.
-- 3. is_free recomputed for EVERY place with the same expression as
--    syncPlaceAccessSql (src/lib/content/map-access.ts), so stale rows are
--    fixed everywhere. Only rows that differ are written. Idempotent.

UPDATE "categories" SET "map_tier" = 'free', "updated_at" = now()
WHERE "key" IN ('mosques','hospital','markets','malls','pharmacies')
  AND "map_tier" IS DISTINCT FROM 'free';
--> statement-breakpoint

UPDATE "map_places" mp SET
  "is_hidden_gem" = false,
  "required_entitlement" = 'map_access',
  "updated_at" = now()
WHERE mp."category_id" IN (SELECT "id" FROM "categories"
    WHERE "key" IN ('mosques','hospital','markets','malls','pharmacies'))
  AND (mp."is_hidden_gem" OR mp."required_entitlement" IS DISTINCT FROM 'map_access');
--> statement-breakpoint

UPDATE "map_places" mp SET
  "is_free" = (coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem",
  "updated_at" = now()
WHERE mp."is_free" IS DISTINCT FROM ((coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem");
