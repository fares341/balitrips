/**
 * Content templates per activity type (client spec v2, «Advanced 8»).
 *
 * A template only pre-fills lists that are still EMPTY on the activity —
 * what to bring, important notes, ages & conditions, suitable for, FAQ — and
 * marks the activity «needs review», which blocks publishing until someone
 * checks the texts. They are generic starting points, never facts about a
 * specific activity: no prices, times, places or promises (no free
 * cancellation, no included meals).
 */

import type { Localized } from '@/db/schema/_shared'

export const TEMPLATE_KEYS = ['adventure', 'sea', 'nature', 'family', 'private', 'photo'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

export interface ActivityTemplate {
  whatToBring: Localized[]
  importantNotes: Localized[]
  ageConditions: Localized[]
  suitableFor: Localized[]
  faq: { q: Localized; a: Localized }[]
}

const L = (ar: string, en: string, id: string): Localized => ({ ar, en, id })

const COMMON_FAQ = [
  {
    q: L(
      'هل يمكنني تعديل موعد الحجز؟',
      'Can I change my booking date?',
      'Bisakah saya mengubah tanggal?',
    ),
    a: L(
      'تواصل معنا وسنراجع الإتاحة لدى الجهة المشغلة. تُطبق سياسة الإلغاء والتعديل الموضحة في الصفحة.',
      'Contact us and we will check availability with the operator. The cancellation and change policy on this page applies.',
      'Hubungi kami dan kami akan memeriksa ketersediaan dengan operator. Kebijakan pembatalan dan perubahan di halaman ini berlaku.',
    ),
  },
]

export const ACTIVITY_TEMPLATES: Record<TemplateKey, ActivityTemplate> = {
  adventure: {
    whatToBring: [
      L('ملابس رياضية مريحة', 'Comfortable sportswear', 'Pakaian olahraga yang nyaman'),
      L('حذاء رياضي مغلق', 'Closed sports shoes', 'Sepatu olahraga tertutup'),
      L('مياه للشرب', 'Drinking water', 'Air minum'),
      L('واقي شمس', 'Sunscreen', 'Tabir surya'),
    ],
    importantNotes: [
      L(
        'يُرجى الحضور قبل الموعد بوقت كافٍ',
        'Please arrive in good time',
        'Harap datang tepat waktu',
      ),
      L(
        'النشاط قد يتأثر بالطقس',
        'The activity may depend on the weather',
        'Aktivitas dapat bergantung pada cuaca',
      ),
      L(
        'اتبع تعليمات المرشد والسلامة',
        'Follow the guide’s safety instructions',
        'Ikuti instruksi keselamatan pemandu',
      ),
    ],
    ageConditions: [
      L(
        'قد لا يناسب بعض الحالات الصحية',
        'May not suit some health conditions',
        'Mungkin tidak cocok untuk kondisi kesehatan tertentu',
      ),
      L('الأطفال برفقة شخص بالغ', 'Children with an adult', 'Anak-anak didampingi orang dewasa'),
    ],
    suitableFor: [
      L('محبو المغامرة', 'Adventure lovers', 'Pecinta petualangan'),
      L('مجموعات الأصدقاء', 'Groups of friends', 'Grup teman'),
    ],
    faq: COMMON_FAQ,
  },
  sea: {
    whatToBring: [
      L('ملابس سباحة', 'Swimwear', 'Pakaian renang'),
      L('منشفة', 'Towel', 'Handuk'),
      L('واقي شمس صديق للشعاب', 'Reef-safe sunscreen', 'Tabir surya ramah terumbu'),
      L('ملابس بديلة', 'A change of clothes', 'Pakaian ganti'),
    ],
    importantNotes: [
      L(
        'الرحلات البحرية تعتمد على حالة البحر',
        'Sea trips depend on sea conditions',
        'Perjalanan laut bergantung pada kondisi laut',
      ),
      L(
        'أخبرنا مسبقًا إن كنت لا تجيد السباحة',
        'Tell us beforehand if you cannot swim',
        'Beri tahu kami jika Anda tidak bisa berenang',
      ),
    ],
    ageConditions: [
      L('الأطفال برفقة شخص بالغ', 'Children with an adult', 'Anak-anak didampingi orang dewasa'),
    ],
    suitableFor: [L('العائلات', 'Families', 'Keluarga'), L('الأزواج', 'Couples', 'Pasangan')],
    faq: COMMON_FAQ,
  },
  nature: {
    whatToBring: [
      L('حذاء مناسب للمشي', 'Walking shoes', 'Sepatu untuk berjalan'),
      L('مياه للشرب', 'Drinking water', 'Air minum'),
      L('طارد للحشرات', 'Insect repellent', 'Losion anti nyamuk'),
      L('ملابس بديلة', 'A change of clothes', 'Pakaian ganti'),
    ],
    importantNotes: [
      L(
        'قد تكون الممرات زلقة بعد المطر',
        'Paths may be slippery after rain',
        'Jalur bisa licin setelah hujan',
      ),
      L('حافظ على نظافة المكان', 'Please keep the place clean', 'Harap jaga kebersihan'),
    ],
    ageConditions: [
      L('يتطلب لياقة متوسطة', 'Needs moderate fitness', 'Membutuhkan kebugaran sedang'),
    ],
    suitableFor: [
      L('محبو الطبيعة', 'Nature lovers', 'Pecinta alam'),
      L('صناع المحتوى', 'Content creators', 'Kreator konten'),
    ],
    faq: COMMON_FAQ,
  },
  family: {
    whatToBring: [
      L('ملابس مريحة', 'Comfortable clothes', 'Pakaian nyaman'),
      L('قبعة وواقي شمس', 'Hat and sunscreen', 'Topi dan tabir surya'),
      L('مياه ووجبات خفيفة للأطفال', 'Water and snacks for children', 'Air dan camilan untuk anak'),
    ],
    importantNotes: [
      L(
        'الأطفال تحت مسؤولية ذويهم طوال النشاط',
        'Children stay in their parents’ care throughout',
        'Anak-anak tetap dalam pengawasan orang tua',
      ),
    ],
    ageConditions: [
      L('مناسب لمعظم الأعمار', 'Suitable for most ages', 'Cocok untuk sebagian besar usia'),
      L('الأطفال برفقة شخص بالغ', 'Children with an adult', 'Anak-anak didampingi orang dewasa'),
    ],
    suitableFor: [L('العائلات', 'Families', 'Keluarga'), L('الأطفال', 'Children', 'Anak-anak')],
    faq: COMMON_FAQ,
  },
  private: {
    whatToBring: [
      L('ملابس مريحة', 'Comfortable clothes', 'Pakaian nyaman'),
      L('جواز السفر أو صورة منه', 'Passport or a copy', 'Paspor atau salinannya'),
    ],
    importantNotes: [
      L(
        'يُرسل البرنامج النهائي بعد تأكيد الحجز',
        'The final plan is sent after the booking is confirmed',
        'Rencana akhir dikirim setelah pemesanan dikonfirmasi',
      ),
      L(
        'أخبرنا بطلباتك الخاصة عند الحجز',
        'Tell us your special requests when booking',
        'Sampaikan permintaan khusus saat memesan',
      ),
    ],
    ageConditions: [],
    suitableFor: [
      L('الأزواج', 'Couples', 'Pasangan'),
      L('العائلات', 'Families', 'Keluarga'),
      L('المجموعات الخاصة', 'Private groups', 'Grup pribadi'),
    ],
    faq: COMMON_FAQ,
  },
  photo: {
    whatToBring: [
      L('ملابس مناسبة للتصوير', 'Outfits for the photos', 'Pakaian untuk foto'),
      L('كاميرا أو هاتف مشحون', 'A charged camera or phone', 'Kamera atau ponsel yang terisi daya'),
    ],
    importantNotes: [
      L(
        'الإضاءة تتأثر بالطقس ووقت اليوم',
        'Light depends on the weather and time of day',
        'Cahaya bergantung pada cuaca dan waktu',
      ),
      L('يُرجى الالتزام بالموعد', 'Please be on time', 'Harap tepat waktu'),
    ],
    ageConditions: [],
    suitableFor: [
      L('صناع المحتوى', 'Content creators', 'Kreator konten'),
      L('الأزواج', 'Couples', 'Pasangan'),
    ],
    faq: COMMON_FAQ,
  },
}

export function isTemplateKey(value: string | null | undefined): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value ?? '')
}

/** The columns a template fills: only the lists that are empty now. */
export function templateFill(
  key: TemplateKey,
  current: {
    whatToBring: unknown[] | null
    importantNotes: unknown[] | null
    ageConditions: unknown[] | null
    suitableFor: unknown[] | null
    faq: unknown[] | null
  },
): Partial<ActivityTemplate> {
  const template = ACTIVITY_TEMPLATES[key]
  const out: Partial<ActivityTemplate> = {}
  const empty = (value: unknown[] | null) => !Array.isArray(value) || value.length === 0
  if (empty(current.whatToBring) && template.whatToBring.length > 0)
    out.whatToBring = template.whatToBring
  if (empty(current.importantNotes) && template.importantNotes.length > 0)
    out.importantNotes = template.importantNotes
  if (empty(current.ageConditions) && template.ageConditions.length > 0)
    out.ageConditions = template.ageConditions
  if (empty(current.suitableFor) && template.suitableFor.length > 0)
    out.suitableFor = template.suitableFor
  if (empty(current.faq) && template.faq.length > 0) out.faq = template.faq
  return out
}
