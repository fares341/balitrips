-- «فعاليات جدولي» (itineraries phase 3): per-itinerary «احجز كل الفعاليات»
-- discount percent. Null = the global `itinerarySales.allActivitiesDiscountPct`.
-- A new nullable column: no existing row changes, so there is nothing to back up.
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "bundle_discount_pct" integer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itineraries_bundle_discount_pct_range'
  ) THEN
    ALTER TABLE "itineraries"
      ADD CONSTRAINT "itineraries_bundle_discount_pct_range"
      CHECK ("bundle_discount_pct" IS NULL OR ("bundle_discount_pct" BETWEEN 0 AND 90));
  END IF;
END $$;
