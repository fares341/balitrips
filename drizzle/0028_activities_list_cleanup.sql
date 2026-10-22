-- Client task list (Oct 2026), activities section: A4, A6, A7, C5, C6, C7.
-- Data only, nothing is deleted except the invented demo reviews (C5).
-- Every statement matches rows by slug and does nothing where a row is
-- missing, so a fresh database (CI, before the seed) passes straight through.

-- A7: an activity folded into another one as a package keeps its row and its
-- link; the page answers with a permanent redirect to the merged activity.
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "merged_into_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activities" ADD CONSTRAINT "activities_merged_into_id_activities_id_fk"
    FOREIGN KEY ("merged_into_id") REFERENCES "public"."activities"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- C5: the handoff's six invented reviews (each attached to two items, all five
-- stars, same date). Only rows with no order behind them and those exact
-- author names; real reviews are untouched.
-- ---------------------------------------------------------------------------
DELETE FROM "reviews"
WHERE "order_id" IS NULL
  AND "author_name" IN ('Sarah M.', 'Ahmed K.', 'Lena R.', 'Yusuf A.', 'Maya P.', 'Tom B.');
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- C6: an activity's rating and review count come from its published reviews
-- only (null / 0 when there are none), kept in step by a trigger. The Studio
-- no longer edits them by hand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "bt_refresh_activity_rating"(aid uuid) RETURNS void
LANGUAGE sql AS $$
  UPDATE "activities" a
  SET "rating" = s.avg, "review_count" = s.n
  FROM (
    SELECT round(avg(r."stars")::numeric, 1)::real AS avg, count(*)::int AS n
    FROM "reviews" r
    WHERE r."activity_id" = aid AND r."is_published" AND r."deleted_at" IS NULL
  ) s
  WHERE a."id" = aid;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "bt_reviews_rating_trigger"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."activity_id" IS NOT NULL THEN
    PERFORM "bt_refresh_activity_rating"(OLD."activity_id");
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."activity_id" IS NOT NULL THEN
    PERFORM "bt_refresh_activity_rating"(NEW."activity_id");
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "reviews_rating_sync" ON "reviews";
--> statement-breakpoint
CREATE TRIGGER "reviews_rating_sync"
AFTER INSERT OR UPDATE OR DELETE ON "reviews"
FOR EACH ROW EXECUTE FUNCTION "bt_reviews_rating_trigger"();
--> statement-breakpoint
UPDATE "activities" a
SET "rating" = s.avg, "review_count" = coalesce(s.n, 0)
FROM "activities" x
LEFT JOIN (
  SELECT r."activity_id", round(avg(r."stars")::numeric, 1)::real AS avg, count(*)::int AS n
  FROM "reviews" r
  WHERE r."is_published" AND r."deleted_at" IS NULL
  GROUP BY r."activity_id"
) s ON s."activity_id" = x."id"
WHERE a."id" = x."id";
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- A4: «دليل محترم لمعابد بالي» → «دليلك لآداب زيارة مزارات بالي», and
-- «معابد» → «مزارات» in the Arabic excerpt and body. Page title and the
-- social tags read the title, so they follow.
-- ---------------------------------------------------------------------------
UPDATE "articles"
SET "title" = jsonb_set("title", '{ar}', to_jsonb('دليلك لآداب زيارة مزارات بالي'::text)),
    "excerpt" = CASE WHEN jsonb_typeof("excerpt" -> 'ar') = 'string'
      THEN jsonb_set("excerpt", '{ar}', to_jsonb(replace("excerpt" ->> 'ar', 'معابد', 'مزارات')))
      ELSE "excerpt" END,
    "body" = CASE WHEN jsonb_typeof("body" -> 'ar') = 'string'
      THEN jsonb_set("body", '{ar}', to_jsonb(replace("body" ->> 'ar', 'معابد', 'مزارات')))
      ELSE "body" END,
    "updated_at" = now()
WHERE "slug" = 'a-respectful-guide-to-balis-temples';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- A6: restaurants, cafés, beaches and dinners are places, not activities.
-- Hidden: out of every list, "similar" and the reviews page; rows kept.
-- ---------------------------------------------------------------------------
UPDATE "activities"
SET "status" = 'hidden', "show_on_home" = false, "is_featured" = false, "updated_at" = now()
WHERE "slug" IN (
    'locavore-ubud',
    'crate-cafe-canggu',
    'padang-padang-beach',
    'diamond-beach',
    'cliffside-sunset-dinner',
    'samabe-private-beach-dinner',
    'samabe-cave-dining-experience'
  )
  AND "status" IN ('published', 'unavailable');
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- A7: look-alike activities become ONE activity with packages.
--
-- For each group a new activity is made from the first source (its photos,
-- place, times and texts), with the categories, tags, gallery and add-ons of
-- all of them. Every source becomes one package of it (its own price, what it
-- includes, its texts); a source that already had packages brings each of
-- them. The sources are then hidden with `merged_into_id` set, so their old
-- links redirect. `redirect_only` rows (the handoff's demo copies) only get
-- the redirect. A group whose new slug exists already, or with fewer than two
-- sources, is skipped, so running this twice changes nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.bt_merge_activities(
  new_slug text,
  new_name jsonb,
  sources text[],
  redirect_only text[]
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  src_ids uuid[];
  base_id uuid;
  new_id uuid := gen_random_uuid();
  src record;
  tr record;
  new_tier uuid;
  pos int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM "activities" WHERE "slug" = new_slug) THEN
    RAISE NOTICE 'merge %: slug exists, skipped', new_slug;
    RETURN;
  END IF;

  SELECT array_agg(a."id" ORDER BY array_position(sources, a."slug"::text))
  INTO src_ids
  FROM "activities" a
  WHERE a."slug" = ANY (sources)
    AND a."status" IN ('published', 'hidden', 'unavailable')
    AND a."deleted_at" IS NULL
    AND a."merged_into_id" IS NULL;

  IF coalesce(array_length(src_ids, 1), 0) < 2 THEN
    RAISE NOTICE 'merge %: % source(s) found, skipped', new_slug, coalesce(array_length(src_ids, 1), 0);
    RETURN;
  END IF;
  base_id := src_ids[1];

  -- The new activity: a copy of the first source, renamed.
  CREATE TEMP TABLE IF NOT EXISTS bt_merge_row (LIKE "activities");
  TRUNCATE bt_merge_row;
  INSERT INTO bt_merge_row SELECT * FROM "activities" WHERE "id" = base_id;
  UPDATE bt_merge_row SET
    "id" = new_id,
    "slug" = new_slug,
    "legacy_id" = NULL,
    "name" = new_name,
    "headline" = NULL,
    "short_description" = NULL,
    -- What is included now differs per package; each package card lists it.
    "included" = NULL,
    "excluded" = NULL,
    "price_minor" = (SELECT min("price_minor") FROM "activities" WHERE "id" = ANY (src_ids)),
    "max_guests" = (SELECT max("max_guests") FROM "activities" WHERE "id" = ANY (src_ids)),
    "min_guests" = (SELECT min("min_guests") FROM "activities" WHERE "id" = ANY (src_ids)),
    "is_most_popular" = (SELECT bool_or("is_most_popular") FROM "activities" WHERE "id" = ANY (src_ids)),
    "show_on_home" = (SELECT bool_or("show_on_home") FROM "activities" WHERE "id" = ANY (src_ids)),
    "is_featured" = (SELECT bool_or("is_featured") FROM "activities" WHERE "id" = ANY (src_ids)),
    "rating" = NULL,
    "review_count" = 0,
    "status" = 'published',
    "published_at" = now(),
    "merged_into_id" = NULL,
    "created_at" = now(),
    "updated_at" = now();
  INSERT INTO "activities" SELECT * FROM bt_merge_row;

  INSERT INTO "activity_categories" ("activity_id", "category_id")
  SELECT DISTINCT new_id, "category_id" FROM "activity_categories" WHERE "activity_id" = ANY (src_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO "activity_tags" ("activity_id", "tag_id")
  SELECT DISTINCT new_id, "tag_id" FROM "activity_tags" WHERE "activity_id" = ANY (src_ids)
  ON CONFLICT DO NOTHING;

  -- Gallery: every source's photos, first source first; the other sources'
  -- cover photos join it too.
  INSERT INTO "activity_images" ("activity_id", "media_id", "sort_order")
  SELECT new_id, m.media_id, (row_number() OVER (ORDER BY m.src_pos, m.sort_order))::int - 1
  FROM (
    SELECT DISTINCT ON (x.media_id) x.media_id, x.src_pos, x.sort_order
    FROM (
      SELECT i."media_id" AS media_id, array_position(src_ids, i."activity_id") AS src_pos, i."sort_order" AS sort_order
      FROM "activity_images" i WHERE i."activity_id" = ANY (src_ids)
      UNION ALL
      SELECT a."hero_image_id", array_position(src_ids, a."id"), 1000
      FROM "activities" a WHERE a."id" = ANY (src_ids) AND a."hero_image_id" IS NOT NULL
    ) x
    ORDER BY x.media_id, x.src_pos, x.sort_order
  ) m
  ON CONFLICT DO NOTHING;

  -- Add-ons from the shared library: one link per add-on, open to every package.
  INSERT INTO "activity_addon_links" ("activity_id", "addon_id", "price_minor", "only_packages", "required", "sort_order")
  SELECT DISTINCT ON (l."addon_id") new_id, l."addon_id", l."price_minor", NULL, l."required", l."sort_order"
  FROM "activity_addon_links" l
  WHERE l."activity_id" = ANY (src_ids)
  ORDER BY l."addon_id", array_position(src_ids, l."activity_id")
  ON CONFLICT DO NOTHING;

  -- The activity's own add-ons, one per name, open to every package.
  INSERT INTO "activity_addons" ("activity_id", "name", "description", "price_minor", "currency", "pricing", "max_qty", "only_packages", "requires_addon_id", "available", "sort_order")
  SELECT DISTINCT ON (coalesce(d."name" ->> 'en', d."name"::text))
    new_id, d."name", d."description", d."price_minor", d."currency", d."pricing", d."max_qty", NULL, NULL, d."available", d."sort_order"
  FROM "activity_addons" d
  WHERE d."activity_id" = ANY (src_ids) AND d."deleted_at" IS NULL
  ORDER BY coalesce(d."name" ->> 'en', d."name"::text), array_position(src_ids, d."activity_id"), d."sort_order";

  -- Packages.
  FOR src IN
    SELECT a.* FROM "activities" a
    WHERE a."id" = ANY (src_ids)
    ORDER BY array_position(src_ids, a."id")
  LOOP
    IF EXISTS (
      SELECT 1 FROM "activity_tiers" t
      WHERE t."activity_id" = src."id" AND t."status" = 'published' AND t."deleted_at" IS NULL
    ) THEN
      FOR tr IN
        SELECT t.* FROM "activity_tiers" t
        WHERE t."activity_id" = src."id" AND t."status" = 'published' AND t."deleted_at" IS NULL
        ORDER BY t."sort_order", t."price_minor"
      LOOP
        new_tier := gen_random_uuid();
        INSERT INTO "activity_tiers" (
          "id", "activity_id", "key", "name", "tagline", "price_minor", "currency",
          "pricing_mode", "group_max", "max_guests", "min_guests", "child_price_minor",
          "includes", "excludes", "includes_addons", "available", "is_popular",
          "features", "highlights", "details", "notes", "sort_order", "status", "published_at"
        ) VALUES (
          new_tier, new_id, left(src."slug" || '-' || tr."key", 64),
          -- «Source name · Package name», per language.
          (SELECT coalesce(jsonb_object_agg(k, to_jsonb(
              coalesce(src."name" ->> k, src."name" ->> 'en') || ' · ' ||
              coalesce(tr."name" ->> k, tr."name" ->> 'en'))), tr."name")
           FROM jsonb_object_keys(tr."name") k),
          coalesce(tr."tagline", src."short_description"), tr."price_minor", tr."currency",
          tr."pricing_mode", tr."group_max", coalesce(tr."max_guests", src."max_guests"),
          coalesce(tr."min_guests", NULLIF(src."min_guests", 1)), tr."child_price_minor",
          coalesce(tr."includes", src."included"), coalesce(tr."excludes", src."excluded"),
          NULL, tr."available", false,
          tr."features", coalesce(tr."highlights", src."highlights"), tr."details",
          coalesce(tr."notes", src."important_notes"), pos, 'published', now()
        );
        INSERT INTO "tier_included_activities" ("tier_id", "activity_id", "sort_order", "timing")
        SELECT new_tier, i."activity_id", i."sort_order", i."timing"
        FROM "tier_included_activities" i WHERE i."tier_id" = tr."id"
        ON CONFLICT DO NOTHING;
        pos := pos + 1;
      END LOOP;
    ELSE
      INSERT INTO "activity_tiers" (
        "id", "activity_id", "key", "name", "tagline", "price_minor", "currency",
        "pricing_mode", "max_guests", "min_guests", "includes", "excludes",
        "available", "is_popular", "highlights", "notes", "sort_order", "status", "published_at"
      ) VALUES (
        gen_random_uuid(), new_id, left(src."slug", 64), src."name",
        coalesce(src."short_description", src."headline"), src."price_minor", src."currency",
        'per_person', src."max_guests", NULLIF(src."min_guests", 1), src."included", src."excluded",
        src."status" <> 'unavailable', src."is_most_popular", src."highlights",
        src."important_notes", pos, 'published', now()
      );
      pos := pos + 1;
    END IF;
  END LOOP;

  -- At most one "most popular" package.
  UPDATE "activity_tiers" SET "is_popular" = false
  WHERE "activity_id" = new_id AND "is_popular"
    AND "id" <> (SELECT "id" FROM "activity_tiers" WHERE "activity_id" = new_id AND "is_popular" ORDER BY "sort_order" LIMIT 1);

  -- The sources: hidden, pointing at the new activity.
  UPDATE "activities"
  SET "status" = 'hidden', "merged_into_id" = new_id, "show_on_home" = false,
      "is_featured" = false, "updated_at" = now()
  WHERE "id" = ANY (src_ids)
     OR ("slug" = ANY (redirect_only) AND "deleted_at" IS NULL AND "merged_into_id" IS NULL);

  RAISE NOTICE 'merge %: % sources, % packages', new_slug, array_length(src_ids, 1), pos;
END $$;
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'water-sports-bali',
  '{"ar":"الرياضات المائية","en":"Water Sports Packages","id":"Paket Olahraga Air"}',
  ARRAY['water-sports-package-a', 'water-sports-package-b', 'water-sports-package-c', 'water-sports-package-premium'],
  ARRAY[]::text[]
);
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'nusa-penida-tour',
  '{"ar":"جولة نوسا بينيدا","en":"Nusa Penida Tour","id":"Tur Nusa Penida"}',
  ARRAY['nusa-penida-island-day-trip', 'nusa-penida-west-tour', 'nusa-penida-west-and-south-tour', 'nusa-penida-west-snorkeling-tour'],
  ARRAY['nusa-penida-day-tour', 'penida-day-tour']
);
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'bali-safari',
  '{"ar":"بالي سفاري","en":"Bali Safari","id":"Bali Safari"}',
  ARRAY['bali-safari-standard-admission', 'bali-safari-deluxe-package', 'bali-safari-premium-package',
        'bali-safari-lion-package', 'bali-safari-rhino-package', 'bali-safari-night-safari',
        'bali-safari-jungle-hopper-car'],
  ARRAY['bali-safari-park']
);
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'bali-marine-safari',
  '{"ar":"بالي مارين سفاري","en":"Bali Marine Safari","id":"Bali Marine Safari"}',
  ARRAY['bali-marine-safari-sea-lion', 'bali-marine-safari-vip', 'bali-marine-safari-sea-dragon'],
  ARRAY[]::text[]
);
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'bali-shooting-club',
  '{"ar":"نادي بالي للرماية","en":"Bali Shooting Club","id":"Bali Shooting Club"}',
  ARRAY['bali-shooting-standard-package', 'bali-shooting-club-experience', 'bali-shooting-pubg-package'],
  ARRAY[]::text[]
);
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'telaga-waja-rafting',
  '{"ar":"تجديف نهر تيلاجا واجا","en":"Telaga Waja River Rafting","id":"Arung Jeram Telaga Waja"}',
  ARRAY['telaga-waja-river-rafting', 'telaga-waja-avatar-rafting'],
  ARRAY[]::text[]
);
--> statement-breakpoint
SELECT pg_temp.bt_merge_activities(
  'jet-ski-tanjung-benoa',
  '{"ar":"جت سكي تانجونغ بينوا","en":"Jet Ski Tanjung Benoa","id":"Jet Ski Tanjung Benoa"}',
  ARRAY['jetski-guided-tanjung-benoa', 'jetski-solo-tanjung-benoa'],
  ARRAY[]::text[]
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- C7: the handoff's demo activities that are not in the client's list but
-- still opened and took bookings. Back to draft: off the site and not
-- bookable; the rows stay and can be republished from the Studio. Matched on
-- slug AND handoff id, so nothing the owner created is touched.
-- ---------------------------------------------------------------------------
UPDATE "activities"
SET "status" = 'draft', "show_on_home" = false, "is_featured" = false, "updated_at" = now()
WHERE ("slug", "legacy_id") IN (
    ('mount-batur-sunrise-hike', 'batur'),
    ('sekumpul-waterfall-trek', 'sekumpul'),
    ('uluwatu-kecak-fire-dance', 'kecak'),
    ('waterbom-bali', 'waterbom'),
    ('ubud-art-market', 'artmarket'),
    ('blue-lagoon-snorkeling', 'snorkel'),
    ('ubud-jungle-spa-ritual', 'spa'),
    ('lempuyang-gates-of-heaven', 'lempuyang')
  )
  AND "merged_into_id" IS NULL
  AND "status" IN ('published', 'hidden', 'unavailable');
