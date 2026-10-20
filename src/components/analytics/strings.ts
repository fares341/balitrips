/**
 * Consent banner copy, in the three site languages.
 *
 * Kept beside the banner rather than in messages/*.json so the tracking
 * layer is one self-contained folder. Plain words: what each group does,
 * nothing a visitor has to look up.
 */

export type ConsentLocale = 'ar' | 'en' | 'id'

export interface ConsentStrings {
  title: string
  body: string
  acceptAll: string
  necessaryOnly: string
  customize: string
  save: string
  necessary: string
  necessaryHint: string
  analytics: string
  analyticsHint: string
  marketing: string
  marketingHint: string
  policy: string
  alwaysOn: string
  manage: string
}

export const CONSENT_STRINGS: Record<ConsentLocale, ConsentStrings> = {
  ar: {
    title: 'ملفات تعريف الارتباط',
    body: 'نستخدم ملفات ضرورية لتشغيل الموقع. بموافقتك نستخدم أيضاً ملفات لفهم كيف يُستخدم الموقع، وأخرى للإعلانات. يمكنك تغيير اختيارك في أي وقت.',
    acceptAll: 'قبول الكل',
    necessaryOnly: 'الضرورية فقط',
    customize: 'اختيار ما أوافق عليه',
    save: 'حفظ اختياري',
    necessary: 'ضرورية',
    necessaryHint: 'تسجيل الدخول، السلة، اللغة، وحفظ هذا الاختيار. لا يعمل الموقع بدونها.',
    analytics: 'الإحصاءات',
    analyticsHint:
      'إحصاءات مجهولة عن الصفحات والنقرات لتحسين الموقع (منها Google Analytics). لا نسجّل موقعك الجغرافي.',
    marketing: 'التسويق',
    marketingHint:
      'أدوات الإعلانات (Meta وTikTok وGoogle) لقياس الحملات، وتذكير بسلة لم تكتمل إن كنت مسجّلاً.',
    policy: 'سياسة ملفات تعريف الارتباط',
    alwaysOn: 'تعمل دائماً',
    manage: 'إعدادات ملفات تعريف الارتباط',
  },
  en: {
    title: 'Cookies',
    body: 'We use necessary cookies to run the site. With your permission we also use cookies to understand how the site is used, and others for advertising. You can change your choice at any time.',
    acceptAll: 'Accept all',
    necessaryOnly: 'Necessary only',
    customize: 'Let me choose',
    save: 'Save my choice',
    necessary: 'Necessary',
    necessaryHint:
      'Sign-in, your trip, language, and remembering this choice. The site needs them.',
    analytics: 'Statistics',
    analyticsHint:
      'Anonymous statistics about pages and clicks to improve the site (including Google Analytics). We never record your location.',
    marketing: 'Marketing',
    marketingHint:
      'Advertising tools (Meta, TikTok, Google) to measure campaigns, and a reminder about an unfinished trip if you are signed in.',
    policy: 'Cookie policy',
    alwaysOn: 'Always on',
    manage: 'Cookie settings',
  },
  id: {
    title: 'Cookie',
    body: 'Kami memakai cookie yang diperlukan untuk menjalankan situs. Dengan izin Anda, kami juga memakai cookie untuk memahami cara situs digunakan, dan cookie lain untuk iklan. Anda bisa mengubah pilihan kapan saja.',
    acceptAll: 'Terima semua',
    necessaryOnly: 'Hanya yang diperlukan',
    customize: 'Saya pilih sendiri',
    save: 'Simpan pilihan',
    necessary: 'Diperlukan',
    necessaryHint:
      'Masuk akun, perjalanan Anda, bahasa, dan menyimpan pilihan ini. Situs membutuhkannya.',
    analytics: 'Statistik',
    analyticsHint:
      'Statistik anonim tentang halaman dan klik untuk memperbaiki situs (termasuk Google Analytics). Kami tidak pernah mencatat lokasi Anda.',
    marketing: 'Pemasaran',
    marketingHint:
      'Alat iklan (Meta, TikTok, Google) untuk mengukur kampanye, dan pengingat perjalanan yang belum selesai jika Anda masuk akun.',
    policy: 'Kebijakan cookie',
    alwaysOn: 'Selalu aktif',
    manage: 'Pengaturan cookie',
  },
}

export function consentStrings(locale: string): ConsentStrings {
  return CONSENT_STRINGS[(locale === 'ar' || locale === 'id' ? locale : 'en') as ConsentLocale]
}
