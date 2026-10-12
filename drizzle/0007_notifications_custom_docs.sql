CREATE TABLE "custom_trip_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" varchar(200) NOT NULL,
	"bytes" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" uuid,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" varchar(8) DEFAULT 'user' NOT NULL,
	"user_id" uuid,
	"type" varchar(48) NOT NULL,
	"params" jsonb,
	"href" varchar(256),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN "has_children" boolean;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN "wants_vip_map" boolean;--> statement-breakpoint
ALTER TABLE "custom_trip_requests" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "custom_trip_documents" ADD CONSTRAINT "custom_trip_documents_request_id_custom_trip_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."custom_trip_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_trip_documents" ADD CONSTRAINT "custom_trip_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_trip_documents_request_idx" ON "custom_trip_documents" USING btree ("request_id","version");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_audience_idx" ON "notifications" USING btree ("audience","read_at","created_at");--> statement-breakpoint
-- حالات الطلب المخصص حسب الوثيقة. الحالات القديمة تُنقل إلى أقرب مقابل.
UPDATE "custom_trip_requests" SET "status" = CASE "status"
  WHEN 'contacted' THEN 'under_review'
  WHEN 'quoted'    THEN 'waiting_approval'
  WHEN 'won'       THEN 'completed'
  WHEN 'lost'      THEN 'rejected'
  WHEN 'closed'    THEN 'completed'
  ELSE "status" END;--> statement-breakpoint
-- رسائل التواصل: new | read | replied | closed.
UPDATE "contact_messages" SET "status" = CASE "status"
  WHEN 'contacted' THEN 'replied'
  WHEN 'quoted'    THEN 'replied'
  WHEN 'won'       THEN 'closed'
  WHEN 'lost'      THEN 'closed'
  ELSE "status" END;
