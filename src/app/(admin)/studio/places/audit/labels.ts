/**
 * «تدقيق الأماكن» labels in the three content languages. The Studio chrome
 * speaks ar/en only; this page (and its CSV) also speaks Indonesian via
 * `?lang=id`, for the team in Bali.
 */

import type { IssueKind } from '@/lib/places-audit/run'

export const AUDIT_LANGS = ['ar', 'en', 'id'] as const
export type AuditLang = (typeof AUDIT_LANGS)[number]

export function auditLang(value: unknown, fallback: 'ar' | 'en'): AuditLang {
  return value === 'ar' || value === 'en' || value === 'id' ? value : fallback
}

type Dict = Record<string, string>

const en: Dict = {
  title: 'Places audit',
  desc: 'Read-only check of every map place (VIP included) for shared photos, duplicate places and data gaps. Nothing is changed here: open a place to fix it, or archive a duplicate from its editor.',
  export: 'Export CSV',
  hash_run: 'Compare photo contents',
  hash_on: 'Photo contents compared ({n} files hashed, {failed} unreadable).',
  hash_off:
    'Photos are compared by file. «Compare photo contents» also hashes the 320px image of each photo to catch re-uploads and near-identical pictures.',
  summary: 'Summary',
  scanned: '{n} places scanned (published, draft and hidden; archived excluded).',
  none: 'Nothing found.',
  more: 'and {n} more — see the CSV',
  group: 'Group',
  place: 'Place',
  status: 'Status',
  detail: 'Detail',
  category: 'Category',
  link: 'Studio link',
  issue: 'Issue',
  lang: 'Language',
  'i.photo_shared_file': 'Same photo file on several places',
  'i.photo_shared_content': 'Identical photo bytes on several places',
  'i.photo_similar': 'Near-identical photos on several places',
  'i.photo_repeated_in_place': 'Photo repeated inside one place',
  'i.dup_name': 'Same name (any language)',
  'i.dup_near': 'Same category within 75 m',
  'i.dup_source_id': 'Same source id',
  'i.placeholder_slug': 'Placeholder slug (place-N)',
  'i.missing_name_ar': 'Missing Arabic name',
  'i.missing_name_en': 'Missing English name',
  'i.missing_name_id': 'Missing Indonesian name',
  'i.no_hero': 'No main photo',
  'i.empty_gallery': 'Empty gallery',
  'i.outside_bali': 'Coordinates outside Bali',
  'i.bad_coordinates': 'Invalid coordinates',
}

const ar: Dict = {
  title: 'تدقيق الأماكن',
  desc: 'فحص للقراءة فقط لكل أماكن الخريطة (ومنها VIP): صور مشتركة، أماكن مكررة ونواقص في البيانات. لا يُغيَّر شيء هنا: افتح المكان لإصلاحه أو أرشف المكرر من محرره.',
  export: 'تصدير CSV',
  hash_run: 'مقارنة محتوى الصور',
  hash_on: 'تمت مقارنة محتوى الصور ({n} ملف، {failed} تعذرت قراءته).',
  hash_off:
    'الصور تُقارن حالياً بالملف. «مقارنة محتوى الصور» تحسب بصمة صورة 320px لكل صورة لكشف إعادة الرفع والصور شبه المتطابقة.',
  summary: 'الملخص',
  scanned: 'تم فحص {n} مكاناً (منشور ومسودة ومخفي؛ دون المؤرشف).',
  none: 'لا شيء.',
  more: 'و{n} أخرى — راجع ملف CSV',
  group: 'المجموعة',
  place: 'المكان',
  status: 'الحالة',
  detail: 'التفاصيل',
  category: 'التصنيف',
  link: 'رابط الاستوديو',
  issue: 'المشكلة',
  lang: 'اللغة',
  'i.photo_shared_file': 'نفس ملف الصورة في أكثر من مكان',
  'i.photo_shared_content': 'صورة متطابقة البايتات في أكثر من مكان',
  'i.photo_similar': 'صور شبه متطابقة في أكثر من مكان',
  'i.photo_repeated_in_place': 'صورة مكررة داخل المكان نفسه',
  'i.dup_name': 'الاسم نفسه (بأي لغة)',
  'i.dup_near': 'نفس التصنيف وعلى بعد أقل من 75 م',
  'i.dup_source_id': 'نفس معرّف المصدر',
  'i.placeholder_slug': 'رابط مؤقت (place-N)',
  'i.missing_name_ar': 'الاسم العربي ناقص',
  'i.missing_name_en': 'الاسم الإنجليزي ناقص',
  'i.missing_name_id': 'الاسم الإندونيسي ناقص',
  'i.no_hero': 'بلا صورة رئيسية',
  'i.empty_gallery': 'معرض الصور فارغ',
  'i.outside_bali': 'إحداثيات خارج بالي',
  'i.bad_coordinates': 'إحداثيات غير صالحة',
}

const id: Dict = {
  title: 'Audit tempat',
  desc: 'Pemeriksaan baca-saja untuk semua tempat di peta (termasuk VIP): foto yang dipakai bersama, tempat ganda, dan data yang kurang. Tidak ada yang diubah di sini: buka tempat untuk memperbaikinya, atau arsipkan duplikat dari editornya.',
  export: 'Ekspor CSV',
  hash_run: 'Bandingkan isi foto',
  hash_on: 'Isi foto dibandingkan ({n} file di-hash, {failed} tidak terbaca).',
  hash_off:
    'Foto dibandingkan per file. «Bandingkan isi foto» juga menghitung hash gambar 320px tiap foto untuk menemukan unggahan ulang dan foto yang hampir sama.',
  summary: 'Ringkasan',
  scanned: '{n} tempat diperiksa (terbit, draf, dan tersembunyi; tanpa yang diarsipkan).',
  none: 'Tidak ada temuan.',
  more: 'dan {n} lagi — lihat CSV',
  group: 'Grup',
  place: 'Tempat',
  status: 'Status',
  detail: 'Detail',
  category: 'Kategori',
  link: 'Tautan Studio',
  issue: 'Masalah',
  lang: 'Bahasa',
  'i.photo_shared_file': 'File foto yang sama di beberapa tempat',
  'i.photo_shared_content': 'Foto identik di beberapa tempat',
  'i.photo_similar': 'Foto hampir sama di beberapa tempat',
  'i.photo_repeated_in_place': 'Foto berulang dalam satu tempat',
  'i.dup_name': 'Nama sama (bahasa apa pun)',
  'i.dup_near': 'Kategori sama dalam 75 m',
  'i.dup_source_id': 'ID sumber sama',
  'i.placeholder_slug': 'Slug sementara (place-N)',
  'i.missing_name_ar': 'Nama Arab kosong',
  'i.missing_name_en': 'Nama Inggris kosong',
  'i.missing_name_id': 'Nama Indonesia kosong',
  'i.no_hero': 'Tanpa foto utama',
  'i.empty_gallery': 'Galeri kosong',
  'i.outside_bali': 'Koordinat di luar Bali',
  'i.bad_coordinates': 'Koordinat tidak valid',
}

export const AUDIT_LABELS: Record<AuditLang, Dict> = { en, ar, id }

export function auditT(lang: AuditLang) {
  return (key: string, vars?: Record<string, string | number>) => {
    const template = AUDIT_LABELS[lang][key] ?? en[key] ?? key
    return template.replace(/\{(\w+)\}/g, (m, k: string) =>
      vars && k in vars ? String(vars[k]) : m,
    )
  }
}

export function issueLabel(lang: AuditLang, issue: IssueKind): string {
  return auditT(lang)(`i.${issue}`)
}
