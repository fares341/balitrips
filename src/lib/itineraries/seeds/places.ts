/**
 * Stops as the owner's 6- and 8-day PDFs write them. Each builder takes the
 * Google Maps link the programme uses (links differ between programmes for
 * some places, so they are passed verbatim at the call site). Notes are the
 * source's own instruction, in clean Arabic, with English and Indonesian.
 * PRIVATE content only.
 */

import { L, type L3, type SeedStop } from './shared'

const CHECK_IN_UBUD = L(
  'بعدها التوجه إلى أوبود وتسجيل الدخول في الفندق',
  'Then on to Ubud and check in at the hotel',
  'Lalu menuju Ubud dan check-in hotel',
)
const CHECK_IN_UBUD_SHORT = L(
  'تسجيل الدخول في فندق أوبود',
  'Check in at the Ubud hotel',
  'Check-in hotel di Ubud',
)
const CHECK_IN_SEMINYAK = L(
  'بعدها التوجه إلى سيمنياك وتسجيل الدخول في الفندق',
  'Then on to Seminyak and check in at the hotel',
  'Lalu menuju Seminyak dan check-in hotel',
)
const CHECK_IN_SEMINYAK_8 = L(
  'تسجيل الدخول في فندق سيمنياك',
  'Check in at the Seminyak hotel',
  'Check-in hotel di Seminyak',
)
const CHECK_IN_ULUWATU = L(
  'بعدها التوجه إلى الفندق في أولواتو وتسجيل الدخول',
  'Then on to the hotel in Uluwatu and check in',
  'Lalu menuju hotel di Uluwatu dan check-in',
)
export const THEN = {
  CHECK_IN_UBUD,
  CHECK_IN_UBUD_SHORT,
  CHECK_IN_SEMINYAK,
  CHECK_IN_SEMINYAK_8,
  CHECK_IN_ULUWATU,
} as const

const stop = (
  name: string,
  mapsUrl: string,
  type: SeedStop['type'],
  note: L3,
  period?: SeedStop['period'],
  then?: L3,
): SeedStop => ({
  name,
  mapsUrl,
  type,
  note,
  ...(period ? { period } : {}),
  ...(then ? { then } : {}),
})

const BREAKFAST = L('الإفطار', 'Breakfast', 'Sarapan')

export const P = {
  royalKitchenOnTheWay: (url: string, then?: L3) =>
    stop(
      'The Royal Kitchen sanur',
      url,
      'restaurant',
      L(
        'الغداء في الطريق، في منطقة سانور داخل «آيكون بالي» أحدث مولات بالي',
        'Lunch on the way, in Sanur inside Icon Bali, the newest mall on the island',
        'Makan siang di jalan, di Sanur di dalam Icon Bali, mal terbaru di pulau ini',
      ),
      'midday',
      then,
    ),
  royalKitchenIndian: (url: string) =>
    stop(
      'The Royal Kitchen sanur',
      url,
      'restaurant',
      L(
        'بعدها التوجه إلى مول «آيكون بالي» — من أحدث مولات بالي — والغداء هناك في المطعم الهندي',
        'Then to Icon Bali, one of the newest malls, with lunch at the Indian restaurant there',
        'Lalu ke mal Icon Bali, salah satu mal terbaru, dengan makan siang di restoran India di sana',
      ),
      'midday',
    ),
  inkaSpa: (url: string) =>
    stop(
      'INKA Ubud Spa',
      url,
      'spa',
      L(
        'بما أنه اليوم الأول ولا توجد فعاليات: وقت للاستجمام وجلسة مساج في هذا المكان',
        'As it is the first day with no activities: time to unwind with a massage here',
        'Karena hari pertama tanpa aktivitas: waktu bersantai dengan pijat di sini',
      ),
    ),
  frenchCrepe: (url: string) =>
    stop(
      'The French Crepe Ubud',
      url,
      'cafe',
      L(
        'زيارة سنتر أوبود وتجربة الكريب الفرنسي',
        'Visit central Ubud and try the French crêpes',
        'Jalan-jalan di pusat Ubud dan mencoba crêpe Prancis',
      ),
    ),
  nusaUbudVaried: (url: string) =>
    stop(
      'NUSA Ubud Nusa By/Suka - Ubud',
      url,
      'restaurant',
      L(
        'العشاء في هذا المطعم المتنوّع (يُفضَّل الحجز)',
        'Dinner at this varied restaurant (booking recommended)',
        'Makan malam di restoran beragam menu ini (sebaiknya reservasi)',
      ),
      'evening',
    ),
  nusaUbudCentre: (url: string) =>
    stop(
      'NUSA Ubud Nusa By/Suka - Ubud',
      url,
      'restaurant',
      L(
        'العشاء في سنتر أوبود (يُفضَّل الحجز)',
        'Dinner in central Ubud (booking recommended)',
        'Makan malam di pusat Ubud (sebaiknya reservasi)',
      ),
      'evening',
    ),
  twoFace: (url: string) => stop('TWO FACE Ubud', url, 'restaurant', BREAKFAST, 'morning'),
  junglegold: (url: string) =>
    stop(
      'Junglegold Chocolate Factory',
      url,
      'attraction',
      L(
        'في الطريق إلى بيدوقول: أول محطة مصنع صغير للشوكولاتة',
        'On the way to Bedugul, the first stop: a small chocolate factory',
        'Dalam perjalanan ke Bedugul, perhentian pertama: pabrik cokelat kecil',
      ),
    ),
  secretGardenVisit: (url: string) =>
    stop(
      'Secret Garden Village',
      url,
      'attraction',
      L(
        'زيارة حديقة Secret Garden Village',
        'Visit Secret Garden Village',
        'Kunjungi Secret Garden Village',
      ),
    ),
  secretGardenHidden: (url: string) =>
    stop(
      'Secret Garden Village',
      url,
      'attraction',
      L('زيارة الحديقة السرية', 'Visit the secret garden', 'Kunjungi taman rahasia'),
    ),
  blackEyeInGarden: (url: string) =>
    stop(
      'Black Eye Coffee - Bedugul',
      url,
      'cafe',
      L(
        'القهوة المختصة في حديقة Secret Garden Village',
        'Specialty coffee inside Secret Garden Village',
        'Kopi spesialti di dalam Secret Garden Village',
      ),
    ),
  blackEyeSameGarden: (url: string) =>
    stop(
      'Black Eye Coffee - Bedugul',
      url,
      'cafe',
      L(
        'والقهوة المختصة في الحديقة نفسها',
        'And specialty coffee in the same garden',
        'Dan kopi spesialti di taman yang sama',
      ),
    ),
  ulunDanu: (url: string) =>
    stop(
      'Pura Ulun Danu Beratan Bedugul',
      url,
      'attraction',
      L(
        'بعدها التوجه إلى بحيرة براتان — بورا أولون دانو براتان. يُفضَّل ركوب القوارب السريعة في البحيرة',
        'Then to Lake Beratan — Pura Ulun Danu Beratan. A speedboat ride on the lake is recommended',
        'Lalu ke Danau Beratan — Pura Ulun Danu Beratan. Disarankan naik speedboat di danau',
      ),
    ),
  hiland: (url: string) =>
    stop(
      'Hiland 1280 Restaurant',
      url,
      'restaurant',
      L(
        'بعدها الخروج والغداء في مطعم داخل منتجع هاندار',
        'Then lunch at a restaurant inside the Handara resort',
        'Lalu makan siang di restoran di dalam resor Handara',
      ),
      'midday',
    ),
  tukies: (url: string) =>
    stop(
      'Tukies Coconut Shop',
      url,
      'cafe',
      L(
        'بعدها العودة إلى سنتر أوبود — محل آيس كريم مشهور',
        'Then back to central Ubud — a well-known ice-cream shop',
        'Lalu kembali ke pusat Ubud — toko es krim terkenal',
      ),
    ),
  thisIsBali: (url: string) =>
    stop(
      'This Is Bali',
      url,
      'restaurant',
      L(
        'العشاء في المطعم الإندونيسي المشهور',
        'Dinner at the well-known Indonesian restaurant',
        'Makan malam di restoran Indonesia yang terkenal',
      ),
      'evening',
    ),
  mrSmash: (url: string) =>
    stop(
      'Mr.Smash Burger - Ubud',
      url,
      'restaurant',
      L('العشاء في مطعم برجر', 'Dinner at a burger restaurant', 'Makan malam di restoran burger'),
      'evening',
    ),
  livingstoneHoly: (url: string) =>
    stop(
      'Livingstone Holyground',
      url,
      'restaurant',
      L('الإفطار في سنتر أوبود', 'Breakfast in central Ubud', 'Sarapan di pusat Ubud'),
      'morning',
    ),
  bmwRafting: (url: string) =>
    stop(
      'BMW Rafting BMW (Bali Mesari Wisata) Rafting',
      url,
      'activity',
      L(
        'الذهاب إلى التجديف (رافتنغ) — الطريق طويل جدًا',
        'Off to rafting — the drive is very long',
        'Berangkat rafting — perjalanannya sangat jauh',
      ),
    ),
  akasa: (url: string) =>
    stop(
      'AKASA',
      url,
      'cafe',
      L(
        'بعدها التوجه إلى منطقة كنتماني الباردة القريبة من الجبل البركاني، والذهاب للكوفي المختص',
        'Then up to cool Kintamani near the volcano, for specialty coffee',
        'Lalu ke Kintamani yang sejuk dekat gunung berapi, untuk kopi spesialti',
      ),
    ),
  donnaBackToCentre: (url: string) =>
    stop(
      'Donna',
      url,
      'restaurant',
      L(
        'العودة إلى سنتر أوبود والعشاء',
        'Back to central Ubud for dinner',
        'Kembali ke pusat Ubud untuk makan malam',
      ),
      'evening',
    ),
  donnaCentre: (url: string) =>
    stop(
      'Donna',
      url,
      'restaurant',
      L('العشاء في السنتر', 'Dinner in the town centre', 'Makan malam di pusat kota'),
      'evening',
    ),
  watercress: (url: string) =>
    stop('Watercress Ubud Watercress Cafe Ubud', url, 'restaurant', BREAKFAST, 'morning'),
  kuberChange: (url: string) =>
    stop(
      'KUBER ATV BALI',
      url,
      'activity',
      L(
        'الذهاب إلى دبابات كوبر — خذ معك ملابس للتغيير',
        'Off to the Kuber ATVs — bring a change of clothes',
        'Berangkat ATV Kuber — bawa baju ganti',
      ),
    ),
  kuberAdventure: (url: string, then?: L3) =>
    stop(
      'KUBER ATV BALI',
      url,
      'activity',
      L(
        'بعدها مغامرة كوبر بالي بركوب الدبابات',
        'Then the Kuber Bali ATV adventure',
        'Lalu petualangan ATV Kuber Bali',
      ),
      undefined,
      then,
    ),
  pohGading: (url: string) =>
    stop(
      'Poh Gading Waterfall',
      url,
      'attraction',
      L(
        'زيارة الشلال؛ يُفضَّل الاستمتاع بالمكان وشرب العصير فقط، فهو ليس مكانًا مثاليًا للأكل',
        'Visit the waterfall — best just to enjoy it with a juice; it is not an ideal place to eat',
        'Kunjungi air terjun — cukup nikmati dengan jus; bukan tempat ideal untuk makan',
      ),
    ),
  blangsingah: (url: string) =>
    stop(
      'Blangsingah Glass Bridge JEMBATAN KACA BALI BLANGSINGA',
      url,
      'attraction',
      L('الذهاب إلى الجسر الزجاجي', 'On to the glass bridge', 'Menuju jembatan kaca'),
    ),
  omma: (url: string, then?: L3) =>
    stop(
      'Omma Dayclub Bali',
      url,
      'restaurant',
      L(
        'والغداء بعدها في هذا المطعم المطل على شلال Tegenungan Waterfall',
        'Then lunch at this restaurant overlooking Tegenungan Waterfall',
        'Lalu makan siang di restoran yang menghadap Tegenungan Waterfall ini',
      ),
      'midday',
      then,
    ),
  barbacoa: (url: string) =>
    stop(
      'Barbacoa Restaurant',
      url,
      'restaurant',
      L(
        'العشاء في المطعم المكسيكي',
        'Dinner at the Mexican restaurant',
        'Makan malam di restoran Meksiko',
      ),
      'evening',
    ),
  mauriLuxury: (url: string) =>
    stop(
      'Mauri Restaurant',
      url,
      'restaurant',
      L(
        'العشاء في مطعم إيطالي فاخر (يُفضَّل الحجز)',
        'Dinner at an upscale Italian restaurant (booking recommended)',
        'Makan malam di restoran Italia mewah (sebaiknya reservasi)',
      ),
      'evening',
    ),
  mauriNearClub: (url: string) =>
    stop(
      'Mauri Restaurant',
      url,
      'restaurant',
      L(
        'العشاء في المطعم الإيطالي القريب من النادي',
        'Dinner at the Italian restaurant near the club',
        'Makan malam di restoran Italia dekat club',
      ),
      'evening',
    ),
  chaiba: (url: string) =>
    stop(
      "Chai'Ba Authentic Indian Cuisine",
      url,
      'restaurant',
      L(
        'العشاء في المطعم الهندي «شيبه»',
        "Dinner at the Indian restaurant Chai'Ba",
        "Makan malam di restoran India Chai'Ba",
      ),
      'evening',
    ),
  breadYard: (url: string) =>
    stop('Bread Yard - Seminyak', url, 'restaurant', BREAKFAST, 'morning'),
  do32Coffee: (url: string) =>
    stop(
      '32do Bali',
      url,
      'cafe',
      L('القهوة في الكوفي المختص', 'Coffee at the specialty café', 'Kopi di kafe spesialti'),
    ),
  do32Breakfast: (url: string) => stop('32do Bali', url, 'cafe', BREAKFAST, 'morning'),
  atlasAfternoon: (url: string) =>
    stop(
      'Atlas Beach Club',
      url,
      'beach_club',
      L(
        'العصر: التوجه إلى المطعم والمنتجع البحري والجلوس فيه حتى المساء',
        'Afternoon: head to the seaside restaurant and resort and stay until the evening',
        'Sore: menuju restoran dan resor tepi laut, dan bersantai hingga malam',
      ),
      'afternoon',
    ),
  atlasClub: (url: string) =>
    stop(
      'Atlas Beach Club',
      url,
      'beach_club',
      L('بعدها التوجه إلى النادي الشاطئي', 'Then on to the beach club', 'Lalu menuju beach club'),
    ),
  milano: (url: string) =>
    stop(
      'Milano',
      url,
      'restaurant',
      L(
        'العشاء في المطعم الإيطالي ميلانو',
        'Dinner at Milano, the Italian restaurant',
        'Makan malam di Milano, restoran Italia',
      ),
      'evening',
    ),
  silk: (url: string) =>
    stop(
      'SILK RESTAURANT Canggu',
      url,
      'restaurant',
      L(
        'العشاء في المطعم الأوزبكي المميز',
        'Dinner at the standout Uzbek restaurant',
        'Makan malam di restoran Uzbek istimewa',
      ),
      'evening',
    ),
  transStudio: (url: string) =>
    stop(
      'Trans Studio Theme Park Bali',
      url,
      'activity',
      L(
        'التوجه إلى مدينة الملاهي ترانس استوديو',
        'On to the Trans Studio theme park',
        'Menuju taman hiburan Trans Studio',
      ),
    ),
  brunchClub: (url: string) => stop('Brunch Club Legian', url, 'restaurant', BREAKFAST, 'morning'),
  tanjungBenoa: (url: string) =>
    stop(
      'Tanjung Benoa Beach',
      url,
      'activity',
      L('الألعاب البحرية في نوسا دوا', 'Water sports in Nusa Dua', 'Olahraga air di Nusa Dua'),
    ),
  tamanAir: (url: string) =>
    stop('Taman Air Spa', url, 'spa', L('بعدها جلسة مساج', 'Then a massage', 'Lalu pijat')),
  boyNCow: (url: string) =>
    stop(
      "Boy'N'Cow",
      url,
      'restaurant',
      L(
        'العودة والعشاء في مطعم الستيك (يُفضَّل الحجز)',
        'Back for dinner at the steakhouse (booking recommended)',
        'Kembali untuk makan malam di steakhouse (sebaiknya reservasi)',
      ),
      'evening',
    ),
  cliffOpens3: (url: string) =>
    stop(
      'CLIFF at Canna',
      url,
      'restaurant',
      L(
        'بعدها الاتجاه إلى نوسا دوا والمطعم الفاخر؛ يفتح الساعة 3 ظهرًا (يُفضَّل الحجز)',
        'Then to Nusa Dua and the upscale restaurant; it opens at 3 pm (booking recommended)',
        'Lalu ke Nusa Dua dan restoran mewahnya; buka pukul 15.00 (sebaiknya reservasi)',
      ),
      'afternoon',
    ),
  cliffOcean: (url: string) =>
    stop(
      'CLIFF at Canna',
      url,
      'restaurant',
      L(
        'العصر: هذا المطعم المطل على المحيط — مطعم ستيك ويحتاج حجزًا',
        'Afternoon: this ocean-view restaurant — a steakhouse that needs booking',
        'Sore: restoran dengan pemandangan laut ini — steakhouse yang perlu reservasi',
      ),
      'afternoon',
    ),
  beachwalkBeforeFlight: (url: string) =>
    stop(
      'Beachwalk Shopping Center',
      url,
      'shopping',
      L(
        'بعدها التوجه إلى مول بيتش ووك في كوتا والتسوّق قبل السفر',
        'Then to Beachwalk mall in Kuta for shopping before the flight',
        'Lalu ke mal Beachwalk di Kuta untuk belanja sebelum pulang',
      ),
    ),
  beachwalkKutaBeach: (url: string) =>
    stop(
      'Beachwalk Shopping Center',
      url,
      'shopping',
      L(
        'بعدها التوجه إلى مول بيتش ووك المطل على شاطئ كوتا',
        'Then to Beachwalk mall overlooking Kuta beach',
        'Lalu ke mal Beachwalk yang menghadap Pantai Kuta',
      ),
    ),
  jazeerahDinner: (url: string) =>
    stop(
      'Al Jazeerah Signature',
      url,
      'restaurant',
      L(
        'العودة والعشاء في مطعم الجزيرة العربي',
        'Back for dinner at the Arabic restaurant Al Jazeerah',
        'Kembali untuk makan malam di restoran Arab Al Jazeerah',
      ),
      'evening',
    ),
  jazeerahLunch: (url: string, then?: L3) =>
    stop(
      'Al Jazeerah Signature',
      url,
      'restaurant',
      L(
        'الغداء في مطعم الجزيرة العربي',
        'Lunch at the Arabic restaurant Al Jazeerah',
        'Makan siang di restoran Arab Al Jazeerah',
      ),
      'midday',
      then,
    ),
  sapa: (url: string) =>
    stop(
      'Sapa Seafood & Grill - Nusa Dua',
      url,
      'restaurant',
      L(
        'والغداء في المطعم البحري',
        'And lunch at the seafood restaurant',
        'Dan makan siang di restoran seafood',
      ),
      'midday',
    ),
  abunawas: (url: string) =>
    stop(
      'Abunawas Restaurant',
      url,
      'restaurant',
      L(
        'العشاء في المطعم العربي أبو نواس',
        'Dinner at the Arabic restaurant Abunawas',
        'Makan malam di restoran Arab Abunawas',
      ),
      'evening',
    ),
  sundari: (url: string) =>
    stop('SUNDARI Wellness', url, 'spa', L('جلسة مساج', 'A massage', 'Pijat')),
  luna: (url: string) =>
    stop(
      'Luna Beach Club',
      url,
      'beach_club',
      L(
        'بعدها زيارة منطقة نياني والغداء فيها؛ يُفضَّل لبس ملابس السباحة وقضاء يوم كامل',
        'Then the Nyanyi area with lunch there; wear swimwear and plan to stay the whole day',
        'Lalu kawasan Nyanyi dan makan siang di sana; pakai baju renang dan habiskan seharian',
      ),
    ),
  waterbom: (url: string) =>
    stop(
      'Waterbom Bali',
      url,
      'activity',
      L(
        'بعدها الذهاب إلى القرية المائية «ووتربوم» وقضاء يوم كامل حتى الساعة 6 مساءً',
        'Then to the Waterbom water park for a full day, until 6 pm',
        'Lalu ke taman air Waterbom seharian, sampai pukul 18.00',
      ),
    ),
  spiceMantraa: (url: string) =>
    stop(
      'Spice Mantraa Kuta',
      url,
      'restaurant',
      L(
        'بعدها الخروج والغداء في المطعم الهندي',
        'Then out for lunch at the Indian restaurant',
        'Lalu keluar untuk makan siang di restoran India',
      ),
      'midday',
    ),
  goldenMalabar: (url: string) =>
    stop(
      'Golden Malabar Bali',
      url,
      'cafe',
      L('القهوة المختصة في هذا المكان', 'Specialty coffee here', 'Kopi spesialti di sini'),
    ),
  dods: (url: string) =>
    stop(
      "Dod's Burger x MeatCraft Seminyak",
      url,
      'restaurant',
      L(
        'العشاء في مطعم البرجر',
        'Dinner at the burger restaurant',
        'Makan malam di restoran burger',
      ),
      'evening',
    ),
  wyah: (url: string) =>
    stop(
      'WYAH UBUD Art & Creative Space WYAH Art & Creative Space',
      url,
      'restaurant',
      BREAKFAST,
      'morning',
    ),
  zali: (url: string) =>
    stop(
      'ZALI | Lebanese Restaurant Uluwatu',
      url,
      'restaurant',
      L(
        'العشاء في المطعم العربي',
        'Dinner at the Arabic restaurant',
        'Makan malam di restoran Arab',
      ),
      'evening',
    ),
  arabica: (url: string) => stop('% Arabica Bali Uluwatu', url, 'cafe', BREAKFAST, 'morning'),
  gooseberry: (url: string) =>
    stop(
      'Gooseberry French Restaurant | Uluwatu',
      url,
      'restaurant',
      L(
        'العشاء في المطعم الفرنسي',
        'Dinner at the French restaurant',
        'Makan malam di restoran Prancis',
      ),
      'evening',
    ),
  alasHarum: (url: string, then?: L3) =>
    stop(
      'Alas Harum Bali',
      url,
      'activity',
      L(
        'مزارع الأرز وفيها بعض الفعاليات (زيبلاين وسكاي بايك)، والغداء فيها',
        'The rice terraces, with zipline and sky bike, and lunch there',
        'Sawah terasering dengan zipline dan sky bike, dan makan siang di sana',
      ),
      undefined,
      then,
    ),
  teja: (url: string) =>
    stop(
      'Teja Uluwatu',
      url,
      'restaurant',
      L(
        'العصر: هذا المطعم والمكان لمشاهدة الغروب؛ يفتح الساعة 4 مساءً',
        'Afternoon: this restaurant and spot for the sunset; it opens at 4 pm',
        'Sore: restoran dan tempat menikmati matahari terbenam ini; buka pukul 16.00',
      ),
      'afternoon',
    ),
  // ---- 10-day programmes (Nov 2026) ----
  hutCafe: (url: string) => stop('HUT Cafe Bali', url, 'cafe', BREAKFAST, 'morning'),
  alasHarumRice: (url: string) =>
    stop(
      'Alas Harum Bali',
      url,
      'activity',
      L(
        'مزارع الأرز وفيها بعض الفعاليات: زيبلاين والسكاي بايك',
        'The rice terraces, with activities such as the zipline and the sky bike',
        'Sawah terasering dengan aktivitas seperti zipline dan sky bike',
      ),
    ),
  cretyaLunch: (url: string) =>
    stop(
      'Cretya Ubud',
      url,
      'restaurant',
      L(
        'الغداء في المطعم داخل حدائق الأرز',
        'Lunch at the restaurant inside the rice terraces',
        'Makan siang di restoran di tengah sawah',
      ),
      'midday',
    ),
  secretGardenCare: (url: string) =>
    stop(
      'Secret Garden Village',
      url,
      'attraction',
      L(
        'مزار جميل وحديقة فيها منتجات عناية ومناطق قهوة',
        'A pretty stop: a garden with care products and coffee corners',
        'Tempat cantik: taman dengan produk perawatan dan sudut kopi',
      ),
    ),
  mrSmashBackToCentre: (url: string) =>
    stop(
      'Mr.Smash Burger - Ubud',
      url,
      'restaurant',
      L(
        'العودة إلى سنتر أوبود والعشاء في مطعم برجر',
        'Back to central Ubud for dinner at a burger restaurant',
        'Kembali ke pusat Ubud untuk makan malam di restoran burger',
      ),
      'evening',
    ),
  osteriaBackToCentre: (url: string) =>
    stop(
      "L'Osteria Pizza e Cucina Ubud",
      url,
      'restaurant',
      L(
        'العودة إلى سنتر أوبود والعشاء في المطعم الإيطالي',
        'Back to central Ubud for dinner at the Italian restaurant',
        'Kembali ke pusat Ubud untuk makan malam di restoran Italia',
      ),
      'evening',
    ),
  sevenAm: (url: string) => stop('7AM Bakers | 7PM Diners Ubud', url, 'cafe', BREAKFAST, 'morning'),
  siraVillage: (url: string, then?: L3) =>
    stop(
      'Sira Village Grand Outlet Bali',
      url,
      'shopping',
      L(
        'الاتجاه إلى أولواتو، وفي الطريق زيارة أحدث مولات بالي',
        'Head to Uluwatu, with a visit on the way to the newest mall in Bali',
        'Menuju Uluwatu, dengan mampir di mal terbaru di Bali',
      ),
      undefined,
      then,
    ),
  bb52: (url: string) =>
    stop(
      'BB52 Burgers Uluwatu',
      url,
      'restaurant',
      L(
        'العشاء في مطعم البرجر',
        'Dinner at the burger restaurant',
        'Makan malam di restoran burger',
      ),
      'evening',
    ),
  singleFin: (url: string) =>
    stop(
      'Single Fin Bali',
      url,
      'restaurant',
      L('العشاء في هذا المطعم', 'Dinner at this restaurant', 'Makan malam di restoran ini'),
      'evening',
    ),
  balicopter: (url: string) =>
    stop(
      'Balicopter - Helicopter Tour And Transfer',
      url,
      'activity',
      L(
        'اقتراح هذا اليوم: تجربة الهيلوكبتر في بالي',
        'Suggested for today: a helicopter ride over Bali',
        'Saran hari ini: naik helikopter di atas Bali',
      ),
    ),
  koral: (url: string) =>
    stop(
      'Koral: Bali’s First Aquarium Restaurant',
      url,
      'restaurant',
      L(
        'الغداء في المطعم البحري الفاخر في فندق كمبينسكي (يحتاج حجزًا)',
        'Lunch at the fine seafood restaurant in the Kempinski hotel (booking needed)',
        'Makan siang di restoran seafood mewah di hotel Kempinski (perlu reservasi)',
      ),
      'midday',
    ),
  bollywood: (url: string) =>
    stop(
      'Bollywood Indian Cuisine Seminyak',
      url,
      'restaurant',
      L(
        'العشاء في المطعم الهندي',
        'Dinner at the Indian restaurant',
        'Makan malam di restoran India',
      ),
      'evening',
    ),
}

/* ---------------- Day notes and areas from the source ---------------- */

export const AREA = {
  ubud: L('أوبود', 'Ubud', 'Ubud'),
  seminyak: L('سيمنياك', 'Seminyak', 'Seminyak'),
  uluwatu: L('أولواتو', 'Uluwatu', 'Uluwatu'),
}

export const NOTE = {
  lateArrival: L(
    'الوصول في اليوم الأول قد يكون متأخرًا؛ نحاول ترتيب زيارة لمزار بسيط في طريقك إلى أوبود.',
    'You may land late on day one; we try to fit in a simple stop on your way to Ubud.',
    'Anda mungkin tiba larut di hari pertama; kami usahakan satu kunjungan ringan dalam perjalanan ke Ubud.',
  ),
  arrivalDriver: L(
    'الوصول إلى مطار بالي والاستقبال من قبل سائقنا. اليوم الأول عادةً خفيف ولا توجد فيه فعاليات.',
    'Arrive at Bali airport and meet our driver. Day one is usually light, with no activities.',
    'Tiba di bandara Bali dan dijemput sopir kami. Hari pertama biasanya ringan, tanpa aktivitas.',
  ),
  rafting: L(
    'الخروج مبكرًا إلى التجديف، ويُفضَّل أن تكون معك ملابس غيار. اجعل السيارة مريحة لأن الطريق طويل وفيه فعاليات.',
    'Leave early for rafting and bring a change of clothes. Make sure the car is comfortable — the road is long and the day is full.',
    'Berangkat pagi untuk rafting dan bawa baju ganti. Pastikan mobil nyaman — jalannya jauh dan harinya padat.',
  ),
  checkoutUbudToSeminyak: L(
    'الخروج مبكرًا وتسجيل الخروج من الفندق؛ يوم فعاليات في طريقك إلى سيمنياك حتى لا يضيع.',
    'Leave early and check out; an activity day on the way to Seminyak, so it is not lost to the drive.',
    'Berangkat pagi dan check-out; hari aktivitas dalam perjalanan ke Seminyak agar tidak terbuang di jalan.',
  ),
  relaxNoActivities: L(
    'يوم استجمام وزيارات واستكشاف بدون فعاليات.',
    'A day of rest, visits and exploring, with no activities.',
    'Hari istirahat, jalan-jalan, dan eksplorasi, tanpa aktivitas.',
  ),
  waterAndShopping: L(
    'يوم ألعاب بحرية وتسوّق — ملابس الغيار ضرورية.',
    'Water sports and shopping — a change of clothes is a must.',
    'Olahraga air dan belanja — baju ganti wajib.',
  ),
  bedugul: L(
    'زيارة بيدوقول وبحيرة براتان.',
    'A visit to Bedugul and Lake Beratan.',
    'Kunjungan ke Bedugul dan Danau Beratan.',
  ),
  bedugulClothes: L(
    'خذ معك ملابس غيار، والاتجاه إلى بحيرة براتان في بيدوقول.',
    'Bring a change of clothes; the day heads to Lake Beratan in Bedugul.',
    'Bawa baju ganti; hari ini menuju Danau Beratan di Bedugul.',
  ),
  themePark: L(
    'يوم فعاليات للأطفال والكبار في مدينة الملاهي.',
    'A day of fun for kids and adults at the theme park.',
    'Hari seru untuk anak dan dewasa di taman hiburan.',
  ),
  waterbom: L(
    'يوم مدينة الألعاب المائية «ووتربوم» في كوتا — لا بد من ملابس غيار.',
    'Waterbom water park day in Kuta — a change of clothes is a must.',
    'Hari taman air Waterbom di Kuta — baju ganti wajib.',
  ),
  checkoutSeminyakToUbud: L(
    'تسجيل الخروج من فندق سيمنياك والاتجاه إلى أوبود؛ يوم فعاليات أثناء الطريق.',
    'Check out of the Seminyak hotel and head to Ubud, with activities on the way.',
    'Check-out dari hotel Seminyak dan menuju Ubud, dengan aktivitas di jalan.',
  ),
  toUluwatuAtv: L(
    'تسجيل الخروج والتوجه إلى أولواتو؛ الطريق طويل، ويمكن إدخال فعالية الدبابات (لا بد من ملابس غيار).',
    'Check out and head to Uluwatu; the drive is long and an ATV ride can fit in (a change of clothes is a must).',
    'Check-out dan menuju Uluwatu; perjalanannya jauh dan bisa diselipkan ATV (baju ganti wajib).',
  ),
  toUluwatuRice: L(
    'تسجيل الخروج والتوجه إلى أولواتو؛ الطريق طويل، ويمكن إدخال فعالية غابات الأرز والمراجيح والزيبلاين (لا بد من ملابس غيار).',
    'Check out and head to Uluwatu; the drive is long and the rice-forest swings and zipline can fit in (a change of clothes is a must).',
    'Check-out dan menuju Uluwatu; perjalanannya jauh dan bisa diselipkan ayunan dan zipline di hutan sawah (baju ganti wajib).',
  ),
  lastDay: L(
    'آخر يوم: استجمام ويوم خفيف.',
    'Last day: rest and an easy pace.',
    'Hari terakhir: santai dan ringan.',
  ),
  activityDayClothes: L(
    'يوم فعاليات، ويُفضَّل أخذ ملابس غيار.',
    'An activity day — bring a change of clothes.',
    'Hari aktivitas — bawa baju ganti.',
  ),
  toUluwatuLong: L(
    'تسجيل الخروج من فندق أوبود باتجاه أولواتو. يُفضَّل أن تكون السيارة مريحة لأن الطريق طويل (قرابة 3 ساعات)، والأفضل أن يكون الغداء فقط في منتصف الطريق.',
    'Check out of the Ubud hotel and head to Uluwatu. Make sure the car is comfortable: the drive is long (about 3 hours), and it is best to stop only for lunch halfway.',
    'Check-out dari hotel Ubud menuju Uluwatu. Pastikan mobil nyaman: perjalanannya jauh (sekitar 3 jam), dan sebaiknya hanya berhenti untuk makan siang di tengah jalan.',
  ),
  helicopterShopping: L(
    'يوم هيلوكبتر وتسوّق.',
    'A helicopter and shopping day.',
    'Hari helikopter dan belanja.',
  ),
  noActivitiesFirstDay: L(
    'بما أنه اليوم الأول فلا فعاليات فيه.',
    'As it is the first day, there are no activities.',
    'Karena hari pertama, tidak ada aktivitas.',
  ),
}

export const DEPARTURE_6 = L(
  'يوم السفر: السائق يأتيك في الوقت المحدد ويوصلك إلى المطار.',
  'Departure day: the driver collects you at the agreed time and takes you to the airport.',
  'Hari kepulangan: sopir menjemput pada waktu yang disepakati dan mengantar ke bandara.',
)
export const DEPARTURE_8 = L(
  'يوم السفر: السائق سيأتيك في الموقع والوقت المحددين.',
  'Departure day: the driver will come to the agreed place at the agreed time.',
  'Hari kepulangan: sopir akan datang ke tempat dan waktu yang disepakati.',
)
export const STAY_6 = L(
  'السكن في منطقتين: أوبود 3 أيام ثم سيمنياك 3 أيام. البدء بأوبود أفضل من إنهاء الرحلة بها لبعدها عن المطار.',
  'Two bases: Ubud for 3 days, then Seminyak for 3 days. Starting in Ubud is better than ending there, as it is far from the airport.',
  'Dua area menginap: Ubud 3 hari, lalu Seminyak 3 hari. Lebih baik memulai di Ubud daripada mengakhiri di sana karena jauh dari bandara.',
)
export const STAY_8 = L(
  'السكن في ثلاث مناطق: سيمنياك 3 أيام، ثم أوبود 3 أيام، ثم أولواتو يومان.',
  'Three bases: Seminyak for 3 days, then Ubud for 3 days, then Uluwatu for 2 days.',
  'Tiga area menginap: Seminyak 3 hari, lalu Ubud 3 hari, lalu Uluwatu 2 hari.',
)

export const STAY_10 = L(
  'السكن في ثلاث مناطق: سيمنياك 4 أيام، ثم أوبود 4 أيام، ثم أولواتو يومان.',
  'Three bases: Seminyak for 4 days, then Ubud for 4 days, then Uluwatu for 2 days.',
  'Tiga area menginap: Seminyak 4 hari, lalu Ubud 4 hari, lalu Uluwatu 2 hari.',
)

export const ACT = {
  rafting: [
    'BMW Rafting BMW (Bali Mesari Wisata) Rafting',
    'BMW Rafting',
    'Bali Mesari Wisata Rafting',
  ],
  atv: ['KUBER ATV BALI', 'Kuber ATV', 'Kuber Bali ATV'],
  water: ['Tanjung Benoa Water Sports', 'Tanjung Benoa Water Sports Bali'],
  themePark: ['Trans Studio Theme Park Bali', 'Trans Studio Bali', 'Trans Studio'],
  waterbom: ['Waterbom Bali', 'Waterbom'],
  rice: ['Alas Harum Bali', 'Alas Harum'],
  helicopter: ['Balicopter - Helicopter Tour And Transfer', 'Balicopter', 'Bali Helicopter Tour'],
} as const
