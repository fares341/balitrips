-- Owner requests (Mr. Saeed, Oct 2026). Additive and guarded: a fresh
-- database (CI, before the seed) passes straight through, running it twice
-- changes nothing more, and nothing is deleted.

-- (3) A card photo per category, for the home «free Bali guide» cards.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "image_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_image_id_media_id_fk') THEN
    ALTER TABLE "categories" ADD CONSTRAINT "categories_image_id_media_id_fk"
      FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- (3) The five free guide categories. Hospitals now say «and clinics»;
-- malls and popular markets become two categories (0026 had folded them).
INSERT INTO "categories" ("key","label","icon","sort_order","map_tier","map_order") VALUES
  ('pharmacies', '{"en":"Pharmacies","ar":"الصيدليات","id":"Apotek"}', 'drop', 36, 'free', 13),
  ('mosques',    '{"en":"Mosques","ar":"المساجد","id":"Masjid"}', 'compass', 37, 'free', 14),
  ('markets',    '{"en":"Popular markets","ar":"الأسواق الشعبية","id":"Pasar tradisional"}', 'cart', 38, 'free', 15)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "categories" SET
  "label" = '{"en":"Hospitals & clinics","ar":"المستشفيات والعيادات","id":"Rumah sakit & klinik"}'::jsonb,
  "icon" = coalesce("icon", 'shield'),
  "map_tier" = 'free'
WHERE "key" = 'hospital';--> statement-breakpoint
UPDATE "categories" SET
  "label" = '{"en":"Malls","ar":"المولات","id":"Mal"}'::jsonb,
  "icon" = coalesce("icon", 'bag'),
  "map_tier" = 'free'
WHERE "key" = 'malls'
  AND "label" = '{"en":"Malls & markets","ar":"المولات والأسواق","id":"Mal & pasar"}'::jsonb;--> statement-breakpoint

-- Places stay where they are, unless the name clearly says market / pasar /
-- سوق: those move from malls to popular markets (malls kept as a sub-category
-- so old ?cat=malls links still find them).
UPDATE "map_places" mp SET
  "sub_category_ids" = CASE
    WHEN coalesce(mp."sub_category_ids", '[]'::jsonb) ? mp."category_id"::text THEN mp."sub_category_ids"
    ELSE coalesce(mp."sub_category_ids", '[]'::jsonb) || to_jsonb(mp."category_id"::text)
  END,
  "category_id" = (SELECT "id" FROM "categories" WHERE "key" = 'markets'),
  "updated_at" = now()
WHERE mp."category_id" = (SELECT "id" FROM "categories" WHERE "key" = 'malls')
  AND mp."deleted_at" IS NULL
  AND lower(coalesce(mp."name"->>'en','') || ' ' || coalesce(mp."name"->>'id','') || ' ' || coalesce(mp."name"->>'ar','') || ' ' || mp."slug")
      ~ '(\mpasar\M|\mmarket\M|سوق|أسواق|اسواق)'
  AND lower(coalesce(mp."name"->>'en','') || ' ' || mp."slug") !~ '(\mmall\M|supermarket|plaza)';--> statement-breakpoint

-- Access follows the category (as in 0026 / 0029): the guide categories are free.
UPDATE "map_places" mp SET
  "is_free" = (coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem",
  "updated_at" = now()
WHERE mp."category_id" IN (SELECT "id" FROM "categories" WHERE "key" IN ('hospital','pharmacies','mosques','malls','markets'))
  AND mp."is_free" IS DISTINCT FROM ((coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem");
