/**
 * تطبيع نص البحث — بلا استيرادات، يعمل في المتصفح والخادم.
 *
 * أحرف صغيرة، بلا تشكيل، أ/إ/آ/ٱ ← ا، ة ← ه، ى ← ي، بلا تطويل،
 * وبلا علامات الحروف اللاتينية (café ← cafe) كي تطابق "Cafes" تصنيف "Cafés".
 * نسخة SQL المطابقة في `./places.ts` (`normSql`) — يجب أن تبقيا متطابقتين.
 */
export function normalizeSearch(value: string): string {
  return (
    value
      .toLowerCase()
      // اللاتينية الموسّعة فقط: تفكيك NFD على العربية كان سيحوّل ؤ/ئ أيضاً،
      // وهذا ما لا تفعله نسخة SQL.
      .replace(/[À-ɏ]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''))
      .replace(/[ً-ٰٟ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ـ/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
