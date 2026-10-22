-- Client answers (Oct 2026). Additive schema + data. Every data statement is
-- guarded (matches by key / slug / legacy id, or only fills what is empty), so
-- a fresh database (CI, before the seed) passes straight through and running
-- it twice changes nothing more. Nothing is deleted.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
-- (1) One place may be free on the map even in a VIP category (Sekumpul).
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "free_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- (8) A package request is a custom trip request with the package, vehicle and estimate.
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "package_id" uuid;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "vehicle_key" varchar(32);--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "estimate_minor" bigint;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "estimate_currency" varchar(3);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_trip_requests_package_id_packages_id_fk') THEN
    ALTER TABLE "custom_trip_requests" ADD CONSTRAINT "custom_trip_requests_package_id_packages_id_fk"
      FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
-- (7) Pay after the supplier confirms: bookings are authorised, then captured.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "capture_mode" varchar(12) DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "authorized_at" timestamp with time zone;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (1) Map: beaches are free; Sekumpul is the one free waterfall.
-- ---------------------------------------------------------------------------
UPDATE "categories" SET "map_tier" = 'free' WHERE "key" = 'beaches' AND "map_tier" IS DISTINCT FROM 'free';--> statement-breakpoint
UPDATE "map_places" SET "free_override" = true, "updated_at" = now()
WHERE "deleted_at" IS NULL AND NOT "free_override"
  AND ("slug" ILIKE '%sekumpul%' OR "name"->>'en' ILIKE '%sekumpul%');--> statement-breakpoint
UPDATE "map_places" mp SET
  "is_free" = (coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem",
  "updated_at" = now()
WHERE mp."is_free" IS DISTINCT FROM ((coalesce((SELECT c."map_tier" = 'free' FROM "categories" c WHERE c."id" = mp."category_id"), false)
    OR mp."free_override") AND NOT mp."is_hidden_gem");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (3) Plans: «اشتراك VIP» $19 = 3 months; new «VIP مدى الحياة» $60.
-- ---------------------------------------------------------------------------
UPDATE "plans" SET
  "duration_days" = 90,
  "description" = '{"ar":"كل أماكن VIP على الخريطة لمدة 3 أشهر من تاريخ الشراء، دون تجديد تلقائي.","en":"Every VIP place on the map for 3 months from purchase, with no automatic renewal.","id":"Semua tempat VIP di peta selama 3 bulan sejak pembelian, tanpa perpanjangan otomatis."}'::jsonb,
  "features" = replace(replace(replace("features"::text, 'وصول دائم', 'وصول لمدة 3 أشهر'),
    'permanent access', '3 months of access'), 'akses permanen', 'akses 3 bulan')::jsonb,
  "updated_at" = now()
WHERE "entitlement_kind" = 'map_access' AND "status" = 'published' AND "deleted_at" IS NULL
  AND "slug" <> 'vip-lifetime' AND "duration_days" IS NULL AND "price_minor" = 1900;--> statement-breakpoint
INSERT INTO "plans" ("slug","name","description","features","icon","price_minor","currency","entitlement_kind","duration_days","device_limit","featured","sort_order","status","published_at")
SELECT 'vip-lifetime',
  '{"ar":"VIP مدى الحياة","en":"VIP lifetime","id":"VIP seumur hidup"}'::jsonb,
  '{"ar":"نفس وصول اشتراك VIP لكل أماكن VIP على الخريطة، بدفعة واحدة ومدى الحياة.","en":"The same VIP access to every VIP place on the map, one payment, for life.","id":"Akses VIP yang sama ke semua tempat VIP di peta, sekali bayar, seumur hidup."}'::jsonb,
  coalesce(p."features", '[]'::jsonb),
  'gem', 6000, 'USD', 'map_access', NULL, coalesce(p."device_limit", 2), false,
  coalesce(p."sort_order", 10) + 1, 'published', now()
FROM (SELECT 1) one
LEFT JOIN LATERAL (
  SELECT "features", "device_limit", "sort_order" FROM "plans"
  WHERE "entitlement_kind" = 'map_access' AND "deleted_at" IS NULL AND "slug" <> 'vip-lifetime'
  ORDER BY ("status" = 'published') DESC, "sort_order" LIMIT 1
) p ON true
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
-- The lifetime plan's features must not promise "3 months".
UPDATE "plans" SET
  "features" = replace(replace(replace("features"::text, 'وصول لمدة 3 أشهر', 'وصول دائم'),
    '3 months of access', 'permanent access'), 'akses 3 bulan', 'akses permanen')::jsonb
WHERE "slug" = 'vip-lifetime' AND "features"::text ~ '(3 أشهر|3 months|3 bulan)';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (4) The temples article: the client's title. Page title, meta and the
-- social tags read the title.
-- ---------------------------------------------------------------------------
UPDATE "articles"
SET "title" = jsonb_set("title", '{ar}', to_jsonb('معالم ومزارات بالي'::text)), "updated_at" = now()
WHERE "slug" = 'a-respectful-guide-to-balis-temples' AND "title"->>'ar' IS DISTINCT FROM 'معالم ومزارات بالي';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (6) Cancellation: every booking is non-refundable, except force majeure on
-- the provider's side (cancelled and fully refunded). The site-wide text is
-- the default where an activity has none, and no "free cancellation" promise
-- remains.
-- ---------------------------------------------------------------------------
UPDATE "activities" SET
  "cancellation_policy" = '{"ar":"جميع الحجوزات غير قابلة للاسترداد، إلا إذا تعذّر على مقدّم الخدمة تنفيذها لظرف قاهر؛ عندها يُلغى الحجز ويُرد المبلغ كاملًا.","en":"All bookings are non-refundable, except when the provider cannot run the service because of force majeure; the booking is then cancelled and fully refunded.","id":"Semua pemesanan tidak dapat dikembalikan dananya, kecuali jika penyedia tidak dapat menjalankan layanan karena keadaan kahar; pemesanan kemudian dibatalkan dan dana dikembalikan penuh."}'::jsonb,
  "updated_at" = now()
WHERE "deleted_at" IS NULL
  AND coalesce(btrim("cancellation_policy"->>'ar'), '') = ''
  AND coalesce(btrim("cancellation_policy"->>'en'), '') = ''
  AND coalesce(btrim("cancellation_policy"->>'id'), '') = '';--> statement-breakpoint
UPDATE "activities" SET "free_cancellation_hours" = NULL, "updated_at" = now()
WHERE "free_cancellation_hours" IS NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (8) Every package includes a driver: no "transport between activities" in
-- what is excluded.
-- ---------------------------------------------------------------------------
UPDATE "packages" SET
  "driver_included" = true,
  "excluded" = (
    SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce("excluded", '[]'::jsonb)) e
    WHERE lower(e::text) !~ '(transport|المواصلات|التنقل|transportasi)'
  ),
  "updated_at" = now()
WHERE "deleted_at" IS NULL
  AND (NOT "driver_included"
    OR lower(coalesce("excluded", '[]'::jsonb)::text) ~ '(transport|المواصلات|التنقل|transportasi)');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (10) The handoff's demo packages leave the site (draft; rows kept). The
-- client sends the real ones.
-- ---------------------------------------------------------------------------
UPDATE "packages" SET "status" = 'draft', "updated_at" = now()
WHERE "legacy_id" LIKE 'pk\_%' AND "status" = 'published' AND "deleted_at" IS NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- (12) The seven merged activities (0028): a short description from their
-- own facts only — the area and the names of the packages folded into them.
-- Filled only where empty. For owner review.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT a."id", a."name",
      r."label" AS region,
      t.n, t.ar, t.en, t.idn
    FROM "activities" a
    LEFT JOIN "regions" r ON r."id" = a."region_id"
    JOIN (
      SELECT x."activity_id",
        count(*)::int AS n,
        string_agg(coalesce(nullif(x."name"->>'ar', ''), x."name"->>'en'), '، ' ORDER BY x."sort_order") AS ar,
        string_agg(coalesce(nullif(x."name"->>'en', ''), x."name"->>'ar'), ', ' ORDER BY x."sort_order") AS en,
        string_agg(coalesce(nullif(x."name"->>'id', ''), x."name"->>'en'), ', ' ORDER BY x."sort_order") AS idn
      FROM "activity_tiers" x
      GROUP BY x."activity_id"
    ) t ON t."activity_id" = a."id"
    WHERE a."slug" IN ('water-sports-bali', 'nusa-penida-tour', 'bali-safari', 'bali-marine-safari',
                       'bali-shooting-club', 'telaga-waja-rafting', 'jet-ski-tanjung-benoa')
      AND a."deleted_at" IS NULL
      AND coalesce(btrim(a."short_description"->>'ar'), '') = ''
      AND coalesce(btrim(a."short_description"->>'en'), '') = ''
  LOOP
    UPDATE "activities" SET
      "short_description" = jsonb_build_object(
        'ar', 'يضم «' || coalesce(rec."name"->>'ar', rec."name"->>'en') || '»' ||
              coalesce(' في ' || nullif(rec.region->>'ar', ''), '') || ' ' || rec.n ||
              ' باقات: ' || rec.ar || '. ما تشمله كل باقة وسعرها في بطاقتها.',
        'en', coalesce(rec."name"->>'en', '') ||
              coalesce(' in ' || nullif(rec.region->>'en', ''), '') || ' comes in ' || rec.n ||
              ' packages: ' || rec.en || '. Each package card lists what it includes and its price.',
        'id', coalesce(nullif(rec."name"->>'id', ''), rec."name"->>'en', '') ||
              coalesce(' di ' || nullif(rec.region->>'id', ''), '') || ' tersedia dalam ' || rec.n ||
              ' paket: ' || rec.idn || '. Setiap kartu paket mencantumkan isi dan harganya.'
      ),
      "updated_at" = now()
    WHERE "id" = rec."id";
  END LOOP;
END $$;
