-- Map v2 (owner, Nov 2026): every map category has a fixed pin colour and
-- icon, editable in Studio → Taxonomy.
-- Additive and guarded: one nullable column, added if missing; defaults are
-- written only where nothing is set yet, so a second run changes nothing and
-- no value an admin chose is overwritten.

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "map_color" varchar(9);

UPDATE "categories" AS c SET "map_color" = d.color
FROM (VALUES
  ('restaurants', '#E07A1F'),
  ('cafes', '#2F6FB5'),
  ('beaches', '#1A9E97'),
  ('malls', '#B5452A'),
  ('hospital', '#D2342F'),
  ('hospitals', '#D2342F'),
  ('sights', '#8A5A3B'),
  ('spa', '#7A4FB0'),
  ('waterfalls', '#1F3F7A')
) AS d(key, color)
WHERE c."key" = d.key AND c."map_color" IS NULL;

UPDATE "categories" AS c SET "icon" = d.icon
FROM (VALUES
  ('restaurants', 'food'),
  ('cafes', 'coffee'),
  ('beaches', 'wave'),
  ('malls', 'bag'),
  ('hospital', 'cross'),
  ('hospitals', 'cross'),
  ('sights', 'temple'),
  ('spa', 'leaf'),
  ('waterfalls', 'drop')
) AS d(key, icon)
WHERE c."key" = d.key AND (c."icon" IS NULL OR c."icon" = '');

-- To undo:
--   ALTER TABLE "categories" DROP COLUMN IF EXISTS "map_color";
