-- «أبلغني عند التوفر»: alerts for an unavailable activity. Additive only: one
-- new table; no existing row or column is touched.
CREATE TABLE IF NOT EXISTS "availability_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid,
	"email" varchar(254),
	"phone" varchar(20),
	"contact_key" varchar(300) NOT NULL,
	"locale" varchar(8) DEFAULT 'ar' NOT NULL,
	"notified_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_alerts" ADD CONSTRAINT "availability_alerts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_alerts" ADD CONSTRAINT "availability_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_alerts_contact_uq" ON "availability_alerts" USING btree ("activity_id","contact_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_alerts_pending_idx" ON "availability_alerts" USING btree ("activity_id","notified_at");
