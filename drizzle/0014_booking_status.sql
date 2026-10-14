-- Booking-item status and guest checkout (v3 handoff: "Booking & payment
-- states", Order.guest_contact).
--
-- order_items.booking_status is the provider-facing life of one booked item:
--   created -> sent_to_provider -> confirmed -> completed
--   cancel_requested -> cancelled -> refunded
-- "Confirmed" is set only when the provider confirms, never by payment;
-- digital products (itinerary, plan, custom itinerary) complete on payment.
-- fulfilment_status is kept as it was: refunds, vouchers and the account
-- pages still read it. Existing rows are backfilled from it.
--
-- orders.guest_token_hash lets a signed-out traveller see the order they
-- placed from the same browser (sha256 of an httpOnly cookie);
-- orders.source_cart_id lets the payment webhook empty that guest's cart.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "booking_status" varchar(24) DEFAULT 'created' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "booking_status_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "order_items" SET "booking_status" = CASE "fulfilment_status"
    WHEN 'delivered' THEN 'completed'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'refunded' THEN 'refunded'
    ELSE 'created'
  END,
  "booking_status_at" = "updated_at"
  WHERE "booking_status" = 'created' AND "fulfilment_status" <> 'pending';
--> statement-breakpoint
UPDATE "order_items" i SET "booking_status" = 'completed', "booking_status_at" = o."updated_at"
  FROM "orders" o
  WHERE o."id" = i."order_id"
    AND i."booking_status" = 'created'
    AND i."kind" IN ('itinerary', 'plan', 'custom', 'place')
    AND o."status" IN ('paid', 'confirmed', 'partially_refunded');
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "guest_token_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_cart_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_guest_token_idx" ON "orders" USING btree ("guest_token_hash");
