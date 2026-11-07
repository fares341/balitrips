-- Packages: Studio drag order for the public listing (owner, Nov 2026).
-- Backfilled with today's order (price, then length), so nothing moves
-- until the owner reorders. Additive and idempotent.
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "packages" p
   SET "sort_order" = o.n
  FROM (SELECT "id", row_number() OVER (ORDER BY "price_minor", "days", "id") AS n FROM "packages") o
 WHERE p."id" = o."id"
   AND NOT EXISTS (SELECT 1 FROM "packages" WHERE "sort_order" <> 0);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "packages_sort_idx" ON "packages" ("sort_order");
