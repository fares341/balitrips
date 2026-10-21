-- Client (Oct 2026): /plans offers only Free and the paid map plan ($19).
-- Data only: published VIP plans go back to draft. Nothing is deleted;
-- existing VIP access, orders and entitlements are untouched, and a plan can
-- be published again from Studio → Plans at any time.
UPDATE "plans"
SET "status" = 'draft', "updated_at" = now()
WHERE "entitlement_kind" = 'vip' AND "status" = 'published' AND "deleted_at" IS NULL;
