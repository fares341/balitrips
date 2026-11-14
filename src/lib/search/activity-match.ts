/**
 * Matching for the activities list search box (pure, no I/O).
 *
 * Arabic visitors type what they hear: «رافتنج» for rafting, «سفارى» with a
 * final ى, «جيت سكي». A literal substring test answered «no activities» for
 * all of them. The text and the query are folded the same way (letter
 * variants, diacritics, case), and a few groups of words that mean the same
 * activity match each other.
 */

const MARKS = /[ً-ٰٟـ]/g
const ARABIC_DIGITS = /[٠-٩۰-۹]/g

/** Lower case, Arabic letter variants as one letter, no diacritics, single spaces. */
export function foldSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(MARKS, '')
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Words for the same activity, in the spellings people type. */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['رافتنج', 'رافتينج', 'رافتنغ', 'رافتينغ', 'تجديف', 'rafting', 'arung jeram'],
  ['سفاري', 'سافاري', 'safari'],
  ['دباب', 'دبابات', 'كواد', 'atv', 'quad'],
  ['باجي', 'بقي', 'buggy'],
  ['غوص', 'دايفنج', 'دايفينج', 'diving', 'dive', 'menyelam'],
  [
    'سنوركل',
    'سنوركلينج',
    'سنوركلنج',
    'الغطس السطحي',
    'غطس',
    'snorkeling',
    'snorkelling',
    'snorkel',
  ],
  ['جت سكي', 'جيت سكي', 'جتسكي', 'دراجه مائيه', 'jet ski', 'jetski'],
  ['باراشوت', 'مظله', 'باراسيلنج', 'parasailing', 'parasail'],
  ['منطاد', 'بالون', 'balloon', 'balon'],
  ['هليكوبتر', 'هيلوكوبتر', 'مروحيه', 'helicopter', 'helikopter'],
  ['حديقه حيوان', 'حديقه الحيوان', 'زو', 'zoo', 'kebun binatang'],
  ['خيل', 'خيول', 'حصان', 'horse', 'kuda'],
  ['شلال', 'شلالات', 'waterfall', 'air terjun'],
  ['معبد', 'معابد', 'temple', 'pura'],
  ['بينتبول', 'بنتبول', 'paintball'],
  ['جولف', 'قولف', 'غولف', 'golf'],
  ['طيران شراعي', 'باراجلايدنج', 'باراغلايدنغ', 'paragliding'],
  ['ارجوحه', 'مرجيحه', 'swing', 'ayunan'],
].map((group) => group.map(foldSearch))

/** `haystack` (already folded) answers the visitor's query. */
export function matchesQuery(haystack: string, query: string): boolean {
  const needle = foldSearch(query)
  if (needle === '') return true
  if (haystack.includes(needle)) return true
  // Every word of the query somewhere in the text («رافتنج أوبود»).
  const words = needle.split(' ').filter((word) => word.length > 1)
  if (words.length > 1 && words.every((word) => haystack.includes(word))) return true
  for (const group of SYNONYM_GROUPS) {
    if (!group.some((term) => needle.includes(term))) continue
    if (group.some((term) => haystack.includes(term))) return true
  }
  return false
}
