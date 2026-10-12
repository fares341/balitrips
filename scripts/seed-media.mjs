/**
 * Generate and attach placeholder imagery.
 *
 * The handoff sourced every photograph from `loremflickr` — a hot-linking
 * search service, so each image was a third party's bandwidth, uptime and
 * licence. None of that was carried over, which is why `media` is empty and
 * every `hero_image_id` is null, and why the site renders grey blocks.
 *
 * This fills the gap for evaluation WITHOUT a licensing problem: the artwork
 * is generated here, so it is ours, commits cleanly, needs no network and
 * cannot rot. Each scene is picked from the record's own category or region,
 * so a beach reads as a beach and a temple as a temple — the layout can be
 * judged honestly even though the art is not photography.
 *
 * Deliberately NOT part of `db:seed`. Real photography replaces this through
 * the admin media library, and a re-seed must never quietly reinstate
 * placeholders over it: rows are attached only where `hero_image_id` is null.
 *
 *   node scripts/seed-media.mjs           attach where missing
 *   node scripts/seed-media.mjs --force   re-attach everything
 *   node scripts/seed-media.mjs --clear   detach and remove generated rows
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(root, 'public/seed-media')
/** Marks a row as generated, so --clear can find them and humans can tell. */
const KEY_PREFIX = 'seed-media'
const WIDTH = 1200
const HEIGHT = 800

/* --------------------------------------------------------------------------
   Scenes — palettes taken from the brand tokens, not invented, so generated
   art sits beside the real design instead of fighting it.
   -------------------------------------------------------------------------- */

const SCENES = {
  beach: { sky: ['#7FD4E8', '#CFF0F7'], water: '#2FA8C4', land: '#E7D3AE', accent: '#FF9000' },
  marine: { sky: ['#4FBBD8', '#A9E4F0'], water: '#127A99', land: '#1F5F73', accent: '#71FF85' },
  volcano: { sky: ['#F6C88A', '#FBE6C8'], water: '#8A6A4F', land: '#4A3A30', accent: '#FF9000' },
  nature: { sky: ['#BDE8C4', '#EAF7EA'], water: '#3C6E45', land: '#26552E', accent: '#71FF85' },
  temple: { sky: ['#F7D9A8', '#FDEFD8'], water: '#9C6B3F', land: '#6B4A2C', accent: '#E07E00' },
  food: { sky: ['#FFD9A8', '#FFF1DC'], water: '#C97B3A', land: '#8A4B22', accent: '#FF9000' },
  spa: { sky: ['#D8F0DC', '#F3FBF4'], water: '#7FBF95', land: '#3C6E45', accent: '#C9F7CF' },
  romantic: { sky: ['#F9C8C0', '#FDE8E4'], water: '#D08A80', land: '#8A4A45', accent: '#FF9000' },
  city: { sky: ['#CFE0EC', '#EEF4F8'], water: '#7C93A6', land: '#3F5567', accent: '#FF9000' },
  default: { sky: ['#BDE8C4', '#EAF7EA'], water: '#3C6E45', land: '#26552E', accent: '#FF9000' },
}

/** Category or region key fragment -> scene. */
const SCENE_BY_KEY = {
  beach: 'beach',
  marine: 'marine',
  snorkel: 'marine',
  dive: 'marine',
  island: 'marine',
  adv: 'volcano',
  hik: 'volcano',
  mountain: 'volcano',
  volcano: 'volcano',
  batur: 'volcano',
  nature: 'nature',
  waterfall: 'nature',
  rice: 'nature',
  jungle: 'nature',
  sekumpul: 'nature',
  culture: 'temple',
  temple: 'temple',
  heritage: 'temple',
  art: 'temple',
  lempuyang: 'temple',
  food: 'food',
  cafe: 'food',
  restaurant: 'food',
  culinary: 'food',
  dine: 'food',
  spa: 'spa',
  wellness: 'spa',
  relax: 'spa',
  romantic: 'romantic',
  honey: 'romantic',
  family: 'nature',
  kids: 'nature',
  photo: 'city',
  shop: 'city',
  south: 'beach',
  central: 'nature',
  east: 'temple',
  north: 'volcano',
  islands: 'marine',
}

function sceneFor(keys) {
  for (const key of keys) {
    if (!key) continue
    const lower = String(key).toLowerCase()
    for (const [needle, scene] of Object.entries(SCENE_BY_KEY)) {
      if (lower.includes(needle)) return SCENES[scene]
    }
  }
  return SCENES.default
}

/** Deterministic per-slug jitter, so two beaches are not identical. */
function jitter(slug, salt, spread) {
  const hash = createHash('sha256')
    .update(slug + ':' + salt)
    .digest()
  return ((hash[0] ?? 0) / 255 - 0.5) * spread
}

function svg(slug, scene) {
  const horizon = HEIGHT * 0.58 + jitter(slug, 'h', 60)
  const sunX = WIDTH * (0.25 + jitter(slug, 'sx', 0.5))
  const sunY = horizon - 130 + jitter(slug, 'sy', 60)
  const peak = jitter(slug, 'p', 90)

  // Two ridges over a gradient. Enough silhouette to read as landscape at
  // card size, few enough nodes to stay small in the repository.
  const ridgeA =
    'M0,' +
    horizon +
    ' L' +
    WIDTH * 0.22 +
    ',' +
    (horizon - 170 + peak) +
    ' L' +
    WIDTH * 0.42 +
    ',' +
    (horizon - 40) +
    ' L' +
    WIDTH * 0.6 +
    ',' +
    (horizon - 210 - peak) +
    ' L' +
    WIDTH * 0.82 +
    ',' +
    (horizon - 60) +
    ' L' +
    WIDTH +
    ',' +
    (horizon - 140) +
    ' L' +
    WIDTH +
    ',' +
    HEIGHT +
    ' L0,' +
    HEIGHT +
    ' Z'

  const ridgeB =
    'M0,' +
    (horizon + 60) +
    ' L' +
    WIDTH * 0.3 +
    ',' +
    (horizon - 20) +
    ' L' +
    WIDTH * 0.55 +
    ',' +
    (horizon + 80) +
    ' L' +
    WIDTH * 0.78 +
    ',' +
    (horizon - 10) +
    ' L' +
    WIDTH +
    ',' +
    (horizon + 70) +
    ' L' +
    WIDTH +
    ',' +
    HEIGHT +
    ' L0,' +
    HEIGHT +
    ' Z'

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      WIDTH +
      ' ' +
      HEIGHT +
      '" width="' +
      WIDTH +
      '" height="' +
      HEIGHT +
      '" role="img">',
    '<defs>',
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="' + scene.sky[0] + '"/>',
    '<stop offset="100%" stop-color="' + scene.sky[1] + '"/>',
    '</linearGradient>',
    '<linearGradient id="land" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="' + scene.water + '"/>',
    '<stop offset="100%" stop-color="' + scene.land + '"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="url(#sky)"/>',
    '<circle cx="' +
      sunX.toFixed(0) +
      '" cy="' +
      sunY.toFixed(0) +
      '" r="58" fill="' +
      scene.accent +
      '" opacity="0.9"/>',
    '<path d="' + ridgeA + '" fill="url(#land)" opacity="0.85"/>',
    '<path d="' + ridgeB + '" fill="' + scene.land + '" opacity="0.55"/>',
    '</svg>',
    '',
  ].join('\n')
}

/* --------------------------------------------------------------------------
   Attach
   -------------------------------------------------------------------------- */

const force = process.argv.includes('--force')
const clear = process.argv.includes('--clear')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('\n  DATABASE_URL is not set.\n')
  process.exit(1)
}
const sql = postgres(url, { max: 1 })

const TABLES = ['activities', 'itineraries', 'packages', 'landmarks', 'map_places', 'articles']

/**
 * Records still needing an image, with the keys that pick a scene.
 *
 * Explicit per table. Composing the joins from fragments read tidily and did
 * not survive contact with the driver: an empty fragment is still an object,
 * so the "is there a join?" test was always true and produced a query
 * referencing a table it never joined.
 */
async function fetchRows(table) {
  const onlyMissing = force ? sql`` : sql`and t.hero_image_id is null`

  if (table === 'activities') {
    return sql`
      select distinct on (t.id) t.id, t.slug, r.key as region_key, c.key as category_key
      from activities t
      left join regions r on r.id = t.region_id
      left join activity_categories ac on ac.activity_id = t.id
      left join categories c on c.id = ac.category_id
      where t.deleted_at is null ${onlyMissing}
      order by t.id
    `
  }

  if (table === 'articles') {
    return sql`
      select t.id, t.slug, null as region_key, c.key as category_key
      from articles t
      left join article_categories c on c.id = t.category_id
      where t.deleted_at is null ${onlyMissing}
    `
  }

  // itineraries and packages carry regions through a join table rather than
  // a region_id column, so there is nothing to join here. Their slug already
  // names the theme ("relaxation-package", "family-itinerary"), which is a
  // better scene hint than an arbitrary first region would be.
  if (table === 'itineraries' || table === 'packages') {
    return sql`
      select t.id, t.slug, null as region_key, null as category_key
      from ${sql(table)} t
      where t.deleted_at is null ${onlyMissing}
    `
  }

  return sql`
    select t.id, t.slug, r.key as region_key, null as category_key
    from ${sql(table)} t
    left join regions r on r.id = t.region_id
    where t.deleted_at is null ${onlyMissing}
  `
}

async function main() {
  if (clear) {
    for (const table of TABLES) {
      await sql`
        update ${sql(table)} set hero_image_id = null
        where hero_image_id in (select id from media where object_key like ${KEY_PREFIX + '%'})
      `
    }
    const removed = await sql`
      delete from media where object_key like ${KEY_PREFIX + '%'} returning id
    `
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
    console.log('\n  Detached and removed ' + removed.length + ' generated media rows.\n')
    await sql.end()
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  let written = 0

  for (const table of TABLES) {
    const rows = await fetchRows(table)

    for (const row of rows) {
      const scene = sceneFor([row.category_key, row.region_key, row.slug])
      const objectKey = KEY_PREFIX + '/' + table + '-' + row.slug + '.svg'
      const body = svg(row.slug, scene)
      writeFileSync(resolve(root, 'public', objectKey), body, 'utf8')
      written++

      const alt = row.slug.replace(/-/g, ' ')
      const [media] = await sql`
        insert into media (object_key, mime_type, width, height, bytes, alt, credit)
        values (${objectKey}, 'image/svg+xml', ${WIDTH}, ${HEIGHT}, ${body.length},
                ${sql.json({ en: alt, ar: alt, id: alt })},
                'Generated placeholder — replace with licensed photography')
        on conflict (object_key) do update set updated_at = now()
        returning id
      `
      await sql`update ${sql(table)} set hero_image_id = ${media.id} where id = ${row.id}`
    }

    console.log('  ' + table.padEnd(12) + rows.length)
  }

  console.log('\n  Wrote and attached ' + written + ' images.')
  console.log('  GENERATED PLACEHOLDERS — replace via the admin media library.\n')
  await sql.end()
}

main().catch(async (error) => {
  console.error(error)
  await sql.end()
  process.exit(1)
})
