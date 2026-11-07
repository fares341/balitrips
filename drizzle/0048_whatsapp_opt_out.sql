-- WhatsApp opt-out (STOP). The itinerary delivery message is transactional
-- and no longer needs marketing consent, so an explicit opt-out has to be
-- recordable on its own. Additive and idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_opted_out_at" timestamp with time zone;
