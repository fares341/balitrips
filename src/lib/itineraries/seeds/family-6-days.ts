/**
 * «جدول العائلة 6 أيام» — source: «جداول سياحية 6 أيام - بالي شباب - شهر عسل -
 * عوائل.pdf», section «جدول عائلي» (pages 12–18). Links verbatim.
 */

import { ACT, AREA, DEPARTURE_6, NOTE, P, STAY_6, THEN } from './places'
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
    area: AREA.ubud,
    title: L(
      'الوصول والاستقرار في أوبود',
      'Arrival and settling into Ubud',
      'Tiba dan menetap di Ubud',
    ),
    description: L(
      'غداء في الطريق، ثم تسجيل الدخول في أوبود، وجولة في السنتر، والعشاء.',
      'Lunch on the way, check-in in Ubud, a stroll in the centre and dinner.',
      'Makan siang di jalan, check-in di Ubud, jalan-jalan di pusat kota, dan makan malam.',
    ),
    notes: [NOTE.lateArrival],
    activityNames: [],
    stops: [
      P.royalKitchenOnTheWay(
        'https://maps.app.goo.gl/5jaN2KyfEimeUBja6?g_st=ic',
        THEN.CHECK_IN_UBUD,
      ),
      P.frenchCrepe('https://maps.app.goo.gl/CjRPbXBK3mXVSrDe8?g_st=ic'),
      P.nusaUbudVaried('https://maps.app.goo.gl/BqEP6bXLcvetSu6w6?g_st=ic'),
    ],
  },
  {
    dayNumber: 2,
    area: AREA.ubud,
    title: L('بيدوقول وبحيرة براتان', 'Bedugul and Lake Beratan', 'Bedugul dan Danau Beratan'),
    description: L(
      'مصنع الشوكولاتة، الحديقة والقهوة، البحيرة، غداء في منتجع هاندار، آيس كريم في أوبود، والعشاء برجر.',
      'The chocolate factory, the garden and coffee, the lake, lunch at Handara, ice cream in Ubud and a burger dinner.',
      'Pabrik cokelat, taman dan kopi, danau, makan siang di Handara, es krim di Ubud, dan makan malam burger.',
    ),
    notes: [NOTE.bedugul],
    activityNames: [],
    stops: [
      P.twoFace('https://maps.app.goo.gl/umkm8KzzQt3LvEN77?g_st=ic'),
      P.junglegold('https://maps.app.goo.gl/prSkGWvkcmJAAs3k7?g_st=ic'),
      P.secretGardenVisit('https://maps.app.goo.gl/sVeekMYbzX1Ghk4Z8?g_st=ic'),
      P.blackEyeSameGarden('https://maps.app.goo.gl/mTnrRye8CpHkwLqn8?g_st=ic'),
      P.ulunDanu('https://maps.app.goo.gl/3EY7AEwNDzcLjMHn6?g_st=ic'),
      P.hiland('https://maps.app.goo.gl/ZoD9KAiu91BmYRWz8?g_st=ic'),
      P.tukies('https://maps.app.goo.gl/HkGdRkUemQ1q3v5M9?g_st=ic'),
      P.mrSmash('https://maps.app.goo.gl/wq1bGb6DP98iBUkVA?g_st=ic'),
    ],
  },
  {
    dayNumber: 3,
    area: AREA.ubud,
    title: L('تجديف وكنتماني', 'Rafting and Kintamani', 'Rafting dan Kintamani'),
    description: L(
      'إفطار في السنتر، ثم التجديف، ثم قهوة في كنتماني قرب البركان، والعشاء في أوبود.',
      'Breakfast in the centre, rafting, coffee in Kintamani near the volcano, and dinner in Ubud.',
      'Sarapan di pusat kota, rafting, kopi di Kintamani dekat gunung berapi, dan makan malam di Ubud.',
    ),
    notes: [NOTE.rafting],
    activityNames: ACT.rafting,
    stops: [
      P.livingstoneHoly('https://maps.app.goo.gl/8WaZRn7kZ97F7N4N9?g_st=ic'),
      P.bmwRafting('https://maps.app.goo.gl/Kh9K4bdPBk39QiVZ9?g_st=ic'),
      P.akasa('https://maps.app.goo.gl/JUsnRmnidHKLyC3y7?'),
      P.donnaBackToCentre('https://maps.app.goo.gl/47tpjKMT66tNjsAU6?g_st=ic'),
    ],
  },
  {
    dayNumber: 4,
    area: AREA.seminyak,
    title: L(
      'شلال وجسر زجاجي في الطريق إلى سيمنياك',
      'A waterfall and the glass bridge on the way to Seminyak',
      'Air terjun dan jembatan kaca dalam perjalanan ke Seminyak',
    ),
    description: L(
      'تسجيل الخروج من أوبود: شلال، الجسر الزجاجي، غداء مطل على الشلال، ثم سيمنياك وعشاء هندي.',
      'Check out of Ubud: a waterfall, the glass bridge, lunch over the falls, then Seminyak and an Indian dinner.',
      'Check-out dari Ubud: air terjun, jembatan kaca, makan siang menghadap air terjun, lalu Seminyak dan makan malam India.',
    ),
    notes: [NOTE.checkoutUbudToSeminyak],
    activityNames: [],
    stops: [
      P.watercress('https://maps.app.goo.gl/y1JN6EhfqY1ZPeyn7?g_st=ic'),
      P.pohGading('https://maps.app.goo.gl/9TpH4DJFfMqaZWfKA?g_st=ic'),
      P.blangsingah('https://maps.app.goo.gl/syWtHv7fLrazQEcBA?g_st=ic'),
      P.omma('https://maps.app.goo.gl/3e7kKVaRBwGLAawo6?g_st=ic', THEN.CHECK_IN_SEMINYAK),
      P.chaiba('https://maps.app.goo.gl/TcjdA1Z9WDu4tkGn6?g_st=ic'),
    ],
  },
  {
    dayNumber: 5,
    area: AREA.seminyak,
    title: L('يوم مدينة الملاهي', 'Theme park day', 'Hari taman hiburan'),
    description: L(
      'إفطار وقهوة، ثم مدينة الملاهي ترانس استوديو، والعشاء في المطعم الأوزبكي.',
      'Breakfast and coffee, the Trans Studio theme park, and dinner at the Uzbek restaurant.',
      'Sarapan dan kopi, taman hiburan Trans Studio, dan makan malam di restoran Uzbek.',
    ),
    notes: [NOTE.themePark],
    activityNames: ACT.themePark,
    stops: [
      P.breadYard('https://maps.app.goo.gl/Ju9y1FPhZH2NbWSX7?g_st=ic'),
      P.do32Coffee('https://maps.app.goo.gl/7e8a5w9ZvjXZhjLMA?g_st=ic'),
      P.transStudio('https://maps.app.goo.gl/eDQHT9N2Td33oewN7?g_st=ic'),
      P.silk('https://maps.app.goo.gl/GWavt4TJ9oqhrKk3A?g_st=ic'),
    ],
  },
  {
    dayNumber: 6,
    area: AREA.seminyak,
    title: L(
      'ألعاب بحرية في نوسا دوا وتسوّق',
      'Water sports in Nusa Dua and shopping',
      'Olahraga air di Nusa Dua dan belanja',
    ),
    description: L(
      'الألعاب البحرية، غداء في مطعم بحري، التسوّق في كوتا، والعشاء في المطعم العربي.',
      'Water sports, lunch at a seafood restaurant, shopping in Kuta and dinner at the Arabic restaurant.',
      'Olahraga air, makan siang di restoran seafood, belanja di Kuta, dan makan malam di restoran Arab.',
    ),
    notes: [NOTE.waterAndShopping],
    activityNames: ACT.water,
    stops: [
      P.brunchClub('https://maps.app.goo.gl/qrQejf6m828boNbT7?g_st=ic'),
      P.tanjungBenoa('https://maps.app.goo.gl/YCcwakQ5xSFMb92h6?g_st=ic'),
      P.sapa('https://maps.app.goo.gl/HcQXGRsGtMEXyqyXA?g_st=ic'),
      P.beachwalkBeforeFlight('https://maps.app.goo.gl/AHHYXh4prXzprd9r6?g_st=ic'),
      P.jazeerahDinner('https://maps.app.goo.gl/16PfsAu94SXS4VXk9?g_st=ic'),
    ],
  },
]

export const FAMILY_6_DAYS: ItinerarySeed = {
  slug: 'bali-6d-family',
  pdfName: 'bali-family-6-days-ar.pdf',
  audienceKind: 'family',
  sourceDocument: 'جداول سياحية 6 أيام - بالي شباب - شهر عسل - عوائل.pdf',
  sourcePages: '12–18 («جدول عائلي»)',
  priceMinor: null,
  currency: 'SAR',
  stay: STAY_6,
  departure: DEPARTURE_6,
  days: DAYS,
  public: {
    name: L(
      'جدول العائلة 6 أيام في بالي',
      'Bali Family Itinerary — 6 Days',
      'Itinerary Keluarga Bali — 6 Hari',
    ),
    heroTitle: L(
      'أيام مليئة بالذكريات الجميلة مع عائلتك',
      'Beautiful Family Memories Await',
      'Kenangan Indah Bersama Keluarga Menanti',
    ),
    blurb: L(
      'ستة أيام عائلية مرتّبة: مرح للأطفال، وراحة للكبار، وأكل يناسب الجميع.',
      'Six well-ordered family days: fun for the kids, rest for the grown-ups and food everyone enjoys.',
      'Enam hari keluarga yang tertata: seru untuk anak, santai untuk orang tua, dan makanan yang disukai semua.',
    ),
    intro: L(
      'السفر مع العائلة يحتاج ترتيبًا أكثر، وهذا ما وفّرناه لك. ستة أيام متوازنة بين المغامرة والطبيعة واللعب والتسوّق، مع مطاعم تناسب الصغار والكبار، ونصائح عملية مثل متى تحتاج ملابس غيار ومتى تخرج مبكرًا. أقل حيرة، ووقت أكثر مع عائلتك.',
      'Travelling as a family needs more planning — so we did it for you. Six days balanced between adventure, nature, play and shopping, with restaurants for young and old, and practical tips like when to pack a change of clothes and when to leave early. Less guesswork, more time together.',
      'Bepergian bersama keluarga butuh perencanaan lebih — jadi kami siapkan untuk Anda. Enam hari yang seimbang antara petualangan, alam, bermain, dan belanja, dengan restoran untuk semua usia, serta tips praktis seperti kapan membawa baju ganti dan kapan berangkat pagi. Lebih sedikit bingung, lebih banyak waktu bersama.',
    ),
    tripType: L('عائلي', 'Family', 'Keluarga'),
    audience: [
      L('العائلات', 'Families', 'Keluarga'),
      L('مناسب للأطفال', 'Kid-friendly', 'Ramah anak'),
    ],
    suitableFor: L(
      'للعائلات التي تريد أيامًا ممتعة للأطفال ومريحة للكبار.',
      'For families who want days that are fun for the kids and easy on the adults.',
      'Untuk keluarga yang ingin hari yang seru bagi anak dan nyaman bagi orang tua.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L(
        'وصول هادئ وبداية خفيفة',
        'A calm arrival and an easy start',
        'Kedatangan santai dan awal yang ringan',
      ),
      L('نزهة في الأجواء الباردة', 'An outing in the cool air', 'Jalan-jalan di udara sejuk'),
      L('يوم مغامرة للعائلة', 'An adventure day for the family', 'Hari petualangan keluarga'),
      L(
        'طبيعة وإطلالات على الطريق',
        'Nature and views on the way',
        'Alam dan pemandangan di perjalanan',
      ),
      L(
        'يوم مرح للأطفال والكبار',
        'A fun day for kids and adults',
        'Hari seru untuk anak dan dewasa',
      ),
      L('بحر وتسوّق قبل العودة', 'Sea and shopping before home', 'Laut dan belanja sebelum pulang'),
    ],
    moodLines: [
      L(
        'غداء، استقرار، وجولة خفيفة.',
        'Lunch, settle in, a gentle stroll.',
        'Makan siang, menetap, jalan santai.',
      ),
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
      L(
        'انتقال إلى السكن الثاني بيوم جميل.',
        'Move to your second base on a lovely day.',
        'Pindah ke area kedua di hari yang indah.',
      ),
      L(
        'يوم كامل من الضحك واللعب.',
        'A whole day of laughs and games.',
        'Seharian tertawa dan bermain.',
      ),
      L('آخر يوم قبل السفر.', 'The last day before you fly.', 'Hari terakhir sebelum pulang.'),
    ],
    seoTitle: L(
      'جدول سياحي للعائلة 6 أيام في بالي',
      '6-Day Bali Family Itinerary',
      'Itinerary Keluarga 6 Hari di Bali',
    ),
    seoDescription: L(
      'جدول عائلي جاهز لـ6 أيام في بالي: أيام متوازنة، مطاعم تناسب العائلة، رابط خريطة لكل محطة، وملف PDF يصلك فور الدفع.',
      'A ready 6-day family plan for Bali: balanced days, family-friendly restaurants, a map link for every stop and a PDF the moment you pay.',
      'Rencana keluarga 6 hari di Bali: hari seimbang, restoran ramah keluarga, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('family', 6, 2),
    benefits: benefitsFor('family'),
    how: HOW_STEPS,
  },
}
