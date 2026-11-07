-- Studio «الترجمات» now edits the live site (owner, Nov 2026). Overrides of
-- the bundled message catalogues, one row per key with only the changed
-- languages; i18n/request.ts lays them over messages/*.json. No row = the
-- bundled text, so the live site is unchanged until something is edited.
-- Additive and idempotent.
CREATE TABLE IF NOT EXISTS "message_overrides" (
  "key" varchar(160) PRIMARY KEY NOT NULL,
  "values" jsonb NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Home page texts saved by Studio → «الصفحة الرئيسية» move into the same
-- store (the homeContent setting keeps its copy as a fallback layer).
INSERT INTO "message_overrides" ("key", "values")
SELECT e.key, e.value
  FROM "site_settings" s, jsonb_each(coalesce(s."value" -> 'texts', '{}'::jsonb)) AS e(key, value)
 WHERE s."key" = 'homeContent' AND jsonb_typeof(e.value) = 'object' AND e.value <> '{}'::jsonb
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- The old translations table was a copy of the catalogues («import») that
-- the site never read. Only rows someone edited after importing carry an
-- intended change; untouched copies would only freeze today's wording.
INSERT INTO "message_overrides" ("key", "values")
SELECT t."key", jsonb_strip_nulls(jsonb_build_object(
         'en', nullif(btrim(t."values" ->> 'en'), ''),
         'ar', nullif(btrim(t."values" ->> 'ar'), ''),
         'id', nullif(btrim(t."values" ->> 'id'), '')))
  FROM "translations" t
 WHERE t."updated_at" > t."created_at" + interval '1 second'
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
DELETE FROM "message_overrides" WHERE "values" = '{}'::jsonb;
