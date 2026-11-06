-- Phase 4 — itinerary delivery the moment an order is paid.
--
-- itinerary_deliveries: one row per (order item, channel). The UNIQUE pair is
-- what makes delivery idempotent: a replayed webhook, the reconcile sweep and
-- a Studio «mark as paid» all try to insert the same row and only the first
-- succeeds. The worker claims the row (status queued → sending) before it
-- sends, so two workers never both send. `round` counts resends.
--   channel   'email' | 'whatsapp'
--   status    'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
CREATE TABLE IF NOT EXISTS "itinerary_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
  "channel" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'queued',
  "recipient" varchar(320),
  "round" integer NOT NULL DEFAULT 0,
  "attempts" integer NOT NULL DEFAULT 0,
  "error" text,
  "sent_at" timestamp with time zone,
  "requested_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "itinerary_deliveries_item_channel_uq"
  ON "itinerary_deliveries" ("order_item_id", "channel");
