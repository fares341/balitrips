-- Client (Oct 2026, list A1): the map has two levels, Free and VIP, locked by
-- CATEGORY (no more free region). Free: activities, tourist sites, malls.
-- VIP: restaurants, cafés, spa, kids' nurseries, beauty & ladies' salons,
-- waterfalls, beaches, barbers. VIP is the published map plan ($19).
--
-- Additive and data-only: two new columns, new categories where missing,
-- places moved to their map category with the old one kept as a
-- sub-category (filters, /events and old ?cat= links keep matching). Nothing
-- is deleted.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "map_tier" varchar(8);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "map_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO "categories" ("key","label","sort_order") VALUES
  ('activities',  '{"en":"Activities","ar":"الأنشطة والفعاليات","id":"Aktivitas"}', 20),
  ('sights',      '{"en":"Tourist sites","ar":"المزارات السياحية","id":"Tempat wisata"}', 21),
  ('malls',       '{"en":"Malls & markets","ar":"المولات والأسواق","id":"Mal & pasar"}', 26),
  ('restaurants', '{"en":"Restaurants","ar":"المطاعم","id":"Restoran"}', 27),
  ('cafes',       '{"en":"Cafés","ar":"المقاهي","id":"Kafe"}', 28),
  ('spa',         '{"en":"Spa","ar":"السبا","id":"Spa"}', 29),
  ('kids-care',   '{"en":"Kids'' nurseries","ar":"حضانات الأطفال","id":"Penitipan anak"}', 30),
  ('beauty',      '{"en":"Beauty & ladies'' salons","ar":"مراكز التجميل والصالونات النسائية","id":"Salon kecantikan"}', 31),
  ('waterfalls',  '{"en":"Bali waterfalls","ar":"شلالات بالي","id":"Air terjun Bali"}', 32),
  ('beaches',     '{"en":"Bali beaches","ar":"شواطئ بالي","id":"Pantai Bali"}', 33),
  ('barbers',     '{"en":"Barbers","ar":"الحلاقين","id":"Tukang cukur"}', 34),
  ('hospital',    '{"en":"Hospitals","ar":"مستشفيات","id":"Rumah Sakit"}', 35)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "categories" SET "label" = '{"en":"Tourist sites","ar":"المزارات السياحية","id":"Tempat wisata"}'::jsonb WHERE "key" = 'sights';--> statement-breakpoint
UPDATE "categories" SET "label" = '{"en":"Activities","ar":"الأنشطة والفعاليات","id":"Aktivitas"}'::jsonb WHERE "key" = 'activities';--> statement-breakpoint
UPDATE "categories" SET "map_tier" = v.tier, "map_order" = v.ord
FROM (VALUES ('activities','free',1),('sights','free',2),('malls','free',3),
             ('restaurants','vip',4),('cafes','vip',5),('spa','vip',6),('kids-care','vip',7),
             ('beauty','vip',8),('waterfalls','vip',9),('beaches','vip',10),('barbers','vip',11),
             ('hospital','free',12)) AS v(key, tier, ord)
WHERE "categories"."key" = v.key;--> statement-breakpoint
-- Every other category's places move to the map category their name fits
-- (first rule wins; anything unrecognised is an activity).
UPDATE "map_places" mp SET
  "sub_category_ids" = CASE
    WHEN coalesce(mp."sub_category_ids", '[]'::jsonb) ? mp."category_id"::text THEN mp."sub_category_ids"
    ELSE coalesce(mp."sub_category_ids", '[]'::jsonb) || to_jsonb(mp."category_id"::text)
  END,
  "category_id" = target."id",
  "updated_at" = now()
FROM "categories" old
CROSS JOIN LATERAL (
  SELECT lower(old."key" || ' ' || coalesce(old."label"->>'en','') || ' ' || coalesce(old."label"->>'ar','') || ' ' || coalesce(old."label"->>'id','')) AS t
) txt
JOIN "categories" target ON target."key" = CASE
  WHEN txt.t ~ '(waterfall|شلال|air terjun)' THEN 'waterfalls'
  WHEN txt.t ~ '(beach|شاطئ|شواطئ|pantai)' THEN 'beaches'
  WHEN txt.t ~ '(barber|حلاق|cukur)' THEN 'barbers'
  WHEN txt.t ~ '(beauty|salon|nail|تجميل|صالون)' THEN 'beauty'
  WHEN txt.t ~ '(nurser|daycare|kindergarten|حضان)' THEN 'kids-care'
  WHEN txt.t ~ '(\mspa\M|massage|wellness|سبا|مساج)' THEN 'spa'
  WHEN txt.t ~ '(cafe|café|coffee|kafe|كافي|مقه|مقاه)' THEN 'cafes'
  WHEN txt.t ~ '(restaurant|food|dining|restoran|مطعم|مطاعم)' THEN 'restaurants'
  WHEN txt.t ~ '(mall|shopping|market|belanja|pasar|مول|تسوق|سوق|أسواق|اسواق)' THEN 'malls'
  WHEN txt.t ~ '(hospital|clinic|medical|مستشف)' THEN 'hospital'
  WHEN txt.t ~ '(sight|temple|culture|landmark|attraction|heritage|museum|wisata|pura|مزار|معبد|معابد|معالم|سياح|ثقاف|متحف)' THEN 'sights'
  ELSE 'activities'
END
WHERE old."id" = mp."category_id" AND old."map_tier" IS NULL;--> statement-breakpoint
-- Access follows the category: free categories open, everything else VIP
-- (the map plan). A place with no category stays locked.
UPDATE "map_places" mp SET
  "is_free" = coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    AND NOT mp."is_hidden_gem",
  "required_entitlement" = 'map_access',
  "updated_at" = now();--> statement-breakpoint
UPDATE "plans" SET
  "name" = coalesce("name", '{}'::jsonb) || '{"ar":"اشتراك VIP","en":"VIP subscription","id":"Langganan VIP"}'::jsonb,
  "updated_at" = now()
WHERE "entitlement_kind" = 'map_access' AND "status" = 'published' AND "deleted_at" IS NULL;
--> statement-breakpoint
-- List H9 ("compare areas" showed 0 places / 0 itineraries): link what has no
-- area yet. A place with no area gets the closest area whose circle holds it
-- (a neighbourhood before a broad region), like Studio's coordinate picker.
UPDATE "map_places" mp SET "region_id" = (
  SELECT r."id"
  FROM "regions" r
  WHERE r."status" = 'active' AND r."center_lat" IS NOT NULL AND r."center_lon" IS NOT NULL
    AND 111.32 * sqrt(power(mp."lat" - r."center_lat", 2)
      + power((mp."lon" - r."center_lon") * cos(radians(mp."lat")), 2))
      <= coalesce(r."radius_km", CASE WHEN r."parent_id" IS NULL THEN 15 ELSE 4 END)
  ORDER BY (r."parent_id" IS NULL),
    power(mp."lat" - r."center_lat", 2) + power((mp."lon" - r."center_lon") * cos(radians(mp."lat")), 2)
  LIMIT 1
)
WHERE mp."region_id" IS NULL;--> statement-breakpoint
-- An itinerary's areas: the broad regions of the places and activities on its days.
INSERT INTO "itinerary_regions" ("itinerary_id", "region_id")
SELECT DISTINCT d."itinerary_id", coalesce(r."parent_id", r."id")
FROM "itinerary_days" d
LEFT JOIN "itinerary_day_places" dp ON dp."day_id" = d."id"
LEFT JOIN "map_places" mp ON mp."id" = dp."place_id"
LEFT JOIN "activities" a ON a."id" = d."activity_id"
JOIN "regions" r ON r."id" = coalesce(mp."region_id", a."region_id")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- List H11: one wording for a plan with no end date ("وصول دائم"), as on the
-- plan card, instead of "لك طوال الرحلة" in its description / features.
UPDATE "plans" SET
  "description" = replace(replace(replace("description"::text, 'لك طوال الرحلة', 'وصول دائم'),
    'yours for the whole trip', 'permanent access'), 'untuk seluruh perjalanan', 'akses permanen')::jsonb,
  "features" = replace(replace(replace("features"::text, 'لك طوال الرحلة', 'وصول دائم'),
    'yours for the whole trip', 'permanent access'), 'untuk seluruh perjalanan', 'akses permanen')::jsonb,
  "updated_at" = now()
WHERE "duration_days" IS NULL AND "deleted_at" IS NULL
  AND ("description"::text ~ '(طوال الرحلة|whole trip|seluruh perjalanan)'
    OR "features"::text ~ '(طوال الرحلة|whole trip|seluruh perjalanan)');
