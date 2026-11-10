-- Plans sold per device (owner, Nov 2026): the base price covers the plan's
-- device_limit; each extra device the buyer picks adds extra_device_price_minor.
-- NULL/0 = extra devices not sold. max_devices caps the buyer's choice.
-- Additive and idempotent; no prices are seeded.
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "extra_device_price_minor" integer;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "max_devices" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plans" ADD CONSTRAINT "plans_extra_device_price_check"
    CHECK ("extra_device_price_minor" IS NULL OR "extra_device_price_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plans" ADD CONSTRAINT "plans_max_devices_check"
    CHECK ("max_devices" IS NULL OR "max_devices" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
