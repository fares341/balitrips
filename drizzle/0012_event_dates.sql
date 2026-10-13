-- Events with dates: optional start/end on map places and activities in the
-- `events` category. NULL = a permanent place/activity with no date.
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "event_starts_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN IF NOT EXISTS "event_ends_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "event_starts_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "event_ends_at" timestamp with time zone;
