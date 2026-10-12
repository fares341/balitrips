import { describe, expect, it } from 'vitest'

import {
  buildVocabulary,
  compareHits,
  matchesTerms,
  namesOf,
  placeHaystack,
  queryTerms,
  resolveArea,
  splitPlacePhrase,
  textRank,
  understandQuery,
  wordVariants,
  type HaystackSource,
  type MapTaxonomy,
  type RankFields,
} from './query'

const l = (en: string, ar: string, id: string) => ({ en, ar, id })

const region = (key: string, label: Record<string, string>, parentKey: string | null = null) => ({
  key,
  label,
  parentKey,
  centerLat: null,
  centerLon: null,
  radiusKm: null,
})

/** نفس تصنيفات البذرة (src/db/seed): أسماء عربية بـ "ال"، و"Cafés" بعلامة. */
const taxonomy: MapTaxonomy = {
  regions: [
    region('south', l('South Bali', 'جنوب بالي', 'Bali Selatan')),
    region('kuta', l('Kuta', 'كوتا', 'Kuta'), 'south'),
    region('seminyak', l('Seminyak', 'سمينياك', 'Seminyak'), 'south'),
    region('canggu', l('Canggu', 'تشانغو', 'Canggu'), 'south'),
    region('nusa-dua', l('Nusa Dua', 'نوسا دوا', 'Nusa Dua'), 'south'),
    region('ubud', l('Ubud', 'أوبود', 'Ubud')),
  ],
  categories: [
    { key: 'beach', label: l('Beaches', 'الشواطئ', 'Pantai') },
    { key: 'food', label: l('Restaurants', 'المطاعم', 'Restoran') },
    { key: 'cafe', label: l('Cafés', 'الكافيهات', 'Kafe') },
    { key: 'hospital', label: l('Hospitals', 'مستشفيات', 'Rumah Sakit') },
  ],
  tags: [
    { key: 'specialty-coffee', label: l('Specialty Coffee', 'قهوة مختصة', 'Kopi Spesialti') },
    { key: 'burger', label: l('Burger', 'برجر', 'Burger') },
    { key: 'pizza', label: l('Pizza', 'بيتزا', 'Pizza') },
  ],
}
const vocab = buildVocabulary(taxonomy)

const category = (key: string) => taxonomy.categories.find((one) => one.key === key)?.label
const tag = (key: string) => ({
  key,
  label: taxonomy.tags.find((one) => one.key === key)?.label ?? l(key, key, key),
})

function place(
  slug: string,
  name: string,
  categoryKey: string,
  regionKey: string,
  tags: HaystackSource['tags'] = [],
): string {
  return placeHaystack({
    slug,
    name: l(name, name, name),
    categoryKey,
    categoryLabel: category(categoryKey),
    tags,
    regionKey,
    regionLabel: taxonomy.regions.find((one) => one.key === regionKey)?.label,
    parentRegionKey: 'south',
  })
}

const kutaCafe = place('kopi-kuta', 'Kopi Kuta', 'cafe', 'kuta', [tag('specialty-coffee')])
const plainCafe = place('warung-cafe', 'Warung Santai', 'cafe', 'kuta')
const burgerJoint = place('burger-co', 'Burger Co', 'food', 'seminyak', [tag('burger')])
const pizzeria = place('pizza-place', 'Nonna', 'food', 'ubud', [tag('pizza')])
const echoBeach = place('echo-beach', 'Echo Beach', 'beach', 'canggu')
const finns = place('finns', 'Finns Beach Club', 'beach', 'canggu', [
  { key: 'nightlife', label: l('Nightlife', 'سهر', 'Hiburan Malam') },
])
const hospital = place('bimc', 'BIMC', 'hospital', 'kuta')

const ask = (q: string) => understandQuery(q, vocab)
const finds = (q: string, haystack: string) => matchesTerms(haystack, ask(q).terms)

describe('spec examples (8.x)', () => {
  it('"كافيهات في كوتا" → cafes, area Kuta', () => {
    const q = ask('كافيهات في كوتا')
    expect(q.areaKey).toBe('kuta')
    expect(q.nearMe).toBe(false)
    expect(matchesTerms(kutaCafe, q.terms)).toBe(true)
    expect(matchesTerms(burgerJoint, q.terms)).toBe(false)
  })

  it('"Specialty Coffee in Kuta" → both words required, area Kuta', () => {
    const q = ask('Specialty Coffee in Kuta')
    expect(q.areaKey).toBe('kuta')
    expect(q.terms.map((term) => term.word)).toEqual(['specialty', 'coffee'])
    expect(matchesTerms(kutaCafe, q.terms)).toBe(true)
    expect(matchesTerms(plainCafe, q.terms)).toBe(false)
  })

  it('"مطاعم برجر في Seminyak" → restaurant AND burger, area Seminyak', () => {
    const q = ask('مطاعم برجر في Seminyak')
    expect(q.areaKey).toBe('seminyak')
    expect(matchesTerms(burgerJoint, q.terms)).toBe(true)
    expect(matchesTerms(pizzeria, q.terms)).toBe(false)
  })

  it('"Pizza Restaurants" → pizza AND restaurant, no area', () => {
    const q = ask('Pizza Restaurants')
    expect(q.areaKey).toBeNull()
    expect(matchesTerms(pizzeria, q.terms)).toBe(true)
    expect(matchesTerms(burgerJoint, q.terms)).toBe(false)
  })

  it('"Cafes near me" → near me, cafes', () => {
    const q = ask('Cafes near me')
    expect(q.nearMe).toBe(true)
    expect(q.areaKey).toBeNull()
    expect(q.terms).toHaveLength(1)
    expect(matchesTerms(plainCafe, q.terms)).toBe(true)
    expect(matchesTerms(hospital, q.terms)).toBe(false)
  })

  it('"مستشفى قريب مني" → near me, hospitals', () => {
    const q = ask('مستشفى قريب مني')
    expect(q.nearMe).toBe(true)
    expect(matchesTerms(hospital, q.terms)).toBe(true)
    expect(matchesTerms(plainCafe, q.terms)).toBe(false)
  })

  it('"Beach clubs in Canggu" → beach; club only when the taxonomy knows clubs', () => {
    const q = ask('Beach clubs in Canggu')
    expect(q.areaKey).toBe('canggu')
    // لا وسم club/nightlife في التصنيف ← تصنيف الشواطئ وحده.
    expect(matchesTerms(echoBeach, q.terms)).toBe(true)
    expect(matchesTerms(finns, q.terms)).toBe(true)
    expect(matchesTerms(plainCafe, q.terms)).toBe(false)

    const withNightlife = buildVocabulary({
      ...taxonomy,
      tags: [...taxonomy.tags, { key: 'nightlife', label: l('Nightlife', 'سهر', 'Hiburan') }],
    })
    const strict = understandQuery('Beach clubs in Canggu', withNightlife)
    expect(matchesTerms(finns, strict.terms)).toBe(true)
    expect(matchesTerms(echoBeach, strict.terms)).toBe(false)
  })
})

describe('near me phrases', () => {
  it.each([
    'cafes nearby',
    'cafes close to me',
    'مطاعم قريبة مني',
    'مطاعم بالقرب مني',
    'المطاعم القريبة',
    'kafe dekat saya',
    'kafe di dekat saya',
    'rumah sakit terdekat',
  ])('%s', (text) => {
    const q = ask(text)
    expect(q.nearMe).toBe(true)
    expect(q.terms.length).toBeGreaterThan(0)
  })

  it('"near Kuta" is an area, not my location', () => {
    const q = ask('cafes near Kuta')
    expect(q.nearMe).toBe(false)
    expect(q.areaKey).toBe('kuta')
  })
})

describe('singular / plural / synonyms', () => {
  it.each(['restaurant', 'restaurants', 'مطعم', 'مطاعم', 'المطاعم', 'restoran', 'food'])(
    '%s finds a restaurant',
    (text) => expect(finds(text, burgerJoint)).toBe(true),
  )
  it.each([
    'cafe',
    'cafes',
    'café',
    'Cafés',
    'coffee',
    'كافيه',
    'كافيهات',
    'مقهى',
    'مقاهي',
    'kafe',
  ])('%s finds a café', (text) => expect(finds(text, plainCafe)).toBe(true))
  it.each(['hospital', 'clinic', 'مستشفى', 'مستشفيات', 'عيادة', 'rumah sakit'])(
    '%s finds a hospital',
    (text) => expect(finds(text, hospital)).toBe(true),
  )
  it.each(['beach', 'beaches', 'شاطئ', 'شواطئ', 'pantai'])('%s finds a beach', (text) =>
    expect(finds(text, echoBeach)).toBe(true),
  )
  it('word variants', () => {
    expect(wordVariants('cafes')).toContain('cafe')
    expect(wordVariants('beaches')).toContain('beach')
    expect(wordVariants('bakeries')).toContain('bakery')
    expect(wordVariants('كافيهات')).toContain('كافيه')
    expect(wordVariants('kafe-kafe')).toContain('kafe')
  })
  it('short synonyms are whole words ("massage" → spa, not "spanish")', () => {
    expect(matchesTerms('spanish tapas', queryTerms('massage'))).toBe(false)
    expect(matchesTerms('day spa', queryTerms('massage'))).toBe(true)
    expect(matchesTerms('day spas', queryTerms('massage'))).toBe(true)
  })
  it('typed words match word starts, for results while typing', () => {
    expect(matchesTerms(burgerJoint, queryTerms('bur'))).toBe(true)
    expect(matchesTerms(burgerJoint, queryTerms('urger'))).toBe(true)
    expect(matchesTerms(burgerJoint, queryTerms('ur'))).toBe(false)
  })
  it('no text → no terms, everything matches', () => {
    expect(ask('').terms).toEqual([])
    expect(ask('best places in bali').terms).toEqual([])
  })
})

describe('area from the query', () => {
  it('resolves in all languages and by prefix', () => {
    expect(resolveArea('كوتا', vocab.areas)).toBe('kuta')
    expect(resolveArea('semin', vocab.areas)).toBe('seminyak')
    expect(resolveArea('nusa dua', vocab.areas)).toBe('nusa-dua')
    expect(resolveArea('ubud bali', vocab.areas)).toBe('ubud')
    expect(resolveArea('جنوب بالي', vocab.areas)).toBe('south')
    expect(resolveArea('nowhere', vocab.areas)).toBeNull()
  })
  it('bare area names without "in"', () => {
    expect(ask('cafes kuta').areaKey).toBe('kuta')
    expect(ask('Ubud').areaKey).toBe('ubud')
    expect(ask('Ubud').terms).toEqual([])
  })
  it('an unknown place after "in" stays a search word', () => {
    const q = ask('pizza in Nonna')
    expect(q.areaKey).toBeNull()
    expect(matchesTerms(pizzeria, q.terms)).toBe(true)
  })
  it('keeps the rest of the text when the area is removed', () => {
    expect(ask('Cafes in Kuta').withoutArea).toBe('Cafes')
    expect(ask('cafes in kuta near me').withoutArea).toBe('cafes near me')
  })
  it('splitPlacePhrase', () => {
    expect(splitPlacePhrase('cafes in kuta')).toEqual({ what: 'cafes', where: 'kuta' })
    expect(splitPlacePhrase('كافيهات في كوتا')).toEqual({ what: 'كافيهات', where: 'كوتا' })
    expect(splitPlacePhrase('kafe di canggu')).toEqual({ what: 'kafe', where: 'canggu' })
    expect(splitPlacePhrase('pizza')).toBeNull()
  })
})

describe('suggestion relevance', () => {
  const kuta = namesOf('kuta', l('Kuta', 'كوتا', 'Kuta'))
  it('"ku" and "كو" offer Kuta', () => {
    expect(textRank(kuta, 'ku')).toBe(1)
    expect(textRank(kuta, 'كو')).toBe(1)
  })
  it('two letters never match mid-word', () => {
    expect(textRank(namesOf('canggu', l('Canggu', 'تشانغو', 'Canggu')), 'an')).toBe(-1)
  })
})

describe('result order (8.6)', () => {
  const base: RankFields = {
    distanceKm: null,
    inRegion: false,
    priority: 0,
    sortOrder: 0,
    vip: false,
    popularity: 0,
    name: 'A',
  }
  it('nearest first when location is on', () => {
    const near = { ...base, distanceKm: 1 }
    const far = { ...base, distanceKm: 4, priority: 99 }
    expect([far, near].sort(compareHits)[0]).toBe(near)
  })
  it('then area, admin priority, sort order, VIP, popularity', () => {
    const inside = { ...base, inRegion: true }
    const promoted = { ...base, priority: 5 }
    const early = { ...base, sortOrder: -1 }
    const vip = { ...base, vip: true }
    const popular = { ...base, popularity: 7 }
    const plain = { ...base, name: 'B' }
    expect([plain, popular, vip, early, promoted, inside].sort(compareHits)).toEqual([
      inside,
      promoted,
      early,
      vip,
      popular,
      plain,
    ])
  })
})
