CREATE TABLE "security_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" varchar(48) NOT NULL,
	"severity" varchar(8) NOT NULL,
	"subject" varchar(128) NOT NULL,
	"user_id" uuid,
	"ip" varchar(64),
	"details" jsonb,
	"auto_action" varchar(48),
	"hits" integer DEFAULT 1 NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_alerts_status_idx" ON "security_alerts" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "security_alerts_subject_idx" ON "security_alerts" USING btree ("rule","subject","status");--> statement-breakpoint
CREATE INDEX "security_alerts_user_idx" ON "security_alerts" USING btree ("user_id");