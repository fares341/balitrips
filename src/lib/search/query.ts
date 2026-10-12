/**
 * فهم جملة البحث في الخريطة (الوثيقة 8) — نقي، بلا استيرادات خادم.
 *
 * مصدر واحد للخريطة (على الدبابيس المحمّلة، فوراً) وللخادم
 * (`searchPlaces` في ./places.ts)، كي يتفقا على ما تعنيه الجملة:
 *
 *   "كافيهات في كوتا"         ← ما: كافيهات، أين: Kuta
 *   "Specialty Coffee in Kuta" ← ما: specialty + coffee (كلاهما)، أين: Kuta
 *   "مطاعم برجر في Seminyak"   ← ما: مطاعم + برجر، أين: Seminyak
 *   "Cafes near me"            ← ما: cafes، قريب مني: نعم
 *   "مستشفى قريب مني"          ← ما: مستشفى (مستشفى/عيادة…)، قريب مني: نعم
 *   "Beach clubs in Canggu"    ← ما: beach + club (club يُشترط فقط إن عرفه التصنيف)
 *
 * الخطوات: تقطيع ← "قريب مني" ← "X في Y" ← المنطقة ← كلمات "ما" (كلها مطلوبة)،
 * لكل كلمة بدائلها: المفرد/الجمع، وجدول مرادفات صغير بالثلاث لغات.
 *
 * الأماكن المقفلة لا تمر من هنا أبداً: من يستدعي `matchesTerms` يملك
 * الأماكن المرئية فقط (الدبابيس في المتصفح، والصفوف المفتوحة على الخادم).
 */

import { normalizeSearch } from './normalize'

/** نص مترجم {en, ar, id} كما يخزَّن — أو لا شيء. */
export type LocalizedLike = Partial<Record<string, string | null | undefined>> | null | undefined

/* --------------------------------------------------------------------------
   التصنيفات العامة التي يحتاجها الفهم (تُرسل للمتصفح — لا شيء فيها مقفل)
   -------------------------------------------------------------------------- */

/** منطقة أو حي (الوثيقة 7): بيانات عامة — المفتاح، الاسم، المركز ونصف القطر. */
export interface MapRegion {
  key: string
  label: Record<string, string>
  /** المنطقة العامة للحي (Kuta ← south)؛ null للمنطقة العامة نفسها. */
  parentKey: string | null
  centerLat: number | null
  centerLon: number | null
  radiusKm: number | null
}

export interface TaxonomyEntry {
  key: string
  label: Record<string, string>
}

/** المناطق والتصنيفات والوسوم المفعّلة، مرتبة بـ `sort_order` من لوحة التحكم. */
export interface MapTaxonomy {
  regions: MapRegion[]
  categories: TaxonomyEntry[]
  tags: TaxonomyEntry[]
}

export interface SearchVocabulary {
  areas: readonly { key: string; label: LocalizedLike }[]
  /** نص كل التصنيفات والوسوم المفعّلة (كل اللغات والمفاتيح)، مطبّعاً. */
  taxonomyText: string
}

export function buildVocabulary(taxonomy: MapTaxonomy): SearchVocabulary {
  return {
    areas: taxonomy.regions,
    taxonomyText: normalizeSearch(
      [...taxonomy.categories, ...taxonomy.tags]
        .map((entry) => `${keyText(entry.key)} ${allText(entry.label)}`)
        .join(' '),
    ),
  }
}

/* --------------------------------------------------------------------------
   الجداول
   -------------------------------------------------------------------------- */

/** "قريب مني" بالثلاث لغات — تسلسلات كلمات مطبّعة، الأطول أولاً. */
const NEAR_ME: readonly (readonly string[])[] = [
  'close to me',
  'near to me',
  'near me',
  'around me',
  'near by',
  'nearby',
  'nearest',
  'closest',
  'بالقرب مني',
  'قريب مني',
  'قريبة مني',
  'قريبين مني',
  'القريبة مني',
  'القريب مني',
  'القريبة',
  'القريب',
  'الأقرب',
  'بقربي',
  'جنبي',
  'حولي',
  'di dekat saya',
  'dekat saya',
  'sekitar saya',
  'dekat sini',
  'terdekat',
]
  .map((phrase) => phrase.split(' ').map(normalizeSearch))
  .sort((a, b) => b.length - a.length)

/** كلمات تفصل "ما" عن "أين": Cafes **in** Kuta، كافيهات **في** كوتا، kafe **di** Kuta. */
const SPLIT_WORDS = new Set(
  [
    'in',
    'at',
    'near',
    'around',
    'inside',
    'within',
    'في',
    'فى',
    'داخل',
    'قرب',
    'قريب',
    'بقرب',
    'بالقرب',
    'عند',
    'حول',
    'di',
    'dekat',
    'sekitar',
  ].map(normalizeSearch),
)

/** حشو حول اسم المنطقة: "في **منطقة** كوتا"، "near **the** Kuta **area**". */
const WHERE_FILLER = new Set(
  ['the', 'area', 'region', 'من', 'منطقة', 'حي', 'daerah', 'kawasan'].map(normalizeSearch),
)

/** كلمات لا تحمل معنى للبحث. "bali": كل شيء هنا في بالي. */
const STOPWORDS = new Set(
  [
    'the',
    'a',
    'an',
    'best',
    'good',
    'top',
    'great',
    'nice',
    'some',
    'any',
    'all',
    'of',
    'for',
    'with',
    'and',
    '&',
    'to',
    'in',
    'at',
    'on',
    'me',
    'show',
    'find',
    'place',
    'places',
    'spot',
    'spots',
    'bali',
    'di',
    'ke',
    'yang',
    'dan',
    'terbaik',
    'untuk',
    'cari',
    'tempat',
    'area',
    'region',
    'daerah',
    'kawasan',
    'منطقة',
    'حي',
    'في',
    'من',
    'على',
    'إلى',
    'عن',
    'مع',
    'و',
    'أفضل',
    'أحسن',
    'أين',
    'وين',
    'ابحث',
    'أماكن',
    'مكان',
    'بالي',
  ].map(normalizeSearch),
)

/**
 * مرادفات صغيرة بالثلاث لغات. كلمة من مجموعة تطابق أي كلمة أخرى فيها.
 * `soft`: تُشترط فقط إن كان في التصنيفات أو الوسوم ما يطابقها
 * ("Beach clubs" بلا وسم nightlife/club ← تصنيف الشواطئ وحده).
 */
const SYNONYM_SOURCE: readonly { words: readonly string[]; soft?: boolean }[] = [
  {
    words: [
      'cafe',
      'cafes',
      'coffee',
      'coffeeshop',
      'coffee shop',
      'kafe',
      'kopi',
      'kedai kopi',
      'كافيه',
      'كافيهات',
      'كافي',
      'كوفي',
      'مقهى',
      'مقاهي',
      'قهوة',
    ],
  },
  {
    words: [
      'restaurant',
      'restaurants',
      'food',
      'dining',
      'eatery',
      'restoran',
      'rumah makan',
      'kuliner',
      'مطعم',
      'مطاعم',
      'طعام',
      'أكلات',
    ],
  },
  {
    words: [
      'hospital',
      'hospitals',
      'clinic',
      'clinics',
      'medical',
      'emergency',
      'rumah sakit',
      'klinik',
      'مستشفى',
      'مستشفيات',
      'مشفى',
      'عيادة',
      'عيادات',
      'طوارئ',
    ],
  },
  { words: ['beach', 'beaches', 'pantai', 'شاطئ', 'شواطئ', 'بيتش'] },
  {
    words: [
      'club',
      'clubs',
      'nightlife',
      'nightclub',
      'night club',
      'klub',
      'kelab',
      'كلوب',
      'نادي',
      'نوادي',
      'سهر',
      'حياة ليلية',
    ],
    soft: true,
  },
  { words: ['pizza', 'pizzeria', 'بيتزا'] },
  { words: ['burger', 'burgers', 'hamburger', 'برجر', 'برغر', 'همبرجر', 'همبرغر'] },
  {
    words: [
      'hotel',
      'hotels',
      'resort',
      'resorts',
      'villa',
      'villas',
      'hostel',
      'penginapan',
      'فندق',
      'فنادق',
      'منتجع',
      'منتجعات',
      'فيلا',
      'فلل',
    ],
  },
  { words: ['temple', 'temples', 'pura', 'معبد', 'معابد'] },
  { words: ['market', 'markets', 'pasar', 'سوق', 'أسواق'] },
  { words: ['shopping', 'mall', 'belanja', 'تسوق', 'مول', 'محلات'] },
  { words: ['spa', 'massage', 'pijat', 'سبا', 'مساج', 'تدليك'] },
  {
    words: [
      'hike',
      'hiking',
      'trek',
      'trekking',
      'pendakian',
      'هايكنج',
      'مشي جبلي',
      'المشي الجبلي',
    ],
  },
  { words: ['waterfall', 'waterfalls', 'air terjun', 'شلال', 'شلالات'] },
  { words: ['bar', 'bars', 'pub', 'lounge', 'بار'] },
  {
    words: [
      'sight',
      'sights',
      'attraction',
      'attractions',
      'landmark',
      'landmarks',
      'wisata',
      'tempat wisata',
      'معلم',
      'معالم',
      'أماكن سياحية',
    ],
  },
  {
    words: ['gem', 'gems', 'hidden gem', 'hidden gems', 'permata', 'جوهرة', 'جواهر', 'جواهر مخفية'],
  },
  {
    words: [
      'family',
      'families',
      'kids',
      'children',
      'keluarga',
      'anak',
      'عائلي',
      'عائلة',
      'عائلات',
      'أطفال',
    ],
  },
  { words: ['pharmacy', 'pharmacies', 'apotek', 'صيدلية', 'صيدليات'] },
]

interface SynonymGroup {
  words: readonly string[]
  soft: boolean
}

const SYNONYMS: readonly SynonymGroup[] = SYNONYM_SOURCE.map((group) => ({
  words: [...new Set(group.words.map(normalizeSearch))],
  soft: group.soft === true,
}))

/** كلمة (أو عبارة) ← مجموعاتها. العبارات ("rumah sakit") تُلتقط قبل التقطيع لكلمات. */
const WORD_INDEX = new Map<string, SynonymGroup[]>()
for (const group of SYNONYMS) {
  for (const word of group.words) WORD_INDEX.set(word, [...(WORD_INDEX.get(word) ?? []), group])
}
const MAX_COMPOUND = 3

/* --------------------------------------------------------------------------
   أدوات نصية
   -------------------------------------------------------------------------- */

/** كل قيم النص المترجم (en/ar/id) — البحث بكل اللغات، لا بلغة الزائر وحدها. */
function allText(value: LocalizedLike): string {
  if (!value) return ''
  return Object.values(value)
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
}

/** `specialty-coffee` ← "specialty-coffee specialty coffee". */
function keyText(key: string | null | undefined): string {
  return key ? `${key} ${key.replace(/[-_]+/g, ' ')}` : ''
}

const ARABIC = /[؀-ۿ]/
const WORD_CHAR = /[\p{L}\p{N}]/u
/** سوابق عربية ملتصقة: "ال"، "و"، "ب"… "الشواطئ" تطابق "شواطئ". */
const ARABIC_PREFIXES = ['وال', 'بال', 'لل', 'ال', 'و', 'ب'] as const

function atWordStart(hay: string, index: number, arabic: boolean): boolean {
  if (index === 0 || !WORD_CHAR.test(hay.charAt(index - 1))) return true
  if (!arabic) return false
  for (const prefix of ARABIC_PREFIXES) {
    const start = index - prefix.length
    if (start < 0 || hay.slice(start, index) !== prefix) continue
    if (start === 0 || !WORD_CHAR.test(hay.charAt(start - 1))) return true
  }
  return false
}

/** لاحقة جمع بعد كلمة كاملة: club←clubs، beach←beaches، عيادة←عيادات. */
const PLURAL_SUFFIXES = ['es', 's', 'ات'] as const

function atWordEnd(hay: string, end: number): boolean {
  if (end >= hay.length || !WORD_CHAR.test(hay.charAt(end))) return true
  return PLURAL_SUFFIXES.some(
    (suffix) =>
      hay.startsWith(suffix, end) &&
      (end + suffix.length >= hay.length || !WORD_CHAR.test(hay.charAt(end + suffix.length))),
  )
}

/**
 * هل يحتوي النص على البديل؟ الطويلة جزء من كلمة يكفي ("restaurant" في
 * "restaurants"، "مطاعم" في "المطاعم"). القصيرة يجب أن تبدأ كلمة — وإن كانت
 * مرادفاً لا ما كتبه المستخدم (`whole`) فيجب أن تكون الكلمة كلها، وإلا طابق
 * مرادف "spa" كلمة "spanish" ومرادف "سوق" كلمة "تسوق". ما يكتبه المستخدم
 * يطابق بدايات الكلمات كي تظهر النتائج أثناء الكتابة ("bur" ← burger).
 */
export function containsAlt(hay: string, alt: string, whole = false): boolean {
  const arabic = ARABIC.test(alt)
  const short = arabic ? alt.length <= 3 : alt.length <= 4
  if (!short) return hay.includes(alt)
  let from = 0
  for (;;) {
    const index = hay.indexOf(alt, from)
    if (index < 0) return false
    if (atWordStart(hay, index, arabic) && (!whole || atWordEnd(hay, index + alt.length))) {
      return true
    }
    from = index + 1
  }
}

/** صيغ المفرد/الجمع التقريبية لكلمة مطبّعة. */
export function wordVariants(word: string): string[] {
  const out = new Set([word])
  // الإندونيسية تجمع بالتكرار: kafe-kafe ← kafe.
  const halves = word.split('-')
  if (halves.length === 2 && halves[0] !== undefined && halves[0] === halves[1]) out.add(halves[0])
  if (ARABIC.test(word)) {
    let stem = word
    for (const prefix of ['وال', 'بال', 'لل', 'ال']) {
      if (stem.startsWith(prefix) && stem.length - prefix.length >= 3) {
        stem = stem.slice(prefix.length)
        out.add(stem)
        break
      }
    }
    // جمع المؤنث السالم: كافيهات ← كافيه، مستشفيات ← مستشفي.
    if (stem.endsWith('ات') && stem.length >= 5) out.add(stem.slice(0, -2))
  } else {
    if (word.length > 4 && word.endsWith('ies')) out.add(`${word.slice(0, -3)}y`)
    if (word.length > 4 && word.endsWith('es')) out.add(word.slice(0, -2))
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) out.add(word.slice(0, -1))
  }
  return [...out].filter((variant) => variant.length >= 2)
}

/* --------------------------------------------------------------------------
   الكلمات
   -------------------------------------------------------------------------- */

export interface QueryTerm {
  /** الكلمة كما فُهمت (مطبّعة). */
  word: string
  /** الكلمة وصيغها (مفرد/جمع) — أي واحدة تكفي. */
  alts: string[]
  /** مرادفاتها من الجدول — أي واحد يكفي، والقصير منها كلمةً كاملة. */
  synonyms: string[]
  /** مرادف "ناعم": يُسقط إن لم يعرفه التصنيف (انظر SYNONYM_SOURCE). */
  soft: boolean
}

function buildTerm(word: string): QueryTerm | null {
  // "cafes near" وهو يكمل الكتابة إلى "near me": كلمة الفصل وحدها ليست شرطاً.
  if (STOPWORDS.has(word) || SPLIT_WORDS.has(word)) return null
  const variants = wordVariants(word)
  const groups = [...new Set(variants.flatMap((variant) => WORD_INDEX.get(variant) ?? []))]
  if (variants.length === 0) return null
  const synonyms = [...new Set(groups.flatMap((group) => group.words))].filter(
    (synonym) => !variants.includes(synonym),
  )
  return {
    word,
    alts: variants,
    synonyms,
    soft: groups.length > 0 && groups.every((group) => group.soft),
  }
}

/** كلمات "ما" ← شروط (AND). عبارات المرادفات ("rumah sakit") تبقى كلمة واحدة. */
function termsFrom(words: readonly string[]): QueryTerm[] {
  const out: QueryTerm[] = []
  for (let i = 0; i < words.length; i++) {
    let taken = 1
    for (let size = Math.min(MAX_COMPOUND, words.length - i); size > 1; size--) {
      const phrase = words.slice(i, i + size).join(' ')
      if (WORD_INDEX.has(phrase)) {
        taken = size
        break
      }
    }
    const term = buildTerm(words.slice(i, i + taken).join(' '))
    if (term !== null) out.push(term)
    i += taken - 1
  }
  return out
}

/** شروط نص بلا منطقة ولا موقع — للاقتراحات (أي تصنيف يطابق "مطعم"؟). */
export function queryTerms(text: string): QueryTerm[] {
  return termsFrom(tokenize(text).map((token) => token.norm))
}

/** هل يطابق النص هذا الشرط؟ */
export function matchesTerm(haystack: string, term: QueryTerm): boolean {
  return (
    term.alts.some((alt) => containsAlt(haystack, alt)) ||
    term.synonyms.some((synonym) => containsAlt(haystack, synonym, true))
  )
}

/** هل يحقق النص كل الشروط؟ */
export function matchesTerms(haystack: string, terms: readonly QueryTerm[]): boolean {
  return terms.every((term) => matchesTerm(haystack, term))
}

/* --------------------------------------------------------------------------
   التقطيع و"X في Y"
   -------------------------------------------------------------------------- */

interface Token {
  /** كما كتبه المستخدم — لإعادة كتابة الحقل بلا المنطقة. */
  raw: string
  norm: string
}

const PUNCTUATION = /[.,!?؟،؛;:"'“”«»()[\]{}|/\\]+/g

function tokenize(input: string): Token[] {
  return input
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeSearch(raw).replace(PUNCTUATION, '') }))
    .filter((token) => token.norm !== '')
}

function matchAt(tokens: readonly Token[], start: number, phrase: readonly string[]): boolean {
  return phrase.every((word, offset) => tokens[start + offset]?.norm === word)
}

/** "Cafes in Kuta" / "كافيهات في كوتا" / "kafe di Kuta" ← [ما, أين] (نص مطبّع). */
export function splitPlacePhrase(needle: string): { what: string; where: string } | null {
  const tokens = tokenize(needle)
  const split = findSplit(tokens, new Set())
  if (split === null) return null
  const what = split.what.map((index) => tokens[index]?.norm ?? '').join(' ')
  const where = split.where.map((index) => tokens[index]?.norm ?? '').join(' ')
  return what.length >= 2 && where.length >= 2 ? { what, where } : null
}

/**
 * آخر كلمة فصل يتبعها شيء: "Made in Bali Cafe in Kuta" ← أين = Kuta.
 * يعيد فهارس الكلمات (لا نصوصاً) كي يُعاد بناء النص الأصلي بلا المنطقة.
 */
function findSplit(
  tokens: readonly Token[],
  removed: ReadonlySet<number>,
): { splitAt: number; what: number[]; where: number[] } | null {
  const live = tokens.map((_, index) => index).filter((index) => !removed.has(index))
  for (let at = live.length - 2; at >= 0; at--) {
    const index = live[at]
    if (index === undefined || !SPLIT_WORDS.has(tokens[index]?.norm ?? '')) continue
    const where = live
      .slice(at + 1)
      .filter(
        (one) =>
          !WHERE_FILLER.has(tokens[one]?.norm ?? '') && !SPLIT_WORDS.has(tokens[one]?.norm ?? ''),
      )
    if (where.length === 0) continue
    return { splitAt: index, what: live.slice(0, at), where }
  }
  return null
}

/* --------------------------------------------------------------------------
   المنطقة
   -------------------------------------------------------------------------- */

/** كل أسماء المنطقة مطبّعة: الاسم بالثلاث لغات والمفتاح. */
export function namesOf(key: string, label: LocalizedLike): string[] {
  const names = new Set<string>()
  for (const part of [key, key.replace(/[-_]+/g, ' '), ...Object.values(label ?? {})]) {
    if (typeof part !== 'string') continue
    const norm = normalizeSearch(part)
    if (norm !== '') names.add(norm)
  }
  return [...names]
}

const BALI = new Set(['bali', normalizeSearch('بالي')])

/**
 * نص "أين" ← مفتاح منطقة. مطابقة تامة أولاً ("كوتا"، "Seminyak"، "south")،
 * ثم بلا "بالي" ("Ubud Bali")، ثم بداية الاسم ("semin" ← Seminyak).
 * `areas` بترتيب لوحة التحكم، فالتعادل لصالح الأعلى.
 */
export function resolveArea(
  where: string,
  areas: SearchVocabulary['areas'],
  allowPrefix = true,
): string | null {
  const needle = normalizeSearch(where)
  if (needle === '') return null
  const named = areas.map((area) => ({ key: area.key, names: namesOf(area.key, area.label) }))
  const trimmed = needle
    .split(' ')
    .filter((word) => !BALI.has(word))
    .join(' ')
  for (const candidate of trimmed !== '' && trimmed !== needle ? [needle, trimmed] : [needle]) {
    const exact = named.find((area) => area.names.includes(candidate))
    if (exact) return exact.key
  }
  if (!allowPrefix || trimmed.length < 3) return null
  return named.find((area) => area.names.some((name) => name.startsWith(trimmed)))?.key ?? null
}

/* --------------------------------------------------------------------------
   الجملة كاملة
   -------------------------------------------------------------------------- */

export interface UnderstoodQuery {
  /** "near me"، "قريب مني"، "terdekat"… ← اطلب الموقع ورتّب بالأقرب. */
  nearMe: boolean
  /** منطقة سمّتها الجملة ("في كوتا")، تُطبَّق كفلتر المنطقة. */
  areaKey: string | null
  /** شروط "ما" — كلها مطلوبة. فارغة = لا نص يُرشَّح به. */
  terms: QueryTerm[]
  /** النص كما كُتب بلا المنطقة — عند اختيار منطقة أخرى من القائمة. */
  withoutArea: string
}

export const EMPTY_QUERY: UnderstoodQuery = {
  nearMe: false,
  areaKey: null,
  terms: [],
  withoutArea: '',
}

/** اسم منطقة تام (لا بدايته) في آخر الكلمات أو أولها — حتى ثلاث كلمات ("Nusa Dua"). */
function bareArea(
  tokens: readonly Token[],
  indexes: readonly number[],
  areas: SearchVocabulary['areas'],
): { key: string; used: number[] } | null {
  for (let size = Math.min(MAX_COMPOUND, indexes.length); size >= 1; size--) {
    for (const slice of [indexes.slice(-size), indexes.slice(0, size)]) {
      const key = resolveArea(
        slice.map((index) => tokens[index]?.norm ?? '').join(' '),
        areas,
        false,
      )
      if (key !== null) return { key, used: slice }
    }
  }
  return null
}

export function understandQuery(input: string, vocabulary: SearchVocabulary): UnderstoodQuery {
  const tokens = tokenize(input.slice(0, 80))
  if (tokens.length === 0) return { ...EMPTY_QUERY, withoutArea: input }

  // 1. "قريب مني" — يُزال من النص، ومعه كلمة فصل قبله ("kafe di dekat saya").
  const removed = new Set<number>()
  let nearMe = false
  for (let i = 0; i < tokens.length; i++) {
    const phrase = NEAR_ME.find((candidate) => matchAt(tokens, i, candidate))
    if (phrase === undefined) continue
    nearMe = true
    for (let k = 0; k < phrase.length; k++) removed.add(i + k)
    if (i > 0 && SPLIT_WORDS.has(tokens[i - 1]?.norm ?? '')) removed.add(i - 1)
    i += phrase.length - 1
  }

  // 2. "X في Y": المنطقة من Y إن عُرفت؛ وإلا فـ Y كلمات بحث عادية.
  const areaIndexes = new Set<number>()
  let areaKey: string | null = null
  let whatIndexes = tokens.map((_, index) => index).filter((index) => !removed.has(index))
  const split = findSplit(tokens, removed)
  if (split !== null) {
    const where = split.where.map((index) => tokens[index]?.norm ?? '').join(' ')
    areaKey = resolveArea(where, vocabulary.areas)
    if (areaKey !== null) {
      areaIndexes.add(split.splitAt)
      for (let index = split.splitAt + 1; index < tokens.length; index++) {
        if (!removed.has(index)) areaIndexes.add(index)
      }
      whatIndexes = split.what
    } else {
      whatIndexes = whatIndexes.filter((index) => index !== split.splitAt)
    }
  }

  // 3. بلا "في": اسم منطقة كامل في آخر الجملة أو أولها ("cafes kuta"، "Ubud").
  if (areaKey === null) {
    const bare = bareArea(tokens, whatIndexes, vocabulary.areas)
    if (bare !== null) {
      areaKey = bare.key
      for (const index of bare.used) areaIndexes.add(index)
      whatIndexes = whatIndexes.filter((index) => !areaIndexes.has(index))
    }
  }

  // 4. كلمات "ما" ← شروط. الناعمة تُسقط إن لم يعرفها التصنيف وبقي غيرها.
  let terms = termsFrom(whatIndexes.map((index) => tokens[index]?.norm ?? ''))
  if (terms.some((term) => !term.soft)) {
    terms = terms.filter((term) => !term.soft || matchesTerm(vocabulary.taxonomyText, term))
  }

  return {
    nearMe,
    areaKey,
    terms,
    withoutArea: tokens
      .filter((_, index) => !areaIndexes.has(index))
      .map((token) => token.raw)
      .join(' '),
  }
}

/* --------------------------------------------------------------------------
   نص المكان
   -------------------------------------------------------------------------- */

export interface HaystackSource {
  slug: string
  name: LocalizedLike
  category?: LocalizedLike
  description?: LocalizedLike
  categoryKey?: string | null
  categoryLabel?: LocalizedLike
  subCategories?: readonly { key: string; label?: LocalizedLike }[]
  tags?: readonly { key: string; label: LocalizedLike }[]
  regionKey?: string | null
  regionLabel?: LocalizedLike
  parentRegionKey?: string | null
  parentRegionLabel?: LocalizedLike
}

/**
 * نص البحث لمكان مرئي: الاسم، الوصف، التصنيف (مفتاحاً واسماً)، التصنيفات
 * الفرعية، الوسوم، والمنطقة — بالثلاث لغات، مطبّعاً. نفس الدالة في المتصفح
 * والخادم، فلا تختلف نتيجة الخريطة عن نتيجة `/api/places/search`.
 */
export function placeHaystack(source: HaystackSource): string {
  return normalizeSearch(
    [
      allText(source.name),
      source.slug.replace(/-+/g, ' '),
      allText(source.category),
      keyText(source.categoryKey),
      allText(source.categoryLabel),
      ...(source.subCategories ?? []).map((sub) => `${keyText(sub.key)} ${allText(sub.label)}`),
      ...(source.tags ?? []).map((tag) => `${keyText(tag.key)} ${allText(tag.label)}`),
      keyText(source.regionKey),
      allText(source.regionLabel),
      keyText(source.parentRegionKey),
      allText(source.parentRegionLabel),
      allText(source.description),
    ].join(' '),
  )
}

/* --------------------------------------------------------------------------
   الترتيب (الوثيقة 8.6)
   -------------------------------------------------------------------------- */

export interface RankFields {
  /** null إن لم يُعرف موقع المستخدم. */
  distanceKm: number | null
  /** داخل المنطقة المختارة أو المذكورة في الجملة. */
  inRegion: boolean
  /** أولوية الإدارة (الأعلى أولاً). */
  priority: number
  /** الترتيب اليدوي (الأقل أولاً). */
  sortOrder: number
  /** مكان VIP لمستخدم يملك VIP — يتقدم على غيره. false دائماً لغير المشتركين. */
  vip: boolean
  /** حفظ (مفضلة + رحلتي) + مشاهدات. */
  popularity: number
  name: string
}

/**
 * 1. الأقرب (إن كان الموقع مفعّلاً) 2. داخل المنطقة 3. أولوية الإدارة ثم
 * الترتيب اليدوي 4. VIP أولاً لمشترك VIP 5. الأكثر مشاهدة وحفظاً.
 */
export function compareHits(a: RankFields, b: RankFields): number {
  if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
    return a.distanceKm - b.distanceKm
  }
  if (a.inRegion !== b.inRegion) return a.inRegion ? -1 : 1
  if (a.priority !== b.priority) return b.priority - a.priority
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  if (a.vip !== b.vip) return a.vip ? -1 : 1
  if (a.popularity !== b.popularity) return b.popularity - a.popularity
  return a.name.localeCompare(b.name)
}

/* --------------------------------------------------------------------------
   الاقتراحات
   -------------------------------------------------------------------------- */

/**
 * قرب نص من أسماء: 0 تطابق، 1 يبدأ به، 2 كلمة تبدأ به، 3 يحتويه، -1 لا.
 * حرفان فقط ("ku"، "كو") لا يكفيان لـ 3 — وإلا طابق "an" نصف الجزيرة.
 */
export function textRank(names: readonly string[], needle: string): number {
  let best = -1
  for (const name of names) {
    let rank = -1
    if (name === needle) rank = 0
    else if (name.startsWith(needle)) rank = 1
    else if (name.split(' ').some((word) => wordVariants(word).some((v) => v.startsWith(needle))))
      rank = 2
    else if (needle.length >= 3 && name.includes(needle)) rank = 3
    if (rank >= 0 && (best < 0 || rank < best)) best = rank
  }
  return best
}
