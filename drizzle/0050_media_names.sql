-- Media library: a human name per file (owner, Nov 2026: "upload everything
-- at once, then pick each image by its name"). Backfilled from the object
-- key's file name so every existing row is findable straight away; the
-- upload path fills it from the uploaded file's name. Additive, idempotent.
-- NOTE: numbered 0050 on purpose (0049 is reserved by a parallel branch).
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
UPDATE "media"
   SET "name" = coalesce(nullif(btrim("alt" ->> 'en'), ''), regexp_replace(
         regexp_replace(regexp_replace("object_key", '^.*/', ''), '\.[A-Za-z0-9]+$', ''),
         '[-_]+', ' ', 'g'))
 WHERE "name" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_name_lower_idx" ON "media" (lower("name"));
