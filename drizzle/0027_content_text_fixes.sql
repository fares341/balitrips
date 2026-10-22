-- Task list (Oct 2026) — content fixes that live in the database.
-- Data only; every statement is guarded so it is a no-op on rows it does not
-- match, and running it twice changes nothing more.

-- H14: articles that have no real body yet (title + one line in every
-- language) leave the blog until they are written. They go back to draft —
-- nothing is deleted, and Studio → Articles publishes them again.
UPDATE "articles"
SET "status" = 'draft', "updated_at" = now()
WHERE "status" = 'published'
  AND "deleted_at" IS NULL
  AND coalesce(length(btrim("body"->>'en')), 0) < 400
  AND coalesce(length(btrim("body"->>'ar')), 0) < 400
  AND coalesce(length(btrim("body"->>'id')), 0) < 400;
--> statement-breakpoint

-- L1 (colloquial → MSA) and the terminology table (one spelling per place
-- name), applied to the Arabic text of every content column.
DO $$
DECLARE
  col record;
  pair text[];
  pairs text[][] := ARRAY[
    ARRAY['اللي اختارها فريقنا', 'التي اختارها فريقنا'],
    ARRAY['سواقنا', 'سائقنا'],
    ARRAY['ومافي فعاليات', 'ولا توجد فعاليات'],
    ARRAY['عمل تشك إن', 'إجراء تسجيل الوصول'],
    ARRAY['سمينياك', 'سيمنياك'],
    ARRAY['سمنياك', 'سيمنياك'],
    ARRAY['أولوواتو', 'أولواتو']
  ];
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.data_type = 'jsonb'
      AND c.table_name IN (
        'activities', 'activity_tiers', 'activity_addons', 'addons_library',
        'itineraries', 'itinerary_days', 'itinerary_day_places', 'packages',
        'map_places', 'landmarks', 'regions', 'categories', 'articles', 'media'
      )
  LOOP
    FOREACH pair SLICE 1 IN ARRAY pairs LOOP
      EXECUTE format(
        'UPDATE %I SET %I = jsonb_set(%I, ''{ar}'', to_jsonb(replace(%I->>''ar'', $1, $2))) '
        'WHERE jsonb_typeof(%I) = ''object'' AND %I->>''ar'' LIKE ''%%'' || $1 || ''%%''',
        col.table_name, col.column_name, col.column_name, col.column_name,
        col.column_name, col.column_name
      ) USING pair[1], pair[2];
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint

-- L8: "pura-pura" means "pretending"; the article means temples in Bali.
UPDATE "articles"
SET "title" = jsonb_set("title", '{id}', to_jsonb(replace("title"->>'id', 'pura-pura Bali', 'pura di Bali'))),
    "updated_at" = now()
WHERE "title"->>'id' LIKE '%pura-pura Bali%';
--> statement-breakpoint

-- H17 (durations only): an Indonesian duration that is still the English
-- text is translated when it is made of nothing but numbers and time units;
-- anything else is left for a translator.
UPDATE "activities"
SET "duration" = jsonb_set(
      "duration", '{id}',
      to_jsonb(
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
          btrim("duration"->>'en'),
          '(?i)\mfull[ -]day\M', 'Sehari penuh', 'g'),
          '(?i)\mhalf[ -]day\M', 'Setengah hari', 'g'),
          '(?i)\m(hours?|hrs?)\M', 'jam', 'g'),
          '(?i)\m(minutes?|mins?)\M', 'menit', 'g'),
          '(?i)\mdays?\M', 'hari', 'g'),
          '(?i)\mapprox\.?|\mabout\M', 'sekitar', 'g')
      )
    ),
    "updated_at" = now()
WHERE jsonb_typeof("duration") = 'object'
  AND coalesce("duration"->>'en', '') <> ''
  AND (coalesce("duration"->>'id', '') = '' OR "duration"->>'id' = "duration"->>'en')
  AND btrim("duration"->>'en') ~* '^((full|half)[ -]day|approx\.?|about|hours?|hrs?|minutes?|mins?|days?|[0-9]+([.,][0-9]+)?|[–+-]|\s)+$';
