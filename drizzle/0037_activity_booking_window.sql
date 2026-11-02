-- Owner request (Oct 2026): «أقرب موعد للحجز» per activity.
-- Additive and guarded: two nullable columns, added if missing; a second run
-- changes nothing, and nothing existing is altered or deleted.
--
--   min_advance_days  NULL = legacy rule (only lead_time_hours before the
--                     slot, exactly as before). 0 = same day, 1 = from
--                     tomorrow, 2 = from the day after, N = after N days,
--                     all counted on Bali's calendar (Asia/Makassar).
--   booking_cutoff    'HH:MM' Bali time. Once it has passed today, the
--                     earliest bookable day moves one day later. NULL = none.
--
-- lead_time_hours keeps its meaning (hours before the slot) and is still
-- enforced on top, so every existing activity behaves exactly as before.

ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "min_advance_days" integer;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "booking_cutoff" varchar(5);

-- Ranges (0..365 days, HH:MM) are validated by the Studio and the sheet import.

-- To undo:
--   ALTER TABLE "activities" DROP COLUMN IF EXISTS "booking_cutoff";
--   ALTER TABLE "activities" DROP COLUMN IF EXISTS "min_advance_days";
