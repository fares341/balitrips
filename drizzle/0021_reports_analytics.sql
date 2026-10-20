-- Phase 5: reports, first-party analytics and marketing integrations. Additive
-- only: seven new tables and six nullable columns on orders. No existing row
-- is changed.
--
--  * analytics_events: one row per tracked event; event_id is UNIQUE so the
--    browser and the server never count the same purchase twice.
--  * visitor_attribution: first-touch / last-touch campaign per visitor id.
--  * client_errors: map load errors reported by browsers.
--  * integration_secrets: encrypted server-only tokens (Meta CAPI, TikTok).
--  * report_schedules / report_exports: emailed reports and PDF exports.
--  * checkout_reminders: abandoned-checkout reminders (max one per cart).
--  * orders.utm_* / utm_first / analytics_anon_id / tracking_consent: where
--    the order came from and what the visitor allowed at checkout.
CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"source" varchar(8) DEFAULT 'browser' NOT NULL,
	"user_id" uuid,
	"anon_id" varchar(64),
	"session_id" varchar(64),
	"path" varchar(300),
	"item_kind" varchar(24),
	"item_id" uuid,
	"item_ref" varchar(160),
	"order_id" uuid,
	"value_minor" bigint,
	"currency" varchar(3),
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(100),
	"device_type" varchar(16),
	"props" jsonb,
	"consent_marketing" boolean DEFAULT false NOT NULL,
	"forwarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visitor_attribution" (
	"anon_id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"first_source" varchar(100),
	"first_medium" varchar(100),
	"first_campaign" varchar(100),
	"first_landing_path" varchar(300),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_source" varchar(100),
	"last_medium" varchar(100),
	"last_campaign" varchar(100),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" varchar(24) NOT NULL,
	"code" varchar(48) NOT NULL,
	"path" varchar(300),
	"device_type" varchar(16),
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_secrets" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"hint" varchar(8),
	"updated_by_actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report" varchar(32) NOT NULL,
	"frequency" varchar(12) NOT NULL,
	"recipients" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report" varchar(32) NOT NULL,
	"params" jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'queued' NOT NULL,
	"object_key" text,
	"bytes" integer,
	"error" text,
	"locale" varchar(2) DEFAULT 'ar' NOT NULL,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkout_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid,
	"user_id" uuid,
	"event_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitor_attribution" ADD CONSTRAINT "visitor_attribution_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_errors" ADD CONSTRAINT "client_errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_updated_by_actor_id_users_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_reminders" ADD CONSTRAINT "checkout_reminders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_reminders" ADD CONSTRAINT "checkout_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_event_id_unique" ON "analytics_events" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_name_time_idx" ON "analytics_events" USING btree ("name","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_time_idx" ON "analytics_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_anon_idx" ON "analytics_events" USING btree ("anon_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_order_idx" ON "analytics_events" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitor_attribution_user_idx" ON "visitor_attribution" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_errors_area_time_idx" ON "client_errors" USING btree ("area","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_schedules_enabled_idx" ON "report_schedules" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_exports_requested_idx" ON "report_exports" USING btree ("requested_by","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_reminders_cart_unique" ON "checkout_reminders" USING btree ("cart_id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utm_source" varchar(100);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utm_medium" varchar(100);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utm_campaign" varchar(100);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utm_first" jsonb;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "analytics_anon_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_consent" varchar(4);
