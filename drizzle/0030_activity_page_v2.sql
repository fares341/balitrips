-- Activity details page v2 (client spec, Oct 2026). Additive only: new
-- nullable / defaulted columns; no data is rewritten or deleted.

-- Packages: reference price, badge, own picture and duration.
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "compare_at_price_minor" bigint;--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "badge_label" jsonb;--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "badge_color" varchar(16);--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "image_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "duration" jsonb;--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "description" jsonb;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_tiers_image_id_media_id_fk') THEN
    ALTER TABLE "activity_tiers" ADD CONSTRAINT "activity_tiers_image_id_media_id_fk"
      FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Add-ons: tiered prices by quantity and incompatible add-ons.
ALTER TABLE "activity_addons" ADD COLUMN IF NOT EXISTS "price_tiers" jsonb;--> statement-breakpoint
ALTER TABLE "activity_addons" ADD COLUMN IF NOT EXISTS "incompatible_with" jsonb;--> statement-breakpoint
ALTER TABLE "addons_library" ADD COLUMN IF NOT EXISTS "price_tiers" jsonb;--> statement-breakpoint
ALTER TABLE "addons_library" ADD COLUMN IF NOT EXISTS "incompatible_with" jsonb;--> statement-breakpoint

-- Activities: SEO per language, hand-picked related activities, content template.
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "seo_title" jsonb;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "seo_description" jsonb;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "og_image_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "canonical_url" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "related_ids" jsonb;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "content_template" varchar(32);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_og_image_id_media_id_fk') THEN
    ALTER TABLE "activities" ADD CONSTRAINT "activities_og_image_id_media_id_fk"
      FOREIGN KEY ("og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
