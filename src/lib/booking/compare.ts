/**
 * «Compare packages»: the rows of the comparison table (pure, no I/O).
 *
 * A row is something a package INCLUDES. Rows come from three places only:
 *
 *  - the activity's general «included» lines — true for every package;
 *  - the extras a package includes (`includesAddons`) — one row per extra;
 *  - each package's own «includes» list.
 *
 * «Not included» lines are never rows: a table of dashes under «soap and
 * shampoo» says nothing. Lines are matched by normalised text, so the same
 * thing typed two ways («Parasailing 5 min» / «Parasailing (5 minutes)»), or
 * typed in one package and ticked as an extra in another, is one row.
 */

export interface CompareAddon {
  id: string
  name: string
}

export interface ComparePackage {
  id: string
  /** The package's own «includes» lines, already localized. */
  includes: readonly string[]
  /** Ids of the extras the package includes. */
  includesAddons: readonly string[]
}

export interface CompareRow {
  key: string
  label: string
  /** One flag per package, in the order the packages were given. */
  has: boolean[]
  /** Some packages include it and some do not. */
  differs: boolean
}

const ARABIC_MARKS = /[ً-ٰٟـ]/g
const ARABIC_DIGITS = /[٠-٩۰-۹]/g

/** Arabic letter variants written as one letter (أ إ آ → ا, ى → ي, ة → ه…). */
function foldLetters(text: string): string {
  return text
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}

const folded = (words: readonly string[]) => new Set(words.map(foldLetters))

/** Words that say how much or how long, never what: dropped when matching. */
const UNIT_WORDS = folded([
  'دقيقة',
  'دقائق',
  'دقيقتان',
  'دقيقتين',
  'ساعة',
  'ساعات',
  'ساعتان',
  'ساعتين',
  'جولة',
  'جولات',
  'جولتان',
  'جولتين',
  'مرة',
  'مرات',
  'مرتان',
  'مرتين',
  'min',
  'mins',
  'minute',
  'minutes',
  'hour',
  'hours',
  'hr',
  'hrs',
  'round',
  'rounds',
  'ride',
  'rides',
  'time',
  'times',
  'x',
  'menit',
  'jam',
  'putaran',
  'kali',
])

/** Words that only qualify a line («free», «with a guide» stays — that is content). */
const FILLER_WORDS = folded(['مجانا', 'مجاني', 'مجانية', 'free', 'gratis', 'مشمول', 'included'])

/**
 * A line reduced to what it names: lower case, Arabic letter variants folded,
 * diacritics, punctuation, brackets, quantities («5 minutes», «×2») and the
 * definite article dropped.
 */
export function normalizeFeature(text: string): string {
  const plain = foldLetters(text.normalize('NFKC').toLowerCase())
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    // Brackets keep their words («(15 minutes)» is a quantity like any other).
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const tokens = plain
    .split(' ')
    .filter((token) => token !== '')
    .filter((token) => !/^\d+$/.test(token) && !/^\d+x$|^x\d+$/.test(token))
    .filter((token) => !UNIT_WORDS.has(token) && !FILLER_WORDS.has(token))
    .map((token) => (token.length >= 5 && token.startsWith('ال') ? token.slice(2) : token))
  return tokens.join(' ')
}

/** `short` is the start of `long`, ending on a word boundary. */
function startsWithWords(long: string, short: string): boolean {
  return short !== '' && (long === short || long.startsWith(`${short} `))
}

/** Two normalised lines name the same thing: equal, or one continues the other. */
function sameThing(a: string, b: string): boolean {
  return startsWithWords(a, b) || startsWithWords(b, a)
}

/**
 * The rows of the table for these packages.
 *
 * `general` are the activity's own «included» lines that apply to every
 * package; `addons` are all the activity's extras (so a line typed as text
 * can be recognised as an extra another package ticks).
 */
export function compareRows(
  packages: readonly ComparePackage[],
  addons: readonly CompareAddon[],
  general: readonly string[] = [],
): CompareRow[] {
  type Draft = { key: string; label: string; norm: string; has: boolean[] }
  const rows: Draft[] = []
  const blank = () => packages.map(() => false)
  const every = () => packages.map(() => true)

  // 1. Lines true for every package.
  const generalRows: Draft[] = []
  for (const line of general) {
    const norm = normalizeFeature(line)
    if (norm === '' || generalRows.some((row) => row.norm === norm)) continue
    generalRows.push({ key: `g:${norm}`, label: line.trim(), norm, has: every() })
  }

  // 2. Extras, by id: a row exists once a package includes the extra.
  const addonNorm = addons.map((addon) => ({ ...addon, norm: normalizeFeature(addon.name) }))
  const addonRow = (addon: { id: string; name: string; norm: string }): Draft => {
    const key = `a:${addon.id}`
    let row = rows.find((r) => r.key === key)
    if (!row) {
      row = { key, label: addon.name.trim(), norm: addon.norm, has: blank() }
      rows.push(row)
    }
    return row
  }
  /** The single extra a typed line names; none when it fits several or none. */
  const addonFor = (norm: string) => {
    const exact = addonNorm.filter((addon) => addon.norm !== '' && addon.norm === norm)
    if (exact.length === 1) return exact[0]
    const near = addonNorm.filter((addon) => addon.norm !== '' && sameThing(addon.norm, norm))
    return near.length === 1 ? near[0] : undefined
  }

  packages.forEach((pkg, index) => {
    for (const id of pkg.includesAddons) {
      const addon = addonNorm.find((a) => a.id === id)
      if (!addon || addon.norm === '') continue
      const row = addonRow(addon)
      row.has[index] = true
    }
  })

  // 3. Each package's own lines.
  packages.forEach((pkg, index) => {
    for (const line of pkg.includes) {
      const norm = normalizeFeature(line)
      if (norm === '') continue
      // Already said for every package by a general line (the same words, or
      // a shorter way to say it; a longer line may be an upgrade and stays).
      if (generalRows.some((row) => startsWithWords(row.norm, norm))) continue
      const addon = addonFor(norm)
      if (addon) {
        addonRow(addon).has[index] = true
        continue
      }
      let row = rows.find((r) => r.norm === norm)
      if (!row) {
        row = { key: `t:${norm}`, label: line.trim(), norm, has: blank() }
        rows.push(row)
      }
      row.has[index] = true
    }
  })

  const finish = (row: Draft): CompareRow => ({
    key: row.key,
    label: row.label,
    has: row.has,
    differs: row.has.some(Boolean) && row.has.some((yes) => !yes),
  })
  const own = rows.filter((row) => row.has.some(Boolean)).map(finish)
  // Differences first — they are what the table is for — then what all share.
  return [
    ...own.filter((row) => row.differs),
    ...own.filter((row) => !row.differs),
    ...generalRows.map(finish),
  ]
}

/** `names` without the ones a line of `lines` already says (same normalised thing). */
export function withoutRepeats(names: readonly string[], lines: readonly string[]): string[] {
  const seen = lines.map(normalizeFeature).filter((norm) => norm !== '')
  return names.filter((name) => {
    const norm = normalizeFeature(name)
    return norm === '' || !seen.some((line) => sameThing(line, norm))
  })
}
