CREATE TABLE "activity_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" jsonb NOT NULL,
	"tagline" jsonb,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"pricing_mode" varchar(16) DEFAULT 'per_guest' NOT NULL,
	"max_guests" integer,
	"is_popular" boolean DEFAULT false NOT NULL,
	"features" jsonb,
	"highlights" jsonb,
	"details" jsonb,
	"notes" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD CONSTRAINT "activity_tiers_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_tier_activity_idx" ON "activity_tiers" USING btree ("activity_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_tier_key_idx" ON "activity_tiers" USING btree ("activity_id","key");