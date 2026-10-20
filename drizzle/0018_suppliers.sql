-- Activity dashboard, phase 2: suppliers, availability, seasonal and child
-- prices, supplier payables. Additive only: every new column is nullable or
-- has a default that keeps today's behaviour, and no row is written — with no
-- supplier, no capacity and no season configured, booking, pricing and
-- orders work exactly as before.
--
--  * suppliers + activity_supplier_offers: who runs an activity, at what cost,
--    with instant or supplier confirmation.
--  * order_items: supplier, offer, frozen cost, the supplier's confirmation
--    number, places held, and the settlement that paid it.
--  * activities: places per departure, closed weekdays, child age band.
--  * activity_tiers.child_price_minor; tier_seasonal_prices.
--  * activity_availability: per-date closures, capacity overrides and the
--    booked counter (reserved on payment with a conditional UPDATE).
--  * supplier_settlements: payment runs to suppliers.
--  * booking_status is a varchar: the new values pending_availability,
--    pending_supplier, in_progress and failed need no constraint change.
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(24) DEFAULT 'activity_company' NOT NULL,
	"contact_person" varchar(160),
	"phone" varchar(48),
	"whatsapp" varchar(48),
	"email" varchar(256),
	"address" text,
	"contract_notes" text,
	"commission_bps" integer,
	"payment_terms" text,
	"policy" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"internal_notes" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_status_idx" ON "suppliers" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_supplier_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"tier_id" uuid,
	"cost_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"sell_price_minor" bigint,
	"time_slots" jsonb,
	"terms" text,
	"confirmation_mode" varchar(32) DEFAULT 'needs_supplier_confirmation' NOT NULL,
	"confirm_within_hours" integer DEFAULT 24 NOT NULL,
	"lead_time_hours" integer,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_supplier_offers" ADD CONSTRAINT "activity_supplier_offers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_supplier_offers" ADD CONSTRAINT "activity_supplier_offers_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_supplier_offers" ADD CONSTRAINT "activity_supplier_offers_tier_id_activity_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."activity_tiers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_offers_activity_idx" ON "activity_supplier_offers" USING btree ("activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_offers_supplier_idx" ON "activity_supplier_offers" USING btree ("supplier_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"paid_at" timestamp with time zone,
	"reference" varchar(128),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_settlements" ADD CONSTRAINT "supplier_settlements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_settlements" ADD CONSTRAINT "supplier_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_settlements_supplier_idx" ON "supplier_settlements" USING btree ("supplier_id");
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "supplier_id" uuid;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "supplier_offer_id" uuid;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "cost_minor" bigint;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "cost_currency" varchar(3);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "supplier_ref" varchar(128);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "supplier_confirmed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "capacity_held" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "settlement_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplier_offer_id_activity_supplier_offers_id_fk" FOREIGN KEY ("supplier_offer_id") REFERENCES "public"."activity_supplier_offers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_settlement_id_supplier_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."supplier_settlements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_supplier_idx" ON "order_items" USING btree ("supplier_id");
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "capacity_per_slot" integer;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "closed_weekdays" jsonb;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "child_age_min" integer;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "child_age_max" integer;
--> statement-breakpoint
ALTER TABLE "activity_tiers" ADD COLUMN IF NOT EXISTS "child_price_minor" bigint;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"day" date NOT NULL,
	"slot" varchar(5) DEFAULT '' NOT NULL,
	"capacity" integer,
	"booked" integer DEFAULT 0 NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_availability" ADD CONSTRAINT "activity_availability_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_availability_unique" ON "activity_availability" USING btree ("activity_id","day","slot");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tier_seasonal_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"price_minor" bigint NOT NULL,
	"child_price_minor" bigint,
	"weekdays" jsonb,
	"label" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_seasonal_prices" ADD CONSTRAINT "tier_seasonal_prices_tier_id_activity_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."activity_tiers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tier_seasonal_tier_idx" ON "tier_seasonal_prices" USING btree ("tier_id","from_date");
