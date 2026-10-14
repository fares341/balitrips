-- Activity packages and add-ons (v3 handoff: Package / Addon / OrderItem).
--
-- activity_tiers become the activity's "packages": pricing per_person |
-- per_group with group_max, includes/excludes lists, included add-ons and an
-- availability flag. Existing rows keep their data: per_guest -> per_person,
-- flat -> per_group covering the whole party (group_max = the tier cap, or the
-- activity's), and the card chips (features) seed the new includes list.
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "group_max" integer;
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "includes" jsonb;
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "excludes" jsonb;
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "includes_addons" jsonb;
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "available" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "activity_tiers" t SET "pricing_mode" = 'per_group',
  "group_max" = COALESCE(t."max_guests", (SELECT a."max_guests" FROM "activities" a WHERE a."id" = t."activity_id"))
  WHERE t."pricing_mode" = 'flat';
--> statement-breakpoint
UPDATE "activity_tiers" SET "pricing_mode" = 'per_person' WHERE "pricing_mode" = 'per_guest';
--> statement-breakpoint
UPDATE "activity_tiers" SET "includes" = "features" WHERE "includes" IS NULL AND "features" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_tiers" ALTER COLUMN "pricing_mode" SET DEFAULT 'per_person';
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "multi_day" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"price_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"pricing" varchar(16) DEFAULT 'per_booking' NOT NULL,
	"max_qty" integer,
	"only_packages" jsonb,
	"requires_addon_id" uuid,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_addons" ADD CONSTRAINT "activity_addons_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_addons" ADD CONSTRAINT "activity_addons_requires_addon_id_activity_addons_id_fk" FOREIGN KEY ("requires_addon_id") REFERENCES "public"."activity_addons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_addons_activity_idx" ON "activity_addons" USING btree ("activity_id","sort_order");
--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "options" jsonb;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "options" jsonb;
