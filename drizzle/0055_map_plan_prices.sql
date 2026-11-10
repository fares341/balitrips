-- Owner pricing (Nov 2026) for the map plans — itineraries are not touched:
--   * 3 months = 150 SAR, 1 device, +50 SAR per extra device (up to 5)
--   * 1 year   = 300 SAR, 1 device, +50 SAR per extra device (up to 5)
--   * lifetime is no longer sold (draft, not deleted: buyers keep their access)
-- Prices move from USD to SAR (the site charges in SAR). Idempotent.

-- 3-month plan (the published map plan with 90 days).
UPDATE "plans" SET
  "price_minor" = 15000,
  "currency" = 'SAR',
  "device_limit" = 1,
  "extra_device_price_minor" = 5000,
  "max_devices" = 5,
  "name" = '{"ar":"اشتراك 3 أشهر","en":"3-month pass","id":"Langganan 3 bulan"}'::jsonb,
  "features" = replace(replace(replace("features"::text,
    'استخدام على جهازين', 'استخدام على جهاز واحد (+50 ر.س لكل جهاز إضافي)'),
    'Use on 2 devices', 'Use on 1 device (+50 SAR per extra device)'),
    'Digunakan di 2 perangkat', 'Digunakan di 1 perangkat (+50 SAR per perangkat tambahan)')::jsonb,
  "updated_at" = now()
WHERE "entitlement_kind" = 'map_access' AND "deleted_at" IS NULL
  AND "slug" <> 'vip-lifetime' AND "slug" <> 'map-1-year' AND "duration_days" = 90;
--> statement-breakpoint

-- 1-year plan: a new plan copied from the 3-month one (features, icon, order).
INSERT INTO "plans" ("slug","name","description","features","icon","price_minor","currency",
  "entitlement_kind","duration_days","device_limit","extra_device_price_minor","max_devices",
  "featured","sort_order","status","published_at")
SELECT 'map-1-year',
  '{"ar":"اشتراك سنة","en":"1-year pass","id":"Langganan 1 tahun"}'::jsonb,
  '{"ar":"كل أماكن VIP على الخريطة لمدة سنة من تاريخ الشراء، دون تجديد تلقائي.","en":"Every VIP place on the map for 1 year from purchase, with no automatic renewal.","id":"Semua tempat VIP di peta selama 1 tahun sejak pembelian, tanpa perpanjangan otomatis."}'::jsonb,
  replace(replace(replace(p."features"::text, 'وصول لمدة 3 أشهر', 'وصول لمدة سنة'),
    '3 months of access', '1 year of access'), 'akses 3 bulan', 'akses 1 tahun')::jsonb,
  coalesce(p."icon", 'gem'), 30000, 'SAR', 'map_access', 365, 1, 5000, 5,
  false, coalesce(p."sort_order", 10) + 1, 'published', now()
FROM (
  SELECT "features", "icon", "sort_order" FROM "plans"
  WHERE "entitlement_kind" = 'map_access' AND "deleted_at" IS NULL AND "duration_days" = 90
  ORDER BY ("status" = 'published') DESC, "sort_order" LIMIT 1
) p
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Lifetime: stop selling it (existing entitlements are untouched).
UPDATE "plans" SET "status" = 'draft', "updated_at" = now()
WHERE "slug" = 'vip-lifetime' AND "status" = 'published';
