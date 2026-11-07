/**
 * «جدول العائلة 4 أيام» — the first real itinerary, as reviewed seed data
 * (applied by `scripts/seed-family-4-days.ts`). Pure: no database here, so
 * the public-copy rule can be unit-tested.
 *
 * Two kinds of fields:
 *  - PUBLIC (name, blurb, intro, audience, stats, FAQ, SEO, day moods): say
 *    WHAT the buyer gets — never a place, an area or an activity.
 *  - PRIVATE (day titles / descriptions, the stops and their notes, the
 *    activity linked to a day): only the buyer sees them, after purchase.
 *
 * Source: the client's PDF «جدول سياحي عائلي 4 ايام» (stops and Google Maps
 * links as written there) and the approved page concept (copy, FAQ, prices).
 */

export type L3 = { ar: string; en: string; id: string }

const L = (ar: string, en: string, id: string): L3 => ({ ar, en, id })

export const FAMILY_4_DAYS_SLUG = 'family-4-days'

/* ---------------- Public ---------------- */

export const FAMILY_4_DAYS_PUBLIC = {
  name: L(
    'جدول العائلة 4 أيام في بالي',
    'Bali Family Itinerary — 4 Days',
    'Itinerary Keluarga Bali — 4 Hari',
  ),
  blurb: L(
    'جدولك العائلي جاهز يومًا بيوم، من لحظة وصولك حتى يوم السفر.',
    'Your family plan, ready day by day — from the moment you land to the day you fly home.',
    'Rencana keluarga Anda, siap hari demi hari — dari saat mendarat hingga hari kepulangan.',
  ),
  intro: L(
    'وفّر على نفسك ساعات البحث والحيرة. صمّمنا هذا الجدول للعائلات: أيام متوازنة بين الراحة والمتعة، واختيارات أكل تناسب الجميع، وترتيب يقلّل المشاوير من أول يوم حتى آخر يوم. كل ما عليك أن تفتح الجدول وتستمتع مع عائلتك.',
    'Skip the hours of research and second-guessing. This plan is built for families: days balanced between rest and fun, food choices that suit everyone, and an order that keeps travel time short from the first day to the last. Just open the plan and enjoy the trip together.',
    'Hemat berjam-jam riset dan kebingungan. Rencana ini dibuat untuk keluarga: hari yang seimbang antara istirahat dan keseruan, pilihan makanan yang cocok untuk semua, dan urutan yang memangkas waktu perjalanan dari hari pertama hingga terakhir. Cukup buka rencananya dan nikmati liburan bersama.',
  ),
  tripType: L('عائلي', 'Family', 'Keluarga'),
  audience: [
    L('العائلات', 'Families', 'Keluarga'),
    L('مناسب للأطفال', 'Kid-friendly', 'Ramah anak'),
  ],
  stats: [
    { icon: 'cal', value: '4', label: L('أيام مرتّبة', 'planned days', 'hari tersusun') },
    { icon: 'pin', value: '+15', label: L('محطة مختارة', 'hand-picked stops', 'tempat pilihan') },
    {
      icon: 'food',
      value: '+8',
      label: L('مطاعم للعائلة', 'family restaurants', 'restoran keluarga'),
    },
    { icon: 'map', value: '100%', label: L('روابط خرائط', 'map links', 'tautan peta') },
  ],
  /** «طابع اليوم» — the only per-day text the public page may show. */
  moods: [
    L(
      'وصول هادئ وبداية خفيفة',
      'A calm arrival and an easy start',
      'Kedatangan santai dan awal yang ringan',
    ),
    L(
      'يوم مرح للأطفال واسترخاء للكبار',
      'Fun for the kids, rest for the grown-ups',
      'Seru untuk anak, santai untuk orang tua',
    ),
    L(
      'طبيعة ومغامرة ليوم كامل',
      'A full day of nature and adventure',
      'Sehari penuh alam dan petualangan',
    ),
    L('بحر وألعاب وتسوّق', 'Sea, games and shopping', 'Laut, permainan dan belanja'),
  ],
  seoTitle: L(
    'جدول سياحي للعائلة 4 أيام في بالي',
    '4-Day Bali Family Itinerary',
    'Itinerary Keluarga 4 Hari di Bali',
  ),
  seoDescription: L(
    'جدول عائلي جاهز لـ4 أيام في بالي: أيام متوازنة، مطاعم تناسب العائلة، رابط خريطة لكل محطة، وملف PDF يصلك فور الدفع.',
    'A ready 4-day family plan for Bali: balanced days, family-friendly restaurants, a map link for every stop and a PDF delivered the moment you pay.',
    'Rencana keluarga 4 hari di Bali yang siap pakai: hari yang seimbang, restoran ramah keluarga, tautan peta untuk setiap tempat, dan PDF yang langsung dikirim setelah bayar.',
  ),
  faq: [
    {
      q: L(
        'هل الجدول مناسب للأطفال الصغار؟',
        'Is the plan suitable for young children?',
        'Apakah rencana ini cocok untuk anak kecil?',
      ),
      a: L(
        'نعم. الأيام موزّعة بحيث لا تكون مرهقة، مع أوقات راحة واختيارات مناسبة للأطفال في كل يوم، واليوم الأول خفيف بعد رحلة الطيران.',
        'Yes. The days are paced so they never get exhausting, with rest time and kid-friendly choices every day, and the first day is kept light after the flight.',
        'Ya. Setiap hari diatur agar tidak melelahkan, dengan waktu istirahat dan pilihan ramah anak setiap hari, dan hari pertama dibuat ringan setelah penerbangan.',
      ),
    },
    {
      q: L(
        'هل المطاعم المقترحة حلال؟',
        'Are the suggested restaurants halal?',
        'Apakah restoran yang disarankan halal?',
      ),
      a: L(
        'اخترنا مطاعم تناسب العائلات، من بينها مطاعم عربية بأطباق مألوفة. ولأن شهادات الحلال قد تتغيّر، ننصحك بالتأكد مباشرة من المطعم قبل الطلب.',
        'We chose family-friendly restaurants, including Arabic restaurants with familiar dishes. Halal certificates can change, so we recommend confirming with the restaurant before you order.',
        'Kami memilih restoran ramah keluarga, termasuk restoran Arab dengan hidangan yang akrab. Sertifikat halal bisa berubah, jadi sebaiknya pastikan langsung ke restoran sebelum memesan.',
      ),
    },
    {
      q: L(
        'أين يُفضَّل السكن مع هذا الجدول؟',
        'Where should we stay with this plan?',
        'Di mana sebaiknya menginap dengan rencana ini?',
      ),
      a: L(
        'الجدول مبني على منطقة سكن واحدة طوال الأيام الأربعة لتقليل التنقل، ونوضّحها لك داخل الجدول.',
        'The plan is built around one base for all four days to keep travel short, and we name it inside the plan.',
        'Rencana ini dibangun di sekitar satu area menginap selama empat hari agar perjalanan singkat, dan kami menyebutkannya di dalam rencana.',
      ),
    },
    {
      q: L(
        'هل أسعار الأنشطة والمطاعم والمواصلات مشمولة؟',
        'Are activities, meals and transport included in the price?',
        'Apakah aktivitas, makan, dan transportasi termasuk dalam harga?',
      ),
      a: L(
        'لا، أنت تشتري الجدول نفسه: التخطيط والترتيب. الأنشطة والمطاعم والمواصلات تدفعها مباشرة، ويمكنك بعد الشراء حجز أنشطة جدولك من خلالنا بخصم خاص.',
        'No — you are buying the plan itself: the planning and the order of the days. You pay activities, meals and transport directly, and after purchase you can book your plan’s activities through us at a special discount.',
        'Tidak — yang Anda beli adalah rencananya: perencanaan dan urutan hari. Aktivitas, makan, dan transportasi dibayar langsung, dan setelah membeli Anda bisa memesan aktivitas rencana Anda melalui kami dengan diskon khusus.',
      ),
    },
    {
      q: L(
        'هل أحتاج سيارة أو سائقًا؟',
        'Do I need a car or a driver?',
        'Apakah saya perlu mobil atau sopir?',
      ),
      a: L(
        'يُنصح بسائق خاص للعائلات في بالي، ونوضّح لك داخل الجدول كيف تنظّم تنقلاتك يومًا بيوم.',
        'A private driver is recommended for families in Bali, and the plan shows how to organise your transport day by day.',
        'Sopir pribadi disarankan untuk keluarga di Bali, dan rencana ini menunjukkan cara mengatur transportasi Anda hari demi hari.',
      ),
    },
    {
      q: L(
        'هل يمكن تعديل الجدول ليناسب عائلتي؟',
        'Can the plan be changed to suit my family?',
        'Bisakah rencana ini diubah sesuai keluarga saya?',
      ),
      a: L(
        'الجدول ثابت وجاهز. إذا رغبت في جدول مصمّم بالكامل حسب احتياجاتك، يمكنك طلب «خصّص جدولك».',
        'This plan is fixed and ready to use. If you want a plan designed entirely around your needs, you can request «Customise your plan».',
        'Rencana ini tetap dan siap pakai. Jika Anda ingin rencana yang dirancang sepenuhnya sesuai kebutuhan, Anda bisa meminta «Sesuaikan rencana Anda».',
      ),
    },
    {
      q: L(
        'متى وكيف أستلم الجدول؟',
        'When and how do I receive the plan?',
        'Kapan dan bagaimana saya menerima rencananya?',
      ),
      a: L(
        'فور إتمام الدفع يظهر الجدول في حسابك ويصلك على بريدك الإلكتروني كملف PDF يمكنك فتحه من جوالك في أي وقت.',
        'As soon as payment goes through, the plan appears in your account and reaches your e-mail as a PDF you can open on your phone at any time.',
        'Begitu pembayaran selesai, rencana muncul di akun Anda dan dikirim ke e-mail sebagai PDF yang bisa dibuka di ponsel kapan saja.',
      ),
    },
  ],
} as const

/* ---------------- Prices ---------------- */

/** «الجدول فقط» — the itinerary's own price. */
export const FAMILY_4_DAYS_PRICE_MINOR = 14_900
export const FAMILY_4_DAYS_CURRENCY = 'SAR'
/**
 * «الجدول + الخريطة» = this price + the global map bundle price
 * (`itinerarySales.mapBundlePriceMinor`). 199 SAR needs that set to 50 SAR;
 * the seed reports the total it computes rather than changing the setting.
 */
export const FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR = 19_900

/* ---------------- Private ---------------- */

export interface StopSpec {
  /** The name as the client's PDF writes it (catalog lookup key). */
  name: string
  mapsUrl: string
  note: L3
}

export interface DaySpec {
  dayNumber: number
  title: L3
  description: L3
  /** Catalog activity names that may be this day's bookable activity, first match wins. */
  activityNames: readonly string[]
  stops: readonly StopSpec[]
}

export const FAMILY_4_DAYS_DAYS: readonly DaySpec[] = [
  {
    dayNumber: 1,
    title: L(
      'الوصول إلى بالي والاستقرار في سيمنياك',
      'Arrival in Bali and settling into Seminyak',
      'Tiba di Bali dan menetap di Seminyak',
    ),
    description: L(
      'السكن في سيمنياك طوال الأيام الأربعة. الوصول إلى مطار بالي والاستقبال من قبل سائقنا. اليوم الأول خفيف وبدون فعاليات: غداء في مطعم عربي، تسجيل الدخول في الفندق، ثم النادي الشاطئي، والعشاء في مطعم إيطالي.',
      'Stay in Seminyak for all four days. Arrive at Bali airport and meet our driver. Day one is light with no activities: lunch at an Arabic restaurant, hotel check-in, then a beach club, and dinner at an Italian restaurant.',
      'Menginap di Seminyak selama empat hari. Tiba di bandara Bali dan dijemput sopir kami. Hari pertama ringan tanpa aktivitas: makan siang di restoran Arab, check-in hotel, lalu beach club, dan makan malam di restoran Italia.',
    ),
    activityNames: [],
    stops: [
      {
        name: 'Al Jazeerah Signature',
        mapsUrl: 'https://maps.app.goo.gl/16PfsAu94SXS4VXk9',
        note: L(
          'الغداء في مطعم الجزيرة العربي',
          'Lunch at this Arabic restaurant',
          'Makan siang di restoran Arab ini',
        ),
      },
      {
        name: 'Atlas Beach Club',
        mapsUrl: 'https://maps.app.goo.gl/JTU4osZpg9G5ssWk6',
        note: L(
          'بعد تسجيل الدخول في الفندق: النادي الشاطئي',
          'After hotel check-in: the beach club',
          'Setelah check-in hotel: beach club',
        ),
      },
      {
        name: 'Milano',
        mapsUrl: 'https://maps.app.goo.gl/mqxfgmD6dDzpnRka8',
        note: L(
          'العشاء في المطعم الإيطالي',
          'Dinner at the Italian restaurant',
          'Makan malam di restoran Italia',
        ),
      },
    ],
  },
  {
    dayNumber: 2,
    title: L(
      'مساج ومدينة ملاهي ترانس استديو',
      'Massage and Trans Studio theme park',
      'Pijat dan taman hiburan Trans Studio',
    ),
    description: L(
      'الإفطار، ثم جلسة مساج، ثم مدينة الملاهي ترانس استديو، والعشاء في المطعم العربي أبو نواس.',
      'Breakfast, then a massage, then the Trans Studio theme park, and dinner at the Arabic restaurant Abunawas.',
      'Sarapan, lalu pijat, lalu taman hiburan Trans Studio, dan makan malam di restoran Arab Abunawas.',
    ),
    activityNames: ['Trans Studio Theme Park Bali', 'Trans Studio Bali', 'Trans Studio'],
    stops: [
      {
        name: '32do Bali',
        mapsUrl: 'https://maps.app.goo.gl/r8aXAM9n9zDkVx7M9',
        note: L('الإفطار', 'Breakfast', 'Sarapan'),
      },
      {
        name: 'SUNDARI Wellness',
        mapsUrl: 'https://maps.app.goo.gl/Lk3S3p76i5Yc41na9',
        note: L('جلسة مساج', 'Massage', 'Pijat'),
      },
      {
        name: 'Trans Studio Theme Park Bali',
        mapsUrl: 'https://maps.app.goo.gl/eDQHT9N2Td33oewN7',
        note: L(
          'مدينة الملاهي ترانس استديو',
          'Trans Studio theme park',
          'Taman hiburan Trans Studio',
        ),
      },
      {
        name: 'Abunawas Restaurant',
        mapsUrl: 'https://maps.app.goo.gl/Fy7wemjtgukmiGYC7',
        note: L(
          'العشاء في المطعم العربي أبو نواس',
          'Dinner at the Arabic restaurant Abunawas',
          'Makan malam di restoran Arab Abunawas',
        ),
      },
    ],
  },
  {
    dayNumber: 3,
    title: L('يوم كامل في أوبود', 'A full day in Ubud', 'Sehari penuh di Ubud'),
    description: L(
      'يوم كامل في أوبود — خذوا معكم ملابس غيار. الإفطار، ثم مزارع الأرز وفيها فعاليات زيبلاين وسكاي بايك، والغداء في مطعم داخل حدائق الأرز، ثم مغامرة كوبر بالي بركوب الدبابات، والعشاء في سنتر أوبود (يُفضَّل الحجز).',
      'A full day in Ubud — bring a change of clothes. Breakfast, then the rice terraces with zipline and sky bike, lunch at a restaurant inside the rice fields, then the Kuber Bali ATV adventure, and dinner in central Ubud (booking recommended).',
      'Sehari penuh di Ubud — bawa baju ganti. Sarapan, lalu sawah terasering dengan zipline dan sky bike, makan siang di restoran di tengah sawah, lalu petualangan ATV Kuber Bali, dan makan malam di pusat Ubud (sebaiknya reservasi).',
    ),
    activityNames: ['KUBER ATV BALI', 'Kuber ATV', 'Kuber Bali ATV'],
    stops: [
      {
        name: 'Livingstone Seminyak',
        mapsUrl: 'https://maps.app.goo.gl/LNfpTd9hFHMhMgo9A',
        note: L('الإفطار', 'Breakfast', 'Sarapan'),
      },
      {
        name: 'Alas Harum Bali',
        mapsUrl: 'https://maps.app.goo.gl/3odFzf2XLrxQZQTYA',
        note: L(
          'مزارع الأرز وفيها زيبلاين وسكاي بايك',
          'Rice terraces with zipline and sky bike',
          'Sawah terasering dengan zipline dan sky bike',
        ),
      },
      {
        name: 'Cretya Ubud',
        mapsUrl: 'https://maps.app.goo.gl/3ozkYpXgJke6Ho8i6',
        note: L(
          'الغداء في المطعم داخل حدائق الأرز',
          'Lunch inside the rice fields',
          'Makan siang di tengah sawah',
        ),
      },
      {
        name: 'KUBER ATV BALI',
        mapsUrl: 'https://maps.app.goo.gl/gnoL5ZjuqngwUAup9',
        note: L('مغامرة ركوب الدبابات', 'ATV adventure', 'Petualangan ATV'),
      },
      {
        name: 'NUSA Ubud Nusa By/Suka - Ubud',
        mapsUrl: 'https://maps.app.goo.gl/AGcmRbLNTTGUTw2m9',
        note: L(
          'العشاء في سنتر أوبود (يُفضَّل الحجز)',
          'Dinner in central Ubud (booking recommended)',
          'Makan malam di pusat Ubud (sebaiknya reservasi)',
        ),
      },
    ],
  },
  {
    dayNumber: 4,
    title: L(
      'ألعاب بحرية في نوسا دوا وتسوّق',
      'Water sports in Nusa Dua and shopping',
      'Olahraga air di Nusa Dua dan belanja',
    ),
    description: L(
      'يوم ألعاب بحرية وتسوّق — ملابس الغيار ضرورية. الإفطار، ثم الألعاب البحرية في نوسا دوا، ثم مول آيكون بالي والغداء في المطعم الهندي، والعودة والعشاء في مطعم ستيك (يُفضَّل الحجز). يوم السفر: السائق يأتيك في الموقع والوقت المحدد.',
      'Water sports and shopping — a change of clothes is a must. Breakfast, then water sports in Nusa Dua, then Icon Bali mall with lunch at the Indian restaurant, and back for dinner at a steakhouse (booking recommended). Departure day: the driver picks you up at the agreed place and time.',
      'Olahraga air dan belanja — baju ganti wajib. Sarapan, lalu olahraga air di Nusa Dua, lalu mal Icon Bali dengan makan siang di restoran India, dan kembali untuk makan malam di steakhouse (sebaiknya reservasi). Hari kepulangan: sopir menjemput di tempat dan waktu yang disepakati.',
    ),
    activityNames: ['Tanjung Benoa Water Sports', 'Tanjung Benoa Water Sports Bali'],
    stops: [
      {
        name: 'Brunch Club Legian',
        mapsUrl: 'https://maps.app.goo.gl/qrQejf6m828boNbT7',
        note: L('الإفطار', 'Breakfast', 'Sarapan'),
      },
      {
        name: 'Tanjung Benoa Beach',
        mapsUrl: 'https://maps.app.goo.gl/YCcwakQ5xSFMb92h6',
        note: L(
          'الألعاب البحرية في نوسا دوا',
          'Water sports in Nusa Dua',
          'Olahraga air di Nusa Dua',
        ),
      },
      {
        name: 'The Royal Kitchen sanur',
        mapsUrl: 'https://maps.app.goo.gl/c12tbQhJHGRWUJz87',
        note: L(
          'مول آيكون بالي والغداء في المطعم الهندي',
          'Icon Bali mall, lunch at the Indian restaurant',
          'Mal Icon Bali, makan siang di restoran India',
        ),
      },
      {
        name: "Boy'N'Cow",
        mapsUrl: 'https://maps.app.goo.gl/s1KwTCFkWgJSvuZT6',
        note: L(
          'العشاء في مطعم الستيك (يُفضَّل الحجز)',
          'Dinner at the steakhouse (booking recommended)',
          'Makan malam di steakhouse (sebaiknya reservasi)',
        ),
      },
    ],
  },
]

/* ---------------- Catalog matching (pure) ---------------- */

export interface CatalogRow {
  id: string
  names: readonly string[]
}

/** Lower-case letters and digits only, «bali» dropped: «KUBER ATV BALI» → «kuberatv». */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bbali\b/g, ' ')
    .replace(/\s+/g, '')
}

export type MatchResult =
  { kind: 'found'; id: string } | { kind: 'missing' } | { kind: 'ambiguous'; ids: string[] }

/**
 * Exact (normalized) name first; else a single row whose name contains the
 * key or is contained in it (≥ 6 letters, so «Milano» does not match
 * «Milanowski»-type noise silently — two hits are reported, never guessed).
 */
export function matchCatalog(name: string, rows: readonly CatalogRow[]): MatchResult {
  const key = normalizeName(name)
  if (key === '') return { kind: 'missing' }
  const exact = rows.filter((row) => row.names.some((one) => normalizeName(one) === key))
  if (exact.length === 1) return { kind: 'found', id: exact[0]!.id }
  if (exact.length > 1) return { kind: 'ambiguous', ids: exact.map((row) => row.id) }
  if (key.length < 6) return { kind: 'missing' }
  const loose = rows.filter((row) =>
    row.names.some((one) => {
      const other = normalizeName(one)
      return other.length >= 6 && (other.includes(key) || key.includes(other))
    }),
  )
  if (loose.length === 1) return { kind: 'found', id: loose[0]!.id }
  if (loose.length > 1) return { kind: 'ambiguous', ids: loose.map((row) => row.id) }
  return { kind: 'missing' }
}

/** Every private string — what the public page must never contain. */
export function privateStrings(): string[] {
  const out = new Set<string>()
  for (const day of FAMILY_4_DAYS_DAYS) {
    for (const value of [...Object.values(day.title), ...Object.values(day.description)])
      out.add(value)
    for (const stop of day.stops) {
      out.add(stop.name)
      out.add(stop.mapsUrl)
      for (const value of Object.values(stop.note)) out.add(value)
    }
  }
  return [...out]
}

/** Distinctive private words (places / areas) checked inside the public copy. */
export const PRIVATE_TERMS = [
  'Seminyak',
  'سيمنياك',
  'Ubud',
  'أوبود',
  'اوبود',
  'Nusa Dua',
  'نوسا دوا',
  'Trans Studio',
  'ترانس',
  'Jazeerah',
  'الجزيرة',
  'Atlas',
  'Milano',
  '32do',
  'SUNDARI',
  'Abunawas',
  'أبو نواس',
  'Livingstone',
  'Alas Harum',
  'Cretya',
  'KUBER',
  'كوبر',
  'Brunch Club',
  'Tanjung Benoa',
  'Royal Kitchen',
  "Boy'N'Cow",
  'Icon Bali',
  'آيكون',
  'ATV',
  'zipline',
  'زيبلاين',
  'maps.app.goo.gl',
] as const
