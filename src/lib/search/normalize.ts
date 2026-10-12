/**
 * تطبيع نص البحث — بلا استيرادات، يعمل في المتصفح والخادم.
 *
 * أحرف صغيرة، بلا تشكيل، أ/إ/آ/ٱ ← ا، ة ← ه، ى ← ي، بلا تطويل.
 * نسخة SQL المطابقة في `./places.ts` (`normSql`) — يجب أن تبقيا متطابقتين.
 */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
