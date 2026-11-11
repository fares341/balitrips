/**
 * «جدول شهر العسل 6 أيام» — source: «جداول سياحية 6 أيام - بالي شباب - شهر عسل
 * - عوائل.pdf», section «جدول شهر عسل» (pages 6–12). Links verbatim.
 */

import { AREA, ACT, DEPARTURE_6, NOTE, P, STAY_6, THEN } from './places'
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
      'مصنع الشوكولاتة، الحديقة والقهوة المختصة، البحيرة، غداء في منتجع هاندار، ثم العودة إلى أوبود.',
      'The chocolate factory, the garden and its specialty coffee, the lake, lunch at Handara, then back to Ubud.',
      'Pabrik cokelat, taman dan kopi spesialtinya, danau, makan siang di Handara, lalu kembali ke Ubud.',
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
      'شلال وجسر زجاجي في الطريق إلى سيمنياك',
      'A waterfall and the glass bridge on the way to Seminyak',
      'Air terjun dan jembatan kaca dalam perjalanan ke Seminyak',
    ),
    description: L(
      'تسجيل الخروج من أوبود: شلال، الجسر الزجاجي، غداء مطل على الشلال، ثم سيمنياك وعشاء إيطالي فاخر.',
      'Check out of Ubud: a waterfall, the glass bridge, lunch over the falls, then Seminyak and an upscale Italian dinner.',
      'Check-out dari Ubud: air terjun, jembatan kaca, makan siang menghadap air terjun, lalu Seminyak dan makan malam Italia mewah.',
    ),
    notes: [NOTE.checkoutUbudToSeminyak],
    activityNames: [],
    stops: [
      P.watercress('https://maps.app.goo.gl/y1JN6EhfqY1ZPeyn7?g_st=ic'),
      P.pohGading('https://maps.app.goo.gl/9TpH4DJFfMqaZWfKA?g_st=ic'),
      P.blangsingah('https://maps.app.goo.gl/syWtHv7fLrazQEcBA?g_st=ic'),
      P.omma('https://maps.app.goo.gl/3e7kKVaRBwGLAawo6?g_st=ic', THEN.CHECK_IN_SEMINYAK),
      P.mauriLuxury('https://maps.app.goo.gl/wa8fN7HgE9eMeeGc8?g_st=ic'),
    ],
  },
  {
    dayNumber: 5,
    area: AREA.seminyak,
    title: L('يوم استرخاء في سيمنياك', 'A slow day in Seminyak', 'Hari santai di Seminyak'),
    description: L(
      'إفطار وقهوة مختصة، ثم النادي الشاطئي من العصر حتى المساء، والعشاء في المطعم الأوزبكي.',
      'Breakfast and specialty coffee, the beach club from afternoon to evening, and dinner at the Uzbek restaurant.',
      'Sarapan dan kopi spesialti, beach club dari sore hingga malam, dan makan malam di restoran Uzbek.',
    ),
    notes: [NOTE.relaxNoActivities],
    activityNames: [],
    stops: [
      P.breadYard('https://maps.app.goo.gl/Ju9y1FPhZH2NbWSX7?g_st=ic'),
      P.do32Coffee('https://maps.app.goo.gl/7e8a5w9ZvjXZhjLMA?g_st=ic'),
      P.atlasAfternoon('https://maps.app.goo.gl/WYMoN4DLj7xkkeS18?g_st=ic'),
      P.silk('https://maps.app.goo.gl/GWavt4TJ9oqhrKk3A?g_st=ic'),
    ],
  },
  {
    dayNumber: 6,
    area: AREA.seminyak,
    title: L(
      'ألعاب بحرية وغداء فاخر وتسوّق',
      'Water sports, an upscale lunch and shopping',
      'Olahraga air, makan siang mewah, dan belanja',
    ),
    description: L(
      'الألعاب البحرية في نوسا دوا، ثم المطعم الفاخر، ثم التسوّق في كوتا، والعشاء في المطعم العربي.',
      'Water sports in Nusa Dua, the upscale restaurant, shopping in Kuta and dinner at the Arabic restaurant.',
      'Olahraga air di Nusa Dua, restoran mewah, belanja di Kuta, dan makan malam di restoran Arab.',
    ),
    notes: [NOTE.waterAndShopping],
    activityNames: ACT.water,
    stops: [
      P.brunchClub('https://maps.app.goo.gl/qrQejf6m828boNbT7?g_st=ic'),
      P.tanjungBenoa('https://maps.app.goo.gl/YCcwakQ5xSFMb92h6?g_st=ic'),
      P.cliffOpens3('https://maps.app.goo.gl/ccz2ybXgdG9knK3ZA?g_st=ic'),
      P.beachwalkBeforeFlight('https://maps.app.goo.gl/AHHYXh4prXzprd9r6?g_st=ic'),
      P.jazeerahDinner('https://maps.app.goo.gl/16PfsAu94SXS4VXk9?g_st=ic'),
    ],
  },
]

export const HONEYMOON_6_DAYS: ItinerarySeed = {
  slug: 'bali-6d-honeymoon',
  pdfName: 'bali-honeymoon-6-days-ar.pdf',
  audienceKind: 'honeymoon',
  sourceDocument: 'جداول سياحية 6 أيام - بالي شباب - شهر عسل - عوائل.pdf',
  sourcePages: '6–12 («جدول شهر عسل»)',
  priceMinor: 10_000,
  areas: [
    { key: 'ubud', nights: 3 },
    { key: 'seminyak', nights: 3 },
  ],
  currency: 'SAR',
  stay: STAY_6,
  departure: DEPARTURE_6,
  days: DAYS,
  public: {
    name: L(
      'جدول شهر العسل 6 أيام في بالي',
      'Bali Honeymoon Itinerary — 6 Days',
      'Itinerary Bulan Madu Bali — 6 Hari',
    ),
    heroTitle: L('ستة أيام لكما فقط', 'Six Days Made for Two', 'Enam Hari Hanya untuk Berdua'),
    blurb: L(
      'جدول شهر عسل جاهز يومًا بيوم: أجواء رومانسية، وأمسيات مميزة، ووقت للراحة.',
      'A ready honeymoon plan, day by day: romantic settings, special evenings and time to relax.',
      'Rencana bulan madu siap pakai, hari demi hari: suasana romantis, malam istimewa, dan waktu bersantai.',
    ),
    intro: L(
      'ركّزا على بعضكما واتركا التخطيط لنا. رتّبنا ستة أيام تجمع بين لحظات هادئة وتجارب مشتركة لا تُنسى، مع مطاعم مختارة لأمسياتكما وترتيب يقلّل وقت الطريق. كل يوم واضح من أوله لآخره، فلا حيرة ولا وقت ضائع.',
      'Focus on each other and leave the planning to us. Six days that mix quiet moments with shared experiences you will remember, with picked restaurants for your evenings and an order that keeps drives short. Every day is clear from start to finish — no second-guessing, no lost time.',
      'Fokus satu sama lain dan serahkan perencanaan kepada kami. Enam hari yang memadukan momen tenang dan pengalaman bersama yang berkesan, dengan restoran pilihan untuk malam Anda dan urutan yang memangkas waktu di jalan. Setiap hari jelas dari awal hingga akhir — tanpa bingung, tanpa waktu terbuang.',
    ),
    tripType: L('شهر عسل', 'Honeymoon', 'Bulan madu'),
    audience: [
      L('الأزواج', 'Couples', 'Pasangan'),
      L('شهر العسل', 'Honeymooners', 'Pengantin baru'),
    ],
    suitableFor: L(
      'للأزواج في شهر العسل أو في رحلة رومانسية.',
      'For couples on their honeymoon or a romantic getaway.',
      'Untuk pasangan yang berbulan madu atau liburan romantis.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L(
        'وصول هادئ وأمسية أولى',
        'A calm arrival and a first evening',
        'Kedatangan tenang dan malam pertama',
      ),
      L(
        'أجواء باردة ومناظر ساحرة',
        'Cool air and enchanting views',
        'Udara sejuk dan pemandangan memesona',
      ),
      L('مغامرة مشتركة', 'An adventure together', 'Petualangan bersama'),
      L('طبيعة وعشاء فاخر', 'Nature and an elegant dinner', 'Alam dan makan malam elegan'),
      L('يوم للاسترخاء معًا', 'A day to unwind together', 'Hari bersantai berdua'),
      L(
        'ختام مميز قبل السفر',
        'A special finale before you fly',
        'Penutup istimewa sebelum pulang',
      ),
    ],
    moodLines: [
      L(
        'راحة وعشاء أول معًا.',
        'Rest and a first dinner together.',
        'Istirahat dan makan malam pertama berdua.',
      ),
      L(
        'محطات جميلة وغداء بإطلالة.',
        'Beautiful stops and lunch with a view.',
        'Tempat indah dan makan siang berpemandangan.',
      ),
      L(
        'اخرجا مبكرًا ليوم ممتلئ.',
        'Leave early for a full day.',
        'Berangkat pagi untuk hari yang padat.',
      ),
      L(
        'انتقال إلى السكن الثاني بيوم جميل.',
        'Move to your second base on a lovely day.',
        'Pindah ke area kedua di hari yang indah.',
      ),
      L(
        'إفطار هادئ وغروب.',
        'A slow breakfast and the sunset.',
        'Sarapan santai dan matahari terbenam.',
      ),
      L(
        'حماس، غداء مميز، وتسوّق.',
        'Thrills, a special lunch and shopping.',
        'Keseruan, makan siang istimewa, dan belanja.',
      ),
    ],
    seoTitle: L(
      'جدول شهر عسل 6 أيام في بالي',
      '6-Day Bali Honeymoon Itinerary',
      'Itinerary Bulan Madu 6 Hari di Bali',
    ),
    seoDescription: L(
      'جدول شهر عسل جاهز لـ6 أيام في بالي: أيام متوازنة، مطاعم مختارة للأمسيات، رابط خريطة لكل محطة، وملف PDF يصلك فور الدفع.',
      'A ready 6-day Bali honeymoon plan: balanced days, picked restaurants for your evenings, a map link for every stop and a PDF the moment you pay.',
      'Rencana bulan madu 6 hari di Bali: hari seimbang, restoran pilihan untuk malam Anda, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('honeymoon', 6, 2),
    benefits: benefitsFor('honeymoon'),
    how: HOW_STEPS,
  },
}
