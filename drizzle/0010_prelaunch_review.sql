-- Pre-launch review: indexes for "most saved" counts (search ranking, dashboard).
CREATE INDEX IF NOT EXISTS "favorites_ref_idx" ON "favorites" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_items_place_idx" ON "trip_items" USING btree ("place_id");
