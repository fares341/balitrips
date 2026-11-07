/**
 * Shared shape of the reviewed itinerary seeds (6 and 8 days, Nov 2026).
 * Pure: no database. Applied by `scripts/seed-itinerary.ts --slug=…`.
 *
 * PUBLIC fields (name, blurb, intro, hero line, audience, stats, day moods,
 * benefits, steps, FAQ, SEO) say WHAT the buyer gets — never a place, an
 * area, a city or an activity. Everything under `days` is PRIVATE: only the
 * buyer sees it, after purchase.
 *
 * Source rule: every stop, its Google Maps link (verbatim) and its order come
 * from the owner's PDFs. Nothing is invented: no prices, clock times or links.
 * A suggested period is set only where the source says it (breakfast, lunch,
 * dinner, «العصر»).
 */

import type { L3 } from './family-4-days'

export type { L3 }

export const L = (ar: string, en: string, id: string): L3 => ({ ar, en, id })

/** What the spec asks to show where the source has nothing. */
export const NOT_AVAILABLE = L('غير متوفر', 'Not available', 'Tidak tersedia')

export const STOP_TYPES = [
  'restaurant',
  'cafe',
  'beach',
  'attraction',
  'spa',
  'beach_club',
  'shopping',
  'accommodation',
  'activity',
  'other',
] as const
export type StopType = (typeof STOP_TYPES)[number]

export const STOP_TYPE_LABEL: Record<StopType, L3> = {
  restaurant: L('مطعم', 'Restaurant', 'Restoran'),
  cafe: L('مقهى', 'Café', 'Kafe'),
  beach: L('شاطئ', 'Beach', 'Pantai'),
  attraction: L('معلم سياحي', 'Attraction', 'Atraksi'),
  spa: L('سبا ومساج', 'Spa', 'Spa'),
  beach_club: L('نادٍ شاطئي', 'Beach club', 'Beach club'),
  shopping: L('تسوّق', 'Shopping', 'Belanja'),
  accommodation: L('سكن', 'Accommodation', 'Akomodasi'),
  activity: L('نشاط', 'Activity', 'Aktivitas'),
  other: L('أخرى', 'Other', 'Lainnya'),
}

/** Suggested part of the day — only when the source implies it clearly. */
export type Period = 'morning' | 'midday' | 'afternoon' | 'evening'

export const PERIOD_LABEL: Record<Period, L3> = {
  morning: L('صباحًا (مقترح)', 'Morning (suggested)', 'Pagi (saran)'),
  midday: L('ظهرًا (مقترح)', 'Midday (suggested)', 'Siang (saran)'),
  afternoon: L('عصرًا (مقترح)', 'Afternoon (suggested)', 'Sore (saran)'),
  evening: L('مساءً (مقترح)', 'Evening (suggested)', 'Malam (saran)'),
}

export interface SeedStop {
  /** The name exactly as the source writes it (catalog lookup key). */
  name: string
  /** The Google Maps link exactly as the source writes it. */
  mapsUrl: string | null
  type: StopType
  period?: Period
  note: L3
  /** A step the source puts right after this stop (e.g. hotel check-in). */
  then?: L3
}

export interface SeedDay {
  dayNumber: number
  /** Where the night is spent (private). */
  area: L3
  title: L3
  /** Short private summary of the day. */
  description: L3
  /** Practical notes taken from the source (clothes, early start, booking …). */
  notes: readonly L3[]
  /** Catalog activity names that may be this day's bookable activity; first match wins. */
  activityNames: readonly string[]
  stops: readonly SeedStop[]
}

export interface SeedFaq {
  q: L3
  a: L3
}

export interface SeedPublic {
  name: L3
  /** Hero line under the title (the page's lede). */
  blurb: L3
  /** Marketing headline shown as the «about» heading. */
  heroTitle: L3
  intro: L3
  tripType: L3
  audience: readonly L3[]
  /** «مناسب لمن» sentence. */
  suitableFor: L3
  stats: readonly { icon: string; value: string; label: L3 }[]
  /** One public teaser per day: title + short generic line. */
  moods: readonly L3[]
  moodLines: readonly L3[]
  seoTitle: L3
  seoDescription: L3
  faq: readonly SeedFaq[]
  benefits: readonly { icon: string; label: L3; text: L3 }[]
  how: readonly { label: L3; text: L3 }[]
}

export interface ItinerarySeed {
  slug: string
  /** File name of the generated Arabic PDF. */
  pdfName: string
  audienceKind: 'youth' | 'honeymoon' | 'family'
  sourceDocument: string
  sourcePages: string
  public: SeedPublic
  /** Null = no price in the source: the itinerary stays a draft until the owner sets one. */
  priceMinor: number | null
  currency: 'SAR'
  /** Private: the stay plan as the source gives it. */
  stay: L3
  /** Private: the source's departure-day line (after the last day). */
  departure: L3
  days: readonly SeedDay[]
}

/* ---------------- Shared public copy (no places, no areas) ---------------- */

export const HOW_STEPS: SeedPublic['how'] = [
  {
    label: L('اختر جدولك', 'Choose your plan', 'Pilih rencana Anda'),
    text: L(
      'اختر الجدول الذي يناسب رحلتك، وحده أو مع الخريطة إن كانت متاحة.',
      'Pick the plan that fits your trip — on its own, or with the map when it is offered.',
      'Pilih rencana yang cocok untuk perjalanan Anda — sendiri, atau dengan peta bila tersedia.',
    ),
  },
  {
    label: L('ادفع بأمان', 'Pay securely', 'Bayar dengan aman'),
    text: L(
      'أكمل الدفع الإلكتروني الآمن خلال دقيقة.',
      'Complete the secure online payment in a minute.',
      'Selesaikan pembayaran online yang aman dalam satu menit.',
    ),
  },
  {
    label: L('استلم جدولك فورًا', 'Get your plan instantly', 'Terima rencana Anda seketika'),
    text: L(
      'يظهر الجدول في حسابك فور الدفع، ويصلك رابط ملف PDF على بريدك الإلكتروني، وعلى واتساب عند تفعيله.',
      'The plan appears in your account as soon as you pay, and a PDF link reaches your e-mail — and WhatsApp when it is enabled.',
      'Rencana langsung muncul di akun Anda setelah membayar, dan tautan PDF dikirim ke e-mail — serta WhatsApp bila diaktifkan.',
    ),
  },
]

const BENEFIT_DAILY: SeedPublic['benefits'][number] = {
  icon: 'calendar',
  label: L('جدول يومي مرتّب', 'A day-by-day plan', 'Rencana hari demi hari'),
  text: L(
    'كل يوم بمحطاته بالترتيب، من الإفطار حتى العشاء.',
    'Every day with its stops in order, from breakfast to dinner.',
    'Setiap hari dengan tempat-tempatnya berurutan, dari sarapan hingga makan malam.',
  ),
}
const BENEFIT_MAPS: SeedPublic['benefits'][number] = {
  icon: 'map',
  label: L('رابط خريطة لكل محطة', 'A map link for every stop', 'Tautan peta untuk setiap tempat'),
  text: L(
    'افتح الموقع على خرائط Google بلمسة، دون بحث.',
    'Open each location in Google Maps with one tap — no searching.',
    'Buka setiap lokasi di Google Maps dengan sekali sentuh — tanpa mencari.',
  ),
}
const BENEFIT_FOOD: SeedPublic['benefits'][number] = {
  icon: 'food',
  label: L('أين تأكل كل يوم', 'Where to eat each day', 'Tempat makan setiap hari'),
  text: L(
    'اقتراحات للإفطار والغداء والعشاء على طريق اليوم نفسه.',
    'Breakfast, lunch and dinner picks on the same route as the day.',
    'Pilihan sarapan, makan siang, dan makan malam di rute hari itu.',
  ),
}
const BENEFIT_TIPS: SeedPublic['benefits'][number] = {
  icon: 'tip',
  label: L('نصائح عملية', 'Practical tips', 'Tips praktis'),
  text: L(
    'متى تخرج مبكرًا، ومتى تحتاج ملابس غيار، وأين يُفضَّل الحجز مسبقًا.',
    'When to leave early, when to pack a change of clothes and where to book ahead.',
    'Kapan berangkat pagi, kapan membawa baju ganti, dan di mana sebaiknya reservasi.',
  ),
}
const BENEFIT_INSTANT: SeedPublic['benefits'][number] = {
  icon: 'bolt',
  label: L('يصلك فور الدفع', 'Yours the moment you pay', 'Langsung setelah bayar'),
  text: L(
    'في حسابك، وملف PDF على بريدك يمكنك حفظه على جوالك.',
    'In your account, plus a PDF by e-mail you can keep on your phone.',
    'Di akun Anda, plus PDF lewat e-mail yang bisa disimpan di ponsel.',
  ),
}

export function benefitsFor(kind: ItinerarySeed['audienceKind']): SeedPublic['benefits'] {
  const fit =
    kind === 'family'
      ? {
          icon: 'family',
          label: L('مرتّب للعائلة', 'Paced for families', 'Diatur untuk keluarga'),
          text: L(
            'أيام فيها مرح للأطفال ووقت راحة للكبار.',
            'Days with fun for the kids and rest for the grown-ups.',
            'Hari yang seru untuk anak dan santai untuk orang tua.',
          ),
        }
      : kind === 'honeymoon'
        ? {
            icon: 'shield',
            label: L('مصمّم للأزواج', 'Made for couples', 'Dibuat untuk pasangan'),
            text: L(
              'أجواء هادئة، وأمسيات مميزة، وأيام استجمام بين أيام المغامرة.',
              'Calm settings, special evenings and slow days between the adventurous ones.',
              'Suasana tenang, malam istimewa, dan hari santai di sela hari petualangan.',
            ),
          }
        : {
            icon: 'bolt',
            label: L('طاقة ومغامرة', 'Energy and adventure', 'Energi dan petualangan'),
            text: L(
              'أيام نشيطة مليئة بالتجارب، مع يوم استرخاء لالتقاط الأنفاس.',
              'Active days full of experiences, with a slower day to catch your breath.',
              'Hari aktif penuh pengalaman, dengan satu hari santai untuk menarik napas.',
            ),
          }
  return [BENEFIT_DAILY, BENEFIT_MAPS, BENEFIT_FOOD, BENEFIT_TIPS, fit, BENEFIT_INSTANT]
}

/** FAQ shared by every programme, with the audience- and length-specific rows. */
export function faqFor(
  kind: ItinerarySeed['audienceKind'],
  days: number,
  bases: number,
): SeedFaq[] {
  const who: SeedFaq =
    kind === 'family'
      ? {
          q: L('لمن يناسب هذا الجدول؟', 'Who is this plan for?', 'Untuk siapa rencana ini?'),
          a: L(
            `للعائلات التي تريد ${days} أيام مرتّبة تجمع بين مرح الأطفال وراحة الكبار، دون ساعات من البحث قبل السفر.`,
            `Families who want ${days} well-ordered days that mix fun for the kids with rest for the adults, without hours of research before the trip.`,
            `Keluarga yang ingin ${days} hari tersusun rapi, memadukan keseruan anak dan istirahat orang tua, tanpa berjam-jam riset sebelum berangkat.`,
          ),
        }
      : kind === 'honeymoon'
        ? {
            q: L('لمن يناسب هذا الجدول؟', 'Who is this plan for?', 'Untuk siapa rencana ini?'),
            a: L(
              `للأزواج في شهر العسل أو في رحلة رومانسية لـ${days} أيام، يريدون أيامًا منظمة وأمسيات مميزة دون عناء التخطيط.`,
              `Couples on a honeymoon or a romantic ${days}-day trip who want organised days and special evenings without the planning.`,
              `Pasangan yang berbulan madu atau liburan romantis ${days} hari, yang ingin hari tertata dan malam istimewa tanpa repot merencanakan.`,
            ),
          }
        : {
            q: L('لمن يناسب هذا الجدول؟', 'Who is this plan for?', 'Untuk siapa rencana ini?'),
            a: L(
              `للشباب والأصدقاء الذين يحبون الحركة والتجارب الجديدة ويريدون ${days} أيام ممتلئة ومنظمة.`,
              `Young travellers and groups of friends who like to keep moving and want ${days} full, well-organised days.`,
              `Anak muda dan rombongan teman yang suka bergerak dan ingin ${days} hari yang padat dan tertata.`,
            ),
          }
  const kids: SeedFaq =
    kind === 'family'
      ? {
          q: L(
            'هل يناسب الأطفال؟',
            'Is it suitable for children?',
            'Apakah cocok untuk anak-anak?',
          ),
          a: L(
            'نعم، رُتّب للعائلات: فيه أيام مرح للأطفال وأيام أهدأ. بعض الأيام تبدأ مبكرًا وفيها طريق طويل، ونوضّح ذلك داخل الجدول لتستعد له.',
            'Yes, it is arranged for families, with fun days for the kids and calmer ones. Some days start early and include a long drive; the plan says which, so you can prepare.',
            'Ya, rencana ini disusun untuk keluarga, dengan hari seru untuk anak dan hari yang lebih santai. Beberapa hari dimulai pagi dan ada perjalanan panjang; rencana menyebutkannya agar Anda siap.',
          ),
        }
      : {
          q: L(
            'هل يناسب الأطفال؟',
            'Is it suitable for children?',
            'Apakah cocok untuk anak-anak?',
          ),
          a: L(
            kind === 'honeymoon'
              ? 'صُمّم هذا الجدول للأزواج. للسفر مع الأطفال نقترح الجدول العائلي بالمدة نفسها.'
              : 'صُمّم هذا الجدول للشباب وفيه أيام نشيطة وطرق طويلة. للسفر مع الأطفال نقترح الجدول العائلي بالمدة نفسها.',
            kind === 'honeymoon'
              ? 'This plan is designed for couples. When travelling with children we suggest the family plan of the same length.'
              : 'This plan is designed for young travellers, with active days and long drives. When travelling with children we suggest the family plan of the same length.',
            kind === 'honeymoon'
              ? 'Rencana ini dirancang untuk pasangan. Jika bepergian dengan anak, kami sarankan rencana keluarga dengan durasi yang sama.'
              : 'Rencana ini dirancang untuk anak muda, dengan hari aktif dan perjalanan panjang. Jika bepergian dengan anak, kami sarankan rencana keluarga dengan durasi yang sama.',
          ),
        }
  return [
    who,
    kids,
    {
      q: L('هل يتضمن روابط خرائط؟', 'Does it include map links?', 'Apakah ada tautan peta?'),
      a: L(
        'نعم، لكل محطة في الجدول رابط على خرائط Google يفتح الموقع مباشرة.',
        'Yes — every stop in the plan has a Google Maps link that opens the location directly.',
        'Ya — setiap tempat dalam rencana memiliki tautan Google Maps yang langsung membuka lokasinya.',
      ),
    },
    {
      q: L('أين يكون السكن؟', 'Where do we stay?', 'Di mana kami menginap?'),
      a: L(
        `الجدول مقسّم على ${bases === 2 ? 'منطقتي سكن' : `${bases} مناطق سكن`} لتقليل المشاوير، ونوضّح داخل الجدول كم ليلة في كل منطقة. حجز الفندق نفسه عليك.`,
        `The plan is split across ${bases} bases to keep drives short, and it says how many nights to spend in each. Booking the hotel is up to you.`,
        `Rencana ini dibagi ke ${bases} area menginap agar perjalanan singkat, dan menyebutkan berapa malam di setiap area. Pemesanan hotel Anda atur sendiri.`,
      ),
    },
    {
      q: L(
        'هل يشمل السعر التذاكر والوجبات والمواصلات؟',
        'Does the price include tickets, meals and transport?',
        'Apakah harga termasuk tiket, makan, dan transportasi?',
      ),
      a: L(
        'لا. أنت تشتري الجدول نفسه: التخطيط والترتيب والروابط. تذاكر الدخول والأنشطة والوجبات والمواصلات تُدفع مباشرة.',
        'No. You are buying the plan itself — the planning, the order and the links. Entry tickets, activities, meals and transport are paid directly.',
        'Tidak. Yang Anda beli adalah rencananya — perencanaan, urutan, dan tautan. Tiket masuk, aktivitas, makan, dan transportasi dibayar langsung.',
      ),
    },
    {
      q: L(
        'هل أحتاج سيارة أو سائقًا؟',
        'Do I need a car or a driver?',
        'Apakah saya perlu mobil atau sopir?',
      ),
      a: L(
        'الجدول مرتّب على التنقل بسيارة خاصة مع سائق، وبعض الأيام فيها طريق طويل. السيارة والسائق غير مشمولين في سعر الجدول.',
        'The plan assumes getting around by private car with a driver, and some days include long drives. A car and driver are not included in the price of the plan.',
        'Rencana ini mengasumsikan perjalanan dengan mobil pribadi dan sopir, dan beberapa hari ada perjalanan panjang. Mobil dan sopir tidak termasuk dalam harga rencana.',
      ),
    },
    {
      q: L(
        'كيف أستلم الجدول بعد الشراء؟',
        'How do I receive the plan?',
        'Bagaimana saya menerima rencananya?',
      ),
      a: L(
        'فور إتمام الدفع يظهر الجدول في حسابك، ويصلك رابط تحميل ملف PDF على بريدك الإلكتروني، وعلى واتساب عند تفعيله.',
        'As soon as payment goes through, the plan appears in your account and a PDF download link reaches your e-mail — and WhatsApp when it is enabled.',
        'Begitu pembayaran selesai, rencana muncul di akun Anda dan tautan unduhan PDF dikirim ke e-mail — serta WhatsApp bila diaktifkan.',
      ),
    },
    {
      q: L('هل يعمل دون إنترنت؟', 'Can I use it offline?', 'Bisakah dipakai tanpa internet?'),
      a: L(
        'بعد تحميل ملف PDF على جوالك تستطيع فتحه وقراءته دون إنترنت، أما فتح روابط الخرائط فيحتاج اتصالًا.',
        'Once the PDF is saved on your phone you can open and read it offline; opening the map links needs a connection.',
        'Setelah PDF tersimpan di ponsel, Anda bisa membuka dan membacanya tanpa internet; membuka tautan peta memerlukan koneksi.',
      ),
    },
  ]
}

/** Stats from the private data — counts only, never names. */
export function statsFor(days: readonly SeedDay[]): SeedPublic['stats'] {
  const stops = days.flatMap((day) => day.stops)
  const food = new Set(
    stops.filter((s) => s.type === 'restaurant' || s.type === 'cafe').map((s) => s.name),
  )
  const linked = stops.filter((s) => s.mapsUrl !== null).length
  return [
    {
      icon: 'cal',
      value: String(days.length),
      label: L('أيام مرتّبة', 'planned days', 'hari tersusun'),
    },
    {
      icon: 'pin',
      value: String(stops.length),
      label: L('محطة بالترتيب', 'stops in order', 'tempat berurutan'),
    },
    {
      icon: 'food',
      value: String(food.size),
      label: L('مطعم ومقهى', 'restaurants & cafés', 'restoran & kafe'),
    },
    {
      icon: 'map',
      value: `${Math.round((linked / Math.max(stops.length, 1)) * 100)}%`,
      label: L('روابط خرائط', 'map links', 'tautan peta'),
    },
  ]
}

/** Every public string of a seed (what the leak test scans). */
export function publicTextsOf(p: SeedPublic): string[] {
  const one = [
    p.name,
    p.blurb,
    p.heroTitle,
    p.intro,
    p.tripType,
    p.suitableFor,
    p.seoTitle,
    p.seoDescription,
    ...p.audience,
    ...p.moods,
    ...p.moodLines,
  ]
  const out = one.flatMap((t) => [t.ar, t.en, t.id])
  for (const s of p.stats) out.push(s.value, s.label.ar, s.label.en, s.label.id)
  for (const f of p.faq) out.push(f.q.ar, f.q.en, f.q.id, f.a.ar, f.a.en, f.a.id)
  for (const b of p.benefits)
    out.push(b.label.ar, b.label.en, b.label.id, b.text.ar, b.text.en, b.text.id)
  for (const h of p.how)
    out.push(h.label.ar, h.label.en, h.label.id, h.text.ar, h.text.en, h.text.id)
  return out
}

/**
 * Words that must never appear in public copy: areas, cities, landmarks and
 * activity names from all seven programmes (Latin and Arabic spellings).
 * Stop names are checked on top of this list.
 */
export const PUBLIC_BANNED_TERMS = [
  'Seminyak',
  'سيمنياك',
  'Ubud',
  'أوبود',
  'اوبود',
  'Uluwatu',
  'أولواتو',
  'اولواتو',
  'Kuta',
  'كوتا',
  'Canggu',
  'كانجو',
  'Sanur',
  'سانور',
  'Nusa Dua',
  'نوسا دوا',
  'Legian',
  'Bedugul',
  'بيدقول',
  'بيدوقول',
  'بيدوجول',
  'Kintamani',
  'كنتماني',
  'كينتاماني',
  'Beratan',
  'براتان',
  'Handara',
  'هاندار',
  'Nyanyi',
  'نياني',
  'Tegenungan',
  'Benoa',
  'Denpasar',
  'Jimbaran',
  'rafting',
  'رافتنغ',
  'تجديف',
  'التجديف',
  'ATV',
  'دبابات',
  'zipline',
  'زيبلاين',
  'sky bike',
  'سكاي بايك',
  'waterfall',
  'شلال',
  'volcano',
  'بركان',
  'البركاني',
  'theme park',
  'مدينة الملاهي',
  'water park',
  'Waterbom',
  'ووتربوم',
  'Trans Studio',
  'ترانس',
  'glass bridge',
  'الجسر الزجاجي',
  'chocolate',
  'شوكولات',
  'temple',
  'معبد',
  'lake',
  'بحيرة',
  'Icon Bali',
  'آيكون',
  'Beachwalk',
  'بيتش ووك',
  'Secret Garden',
  'Kuber',
  'كوبر',
  'Atlas',
  'Jazeerah',
  'الجزيرة',
  'Abunawas',
  'أبو نواس',
  'Milano',
  'ميلانو',
  'maps.app.goo.gl',
  'goo.gl',
] as const
