-- Money columns: int32 -> bigint. int32 overflows at 21.4M IDR (about USD 1,300).
ALTER TABLE "cart_items" ALTER COLUMN "unit_price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "settlement_total_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "line_total_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "refunded_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "amount_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "driver_vehicles" ALTER COLUMN "day_rate_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ALTER COLUMN "budget_per_person_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activity_tiers" ALTER COLUMN "price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "itineraries" ALTER COLUMN "price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "price_minor" SET DATA TYPE bigint;
--> statement-breakpoint
-- Areas & neighbourhoods (spec §7): description, status, parent, approximate centre/radius.
ALTER TABLE "regions" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "status" varchar(16) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "center_lat" double precision;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "center_lon" double precision;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "radius_km" real;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "status" varchar(16) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
-- Neighbourhoods named in the spec (§7.2), under the broad regions. Idempotent.
-- Inner join: on a fresh database (regions not seeded yet) nothing is inserted here
-- and the seed creates them with their parents instead.
INSERT INTO "regions" ("key","label","description","status","parent_id","center_lat","center_lon","radius_km","sort_order")
SELECT v.key, v.label::jsonb, NULL, 'active', p.id, v.lat, v.lon, v.r, v.sort
FROM (VALUES
  ('kuta',     '{"en":"Kuta","ar":"كوتا","id":"Kuta"}',            'south',   -8.7180, 115.1686, 3.0, 10),
  ('seminyak', '{"en":"Seminyak","ar":"سمينياك","id":"Seminyak"}', 'south',   -8.6913, 115.1683, 2.5, 11),
  ('canggu',   '{"en":"Canggu","ar":"تشانغو","id":"Canggu"}',      'south',   -8.6478, 115.1385, 4.0, 12),
  ('uluwatu',  '{"en":"Uluwatu","ar":"أولواتو","id":"Uluwatu"}',   'south',   -8.8291, 115.0849, 6.0, 13),
  ('nusa-dua', '{"en":"Nusa Dua","ar":"نوسا دوا","id":"Nusa Dua"}','south',   -8.8008, 115.2317, 4.0, 14),
  ('sanur',    '{"en":"Sanur","ar":"سانور","id":"Sanur"}',         'south',   -8.6878, 115.2620, 3.0, 15),
  ('ubud',     '{"en":"Ubud","ar":"أوبود","id":"Ubud"}',           'central', -8.5069, 115.2625, 6.0, 16)
) AS v(key, label, parent, lat, lon, r, sort)
JOIN "regions" p ON p."key" = v.parent
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- Map categories named in the spec (§6.2, §10.1) that the activity taxonomy lacked.
INSERT INTO "categories" ("key","label","icon","sort_order") VALUES
  ('activities', '{"en":"Activities","ar":"أنشطة","id":"Aktivitas"}', NULL, 20),
  ('sights',     '{"en":"Sights","ar":"أماكن سياحية","id":"Tempat Wisata"}', NULL, 21),
  ('market',     '{"en":"Markets","ar":"أسواق","id":"Pasar"}', NULL, 22),
  ('shopping',   '{"en":"Shopping","ar":"تسوق","id":"Belanja"}', NULL, 23),
  ('events',     '{"en":"Events","ar":"فعاليات","id":"Acara"}', NULL, 24),
  ('hospital',   '{"en":"Hospitals","ar":"مستشفيات","id":"Rumah Sakit"}', NULL, 25)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- Existing seeded places: move to their neighbourhood and give them a filterable category.
UPDATE "map_places" mp SET "region_id" = r."id"
FROM (VALUES ('canggu','canggu'),('uluwatu','uluwatu'),('ubud','ubud'),('tega','ubud')) AS v(legacy, area)
JOIN "regions" r ON r."key" = v.area
WHERE mp."legacy_id" = v.legacy;--> statement-breakpoint
UPDATE "map_places" mp SET "category_id" = c."id"
FROM (VALUES ('batur','nature'),('tega','sights'),('ubud','culture'),('canggu','beach'),
             ('uluwatu','sights'),('lempuyang','culture'),('penida','beach'),('diamond','beach'),
             ('sekumpul','nature')) AS v(legacy, cat)
JOIN "categories" c ON c."key" = v.cat
WHERE mp."legacy_id" = v.legacy AND mp."category_id" IS NULL;
--> statement-breakpoint
-- Legacy tags were copied with the English text in every language (0006). Real labels + spec tags.
INSERT INTO "tags" ("key","label") VALUES
  ('beaches','{"en":"Beaches","ar":"الشواطئ","id":"Pantai"}'),
  ('temples','{"en":"Temples","ar":"المعابد","id":"Pura"}'),
  ('hiking','{"en":"Hiking","ar":"المشي الجبلي","id":"Pendakian"}'),
  ('popular','{"en":"Popular","ar":"الأكثر زيارة","id":"Populer"}'),
  ('luxury-stays','{"en":"Luxury Stays","ar":"إقامات فاخرة","id":"Penginapan Mewah"}'),
  ('burger','{"en":"Burger","ar":"برجر","id":"Burger"}'),
  ('pizza','{"en":"Pizza","ar":"بيتزا","id":"Pizza"}'),
  ('luxury','{"en":"Luxury","ar":"فاخر","id":"Mewah"}')
ON CONFLICT ("key") DO UPDATE SET "label" = excluded."label";
--> statement-breakpoint
-- Custom request statuses exactly as the spec (§5.3): waiting customer reply, cancelled.
UPDATE "custom_trip_requests" SET "status" = CASE "status"
  WHEN 'waiting_approval' THEN 'waiting_customer'
  WHEN 'rejected' THEN 'cancelled'
  ELSE "status" END;--> statement-breakpoint
-- Custom request fields from the spec (§5.2).
ALTER TABLE "custom_trip_requests" ADD COLUMN "preferred_areas" jsonb;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN "wants_luxury_dining" boolean;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN "wants_adventure" boolean;
--> statement-breakpoint
-- Itinerary fields from the spec (§4.2).
ALTER TABLE "itineraries" ADD COLUMN "detailed_description" jsonb;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "gallery_image_ids" jsonb;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "includes_map" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "is_vip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "linked_place_ids" jsonb;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "uploaded_pdf_keys" jsonb;
--> statement-breakpoint
-- Plan permission from the spec (§13.2): can the plan download PDFs?
ALTER TABLE "plans" ADD COLUMN "can_download_pdf" boolean DEFAULT true NOT NULL;
