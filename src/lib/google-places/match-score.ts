/**
 * Matching our map places to Google places: name normalisation and scoring.
 *
 * Pure (no I/O) so it is unit-tested on its own. Names come in English,
 * Arabic and Indonesian, and Google's `displayName` is usually the local
 * (Indonesian/English) name, so normalisation folds the generic words of all
 * three languages ("Pantai", "Beach", "شاطئ") onto one token before comparing.
 */

import { haversineMeters } from '@/lib/map/distance'

// Arabic: harakat, Quranic marks, superscript alef, tatweel.
const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g
const LATIN_MARKS = /[̀-ͯ]/g

/** Multi-word generic phrases, folded before tokenising. */
const PHRASES: [RegExp, string][] = [
  [/\bair terjun\b/g, ' waterfall '],
  [/\bwater ?fall(s)?\b/g, ' waterfall '],
  [/\bcoffee shop\b/g, ' cafe '],
  [/\brice terrace(s)?\b/g, ' riceterrace '],
  [/\bsawah\b/g, ' riceterrace '],
  [/\brumah sakit\b/g, ' hospital '],
  [/\brumah makan\b/g, ' restaurant '],
  [/(^|\s)مدرجات الارز(?=\s|$)/g, '$1 riceterrace '],
]

/** Single generic words in en / id / ar → one canonical token. */
const SYNONYMS: Record<string, string> = {
  beach: 'beach',
  pantai: 'beach',
  شاطي: 'beach',
  شاطئ: 'beach',
  temple: 'temple',
  pura: 'temple',
  معبد: 'temple',
  waterfall: 'waterfall',
  شلال: 'waterfall',
  شلالات: 'waterfall',
  restaurant: 'restaurant',
  restoran: 'restaurant',
  مطعم: 'restaurant',
  cafe: 'cafe',
  café: 'cafe',
  kafe: 'cafe',
  coffee: 'cafe',
  kopi: 'cafe',
  مقهي: 'cafe',
  كافيه: 'cafe',
  كافي: 'cafe',
  market: 'market',
  pasar: 'market',
  سوق: 'market',
  lake: 'lake',
  danau: 'lake',
  بحيره: 'lake',
  mount: 'mountain',
  mountain: 'mountain',
  gunung: 'mountain',
  جبل: 'mountain',
  island: 'island',
  pulau: 'island',
  nusa: 'island',
  جزيره: 'island',
  forest: 'forest',
  hutan: 'forest',
  غابه: 'forest',
  village: 'village',
  desa: 'village',
  قريه: 'village',
  palace: 'palace',
  puri: 'palace',
  قصر: 'palace',
  hospital: 'hospital',
  مستشفي: 'hospital',
  mall: 'mall',
  مول: 'mall',
  spa: 'spa',
  سبا: 'spa',
}

/** Words that carry no identity here. */
const STOPWORDS = new Set([
  'the',
  'of',
  'and',
  'at',
  'in',
  'a',
  'bali',
  'di',
  'dan',
  'ke',
  'yang',
  'بالي',
  'في',
  'و',
  'من',
])

/** Arabic letter variants folded onto one form; `ال` dropped from words. */
function foldArabic(text: string): string {
  return text
    .replace(AR_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
}

/** Lower-case tokens with accents, punctuation and generic words folded. */
export function nameTokens(input: string | null | undefined): string[] {
  if (!input) return []
  let text = foldArabic(input.normalize('NFKC').toLowerCase())
  text = text.normalize('NFKD').replace(LATIN_MARKS, '').normalize('NFC')
  text = text.replace(/&/g, ' and ').replace(/['’`]/g, '')
  for (const [pattern, to] of PHRASES) text = text.replace(pattern, to)
  text = text.replace(/[^\p{L}\p{N}]+/gu, ' ')
  const out: string[] = []
  for (let token of text.split(' ')) {
    if (token === '') continue
    // Arabic definite article: «الشاطئ» → «شاطئ» (kept for short words).
    if (/^ال[؀-ۿ]{2,}$/.test(token)) token = token.slice(2)
    if (/^وال[؀-ۿ]{2,}$/.test(token)) token = token.slice(3)
    if (STOPWORDS.has(token)) continue
    out.push(SYNONYMS[token] ?? token)
  }
  return out
}

export function normalizeName(input: string | null | undefined): string {
  return nameTokens(input).join(' ')
}

function bigrams(text: string): string[] {
  const s = text.replace(/\s+/g, '')
  if (s.length < 2) return s === '' ? [] : [s]
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2))
  return out
}

function dice(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const counts = new Map<string, number>()
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1)
  let hits = 0
  for (const x of b) {
    const n = counts.get(x) ?? 0
    if (n > 0) {
      hits += 1
      counts.set(x, n - 1)
    }
  }
  return (2 * hits) / (a.length + b.length)
}

/**
 * 0..1. The best of: token overlap, character-bigram overlap, and token
 * containment (our «Tegenungan» inside Google's «Tegenungan Waterfall»).
 * Generic words alone never make a match: two names that share only
 * «beach» score low.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const generic = new Set(Object.values(SYNONYMS))
  const ca = ta.filter((t) => !generic.has(t))
  const cb = tb.filter((t) => !generic.has(t))
  if (ta.join(' ') === tb.join(' ')) return 1
  // Only generic words on one side: compare whole names, capped.
  if (ca.length === 0 || cb.length === 0)
    return Math.min(0.5, dice(bigrams(ta.join(' ')), bigrams(tb.join(' '))))

  const tokenScore = dice(ca, cb)
  const charScore = dice(bigrams(ca.join(' ')), bigrams(cb.join(' ')))
  const setA = new Set(ca)
  const setB = new Set(cb)
  const contained = ca.every((t) => setB.has(t)) || cb.every((t) => setA.has(t))
  const containment = contained ? 0.9 : 0
  return Math.max(tokenScore, charScore, containment)
}

/** 1 within 50 m, falling linearly to 0 at 1.5 km. */
export function distanceScore(meters: number): number {
  if (!Number.isFinite(meters)) return 0
  if (meters <= 50) return 1
  if (meters >= 1500) return 0
  return 1 - (meters - 50) / 1450
}

/** Our map category keys → Google place types that fit them. */
const CATEGORY_TYPES: Record<string, readonly string[]> = {
  restaurants: [
    'restaurant',
    'food',
    'meal_takeaway',
    'bar',
    'cafe',
    'bakery',
    'indonesian_restaurant',
    'seafood_restaurant',
  ],
  cafes: ['cafe', 'coffee_shop', 'bakery', 'restaurant', 'food', 'tea_house'],
  beaches: ['beach', 'natural_feature', 'tourist_attraction', 'park'],
  malls: ['shopping_mall', 'store', 'department_store', 'market', 'clothing_store'],
  hospital: ['hospital', 'doctor', 'health', 'medical_clinic', 'pharmacy'],
  hospitals: ['hospital', 'doctor', 'health', 'medical_clinic', 'pharmacy'],
  sights: [
    'tourist_attraction',
    'point_of_interest',
    'hindu_temple',
    'place_of_worship',
    'museum',
    'park',
    'natural_feature',
    'historical_landmark',
    'cultural_landmark',
  ],
  spa: ['spa', 'beauty_salon', 'wellness_center', 'massage'],
  waterfalls: ['natural_feature', 'tourist_attraction', 'park', 'hiking_area'],
}

/**
 * 1 when a Google type fits our category, 0.2 when none does, 0.5 when we
 * cannot tell (no category, or Google returned no types).
 */
export function typeScore(
  categoryKey: string | null | undefined,
  types: readonly string[] | null | undefined,
): number {
  const wanted = categoryKey ? CATEGORY_TYPES[categoryKey] : undefined
  if (!wanted || !types || types.length === 0) return 0.5
  return types.some((type) => wanted.includes(type)) ? 1 : 0.2
}

export interface OurPlace {
  names: readonly string[]
  lat: number
  lon: number
  categoryKey: string | null
}

export interface Candidate {
  id: string
  name: string
  lat: number
  lon: number
  types: readonly string[]
}

export interface ScoredCandidate extends Candidate {
  score: number
  nameScore: number
  distanceM: number
  typeScore: number
}

export const AUTO_MAX_DISTANCE_M = 150
export const AUTO_MIN_NAME = 0.8
export const AUTO_MIN_SCORE = 0.8
export const REVIEW_MIN_SCORE = 0.45

export function scoreCandidate(place: OurPlace, candidate: Candidate): ScoredCandidate {
  const nameScore = Math.max(0, ...place.names.map((name) => nameSimilarity(name, candidate.name)))
  const distanceM = haversineMeters(
    { lat: place.lat, lon: place.lon },
    { lat: candidate.lat, lon: candidate.lon },
  )
  const t = typeScore(place.categoryKey, candidate.types)
  const score = 0.55 * nameScore + 0.3 * distanceScore(distanceM) + 0.15 * t
  return {
    ...candidate,
    score: Math.round(score * 1000) / 1000,
    nameScore,
    distanceM,
    typeScore: t,
  }
}

export type MatchDecision =
  | { status: 'auto'; best: ScoredCandidate }
  | { status: 'review'; best: ScoredCandidate }
  | { status: 'none'; best: ScoredCandidate | null }

/**
 * Auto-accept only a close (≤150 m), well-named, type-compatible candidate
 * that clearly beats the runner-up; anything plausible goes to review; the
 * rest is «no match».
 */
export function decideMatch(place: OurPlace, candidates: readonly Candidate[]): MatchDecision {
  const scored = candidates.map((c) => scoreCandidate(place, c)).sort((a, b) => b.score - a.score)
  const best = scored[0] ?? null
  if (best === null) return { status: 'none', best: null }
  const runnerUp = scored[1]
  const clear =
    runnerUp === undefined ||
    best.score - runnerUp.score >= 0.05 ||
    runnerUp.nameScore < AUTO_MIN_NAME
  if (
    best.distanceM <= AUTO_MAX_DISTANCE_M &&
    best.nameScore >= AUTO_MIN_NAME &&
    best.typeScore >= 0.5 &&
    best.score >= AUTO_MIN_SCORE &&
    clear
  ) {
    return { status: 'auto', best }
  }
  if (best.score >= REVIEW_MIN_SCORE || best.nameScore >= 0.6) return { status: 'review', best }
  return { status: 'none', best }
}

/** «<name> <area> Bali», without repeating «Bali». */
export function searchQuery(name: string, area: string | null): string {
  const parts = [name, area ?? ''].map((part) => part.trim()).filter(Boolean)
  const text = parts.join(' ')
  return /\bbali\b/i.test(text) ? text : `${text} Bali`
}
