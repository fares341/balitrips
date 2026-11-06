-- «أسئلة شائعة عن هذا الجدول»: per-itinerary FAQ shown on the public page.
-- Rows: { q: {ar,en,id}, a: {ar,en,id}, hidden?: true }. Null = the generic questions.
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "faq" jsonb;
