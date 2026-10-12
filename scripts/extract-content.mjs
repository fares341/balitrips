/**
 * Extracts the content dataset from the design handoff into
 * src/db/seed/content.json.
 *
 * `design/handoff/bt-data.jsx` is a no-build JSX file: it declares a series of
 * top-level `const`s and ends by assigning them onto `window`. It cannot be
 * imported, and parsing JSX to reach the data would be far more machinery than
 * the job needs. Instead we locate each `const NAME = <literal>`, isolate the
 * literal by bracket matching, and evaluate just that expression in a
 * throwaway vm context where the handoff's two helpers are defined:
 *
 *   L(en, ar, id) -> { en, ar, id }     localized string
 *   gal(...tags)  -> [...tags]          gallery of flickr query tags
 *
 * Same technique as scripts/extract-messages.mjs.
 *
 * Run: node scripts/extract-content.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'design/handoff/bt-data.jsx')
const OUT_DIR = resolve(root, 'src/db/seed')
const OUT_FILE = resolve(OUT_DIR, 'content.json')

/**
 * Every top-level const we take, with the size we expect. The counts are
 * asserted so a silently truncated match fails loudly instead of seeding a
 * partial catalog.
 */
const WANTED = [
  ['ACT_CATS', 13],
  ['ACT_SORTS', 3],
  ['REGIONS', 5],
  // 15, not 16 — the handoff notes say 16 but ACTIVITIES only ever held 15.
  ['ACTIVITIES', 15],
  ['ITINERARIES', 8],
  ['PACKAGES', 6],
  ['LOVED', 6],
  ['LANDMARKS', 8],
  ['BLOG_CATS', 5],
  ['ARTICLES', 6],
  ['MAP_BBOX', 4],
  ['MAP_PLACES', 9],
  ['MAP_FILTERS', 5],
  ['REVIEW_POOL', 6],
]

const src = readFileSync(SOURCE, 'utf8')

/**
 * Slice out the literal assigned to `const NAME = ...`.
 *
 * Scans from the first `[` or `{` after the `=` to its match, counting depth
 * so nested literals do not end it early and skipping over string bodies so a
 * bracket inside prose cannot unbalance the count. The handoff's strings are
 * plain single/double quoted text — there are no template literals, no
 * regexes and no comments inside any of these literals.
 */
function isolateLiteral(name) {
  const declaration = `const ${name} = `
  const start = src.indexOf(declaration)
  if (start === -1) throw new Error(`${name} not found in ${SOURCE}`)

  let open = -1
  for (let i = start + declaration.length; i < src.length; i++) {
    const ch = src[i]
    if (ch === '[' || ch === '{') {
      open = i
      break
    }
    if (!/\s/.test(ch)) throw new Error(`${name} is not an array or object literal`)
  }
  if (open === -1) throw new Error(`${name} has no literal body`)

  let depth = 0
  let inString = null
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (inString) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      continue
    }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  throw new Error(`Unbalanced brackets in ${name}`)
}

// The two helpers the handoff literals call, reproduced exactly.
const sandbox = {
  L: (en, ar, id) => ({ en, ar, id }),
  gal: (...tags) => tags,
}

const data = {}
for (const [name, expected] of WANTED) {
  const value = vm.runInNewContext('(' + isolateLiteral(name) + ')', { ...sandbox })
  const size = Array.isArray(value) ? value.length : Object.keys(value).length
  if (size !== expected) {
    throw new Error(`${name}: expected ${expected} entries, extracted ${size}`)
  }
  data[name] = value
}

// ---------------------------------------------------------------------------
// Cross-reference integrity. The handoff wires activities to itineraries,
// packages, landmarks, map pins and reviews by bare string id; a typo there is
// invisible in the prototype (find() just returns undefined and the card
// renders empty) but would become a null foreign key in the seed.
// ---------------------------------------------------------------------------

const problems = []
const activityIds = new Set(data.ACTIVITIES.map((a) => a.id))
const regionKeys = new Set(Object.keys(data.REGIONS))
const catKeys = new Set(data.ACT_CATS.map((c) => c.key))
const blogCatKeys = new Set(data.BLOG_CATS.map((c) => c.key))
const articleIds = new Set(data.ARTICLES.map((a) => a.id))

const check = (ok, message) => {
  if (!ok) problems.push(message)
}

for (const a of data.ACTIVITIES) {
  check(regionKeys.has(a.region), `activity ${a.id}: unknown region "${a.region}"`)
  for (const c of a.cats) check(catKeys.has(c), `activity ${a.id}: unknown category "${c}"`)
}
for (const it of data.ITINERARIES) {
  for (const r of it.regions) check(regionKeys.has(r), `itinerary ${it.id}: unknown region "${r}"`)
  for (const x of it.acts) check(activityIds.has(x), `itinerary ${it.id}: unknown activity "${x}"`)
  check(
    it.acts.length <= it.days,
    `itinerary ${it.id}: ${it.acts.length} activities for ${it.days} days`,
  )
}
for (const p of data.PACKAGES) {
  for (const r of p.regions) check(regionKeys.has(r), `package ${p.id}: unknown region "${r}"`)
  for (const x of p.acts) check(activityIds.has(x), `package ${p.id}: unknown activity "${x}"`)
}
for (const l of data.LANDMARKS) {
  check(regionKeys.has(l.region), `landmark ${l.id}: unknown region "${l.region}"`)
  check(activityIds.has(l.actId), `landmark ${l.id}: unknown activity "${l.actId}"`)
}
for (const m of data.MAP_PLACES) {
  check(regionKeys.has(m.region), `map place ${m.id}: unknown region "${m.region}"`)
  check(activityIds.has(m.actId), `map place ${m.id}: unknown activity "${m.actId}"`)
}
for (const a of data.ARTICLES) {
  check(blogCatKeys.has(a.cat), `article ${a.id}: unknown blog category "${a.cat}"`)
  for (const r of a.related) check(articleIds.has(r), `article ${a.id}: unknown related "${r}"`)
}
for (const c of data.LOVED) {
  check(catKeys.has(c.key), `loved collection "${c.key}" is not an activity category`)
}
for (const r of data.REVIEW_POOL) {
  check(
    r.tags.some((tag) => activityIds.has(tag)),
    `review by ${r.name}: no tag matches an activity id`,
  )
}

// Every locale present on every localized string.
const LOCALES = ['en', 'ar', 'id']
const walk = (node, path) => {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`))
    return
  }
  if (node === null || typeof node !== 'object') return
  const keys = Object.keys(node)
  // An L() result is exactly { en, ar, id } and nothing else. Testing for a
  // single locale key would misfire on every entity, since they all carry a
  // literal `id` — the handoff id, not the Indonesian translation.
  const isLocalized = keys.length === LOCALES.length && keys.every((k) => LOCALES.includes(k))
  if (isLocalized) {
    for (const locale of LOCALES) {
      const value = node[locale]
      if (typeof value !== 'string' || value.length === 0) {
        problems.push(`${path}: missing "${locale}"`)
      }
    }
    return
  }
  for (const key of keys) walk(node[key], `${path}.${key}`)
}
for (const [name] of WANTED) walk(data[name], name)

if (problems.length) {
  console.error(`\n${problems.length} integrity problem(s) in ${SOURCE}:`)
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}

// Emit through Prettier rather than raw JSON.stringify: it collapses short
// arrays that stringify always expands, so without this every regeneration
// leaves the file failing `pnpm format:check`.
const { format, resolveConfig } = await import('prettier')
const prettierOptions = await resolveConfig(OUT_FILE)
const json = await format(JSON.stringify(data, null, 2), {
  ...prettierOptions,
  filepath: OUT_FILE,
})

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, json, 'utf8')

const counts = WANTED.map(([name]) => {
  const value = data[name]
  const size = Array.isArray(value) ? value.length : Object.keys(value).length
  return `${name}=${size}`
}).join('  ')

console.log(`Extracted -> src/db/seed/content.json`)
console.log('  ' + counts)
