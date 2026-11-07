/**
 * «جدول العائلة 8 أيام» — source: «جدول سياحي 8 أيام - بالي شباب - شهر عسل -
 * عوائل.pdf», section «جدول سياحي عائلي» (pages 15–22). Links verbatim.
 */

import { ACT, AREA, DEPARTURE_8, NOTE, P, STAY_8, THEN } from './places'
import {
  benefitsFor,
  faqFor,
  HOW_STEPS,
  L,
  statsFor,
  type ItinerarySeed,
  type SeedDay,
} from './shared'

const DAYS: SeedDay[] = [
  {
    dayNumber: 1,
    area: AREA.seminyak,
    title: L(
      'الوصول والاستقرار في سيمنياك',
      'Arrival and settling into Seminyak',
      'Tiba dan menetap di Seminyak',
    ),
    description: L(
      'غداء عربي، تسجيل الدخول في سيمنياك، النادي الشاطئي، والعشاء الأوزبكي.',
      'An Arabic lunch, check-in in Seminyak, the beach club and an Uzbek dinner.',
      'Makan siang Arab, check-in di Seminyak, beach club, dan makan malam Uzbek.',
    ),
    notes: [NOTE.arrivalDriver],
    activityNames: [],
    stops: [
      P.jazeerahLunch(
        'https://maps.app.goo.gl/16PfsAu94SXS4VXk9?g_st=ic',
        THEN.CHECK_IN_SEMINYAK_8,
      ),
      P.atlasClub('https://maps.app.goo.gl/JTU4osZpg9G5ssWk6?g_st=ic'),
      P.silk('https://maps.app.goo.gl/GWavt4TJ9oqhrKk3A?g_st=ic'),
    ],
  },
  {
    dayNumber: 2,
    area: AREA.seminyak,
    title: L(
      'مساج ومدينة ملاهي ترانس استوديو',
      'Massage and Trans Studio theme park',
      'Pijat dan taman hiburan Trans Studio',
    ),
    description: L(
      'إفطار، جلسة مساج، مدينة الملاهي ترانس استوديو، والعشاء في المطعم العربي أبو نواس.',
      'Breakfast, a massage, the Trans Studio theme park and dinner at the Arabic restaurant Abunawas.',
      'Sarapan, pijat, taman hiburan Trans Studio, dan makan malam di restoran Arab Abunawas.',
    ),
    notes: [],
    activityNames: ACT.themePark,
    stops: [
      P.do32Breakfast('https://maps.app.goo.gl/r8aXAM9n9zDkVx7M9?g_st=ic'),
      P.sundari('https://maps.app.goo.gl/Lk3S3p76i5Yc41na9?g_st=ic'),
      P.transStudio('https://maps.app.goo.gl/eDQHT9N2Td33oewN7?g_st=ic'),
      P.abunawas('https://maps.app.goo.gl/Fy7wemjtgukmiGYC7?g_st=ic'),
    ],
  },
  {
    dayNumber: 3,
    area: AREA.seminyak,
    title: L(
      'ألعاب بحرية في نوسا دوا وتسوّق',
      'Water sports in Nusa Dua and shopping',
      'Olahraga air di Nusa Dua dan belanja',
    ),
    description: L(
      'الألعاب البحرية، ثم مول آيكون بالي والغداء الهندي، والعشاء في مطعم الستيك.',
      'Water sports, then Icon Bali mall with an Indian lunch, and dinner at the steakhouse.',
      'Olahraga air, lalu mal Icon Bali dengan makan siang India, dan makan malam di steakhouse.',
    ),
    notes: [NOTE.waterAndShopping],
    activityNames: ACT.water,
    stops: [
      P.brunchClub('https://maps.app.goo.gl/qrQejf6m828boNbT7?g_st=ic'),
      P.tanjungBenoa('https://maps.app.goo.gl/YCcwakQ5xSFMb92h6?g_st=ic'),
      P.royalKitchenIndian('https://maps.app.goo.gl/c12tbQhJHGRWUJz87?g_st=ic'),
      P.boyNCow('https://maps.app.goo.gl/s1KwTCFkWgJSvuZT6?g_st=ic'),
    ],
  },
  {
    dayNumber: 4,
    area: AREA.ubud,
    title: L(
      'شلال وجسر زجاجي في الطريق إلى أوبود',
      'A waterfall and the glass bridge on the way to Ubud',
      'Air terjun dan jembatan kaca dalam perjalanan ke Ubud',
    ),
    description: L(
      'تسجيل الخروج من سيمنياك: شلال، الجسر الزجاجي، غداء مطل على الشلال، ثم أوبود والعشاء.',
      'Check out of Seminyak: a waterfall, the glass bridge, lunch over the falls, then Ubud and dinner.',
      'Check-out dari Seminyak: air terjun, jembatan kaca, makan siang menghadap air terjun, lalu Ubud dan makan malam.',
    ),
    notes: [NOTE.checkoutSeminyakToUbud],
    activityNames: [],
    stops: [
      P.do32Breakfast('https://maps.app.goo.gl/r8aXAM9n9zDkVx7M9?g_st=ic'),
      P.pohGading('https://maps.app.goo.gl/9TpH4DJFfMqaZWfKA?g_st=ic'),
      P.blangsingah('https://maps.app.goo.gl/syWtHv7fLrazQEcBA?g_st=ic'),
      P.omma('https://maps.app.goo.gl/3e7kKVaRBwGLAawo6?g_st=ic', THEN.CHECK_IN_UBUD_SHORT),
      P.donnaCentre('https://maps.app.goo.gl/tgrSfEJ3JrBaYkKz8?g_st=ic'),
    ],
  },
  {
    dayNumber: 5,
    area: AREA.ubud,
    title: L('بيدوقول وبحيرة براتان', 'Bedugul and Lake Beratan', 'Bedugul dan Danau Beratan'),
    description: L(
      'مصنع الشوكولاتة، الحديقة السرية، البحيرة، غداء في منتجع هاندار، آيس كريم في أوبود، والعشاء برجر.',
      'The chocolate factory, the secret garden, the lake, lunch at Handara, ice cream in Ubud and a burger dinner.',
      'Pabrik cokelat, taman rahasia, danau, makan siang di Handara, es krim di Ubud, dan makan malam burger.',
    ),
    notes: [NOTE.bedugulClothes],
    activityNames: [],
    stops: [
      P.wyah('https://maps.app.goo.gl/KQmM2dFJK9nxxxoT7?g_st=ic'),
      P.junglegold('https://maps.app.goo.gl/prSkGWvkcmJAAs3k7?g_st=ic'),
      P.secretGardenHidden('https://maps.app.goo.gl/mTnrRye8CpHkwLqn8?g_st=ic'),
      P.ulunDanu('https://maps.app.goo.gl/3EY7AEwNDzcLjMHn6?g_st=ic'),
      P.hiland('https://maps.app.goo.gl/ZoD9KAiu91BmYRWz8?g_st=ic'),
      P.tukies('https://maps.app.goo.gl/HkGdRkUemQ1q3v5M9?g_st=ic'),
      P.mrSmash('https://maps.app.goo.gl/T45k3nazpH16GbbUA?g_st=ic'),
    ],
  },
  {
    dayNumber: 6,
    area: AREA.ubud,
    title: L('تجديف وكنتماني', 'Rafting and Kintamani', 'Rafting dan Kintamani'),
    description: L(
      'إفطار في السنتر، ثم التجديف، ثم قهوة في كنتماني قرب البركان، والعشاء في سنتر أوبود.',
      'Breakfast in the centre, rafting, coffee in Kintamani near the volcano, and dinner in central Ubud.',
      'Sarapan di pusat kota, rafting, kopi di Kintamani dekat gunung berapi, dan makan malam di pusat Ubud.',
    ),
    notes: [NOTE.rafting],
    activityNames: ACT.rafting,
    stops: [
      P.livingstoneHoly('https://maps.app.goo.gl/8WaZRn7kZ97F7N4N9?g_st=ic'),
      P.bmwRafting('https://maps.app.goo.gl/Kh9K4bdPBk39QiVZ9?g_st=ic'),
      P.akasa('https://maps.app.goo.gl/JUsnRmnidHKLyC3y7?'),
      P.nusaUbudCentre('https://maps.app.goo.gl/AGcmRbLNTTGUTw2m9?g_st=ic'),
    ],
  },
  {
    dayNumber: 7,
    area: AREA.uluwatu,
    title: L('دبابات ثم أولواتو', 'ATVs, then Uluwatu', 'ATV, lalu Uluwatu'),
    description: L(
      'تسجيل الخروج من أوبود، مغامرة دبابات كوبر، ثم أولواتو والعشاء العربي.',
      'Check out of Ubud, the Kuber ATV adventure, then Uluwatu and an Arabic dinner.',
      'Check-out dari Ubud, petualangan ATV Kuber, lalu Uluwatu dan makan malam Arab.',
    ),
    notes: [NOTE.toUluwatuAtv],
    activityNames: ACT.atv,
    stops: [
      P.twoFace('https://maps.app.goo.gl/umkm8KzzQt3LvEN77?g_st=ic'),
      P.kuberAdventure('https://maps.app.goo.gl/gnoL5ZjuqngwUAup9?g_st=ic', THEN.CHECK_IN_ULUWATU),
      P.zali('https://maps.app.goo.gl/fpSG43dY4SFaDeGR8?g_st=ic'),
    ],
  },
  {
    dayNumber: 8,
    area: AREA.uluwatu,
    title: L(
      'يوم أخير خفيف وغروب في أولواتو',
      'An easy last day and sunset in Uluwatu',
      'Hari terakhir santai dan senja di Uluwatu',
    ),
    description: L(
      'إفطار، ثم مشاهدة الغروب عصرًا، والعشاء الفرنسي.',
      'Breakfast, the sunset in the afternoon, and a French dinner.',
      'Sarapan, matahari terbenam di sore hari, dan makan malam Prancis.',
    ),
    notes: [NOTE.lastDay],
    activityNames: [],
    stops: [
      P.arabica('https://maps.app.goo.gl/chtEzX1oWB2TZjCw5?g_st=ic'),
      P.teja('https://maps.app.goo.gl/czb35AZaVhSwjaVJ6?g_st=ic'),
      P.gooseberry('https://maps.app.goo.gl/iKSsyLFvkyvBD9nHA?g_st=ic'),
    ],
  },
]

export const FAMILY_8_DAYS: ItinerarySeed = {
  slug: 'bali-8d-family',
  pdfName: 'bali-family-8-days-ar.pdf',
  audienceKind: 'family',
  sourceDocument: 'جدول سياحي 8 أيام - بالي شباب - شهر عسل - عوائل.pdf',
  sourcePages: '15–22 («جدول سياحي عائلي»)',
  priceMinor: null,
  currency: 'SAR',
  stay: STAY_8,
  departure: DEPARTURE_8,
  days: DAYS,
  public: {
    name: L(
      'جدول العائلة 8 أيام في بالي',
      'Bali Family Itinerary — 8 Days',
      'Itinerary Keluarga Bali — 8 Hari',
    ),
    heroTitle: L(
      'ثمانية أيام تجمع العائلة على أجمل اللحظات',
      'Eight Days of Family Moments to Treasure',
      'Delapan Hari Momen Keluarga yang Berharga',
    ),
    blurb: L(
      'جدول عائلي طويل ومريح: مرح للأطفال، وطبيعة ومغامرة، وأكل يناسب الجميع، يومًا بيوم.',
      'A longer, relaxed family plan: fun for the kids, nature and adventure, and food everyone enjoys — day by day.',
      'Rencana keluarga yang lebih panjang dan nyaman: seru untuk anak, alam dan petualangan, serta makanan yang disukai semua — hari demi hari.',
    ),
    intro: L(
      'ثمانية أيام مع العائلة تمر بسرعة إذا ضاع نصفها في التخطيط. رتّبنا لك الرحلة على ثلاث مناطق سكن، بأيام فيها ملاهٍ ولعب للأطفال، وأيام طبيعة ومغامرة، ويوم أخير هادئ، مع مطاعم مألوفة للعائلة وتنبيهات عملية قبل كل يوم يحتاج استعدادًا.',
      'Eight family days go fast when half of them are spent planning. The trip is arranged across three bases, with play days for the kids, nature and adventure days and a calm last day, plus family-friendly restaurants and practical reminders before every day that needs preparing.',
      'Delapan hari bersama keluarga cepat berlalu jika separuhnya habis untuk merencanakan. Perjalanan disusun di tiga area menginap, dengan hari bermain untuk anak, hari alam dan petualangan, dan hari terakhir yang tenang, plus restoran ramah keluarga dan pengingat praktis sebelum hari yang perlu persiapan.',
    ),
    tripType: L('عائلي', 'Family', 'Keluarga'),
    audience: [
      L('العائلات', 'Families', 'Keluarga'),
      L('مناسب للأطفال', 'Kid-friendly', 'Ramah anak'),
    ],
    suitableFor: L(
      'للعائلات التي تريد رحلة أطول بإيقاع مريح للجميع.',
      'For families who want a longer trip at a pace that suits everyone.',
      'Untuk keluarga yang ingin perjalanan lebih panjang dengan ritme yang nyaman bagi semua.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L(
        'وصول هادئ وبداية خفيفة',
        'A calm arrival and an easy start',
        'Kedatangan santai dan awal yang ringan',
      ),
      L(
        'يوم مرح للأطفال والكبار',
        'A fun day for kids and adults',
        'Hari seru untuk anak dan dewasa',
      ),
      L('بحر وألعاب وتسوّق', 'Sea, games and shopping', 'Laut, permainan dan belanja'),
      L(
        'طبيعة وإطلالات على الطريق',
        'Nature and views on the way',
        'Alam dan pemandangan di perjalanan',
      ),
      L('نزهة في الأجواء الباردة', 'An outing in the cool air', 'Jalan-jalan di udara sejuk'),
      L('يوم مغامرة للعائلة', 'An adventure day for the family', 'Hari petualangan keluarga'),
      L('حماس ثم سكن جديد', 'Thrills, then a new base', 'Keseruan, lalu area baru'),
      L('ختام هادئ وغروب', 'A calm finale and the sunset', 'Penutup tenang dan matahari terbenam'),
    ],
    moodLines: [
      L(
        'غداء، استقرار، وأمسية لطيفة.',
        'Lunch, settle in, a gentle evening.',
        'Makan siang, menetap, malam yang santai.',
      ),
      L(
        'راحة للكبار ولعب للصغار.',
        'Rest for adults, play for the little ones.',
        'Santai untuk orang tua, bermain untuk si kecil.',
      ),
      L('ملابس الغيار ضرورية.', 'A change of clothes is a must.', 'Baju ganti wajib.'),
      L('انتقال إلى السكن الثاني.', 'Moving to your second base.', 'Pindah ke area kedua.'),
      L(
        'محطات منوعة تحبها العائلة.',
        'Varied stops the whole family enjoys.',
        'Tempat beragam yang disukai keluarga.',
      ),
      L(
        'اخرجوا مبكرًا ومعكم ملابس غيار.',
        'Leave early with a change of clothes.',
        'Berangkat pagi dengan baju ganti.',
      ),
      L('انتقال إلى السكن الثالث.', 'Moving to your third base.', 'Pindah ke area ketiga.'),
      L('آخر يوم قبل السفر.', 'The last day before you fly.', 'Hari terakhir sebelum pulang.'),
    ],
    seoTitle: L(
      'جدول سياحي للعائلة 8 أيام في بالي',
      '8-Day Bali Family Itinerary',
      'Itinerary Keluarga 8 Hari di Bali',
    ),
    seoDescription: L(
      'جدول عائلي جاهز لـ8 أيام في بالي على ثلاث مناطق سكن: أيام متوازنة، مطاعم تناسب العائلة، رابط خريطة لكل محطة، وملف PDF فور الدفع.',
      'A ready 8-day family plan for Bali across three bases: balanced days, family-friendly restaurants, a map link for every stop and a PDF the moment you pay.',
      'Rencana keluarga 8 hari di Bali di tiga area menginap: hari seimbang, restoran ramah keluarga, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('family', 8, 3),
    benefits: benefitsFor('family'),
    how: HOW_STEPS,
  },
}
