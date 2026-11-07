-- Studio itinerary editor (Nov 2026): every block of the public itinerary
-- page is editable per language. One jsonb document per itinerary; an empty
-- text means "the site default" (the translation), so live pages keep their
-- copy. Backfill: the current section order with every section shown, which
-- is exactly what the page renders today. Additive and idempotent.
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "page_content" jsonb;
--> statement-breakpoint
UPDATE "itineraries"
SET "page_content" = '{"sections":[{"key":"about"},{"key":"get"},{"key":"gallery"},{"key":"days"},{"key":"fit"},{"key":"how"},{"key":"faq"},{"key":"custom"},{"key":"others"}]}'::jsonb
WHERE "page_content" IS NULL;
