-- Restaurant sections (owner, Nov 2026): the 11 lists the client keeps in
-- Google Maps become child categories of «restaurants», and a place can sit
-- in several of them. Additive and idempotent.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "parent_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_parent_idx" ON "categories" ("parent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_place_subcategories" (
  "place_id" uuid NOT NULL REFERENCES "map_places"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  CONSTRAINT "map_place_subcategories_place_id_category_id_pk" PRIMARY KEY ("place_id", "category_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_place_subcategories_category_idx" ON "map_place_subcategories" ("category_id");
--> statement-breakpoint
DO $$
DECLARE parent uuid;
BEGIN
  SELECT "id" INTO parent FROM "categories" WHERE "key" = 'restaurants';
  IF parent IS NULL THEN
    RAISE NOTICE '0054: no «restaurants» category, restaurant sections not seeded';
    RETURN;
  END IF;
  INSERT INTO "categories" ("key", "label", "parent_id", "sort_order", "status") VALUES
    ('restaurants-arabic',      '{"ar":"مطاعم عربية","en":"Arabic","id":"Arab"}',          parent, 1,  'active'),
    ('restaurants-burgers',     '{"ar":"برجر","en":"Burgers","id":"Burger"}',              parent, 2,  'active'),
    ('restaurants-italian',     '{"ar":"إيطالي","en":"Italian","id":"Italia"}',            parent, 3,  'active'),
    ('restaurants-greek',       '{"ar":"يوناني","en":"Greek","id":"Yunani"}',              parent, 4,  'active'),
    ('restaurants-mexican',     '{"ar":"مكسيكي","en":"Mexican","id":"Meksiko"}',           parent, 5,  'active'),
    ('restaurants-indian',      '{"ar":"هندي","en":"Indian","id":"India"}',                parent, 6,  'active'),
    ('restaurants-japanese',    '{"ar":"ياباني","en":"Japanese","id":"Jepang"}',           parent, 7,  'active'),
    ('restaurants-indonesian',  '{"ar":"إندونيسي","en":"Indonesian","id":"Indonesia"}',    parent, 8,  'active'),
    ('restaurants-seafood',     '{"ar":"أكل بحري","en":"Seafood","id":"Makanan Laut"}',    parent, 9,  'active'),
    ('restaurants-steak',       '{"ar":"ستيك","en":"Steak","id":"Steak"}',                 parent, 10, 'active'),
    ('restaurants-fine-dining', '{"ar":"مطاعم فاخرة","en":"Fine Dining","id":"Fine Dining"}', parent, 11, 'active')
  ON CONFLICT ("key") DO NOTHING;
END $$;
