-- Client revision 1: budgets are categories, not numbers.
--
-- The custom-trip form asks for economy / mid-range / luxury instead of a
-- per-person amount. custom_trip_requests.budget_tier stores the key
-- ('economy' | 'mid' | 'luxury'); budget_per_person_minor and currency are
-- kept untouched for requests made before this change (the studio derives a
-- category for them from the stored amount, src/lib/budget-tier.ts).
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "budget_tier" varchar(16);
