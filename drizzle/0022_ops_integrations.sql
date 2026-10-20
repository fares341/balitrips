-- Phase 6: team roles, supplier integrations, system health, shared rate
-- limits. Additive only: seven new tables, and users.role widened from 16 to
-- 32 characters so the longer role names fit (widening never rewrites a value).
-- No existing row is changed; every existing account keeps its role.
--
--  * supplier_integrations: one connection per supplier; keys are stored
--    encrypted (AES-256-GCM, INTEGRATIONS_KEY), only their last 4 are shown.
--  * external_product_mappings: supplier id <-> our supplier offer.
--  * integration_imports: uploaded CSV files, previewed before applying.
--  * integration_logs: calls in and out, with a payload HASH (no payload).
--  * error_events: server/browser errors, one row per fingerprint + count.
--  * rate_limits: counters shared by every app instance.
--  * system_heartbeats: last successful backup; alert throttling.
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE varchar(32);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"connection_type" varchar(16) NOT NULL,
	"environment" varchar(12) DEFAULT 'sandbox' NOT NULL,
	"status" varchar(12) DEFAULT 'paused' NOT NULL,
	"credentials_sealed" text,
	"credentials_hint" jsonb,
	"webhook_secret_sealed" text,
	"webhook_secret_hint" varchar(8),
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflict_policy" varchar(12) DEFAULT 'flag' NOT NULL,
	"retry_limit" integer DEFAULT 5 NOT NULL,
	"retry_delay_seconds" integer DEFAULT 60 NOT NULL,
	"rate_limit_per_minute" integer,
	"rate_limit_note" varchar(200),
	"token_expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"alerted_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"internal_kind" varchar(16) DEFAULT 'offer' NOT NULL,
	"internal_id" uuid NOT NULL,
	"label" varchar(200),
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"file_name" varchar(200),
	"body" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(12) DEFAULT 'previewed' NOT NULL,
	"summary" jsonb,
	"created_by" uuid,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid,
	"direction" varchar(8) NOT NULL,
	"operation" varchar(40) NOT NULL,
	"endpoint" varchar(300),
	"status" varchar(12) NOT NULL,
	"http_status" integer,
	"duration_ms" integer,
	"error" text,
	"payload_hash" varchar(64),
	"payload_bytes" integer,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"source" varchar(16) NOT NULL,
	"name" varchar(120),
	"message" text NOT NULL,
	"stack" text,
	"path" varchar(300),
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_request" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_heartbeats" (
	"name" varchar(80) PRIMARY KEY NOT NULL,
	"last_ok_at" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_integrations" ADD CONSTRAINT "supplier_integrations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_integrations" ADD CONSTRAINT "supplier_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_product_mappings" ADD CONSTRAINT "external_product_mappings_integration_id_supplier_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."supplier_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_imports" ADD CONSTRAINT "integration_imports_integration_id_supplier_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."supplier_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_imports" ADD CONSTRAINT "integration_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_imports" ADD CONSTRAINT "integration_imports_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_integration_id_supplier_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."supplier_integrations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_integrations_supplier_idx" ON "supplier_integrations" USING btree ("supplier_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_product_mappings_unique" ON "external_product_mappings" USING btree ("integration_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_product_mappings_internal_idx" ON "external_product_mappings" USING btree ("internal_kind","internal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_imports_integration_idx" ON "integration_imports" USING btree ("integration_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_logs_integration_idx" ON "integration_logs" USING btree ("integration_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_logs_created_idx" ON "integration_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "error_events_fingerprint_unique" ON "error_events" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_last_seen_idx" ON "error_events" USING btree ("last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");
