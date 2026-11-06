-- Lead capture: «خصم أول حجز» popup, Google sign-in and checkout contacts,
-- with per-channel consent + timestamp, and one abandoned-cart reminder per
-- cart. Additive and idempotent (IF NOT EXISTS everywhere): a second run, or a
-- database that already has the tables, passes straight through.
-- NOTE: numbered 0047 because 0045/0046 are taken by open PRs; renumber at
-- merge if needed (the journal "when" is later than theirs).
CREATE TABLE IF NOT EXISTS "lead_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128),
  "phone" varchar(20),
  "email" varchar(256),
  "source" varchar(16) NOT NULL,
  "locale" varchar(5) DEFAULT 'ar' NOT NULL,
  "country" varchar(2),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "cart_token" varchar(64),
  "whatsapp_consent" boolean DEFAULT false NOT NULL,
  "whatsapp_consent_at" timestamp with time zone,
  "email_consent" boolean DEFAULT false NOT NULL,
  "email_consent_at" timestamp with time zone,
  "consent_text" text,
  "coupon_id" uuid REFERENCES "coupons"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_contacts_phone_unique" ON "lead_contacts" ("phone");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_contacts_email_unique" ON "lead_contacts" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_contacts_created_idx" ON "lead_contacts" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_contacts_user_idx" ON "lead_contacts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_contacts_cart_token_idx" ON "lead_contacts" ("cart_token");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cart_reminders" (
  "cart_id" uuid PRIMARY KEY NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
  "lead_id" uuid REFERENCES "lead_contacts"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "channel" varchar(12) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
