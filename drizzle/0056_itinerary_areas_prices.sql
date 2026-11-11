-- Itinerary areas + owner prices (client أستاذ سعيد / owner, Nov 2026).
--
-- 1. `itineraries.areas`: the areas the trip covers, in order, with nights
--    (`@/lib/itineraries/areas`). Region keys only — the one kind of name the
--    public page may show. Nights are kept but hidden (`showNights` false);
--    Studio «إظهار عدد الليالي» turns them on per itinerary.
-- 2. Backfill the seeded itineraries from their source PDFs — only where the
--    field is still empty, so an owner edit is never overwritten.
-- 3. Prices (SAR, itinerary only): 6 days 100, 8 days 150, 10 days 180.
--    bali-4d-family keeps its price. Levels (`tier_prices`) are not touched,
--    nor the status: a draft stays a draft. Idempotent.

ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "areas" jsonb;
--> statement-breakpoint

UPDATE "itineraries" AS i
SET "areas" = v.areas::jsonb, "updated_at" = now()
FROM (VALUES
  ('bali-4d-family',     '{"showNights":false,"items":[{"key":"seminyak","nights":4},{"key":"ubud","nights":null}]}'),
  ('bali-6d-youth',      '{"showNights":false,"items":[{"key":"ubud","nights":3},{"key":"seminyak","nights":3}]}'),
  ('bali-6d-honeymoon',  '{"showNights":false,"items":[{"key":"ubud","nights":3},{"key":"seminyak","nights":3}]}'),
  ('bali-6d-family',     '{"showNights":false,"items":[{"key":"ubud","nights":3},{"key":"seminyak","nights":3}]}'),
  ('bali-8d-youth',      '{"showNights":false,"items":[{"key":"seminyak","nights":3},{"key":"ubud","nights":3},{"key":"uluwatu","nights":2}]}'),
  ('bali-8d-honeymoon',  '{"showNights":false,"items":[{"key":"seminyak","nights":3},{"key":"ubud","nights":3},{"key":"uluwatu","nights":2}]}'),
  ('bali-8d-family',     '{"showNights":false,"items":[{"key":"seminyak","nights":3},{"key":"ubud","nights":3},{"key":"uluwatu","nights":2}]}'),
  ('bali-10d-youth',     '{"showNights":false,"items":[{"key":"seminyak","nights":4},{"key":"ubud","nights":4},{"key":"uluwatu","nights":2}]}'),
  ('bali-10d-honeymoon', '{"showNights":false,"items":[{"key":"seminyak","nights":4},{"key":"ubud","nights":4},{"key":"uluwatu","nights":2}]}')
) AS v(slug, areas)
WHERE i."slug" = v.slug AND i."areas" IS NULL;
--> statement-breakpoint

UPDATE "itineraries" AS i
SET "price_minor" = v.price, "currency" = 'SAR', "updated_at" = now()
FROM (VALUES
  ('bali-6d-youth', 10000), ('bali-6d-honeymoon', 10000), ('bali-6d-family', 10000),
  ('bali-8d-youth', 15000), ('bali-8d-honeymoon', 15000), ('bali-8d-family', 15000),
  ('bali-10d-youth', 18000), ('bali-10d-honeymoon', 18000)
) AS v(slug, price)
WHERE i."slug" = v.slug AND i."price_minor" IS DISTINCT FROM v.price;
