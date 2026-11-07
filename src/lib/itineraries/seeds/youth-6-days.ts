/**
 * «جدول الشباب 6 أيام» — source: «جداول سياحية 6 أيام - بالي شباب - شهر عسل -
 * عوائل.pdf», section «جدول شباب» (pages 1–6). Links verbatim from the source.
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
      'غداء في الطريق، ثم تسجيل الدخول في أوبود، ومساج، وجولة في السنتر، والعشاء.',
      'Lunch on the way, check-in in Ubud, a massage, a stroll in the centre and dinner.',
      'Makan siang di jalan, check-in di Ubud, pijat, jalan-jalan di pusat kota, dan makan malam.',
    ),
    notes: [NOTE.lateArrival, NOTE.noActivitiesFirstDay],
    activityNames: [],
    stops: [
      P.royalKitchenOnTheWay(
        'https://maps.app.goo.gl/5jaN2KyfEimeUBja6?g_st=ic',
        THEN.CHECK_IN_UBUD,
      ),
      P.inkaSpa('https://maps.app.goo.gl/i9oejJLkwNZmwCbs9?g_st=ic'),
      P.frenchCrepe('https://maps.app.goo.gl/CjRPbXBK3mXVSrDe8?g_st=ic'),
      P.nusaUbudVaried('https://maps.app.goo.gl/BqEP6bXLcvetSu6w6?g_st=ic'),
    ],
  },
  {
    dayNumber: 2,
    area: AREA.ubud,
    title: L('بيدوقول وبحيرة براتان', 'Bedugul and Lake Beratan', 'Bedugul dan Danau Beratan'),
    description: L(
      'يوم في المرتفعات: مصنع شوكولاتة، قهوة مختصة، البحيرة، غداء في منتجع هاندار، ثم العودة إلى أوبود.',
      'A highlands day: a chocolate factory, specialty coffee, the lake, lunch at Handara, then back to Ubud.',
      'Sehari di dataran tinggi: pabrik cokelat, kopi spesialti, danau, makan siang di Handara, lalu kembali ke Ubud.',
    ),
    notes: [NOTE.bedugul],
    activityNames: [],
    stops: [
      P.twoFace('https://maps.app.goo.gl/umkm8KzzQt3LvEN77?g_st=ic'),
      P.junglegold('https://maps.app.goo.gl/prSkGWvkcmJAAs3k7?g_st=ic'),
      P.blackEyeInGarden('https://maps.app.goo.gl/mTnrRye8CpHkwLqn8?g_st=ic'),
      P.ulunDanu('https://maps.app.goo.gl/3EY7AEwNDzcLjMHn6?g_st=ic'),
      P.hiland('https://maps.app.goo.gl/ZoD9KAiu91BmYRWz8?g_st=ic'),
      P.tukies('https://maps.app.goo.gl/HkGdRkUemQ1q3v5M9?g_st=ic'),
      P.thisIsBali('https://maps.app.goo.gl/ayRhG9QCygLqF13M6?g_st=ic'),
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
      'دبابات وجسر زجاجي في الطريق إلى سيمنياك',
      'ATVs and the glass bridge on the way to Seminyak',
      'ATV dan jembatan kaca dalam perjalanan ke Seminyak',
    ),
    description: L(
      'تسجيل الخروج من أوبود ويوم فعاليات في الطريق: دبابات كوبر، الجسر الزجاجي، غداء مطل على الشلال، ثم سيمنياك.',
      'Check out of Ubud and an activity day on the road: Kuber ATVs, the glass bridge, lunch over the waterfall, then Seminyak.',
      'Check-out dari Ubud dan hari aktivitas di jalan: ATV Kuber, jembatan kaca, makan siang menghadap air terjun, lalu Seminyak.',
    ),
    notes: [NOTE.checkoutUbudToSeminyak],
    activityNames: ACT.atv,
    stops: [
      P.watercress('https://maps.app.goo.gl/y1JN6EhfqY1ZPeyn7?g_st=ic'),
      P.kuberChange('https://maps.app.goo.gl/mdg6yBj7mhCQPJ8H6?g_st=ic'),
      P.blangsingah('https://maps.app.goo.gl/syWtHv7fLrazQEcBA?g_st=ic'),
      P.omma('https://maps.app.goo.gl/3e7kKVaRBwGLAawo6?g_st=ic', THEN.CHECK_IN_SEMINYAK),
      P.barbacoa('https://maps.app.goo.gl/xcdttjbpNPqhAv236?g_st=ic'),
    ],
  },
  {
    dayNumber: 5,
    area: AREA.seminyak,
    title: L('يوم استرخاء في سيمنياك', 'A slow day in Seminyak', 'Hari santai di Seminyak'),
    description: L(
      'إفطار وقهوة مختصة، ثم النادي الشاطئي من العصر حتى المساء، والعشاء الإيطالي.',
      'Breakfast and specialty coffee, the beach club from afternoon to evening, and an Italian dinner.',
      'Sarapan dan kopi spesialti, beach club dari sore hingga malam, dan makan malam Italia.',
    ),
    notes: [NOTE.relaxNoActivities],
    activityNames: [],
    stops: [
      P.breadYard('https://maps.app.goo.gl/Ju9y1FPhZH2NbWSX7?g_st=ic'),
      P.do32Coffee('https://maps.app.goo.gl/7e8a5w9ZvjXZhjLMA?g_st=ic'),
      P.atlasAfternoon('https://maps.app.goo.gl/WYMoN4DLj7xkkeS18?g_st=ic'),
      P.milano('https://maps.app.goo.gl/hnC2LH4orQhaeL9Z8?g_st=ic'),
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
      'الألعاب البحرية، ثم مول آيكون بالي والغداء الهندي، ومساج، والعشاء في مطعم الستيك.',
      'Water sports, then Icon Bali mall with an Indian lunch, a massage, and dinner at the steakhouse.',
      'Olahraga air, lalu mal Icon Bali dengan makan siang India, pijat, dan makan malam di steakhouse.',
    ),
    notes: [NOTE.waterAndShopping],
    activityNames: ACT.water,
    stops: [
      P.brunchClub('https://maps.app.goo.gl/qrQejf6m828boNbT7?g_st=ic'),
      P.tanjungBenoa('https://maps.app.goo.gl/YCcwakQ5xSFMb92h6?g_st=ic'),
      P.royalKitchenIndian('https://maps.app.goo.gl/c12tbQhJHGRWUJz87?g_st=ic'),
      P.tamanAir('https://maps.app.goo.gl/HYPTvumjVC9D2znZ8?g_st=ic'),
      P.boyNCow('https://maps.app.goo.gl/s1KwTCFkWgJSvuZT6?g_st=ic'),
    ],
  },
]

export const YOUTH_6_DAYS: ItinerarySeed = {
  slug: 'bali-6d-youth',
  pdfName: 'bali-youth-6-days-ar.pdf',
  audienceKind: 'youth',
  sourceDocument: 'جداول سياحية 6 أيام - بالي شباب - شهر عسل - عوائل.pdf',
  sourcePages: '1–6 («جدول شباب»)',
  priceMinor: null,
  currency: 'SAR',
  stay: STAY_6,
  departure: DEPARTURE_6,
  days: DAYS,
  public: {
    name: L(
      'جدول الشباب 6 أيام في بالي',
      'Bali Youth Itinerary — 6 Days',
      'Itinerary Anak Muda Bali — 6 Hari',
    ),
    heroTitle: L(
      'ستة أيام من الحماس دون تخطيط',
      'Six Days of Adventure, Zero Planning',
      'Enam Hari Petualangan Tanpa Repot Merencanakan',
    ),
    blurb: L(
      'جدول جاهز للشباب والأصدقاء: مغامرة وتجارب وأماكن أكل مختارة، يومًا بيوم.',
      'A ready plan for young travellers and friends: adventure, experiences and hand-picked places to eat, day by day.',
      'Rencana siap pakai untuk anak muda dan teman-teman: petualangan, pengalaman, dan tempat makan pilihan, hari demi hari.',
    ),
    intro: L(
      'لا تضيّع أيام رحلتك في البحث والمقارنة. هذا الجدول مرتّب للشباب: أيام مغامرة متتالية، ويوم هادئ لالتقاط الأنفاس، ومطاعم ومقاهٍ على طريق كل يوم، مع ترتيب يقلّل المشاوير وينقلك بين منطقتي السكن في الوقت المناسب. افتح الجدول صباحًا واتبعه.',
      'Don’t spend your trip searching and comparing. This plan is built for young travellers: back-to-back adventure days, one calm day to catch your breath, and restaurants and cafés on each day’s route, in an order that keeps drives short and moves you between the two bases at the right time. Open it in the morning and follow along.',
      'Jangan habiskan liburan untuk mencari dan membandingkan. Rencana ini disusun untuk anak muda: hari-hari petualangan berturut-turut, satu hari tenang untuk bernapas, serta restoran dan kafe di rute setiap hari, dengan urutan yang memangkas perjalanan dan memindahkan Anda antar dua area menginap di waktu yang tepat. Buka di pagi hari dan ikuti saja.',
    ),
    tripType: L('شباب', 'Youth', 'Anak muda'),
    audience: [
      L('الشباب', 'Young travellers', 'Anak muda'),
      L('الأصدقاء', 'Friends', 'Teman-teman'),
    ],
    suitableFor: L(
      'للشباب والأصدقاء الذين يحبون الحركة والتجارب الجديدة.',
      'For young travellers and friends who love to keep moving and try new things.',
      'Untuk anak muda dan teman-teman yang suka bergerak dan mencoba hal baru.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L('بداية هادئة بعد الوصول', 'An easy start after landing', 'Awal santai setelah mendarat'),
      L(
        'أجواء باردة ومناظر خلابة',
        'Cool air and sweeping views',
        'Udara sejuk dan pemandangan memukau',
      ),
      L('يوم مغامرة كامل', 'A full day of adventure', 'Sehari penuh petualangan'),
      L('حماس على الطريق', 'Thrills on the road', 'Keseruan di perjalanan'),
      L('يوم للاسترخاء', 'A day to unwind', 'Hari untuk bersantai'),
      L(
        'بحر وتسوّق ومساء مميز',
        'Sea, shopping and a great evening',
        'Laut, belanja, dan malam istimewa',
      ),
    ],
    moodLines: [
      L(
        'وصول، راحة، وعشاء أول.',
        'Arrive, unwind, first dinner.',
        'Tiba, bersantai, makan malam pertama.',
      ),
      L(
        'محطات متنوعة وغداء بإطلالة.',
        'Varied stops and lunch with a view.',
        'Tempat beragam dan makan siang berpemandangan.',
      ),
      L(
        'اخرج مبكرًا واستعد للحماس.',
        'Leave early and get ready for a rush.',
        'Berangkat pagi dan bersiap untuk seru.',
      ),
      L(
        'تنتقل إلى السكن الثاني بيوم ممتلئ.',
        'Move to your second base on a full day.',
        'Pindah ke area kedua dengan hari yang padat.',
      ),
      L(
        'إفطار هادئ وغروب جميل.',
        'A slow breakfast and a fine sunset.',
        'Sarapan santai dan matahari terbenam indah.',
      ),
      L('آخر يوم قبل السفر.', 'The last day before you fly.', 'Hari terakhir sebelum pulang.'),
    ],
    seoTitle: L(
      'جدول سياحي للشباب 6 أيام في بالي',
      '6-Day Bali Itinerary for Young Travellers',
      'Itinerary 6 Hari di Bali untuk Anak Muda',
    ),
    seoDescription: L(
      'جدول شباب جاهز لـ6 أيام في بالي: مغامرات منظمة، مطاعم ومقاهٍ مختارة، رابط خريطة لكل محطة، وملف PDF يصلك فور الدفع.',
      'A ready 6-day Bali plan for young travellers: organised adventures, picked restaurants and cafés, a map link for every stop and a PDF the moment you pay.',
      'Rencana 6 hari di Bali untuk anak muda: petualangan tertata, restoran dan kafe pilihan, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('youth', 6, 2),
    benefits: benefitsFor('youth'),
    how: HOW_STEPS,
  },
}
