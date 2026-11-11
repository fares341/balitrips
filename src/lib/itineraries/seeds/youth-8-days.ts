/**
 * «جدول الشباب 8 أيام» — source: «جدول سياحي 8 أيام - بالي شباب - شهر عسل -
 * عوائل.pdf», section «جدول سياحي شباب» (pages 1–8). Links verbatim.
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
    dayNumber: 3,
    area: AREA.seminyak,
    title: L('يوم ووتربوم في كوتا', 'Waterbom day in Kuta', 'Hari Waterbom di Kuta'),
    description: L(
      'يوم كامل في ووتربوم، غداء هندي، قهوة مختصة، مول بيتش ووك، والعشاء برجر.',
      'A full day at Waterbom, an Indian lunch, specialty coffee, Beachwalk mall and a burger dinner.',
      'Seharian di Waterbom, makan siang India, kopi spesialti, mal Beachwalk, dan makan malam burger.',
    ),
    notes: [NOTE.waterbom],
    activityNames: ACT.waterbom,
    stops: [
      P.breadYard('https://maps.app.goo.gl/u3pnvVLiVXDrUoL18?g_st=ic'),
      P.waterbom('https://maps.app.goo.gl/xwUfYqxH7vYYXYA6A?g_st=ic'),
      P.spiceMantraa('https://maps.app.goo.gl/zxWSSLFipGpnYLBY9?g_st=ic'),
      P.goldenMalabar('https://maps.app.goo.gl/avfeDXQCQSWAkgR78?g_st=ic'),
      P.beachwalkKutaBeach('https://maps.app.goo.gl/o6V73UUPxVU9KM6J8?g_st=ic'),
      P.dods('https://maps.app.goo.gl/ftjLnJWprRT4nQQV8?g_st=ic'),
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
      'مصنع الشوكولاتة، القهوة المختصة، البحيرة، غداء في منتجع هاندار، آيس كريم في أوبود، والعشاء الإندونيسي.',
      'The chocolate factory, specialty coffee, the lake, lunch at Handara, ice cream in Ubud and an Indonesian dinner.',
      'Pabrik cokelat, kopi spesialti, danau, makan siang di Handara, es krim di Ubud, dan makan malam Indonesia.',
    ),
    notes: [NOTE.bedugulClothes],
    activityNames: [],
    stops: [
      P.wyah('https://maps.app.goo.gl/KQmM2dFJK9nxxxoT7?g_st=ic'),
      P.junglegold('https://maps.app.goo.gl/prSkGWvkcmJAAs3k7?g_st=ic'),
      P.blackEyeInGarden('https://maps.app.goo.gl/mTnrRye8CpHkwLqn8?g_st=ic'),
      P.ulunDanu('https://maps.app.goo.gl/3EY7AEwNDzcLjMHn6?g_st=ic'),
      P.hiland('https://maps.app.goo.gl/ZoD9KAiu91BmYRWz8?g_st=ic'),
      P.tukies('https://maps.app.goo.gl/HkGdRkUemQ1q3v5M9?g_st=ic'),
      P.thisIsBali('https://maps.app.goo.gl/ayRhG9QCygLqF13M6?g_st=ic'),
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
      'يوم أخير خفيف في أولواتو',
      'An easy last day in Uluwatu',
      'Hari terakhir santai di Uluwatu',
    ),
    description: L(
      'إفطار، ثم مطعم مطل على المحيط عصرًا، والعشاء الفرنسي.',
      'Breakfast, an ocean-view restaurant in the afternoon, and a French dinner.',
      'Sarapan, restoran menghadap laut di sore hari, dan makan malam Prancis.',
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

export const YOUTH_8_DAYS: ItinerarySeed = {
  slug: 'bali-8d-youth',
  pdfName: 'bali-youth-8-days-ar.pdf',
  audienceKind: 'youth',
  sourceDocument: 'جدول سياحي 8 أيام - بالي شباب - شهر عسل - عوائل.pdf',
  sourcePages: '1–8 («جدول سياحي شباب»)',
  priceMinor: 15_000,
  areas: [
    { key: 'seminyak', nights: 3 },
    { key: 'ubud', nights: 3 },
    { key: 'uluwatu', nights: 2 },
  ],
  currency: 'SAR',
  stay: STAY_8,
  departure: DEPARTURE_8,
  days: DAYS,
  public: {
    name: L(
      'جدول الشباب 8 أيام في بالي',
      'Bali Youth Itinerary — 8 Days',
      'Itinerary Anak Muda Bali — 8 Hari',
    ),
    heroTitle: L(
      'ثمانية أيام لا تهدأ',
      'Eight Days That Never Slow Down',
      'Delapan Hari Tanpa Jeda',
    ),
    blurb: L(
      'جدول شباب جاهز لثمانية أيام: مغامرات متنوعة، وأماكن سهر وأكل مختارة، وترتيب يوفّر عليك الطريق.',
      'A ready eight-day plan for young travellers: varied adventures, picked places to eat and hang out, and an order that saves you time on the road.',
      'Rencana delapan hari untuk anak muda: petualangan beragam, tempat makan dan nongkrong pilihan, dan urutan yang menghemat waktu di jalan.',
    ),
    intro: L(
      'ثمانية أيام تكفي لتجرّب كثيرًا — إذا كانت مرتّبة. وزّعنا الرحلة على ثلاث مناطق سكن حتى لا تضيع ساعاتك في الطريق، ونوّعنا بين أيام الحماس والأيام الأخف، مع مطاعم ومقاهٍ على طريق كل يوم ونصائح عملية قبل كل يوم مزدحم.',
      'Eight days is enough to try a lot — when they are well ordered. The trip is split across three bases so your hours are not lost on the road, alternating high-energy days with lighter ones, with restaurants and cafés on each day’s route and practical tips before every busy day.',
      'Delapan hari cukup untuk mencoba banyak hal — asalkan tertata. Perjalanan dibagi ke tiga area menginap agar waktu tidak habis di jalan, bergantian antara hari penuh energi dan hari ringan, dengan restoran dan kafe di rute setiap hari serta tips praktis sebelum hari yang padat.',
    ),
    tripType: L('شباب', 'Youth', 'Anak muda'),
    audience: [
      L('الشباب', 'Young travellers', 'Anak muda'),
      L('الأصدقاء', 'Friends', 'Teman-teman'),
    ],
    suitableFor: L(
      'للشباب والأصدقاء الذين يريدون رحلة طويلة مليئة بالتجارب.',
      'For young travellers and friends who want a longer trip packed with experiences.',
      'Untuk anak muda dan teman-teman yang ingin perjalanan lebih panjang penuh pengalaman.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L('وصول وأمسية أولى', 'Arrival and a first evening', 'Kedatangan dan malam pertama'),
      L('بحر وحماس وتسوّق', 'Sea, thrills and shopping', 'Laut, keseruan, dan belanja'),
      L('يوم مرح كامل', 'A full day of fun', 'Sehari penuh keseruan'),
      L('طبيعة على الطريق', 'Nature along the way', 'Alam di sepanjang jalan'),
      L(
        'أجواء باردة ومناظر خلابة',
        'Cool air and sweeping views',
        'Udara sejuk dan pemandangan memukau',
      ),
      L('يوم مغامرة كامل', 'A full day of adventure', 'Sehari penuh petualangan'),
      L('حماس ثم سكن جديد', 'Thrills, then a new base', 'Keseruan, lalu area baru'),
      L('ختام هادئ وغروب', 'A calm finale and the sunset', 'Penutup tenang dan matahari terbenam'),
    ],
    moodLines: [
      L(
        'بداية خفيفة بعد الطيران.',
        'An easy start after the flight.',
        'Awal ringan setelah penerbangan.',
      ),
      L('لا تنسَ ملابس الغيار.', 'Don’t forget a change of clothes.', 'Jangan lupa baju ganti.'),
      L(
        'يوم طويل من اللعب حتى المساء.',
        'A long day of play until the evening.',
        'Seharian bermain hingga sore.',
      ),
      L('انتقال إلى السكن الثاني.', 'Moving to your second base.', 'Pindah ke area kedua.'),
      L(
        'محطات متنوعة وغداء بإطلالة.',
        'Varied stops and lunch with a view.',
        'Tempat beragam dan makan siang berpemandangan.',
      ),
      L('اخرج مبكرًا واستعد.', 'Leave early and be ready.', 'Berangkat pagi dan bersiaplah.'),
      L('انتقال إلى السكن الثالث.', 'Moving to your third base.', 'Pindah ke area ketiga.'),
      L('آخر يوم قبل السفر.', 'The last day before you fly.', 'Hari terakhir sebelum pulang.'),
    ],
    seoTitle: L(
      'جدول سياحي للشباب 8 أيام في بالي',
      '8-Day Bali Itinerary for Young Travellers',
      'Itinerary 8 Hari di Bali untuk Anak Muda',
    ),
    seoDescription: L(
      'جدول شباب جاهز لـ8 أيام في بالي على ثلاث مناطق سكن: مغامرات منظمة، مطاعم ومقاهٍ مختارة، رابط خريطة لكل محطة، وملف PDF فور الدفع.',
      'A ready 8-day Bali plan for young travellers across three bases: organised adventures, picked restaurants and cafés, a map link for every stop and a PDF the moment you pay.',
      'Rencana 8 hari di Bali untuk anak muda di tiga area menginap: petualangan tertata, restoran dan kafe pilihan, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('youth', 8, 3),
    benefits: benefitsFor('youth'),
    how: HOW_STEPS,
  },
}
