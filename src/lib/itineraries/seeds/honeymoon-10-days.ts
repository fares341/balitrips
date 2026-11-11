/**
 * «جدول شهر العسل 10 أيام» — source: «بكج سياحي 10 أيام - شباب + شهر عسل.pdf», section «جدول شهر عسل» (pages 9–18).
 * Links verbatim from the source. Three bases: Seminyak 4, Ubud 4, Uluwatu 2.
 */

import { ACT, AREA, DEPARTURE_8, NOTE, P, STAY_10, THEN } from './places'
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
      'غداء عربي، تسجيل الدخول في سيمنياك، النادي الشاطئي، والعشاء الإيطالي.',
      'An Arabic lunch, check-in in Seminyak, the beach club and an Italian dinner.',
      'Makan siang Arab, check-in di Seminyak, beach club, dan makan malam Italia.',
    ),
    notes: [NOTE.arrivalDriver],
    activityNames: [],
    stops: [
      P.jazeerahLunch(
        'https://maps.app.goo.gl/16PfsAu94SXS4VXk9?g_st=ic',
        THEN.CHECK_IN_SEMINYAK_8,
      ),
      P.atlasClub('https://maps.app.goo.gl/JTU4osZpg9G5ssWk6?g_st=ic'),
      P.mauriNearClub('https://maps.app.goo.gl/oPbtUfRgVTX7k22e7?g_st=ic'),
    ],
  },
  {
    dayNumber: 2,
    area: AREA.seminyak,
    title: L(
      'يوم استجمام وشاطئ نياني',
      'A pampering day and the Nyanyi beach',
      'Hari relaksasi dan pantai Nyanyi',
    ),
    description: L(
      'إفطار، ثم جلسة مساج، ثم يوم كامل في النادي الشاطئي في نياني، والعشاء الأوزبكي.',
      'Breakfast, a massage, a full day at the beach club in Nyanyi, and an Uzbek dinner.',
      'Sarapan, pijat, seharian di beach club di Nyanyi, dan makan malam Uzbek.',
    ),
    notes: [],
    activityNames: [],
    stops: [
      P.do32Breakfast('https://maps.app.goo.gl/r8aXAM9n9zDkVx7M9?g_st=ic'),
      P.sundari('https://maps.app.goo.gl/Lk3S3p76i5Yc41na9?g_st=ic'),
      P.luna('https://maps.app.goo.gl/L8Evm4WW15xx8uVK6?g_st=ic'),
      P.silk('https://maps.app.goo.gl/GWavt4TJ9oqhrKk3A?g_st=ic'),
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
      'إفطار، ثم الألعاب البحرية، ثم مول آيكون بالي والغداء الهندي، والعشاء في مطعم الستيك.',
      'Breakfast, water sports, then Icon Bali mall with an Indian lunch, and dinner at the steakhouse.',
      'Sarapan, olahraga air, lalu mal Icon Bali dengan makan siang India, dan makan malam di steakhouse.',
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
    area: AREA.seminyak,
    title: L('هيلوكبتر وتسوّق', 'A helicopter ride and shopping', 'Helikopter dan belanja'),
    description: L(
      'إفطار، ثم تجربة الهيلوكبتر، وغداء في مطعم بحري فاخر، وقهوة مختصة، ومول بيتش ووك، والعشاء الهندي.',
      'Breakfast, a helicopter ride, lunch at a fine seafood restaurant, specialty coffee, Beachwalk mall and an Indian dinner.',
      'Sarapan, naik helikopter, makan siang di restoran seafood mewah, kopi spesialti, mal Beachwalk, dan makan malam India.',
    ),
    notes: [NOTE.helicopterShopping],
    activityNames: ACT.helicopter,
    stops: [
      P.breadYard('https://maps.app.goo.gl/u3pnvVLiVXDrUoL18?g_st=ic'),
      P.balicopter('https://maps.app.goo.gl/LWwhio3CKd5PtM1A8?g_st=ic'),
      P.koral('https://maps.app.goo.gl/nH3noYNa3cWgMXrE7?g_st=ic'),
      P.goldenMalabar('https://maps.app.goo.gl/avfeDXQCQSWAkgR78?g_st=ic'),
      P.beachwalkKutaBeach('https://maps.app.goo.gl/o6V73UUPxVU9KM6J8?g_st=ic'),
      P.bollywood('https://maps.app.goo.gl/ftjLnJWprRT4nQQV8?g_st=ic'),
    ],
  },
  {
    dayNumber: 5,
    area: AREA.ubud,
    title: L(
      'شلالات وجسر زجاجي في الطريق إلى أوبود',
      'Waterfalls and the glass bridge on the way to Ubud',
      'Air terjun dan jembatan kaca dalam perjalanan ke Ubud',
    ),
    description: L(
      'تسجيل الخروج من سيمنياك: إفطار، شلال، الجسر الزجاجي، غداء مطل على الشلال، ثم تسجيل الدخول في أوبود والعشاء في السنتر.',
      'Check out of Seminyak: breakfast, a waterfall, the glass bridge, lunch over the waterfall, then check in in Ubud and dinner in the centre.',
      'Check-out dari Seminyak: sarapan, air terjun, jembatan kaca, makan siang menghadap air terjun, lalu check-in di Ubud dan makan malam di pusat kota.',
    ),
    notes: [NOTE.checkoutSeminyakToUbud],
    activityNames: [],
    stops: [
      P.hutCafe('https://maps.app.goo.gl/xAacfTReitpkajSNA?g_st=ic'),
      P.pohGading('https://maps.app.goo.gl/9TpH4DJFfMqaZWfKA?g_st=ic'),
      P.blangsingah('https://maps.app.goo.gl/syWtHv7fLrazQEcBA?g_st=ic'),
      P.omma('https://maps.app.goo.gl/3e7kKVaRBwGLAawo6?g_st=ic', THEN.CHECK_IN_UBUD_SHORT),
      P.donnaCentre('https://maps.app.goo.gl/tgrSfEJ3JrBaYkKz8?g_st=ic'),
    ],
  },
  {
    dayNumber: 6,
    area: AREA.ubud,
    title: L(
      'مزارع الأرز ومغامرة الدبابات',
      'Rice terraces and an ATV adventure',
      'Sawah terasering dan petualangan ATV',
    ),
    description: L(
      'إفطار، ثم مزارع الأرز مع الزيبلاين والسكاي بايك، وغداء داخل حدائق الأرز، ثم دبابات كوبر، والعشاء في سنتر أوبود.',
      'Breakfast, the rice terraces with zipline and sky bike, lunch inside the rice fields, the Kuber ATVs, and dinner in central Ubud.',
      'Sarapan, sawah terasering dengan zipline dan sky bike, makan siang di tengah sawah, ATV Kuber, dan makan malam di pusat Ubud.',
    ),
    notes: [NOTE.activityDayClothes],
    activityNames: [...ACT.rice, ...ACT.atv],
    stops: [
      P.twoFace('https://maps.app.goo.gl/umkm8KzzQt3LvEN77?g_st=ic'),
      P.alasHarumRice('https://maps.app.goo.gl/3odFzf2XLrxQZQTYA?g_st=ic'),
      P.cretyaLunch('https://maps.app.goo.gl/3ozkYpXgJke6Ho8i6?g_st=ic'),
      P.kuberAdventure('https://maps.app.goo.gl/gnoL5ZjuqngwUAup9?g_st=ic'),
      P.nusaUbudCentre('https://maps.app.goo.gl/AGcmRbLNTTGUTw2m9?g_st=ic'),
    ],
  },
  {
    dayNumber: 7,
    area: AREA.ubud,
    title: L('بيدوقول وبحيرة براتان', 'Bedugul and Lake Beratan', 'Bedugul dan Danau Beratan'),
    description: L(
      'يوم في المرتفعات: مصنع شوكولاتة، حديقة، البحيرة، غداء في منتجع هاندار، ثم العودة إلى أوبود.',
      'A highlands day: a chocolate factory, a garden, the lake, lunch at Handara, then back to Ubud.',
      'Sehari di dataran tinggi: pabrik cokelat, taman, danau, makan siang di Handara, lalu kembali ke Ubud.',
    ),
    notes: [NOTE.bedugulClothes],
    activityNames: [],
    stops: [
      P.wyah('https://maps.app.goo.gl/KQmM2dFJK9nxxxoT7?g_st=ic'),
      P.junglegold('https://maps.app.goo.gl/prSkGWvkcmJAAs3k7?g_st=ic'),
      P.secretGardenCare('https://maps.app.goo.gl/uR2ZC7TFvTm9GpJx8?g_st=ic'),
      P.ulunDanu('https://maps.app.goo.gl/3EY7AEwNDzcLjMHn6?g_st=ic'),
      P.hiland('https://maps.app.goo.gl/ZoD9KAiu91BmYRWz8?g_st=ic'),
      P.tukies('https://maps.app.goo.gl/HkGdRkUemQ1q3v5M9?g_st=ic'),
      P.thisIsBali('https://maps.app.goo.gl/ayRhG9QCygLqF13M6?g_st=ic'),
    ],
  },
  {
    dayNumber: 8,
    area: AREA.ubud,
    title: L('تجديف وكنتماني', 'Rafting and Kintamani', 'Rafting dan Kintamani'),
    description: L(
      'إفطار في سنتر أوبود، ثم التجديف، ثم قهوة في كنتماني قرب البركان، والعودة إلى أوبود للعشاء.',
      'Breakfast in central Ubud, rafting, coffee in Kintamani near the volcano, and back to Ubud for dinner.',
      'Sarapan di pusat Ubud, rafting, kopi di Kintamani dekat gunung berapi, lalu kembali ke Ubud untuk makan malam.',
    ),
    notes: [NOTE.rafting],
    activityNames: ACT.rafting,
    stops: [
      P.livingstoneHoly('https://maps.app.goo.gl/8WaZRn7kZ97F7N4N9?g_st=ic'),
      P.bmwRafting('https://maps.app.goo.gl/Kh9K4bdPBk39QiVZ9?g_st=ic'),
      P.akasa('https://maps.app.goo.gl/JUsnRmnidHKLyC3y7?'),
      P.osteriaBackToCentre('https://maps.app.goo.gl/wo6y7f3zzmwSvhsW8?g_st=ic'),
    ],
  },
  {
    dayNumber: 9,
    area: AREA.uluwatu,
    title: L('الانتقال إلى أولواتو', 'On to Uluwatu', 'Pindah ke Uluwatu'),
    description: L(
      'تسجيل الخروج من أوبود: إفطار، ثم أحدث مولات بالي في الطريق، وتسجيل الدخول في أولواتو، والعشاء.',
      'Check out of Ubud: breakfast, the newest mall in Bali on the way, check-in in Uluwatu and dinner.',
      'Check-out dari Ubud: sarapan, mal terbaru di Bali di perjalanan, check-in di Uluwatu, dan makan malam.',
    ),
    notes: [NOTE.toUluwatuLong],
    activityNames: [],
    stops: [
      P.sevenAm('https://maps.app.goo.gl/eSt3xydz7txjLQZt5?g_st=ic'),
      P.siraVillage('https://maps.app.goo.gl/zfQ9oZMZJwyLTB698?g_st=ic', THEN.CHECK_IN_ULUWATU),
      P.singleFin('https://maps.app.goo.gl/AbHWufmNgd593six6?g_st=ic'),
    ],
  },
  {
    dayNumber: 10,
    area: AREA.uluwatu,
    title: L(
      'يوم أخير هادئ في أولواتو',
      'A calm last day in Uluwatu',
      'Hari terakhir yang tenang di Uluwatu',
    ),
    description: L(
      'إفطار، ثم العصر في مطعم مطل على المحيط، والعشاء الفرنسي.',
      'Breakfast, an afternoon at an ocean-view restaurant, and a French dinner.',
      'Sarapan, sore di restoran menghadap laut, dan makan malam Prancis.',
    ),
    notes: [NOTE.lastDay],
    activityNames: [],
    stops: [
      P.arabica('https://maps.app.goo.gl/chtEzX1oWB2TZjCw5?g_st=ic'),
      P.cliffOcean('https://maps.app.goo.gl/fLQhbwM2PFC7xTeX7?g_st=ic'),
      P.gooseberry('https://maps.app.goo.gl/iKSsyLFvkyvBD9nHA?g_st=ic'),
    ],
  },
]

export const HONEYMOON_10_DAYS: ItinerarySeed = {
  slug: 'bali-10d-honeymoon',
  pdfName: 'bali-honeymoon-10-days-ar.pdf',
  audienceKind: 'honeymoon',
  sourceDocument: 'بكج سياحي 10 أيام - شباب + شهر عسل.pdf',
  sourcePages: '9–18 («جدول شهر عسل»)',
  priceMinor: 18_000,
  areas: [
    { key: 'seminyak', nights: 4 },
    { key: 'ubud', nights: 4 },
    { key: 'uluwatu', nights: 2 },
  ],
  currency: 'SAR',
  stay: STAY_10,
  departure: DEPARTURE_8,
  days: DAYS,
  public: {
    name: L(
      'جدول شهر العسل 10 أيام في بالي',
      'Bali Honeymoon Itinerary — 10 Days',
      'Itinerary Bulan Madu Bali — 10 Hari',
    ),
    heroTitle: L(
      'عشرة أيام من اللحظات الرومانسية',
      'Ten Days of Romantic Moments',
      'Sepuluh Hari Penuh Momen Romantis',
    ),
    blurb: L(
      'جدول شهر عسل لعشرة أيام: استجمام، وتجارب مشتركة، وأمسيات تبقى في الذاكرة.',
      'A ten-day honeymoon plan: relaxation, shared experiences and evenings to remember.',
      'Rencana bulan madu sepuluh hari: relaksasi, pengalaman bersama, dan malam yang berkesan.',
    ),
    intro: L(
      'شهر عسل طويل يستحق أن يكون بلا عناء. رتّبنا لكما عشرة أيام على ثلاث مناطق سكن، فيها يوم استجمام كامل، وتجربة مميزة من الجو، وأيام تجارب مشتركة، ومطاعم مختارة لكل أمسية، وختام هادئ قبل السفر. كل ما عليكما أن تستمتعا.',
      'A long honeymoon deserves to be effortless. Ten days across three bases, with a full pampering day, a special experience from the air, days of shared adventures, a picked restaurant for every evening and a calm finale before you fly. All you have to do is enjoy it.',
      'Bulan madu panjang layak dijalani tanpa repot. Sepuluh hari di tiga area menginap, dengan satu hari relaksasi penuh, pengalaman istimewa dari udara, hari-hari petualangan bersama, restoran pilihan untuk setiap malam, dan penutup tenang sebelum pulang. Anda berdua tinggal menikmati.',
    ),
    tripType: L('شهر عسل', 'Honeymoon', 'Bulan madu'),
    audience: [
      L('الأزواج', 'Couples', 'Pasangan'),
      L('شهر العسل', 'Honeymooners', 'Pengantin baru'),
    ],
    suitableFor: L(
      'للأزواج الذين يريدون شهر عسل طويلًا يجمع الهدوء والتجارب المميزة.',
      'For couples who want a long honeymoon that blends calm with special experiences.',
      'Untuk pasangan yang ingin bulan madu panjang yang memadukan ketenangan dan pengalaman istimewa.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L('وصول وأمسية أولى', 'Arrival and a first evening', 'Kedatangan dan malam pertama'),
      L('يوم استجمام كامل', 'A full day of pampering', 'Seharian dimanjakan'),
      L('بحر وحماس وتسوّق', 'Sea, thrills and shopping', 'Laut, keseruan, dan belanja'),
      L(
        'تجربة من الجو وتسوّق',
        'A view from the sky and shopping',
        'Pemandangan dari udara dan belanja',
      ),
      L('طبيعة على الطريق', 'Nature along the way', 'Alam di sepanjang jalan'),
      L('مغامرة مشتركة', 'An adventure together', 'Petualangan bersama'),
      L(
        'أجواء باردة ومناظر ساحرة',
        'Cool air and enchanting views',
        'Udara sejuk dan pemandangan memesona',
      ),
      L('يوم حماس وإطلالات', 'A day of thrills and views', 'Hari penuh keseruan dan pemandangan'),
      L('انتقال إلى السكن الأخير', 'Moving to the last base', 'Pindah ke area terakhir'),
      L('ختام هادئ وغروب', 'A calm finale and the sunset', 'Penutup tenang dan matahari terbenam'),
    ],
    moodLines: [
      L(
        'بداية خفيفة بعد الطيران.',
        'An easy start after the flight.',
        'Awal ringan setelah penerbangan.',
      ),
      L('ملابس السباحة معكما.', 'Bring your swimwear.', 'Bawa baju renang.'),
      L('لا تنسيا ملابس الغيار.', 'Don’t forget a change of clothes.', 'Jangan lupa baju ganti.'),
      L('يوم يبقى في الذاكرة.', 'A day to remember.', 'Hari yang tak terlupakan.'),
      L('انتقال إلى السكن الثاني.', 'Moving to your second base.', 'Pindah ke area kedua.'),
      L('ملابس الغيار ضرورية.', 'A change of clothes is a must.', 'Baju ganti wajib.'),
      L(
        'محطات جميلة وغداء بإطلالة.',
        'Beautiful stops and lunch with a view.',
        'Tempat indah dan makan siang berpemandangan.',
      ),
      L('اخرجا مبكرًا.', 'Leave early.', 'Berangkat pagi.'),
      L(
        'طريق طويل وسيارة مريحة.',
        'A long drive in a comfortable car.',
        'Perjalanan jauh dengan mobil nyaman.',
      ),
      L('آخر يوم قبل السفر.', 'The last day before you fly.', 'Hari terakhir sebelum pulang.'),
    ],
    seoTitle: L(
      'جدول شهر عسل 10 أيام في بالي',
      '10-Day Bali Honeymoon Itinerary',
      'Itinerary Bulan Madu 10 Hari di Bali',
    ),
    seoDescription: L(
      'جدول شهر عسل جاهز لـ10 أيام في بالي على ثلاث مناطق سكن: يوم استجمام، تجارب مشتركة، مطاعم مختارة، رابط خريطة لكل محطة، وملف PDF فور الدفع.',
      'A ready 10-day Bali honeymoon plan across three bases: a pampering day, shared experiences, picked restaurants, a map link for every stop and a PDF the moment you pay.',
      'Rencana bulan madu 10 hari di Bali di tiga area menginap: hari relaksasi, pengalaman bersama, restoran pilihan, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('honeymoon', 10, 3),
    benefits: benefitsFor('honeymoon'),
    how: HOW_STEPS,
  },
}
