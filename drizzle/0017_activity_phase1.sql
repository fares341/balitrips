-- Activity dashboard, phase 1. Additive only: every new column is nullable or
-- has a default that keeps today's behaviour, so existing activities, carts and
-- orders read exactly as before.
--
--  * activities: primary category, owner flags (featured / most popular / on
--    home), marketing headline + short card text, highlights and practical
--    lists, meeting point, instant confirmation, free-cancellation hours,
--    minimum party, a phone hero and a video link. `status` gains the values
--    `hidden` and `unavailable` (no constraint to change: it is a varchar).
--  * activity_tags: activities reuse the tags table the map places use.
--  * activity_tiers.min_guests; pricing_mode may now be `per_couple`.
--  * tier_included_activities: other activities a package includes.
--  * addons_library + activity_addon_links: a shared add-on library. The older
--    per-activity activity_addons stay as they are (pricing reads both), so no
--    id referenced by a cart or an order changes.
--  * The primary category of every existing activity is set to its first
--    category (same order the cards already used), so nothing moves.
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "primary_category_id" uuid;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "is_featured" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "is_most_popular" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "show_on_home" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "headline" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "short_description" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "highlights" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "suitable_for" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "important_notes" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "what_to_bring" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "age_conditions" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "meeting_point" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "meeting_lat" double precision;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "meeting_lng" double precision;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "meeting_map_url" text;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "meeting_time_note" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "instant_confirmation" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "free_cancellation_hours" integer;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "min_guests" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "mobile_hero_image_id" uuid;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "video_url" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activities" ADD CONSTRAINT "activities_primary_category_id_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activities" ADD CONSTRAINT "activities_mobile_hero_image_id_media_id_fk" FOREIGN KEY ("mobile_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "activities" a SET "primary_category_id" = (
  SELECT c."id" FROM "activity_categories" ac
  INNER JOIN "categories" c ON c."id" = ac."category_id"
  WHERE ac."activity_id" = a."id"
  ORDER BY c."sort_order", c."key"
  LIMIT 1
) WHERE a."primary_category_id" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_tags" (
	"activity_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "activity_tags_activity_id_tag_id_pk" PRIMARY KEY("activity_id","tag_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_tags" ADD CONSTRAINT "activity_tags_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_tags" ADD CONSTRAINT "activity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_tags_tag_idx" ON "activity_tags" USING btree ("tag_id");
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "min_guests" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tier_included_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"timing" varchar(16) DEFAULT 'same_slot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_included_activities" ADD CONSTRAINT "tier_included_activities_tier_id_activity_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."activity_tiers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_included_activities" ADD CONSTRAINT "tier_included_activities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tier_included_unique" ON "tier_included_activities" USING btree ("tier_id","activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tier_included_tier_idx" ON "tier_included_activities" USING btree ("tier_id","sort_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "addons_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"image_id" uuid,
	"unit_label" jsonb,
	"price_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"pricing" varchar(16) DEFAULT 'per_booking' NOT NULL,
	"max_qty" integer,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "addons_library" ADD CONSTRAINT "addons_library_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addons_library_sort_idx" ON "addons_library" USING btree ("sort_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_addon_links" (
	"activity_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"price_minor" bigint,
	"only_packages" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_addon_links_activity_id_addon_id_pk" PRIMARY KEY("activity_id","addon_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_addon_links" ADD CONSTRAINT "activity_addon_links_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_addon_links" ADD CONSTRAINT "activity_addon_links_addon_id_addons_library_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."addons_library"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_addon_links_addon_idx" ON "activity_addon_links" USING btree ("addon_id");
