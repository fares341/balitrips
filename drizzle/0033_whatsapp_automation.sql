-- WhatsApp automation (client proposal, Oct 2026): the send log. Additive
-- and guarded; running it twice changes nothing.
CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "automation" varchar(40) NOT NULL,
  "dedupe_key" varchar(160) NOT NULL,
  "order_id" uuid,
  "user_id" uuid,
  "to_phone" varchar(20),
  "locale" varchar(5) DEFAULT 'en' NOT NULL,
  "vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "body" text,
  "status" varchar(12) DEFAULT 'queued' NOT NULL,
  "provider" varchar(16),
  "provider_message_id" varchar(120),
  "error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_messages_dedupe_key_unique" UNIQUE("dedupe_key")
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_order_id_orders_id_fk') THEN
    ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_order_id_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_user_id_users_id_fk') THEN
    ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_messages_created_idx" ON "whatsapp_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_idx" ON "whatsapp_messages" USING btree ("status","created_at");
