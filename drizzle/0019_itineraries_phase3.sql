-- Itineraries, packages and VIP, phase 3. Additive only: every new column is
-- nullable or has a default that keeps today's behaviour, and the only rows
-- written are a backfill that restates what an itinerary already does.
--
--  * itinerary_day_places: map places on each day, in order, with a note and
--    an optional time.
--  * itineraries: which ways it is sold (digital / with activities / inside a
--    package / custom request) and what it gives on the map (map_access).
--    map_access is backfilled from includes_map so an itinerary that opened
--    the map before still does ('vip_included'); includes_map / is_vip stay
--    and keep deciding the exact access granted.
--  * itinerary_days.bookable: the day's activity can be booked from the page.
--  * itinerary_package_links: packages an itinerary is sold inside.
--  * packages: an included itinerary and an included VIP plan.
--  * package_activities.day_offset: which day of the trip (0 = first day).
CREATE TABLE IF NOT EXISTS "itinerary_day_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" jsonb,
	"visit_time" varchar(5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itinerary_day_places" ADD CONSTRAINT "itinerary_day_places_day_id_itinerary_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."itinerary_days"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itinerary_day_places" ADD CONSTRAINT "itinerary_day_places_place_id_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."map_places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "itinerary_day_places_unique" ON "itinerary_day_places" USING btree ("day_id","place_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itinerary_day_places_order_idx" ON "itinerary_day_places" USING btree ("day_id","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itinerary_day_places_place_idx" ON "itinerary_day_places" USING btree ("place_id");
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "sale_digital" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "sale_with_activities" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "sale_with_packages" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "sale_custom_request" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "map_access" varchar(16) DEFAULT 'free_only' NOT NULL;
--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN IF NOT EXISTS "vip_plan_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_vip_plan_id_plans_id_fk" FOREIGN KEY ("vip_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "itineraries" SET "map_access" = 'vip_included' WHERE "includes_map" = true AND "map_access" = 'free_only';
--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD COLUMN IF NOT EXISTS "bookable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "itinerary_package_links" (
	"itinerary_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"price_rule" varchar(24) DEFAULT 'included' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_package_links_itinerary_id_package_id_pk" PRIMARY KEY("itinerary_id","package_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itinerary_package_links" ADD CONSTRAINT "itinerary_package_links_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itinerary_package_links" ADD CONSTRAINT "itinerary_package_links_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itinerary_package_links_package_idx" ON "itinerary_package_links" USING btree ("package_id");
--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "itinerary_id" uuid;
--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "includes_vip" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "vip_plan_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "packages" ADD CONSTRAINT "packages_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "packages" ADD CONSTRAINT "packages_vip_plan_id_plans_id_fk" FOREIGN KEY ("vip_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "package_activities" ADD COLUMN IF NOT EXISTS "day_offset" integer;
