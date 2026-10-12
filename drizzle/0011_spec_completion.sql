-- Spec completion (audit vs الوثيقة التفصيلية): share trip, exclusive articles, device type,
-- custom itinerary quotes, request days, payment method. See docs/spec-completion.md.
-- Share My Trip (spec 12.3) + exclusive articles (spec 2.3/2.4).
CREATE TABLE IF NOT EXISTS "trip_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trip_shares_user_unique" ON "trip_shares" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trip_shares_token_unique" ON "trip_shares" USING btree ("token");--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "required_entitlement" varchar(32);
--> statement-breakpoint
-- Security batch (spec 3.2, 14–20): device type on devices; users.status gains 'suspended'
-- (varchar(16), no constraint — no DDL needed for the new status value).
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "device_type" varchar(16);--> statement-breakpoint
-- Backfill from the stored User-Agent, same rules as parseDeviceType() in src/lib/security/fingerprint.ts.
UPDATE "devices" SET "device_type" = CASE
	WHEN "user_agent" ~* '(iPad|Tablet|PlayBook|Silk|Kindle)' THEN 'tablet'
	WHEN "user_agent" ~* 'Android' AND "user_agent" !~* 'Mobile' THEN 'tablet'
	WHEN "user_agent" ~* '(Mobi|iPhone|iPod|Android|Windows Phone|IEMobile|Opera Mini)' THEN 'mobile'
	ELSE 'desktop'
END
WHERE "device_type" IS NULL AND "user_agent" IS NOT NULL;
--> statement-breakpoint
-- Commerce batch: custom itinerary quotes (13.1), request days (22.4),
-- payment method (22.7). The `basic` entitlement kind (13.3) needs no DDL:
-- entitlements.kind / plans.entitlement_kind are varchar(32).

-- 13.1 + 22.4: custom_trip_requests
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "days" integer;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "quote_minor" bigint;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "quote_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "quoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN IF NOT EXISTS "paid_order_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "custom_trip_requests" ADD CONSTRAINT "custom_trip_requests_paid_order_id_orders_id_fk"
    FOREIGN KEY ("paid_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- 22.4 backfill: inclusive day count from the stored dates (same rule as daysBetweenInclusive).
UPDATE "custom_trip_requests"
SET "days" = ("end_date" - "start_date") + 1
WHERE "days" IS NULL
  AND "start_date" IS NOT NULL
  AND "end_date" IS NOT NULL
  AND "end_date" >= "start_date";--> statement-breakpoint

-- 22.7: payments.method
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "method" varchar(32);--> statement-breakpoint
-- Offline payments recorded from Studio (markOrderPaidOffline) are bank transfers.
UPDATE "payments" SET "method" = 'bank_transfer' WHERE "method" IS NULL AND "provider" = 'manual';
