/**
 * «جدول شهر العسل 8 أيام» — source: «جدول سياحي 8 أيام - بالي شباب - شهر عسل -
 * عوائل.pdf», section «جدول شهر عسل» (pages 8–15). Links verbatim.
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
      'مساج ويوم كامل في نياني',
      'A massage and a full day in Nyanyi',
      'Pijat dan seharian di Nyanyi',
    ),
    description: L(
      'إفطار، جلسة مساج، يوم كامل في النادي الشاطئي في نياني، والعشاء الأوزبكي.',
      'Breakfast, a massage, a full day at the beach club in Nyanyi and an Uzbek dinner.',
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
      'مصنع الشوكولاتة، الحديقة السرية، البحيرة، غداء في منتجع هاندار، آيس كريم في أوبود، والعشاء الإندونيسي.',
      'The chocolate factory, the secret garden, the lake, lunch at Handara, ice cream in Ubud and an Indonesian dinner.',
      'Pabrik cokelat, taman rahasia, danau, makan siang di Handara, es krim di Ubud, dan makan malam Indonesia.',
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
    title: L(
      'مزارع الأرز ثم أولواتو',
      'Rice terraces, then Uluwatu',
      'Sawah terasering, lalu Uluwatu',
    ),
    description: L(
      'تسجيل الخروج من أوبود، مزارع الأرز وفعالياتها والغداء فيها، ثم أولواتو والعشاء العربي.',
      'Check out of Ubud, the rice terraces with their activities and lunch, then Uluwatu and an Arabic dinner.',
      'Check-out dari Ubud, sawah terasering dengan aktivitas dan makan siang, lalu Uluwatu dan makan malam Arab.',
    ),
    notes: [NOTE.toUluwatuRice],
    activityNames: ACT.rice,
    stops: [
      P.twoFace('https://maps.app.goo.gl/umkm8KzzQt3LvEN77?g_st=ic'),
      P.alasHarum('https://maps.app.goo.gl/3odFzf2XLrxQZQTYA?g_st=ic', THEN.CHECK_IN_ULUWATU),
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

export const HONEYMOON_8_DAYS: ItinerarySeed = {
  slug: 'bali-8d-honeymoon',
  pdfName: 'bali-honeymoon-8-days-ar.pdf',
  audienceKind: 'honeymoon',
  sourceDocument: 'جدول سياحي 8 أيام - بالي شباب - شهر عسل - عوائل.pdf',
  sourcePages: '8–15 («جدول شهر عسل»)',
  priceMinor: null,
  currency: 'SAR',
  stay: STAY_8,
  departure: DEPARTURE_8,
  days: DAYS,
  public: {
    name: L(
      'جدول شهر العسل 8 أيام في بالي',
      'Bali Honeymoon Itinerary — 8 Days',
      'Itinerary Bulan Madu Bali — 8 Hari',
    ),
    heroTitle: L(
      'ثمانية أيام من اللحظات الرومانسية',
      'Eight Days of Romantic Moments',
      'Delapan Hari Penuh Momen Romantis',
    ),
    blurb: L(
      'جدول شهر عسل لثمانية أيام: استجمام، وتجارب مشتركة، وأمسيات تبقى في الذاكرة.',
      'An eight-day honeymoon plan: relaxation, shared experiences and evenings to remember.',
      'Rencana bulan madu delapan hari: relaksasi, pengalaman bersama, dan malam yang berkesan.',
    ),
    intro: L(
      'رحلة شهر العسل تستحق أن تكون بلا عناء. رتّبنا لكما ثمانية أيام على ثلاث مناطق سكن، فيها يوم مساج واسترخاء كامل، وأيام تجارب مشتركة، ومطاعم مختارة لكل أمسية، وختام هادئ قبل السفر. كل ما عليكما أن تستمتعا.',
      'A honeymoon deserves to be effortless. Eight days across three bases, with a full day of massage and relaxation, days of shared experiences, a picked restaurant for every evening and a calm finale before you fly. All you have to do is enjoy it.',
      'Bulan madu layak dijalani tanpa repot. Delapan hari di tiga area menginap, dengan satu hari penuh pijat dan relaksasi, hari-hari pengalaman bersama, restoran pilihan untuk setiap malam, dan penutup tenang sebelum pulang. Anda berdua tinggal menikmati.',
    ),
    tripType: L('شهر عسل', 'Honeymoon', 'Bulan madu'),
    audience: [
      L('الأزواج', 'Couples', 'Pasangan'),
      L('شهر العسل', 'Honeymooners', 'Pengantin baru'),
    ],
    suitableFor: L(
      'للأزواج الذين يريدون شهر عسل أطول يجمع الهدوء والتجارب.',
      'For couples who want a longer honeymoon that blends calm and experiences.',
      'Untuk pasangan yang ingin bulan madu lebih panjang yang memadukan ketenangan dan pengalaman.',
    ),
    stats: statsFor(DAYS),
    moods: [
      L('وصول وأمسية أولى', 'Arrival and a first evening', 'Kedatangan dan malam pertama'),
      L('يوم استجمام كامل', 'A full day of pampering', 'Seharian dimanjakan'),
      L('بحر وحماس وتسوّق', 'Sea, thrills and shopping', 'Laut, keseruan, dan belanja'),
      L('طبيعة على الطريق', 'Nature along the way', 'Alam di sepanjang jalan'),
      L(
        'أجواء باردة ومناظر ساحرة',
        'Cool air and enchanting views',
        'Udara sejuk dan pemandangan memesona',
      ),
      L('مغامرة مشتركة', 'An adventure together', 'Petualangan bersama'),
      L(
        'خضرة وإطلالات ثم سكن جديد',
        'Green views, then a new base',
        'Pemandangan hijau, lalu area baru',
      ),
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
      L('انتقال إلى السكن الثاني.', 'Moving to your second base.', 'Pindah ke area kedua.'),
      L(
        'محطات جميلة وغداء بإطلالة.',
        'Beautiful stops and lunch with a view.',
        'Tempat indah dan makan siang berpemandangan.',
      ),
      L('اخرجا مبكرًا.', 'Leave early.', 'Berangkat pagi.'),
      L('انتقال إلى السكن الثالث.', 'Moving to your third base.', 'Pindah ke area ketiga.'),
      L('آخر يوم قبل السفر.', 'The last day before you fly.', 'Hari terakhir sebelum pulang.'),
    ],
    seoTitle: L(
      'جدول شهر عسل 8 أيام في بالي',
      '8-Day Bali Honeymoon Itinerary',
      'Itinerary Bulan Madu 8 Hari di Bali',
    ),
    seoDescription: L(
      'جدول شهر عسل جاهز لـ8 أيام في بالي على ثلاث مناطق سكن: يوم استجمام، تجارب مشتركة، مطاعم مختارة، رابط خريطة لكل محطة، وملف PDF فور الدفع.',
      'A ready 8-day Bali honeymoon plan across three bases: a pampering day, shared experiences, picked restaurants, a map link for every stop and a PDF the moment you pay.',
      'Rencana bulan madu 8 hari di Bali di tiga area menginap: hari relaksasi, pengalaman bersama, restoran pilihan, tautan peta setiap tempat, dan PDF langsung setelah bayar.',
    ),
    faq: faqFor('honeymoon', 8, 3),
    benefits: benefitsFor('honeymoon'),
    how: HOW_STEPS,
  },
}
