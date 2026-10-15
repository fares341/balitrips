/**
 * The client's verified Bali landmarks (from the map package, bali-map.js —
 * coordinates from NGA, GeoNames, Wikipedia and the OSM wiki).
 *
 * SERVER-SIDE DATA: imported by `page.tsx`, never by a Client Component.
 * Some landmarks share a name and spot with a paywalled site place (Uluwatu
 * Temple, Nusa Penida…). `visibleLandmarks()` drops those for a viewer who
 * cannot see that place, so the client bundle and payload never name a gated
 * place — the same guarantee as `buildMapPayload`. (The artwork's control
 * points in `./art-warp.ts` carry coordinates only, no names.)
 *
 * They are fixed reference points, not site places: not managed in Studio,
 * drawn only on the real (satellite) map — the artwork has their names
 * painted on it. Names keep the English/Indonesian spelling recognisable:
 * Arabic names are transliterations, and the card shows the Latin name too.
 */

import { haversineKm } from '@/lib/geo'

import type { LandmarkCategory, MapLandmark } from './landmark-style'

export type { LandmarkCategory } from './landmark-style'

export interface LocalText {
  en: string
  ar: string
  id: string
}

export interface Landmark {
  id: string
  name: LocalText
  cat: LandmarkCategory
  /** 1 = always shown, 2 and 3 appear as the real map zooms in. */
  rank: 1 | 2 | 3
  lng: number
  lat: number
  /** Elevation in metres, only where the source gives one. */
  ele: number | null
  desc: LocalText
}

/**
 * COORDINATE CHECK (2026-10-15). The client's list came from NGA, GeoNames,
 * Wikipedia and the OSM wiki; each point was compared with a second source
 * (GeoNames search, geonames.org, unless noted). Within ~300 m: kept.
 *
 *   menjangan 18 m, pemuteran 0 m (Desa Pemuteran), lovina 0 m, tamblingan
 *   206 m, buyan 0 m, beratan 0 m, ulun-danu 31 m, batukaru 0 m, batur 235 m,
 *   lake-batur 188 m, agung 261 m, amed 0 m, ubud 204 m, ceningan 0 m,
 *   penida 17 m.
 *   uluwatu — no GeoNames temple entry; Wikipedia "Uluwatu Temple"
 *   (8°49′44″S 115°5′7″E) and the seeded site place agree.
 *   lembongan — 411 m from GeoNames' island point; both are arbitrary points
 *   on the same small island: kept.
 *   canggu — kept at Wikipedia's 8°39′21″S 115°8′3″E (the coast, where the
 *   artwork paints it); GeoNames' "Canggu" village point is 1.9 km inland.
 *
 * Corrected (old → new, source). The old values were Wikipedia's
 * arc-minute-rounded infobox points (or, for Denpasar, the Renon government
 * district rather than the city):
 *   singaraja  -8.117, 115.083     → -8.111944, 115.088056  GeoNames Singaraja (791 m)
 *   bedugul    -8.283, 115.167     → -8.285, 115.171389     GeoNames Banjar Bedugul (532 m)
 *   seminyak   -8.683, 115.167     → -8.691944, 115.160278  GeoNames Seminyak (1.2 km)
 *   denpasar   -8.6717, 115.2339   → -8.65, 115.216667      GeoNames Denpasar (3.1 km)
 *   kuta       -8.733, 115.167     → -8.723056, 115.172222  GeoNames Kuta (1.2 km)
 *   sanur      -8.683, 115.267     → -8.675, 115.261111     GeoNames Sanur (1.1 km)
 *   nusa-dua   -8.8, 115.217       → -8.800278, 115.233333  GeoNames Nusa Dua (1.8 km)
 *
 * The real map places every landmark and site pin from these lat/lng values
 * only; the artwork's control points (`./art-warp.ts`) never move them.
 */
export const LANDMARKS: readonly Landmark[] = [
  {
    id: 'menjangan',
    name: { en: 'Menjangan Island', ar: 'جزيرة مينجانغان', id: 'Pulau Menjangan' },
    cat: 'island',
    rank: 2,
    lng: 114.517657,
    lat: -8.09588,
    ele: null,
    desc: {
      en: 'Small island off Bali’s north-west coast and part of West Bali National Park (Taman Nasional Bali Barat).',
      ar: 'جزيرة صغيرة قبالة الساحل الشمالي الغربي لبالي، وهي جزء من حديقة غرب بالي الوطنية (Taman Nasional Bali Barat).',
      id: 'Pulau kecil di lepas pantai barat laut Bali, bagian dari Taman Nasional Bali Barat.',
    },
  },
  {
    id: 'pemuteran',
    name: { en: 'Pemuteran', ar: 'بيموتيران', id: 'Pemuteran' },
    cat: 'settlement',
    rank: 3,
    lng: 114.644722,
    lat: -8.165556,
    ele: null,
    desc: {
      en: 'Coastal village in Gerokgak district, Buleleng, on the north-west coast.',
      ar: 'قرية ساحلية في مقاطعة غيروكغاك بإقليم بوليلينغ، على الساحل الشمالي الغربي.',
      id: 'Desa pesisir di Kecamatan Gerokgak, Buleleng, di pantai barat laut.',
    },
  },
  {
    id: 'lovina',
    name: { en: 'Lovina', ar: 'لوفينا', id: 'Lovina' },
    cat: 'settlement',
    rank: 2,
    lng: 115.039722,
    lat: -8.149167,
    ele: null,
    desc: {
      en: 'North-coast beach area west of Singaraja. Early-morning boat trips to watch dolphins are its best-known activity.',
      ar: 'منطقة شواطئ على الساحل الشمالي غرب سينغاراجا، أشهر أنشطتها رحلات القوارب في الصباح الباكر لمشاهدة الدلافين.',
      id: 'Kawasan pantai di pesisir utara, sebelah barat Singaraja. Perjalanan perahu pagi-pagi untuk melihat lumba-lumba adalah kegiatan paling terkenalnya.',
    },
  },
  {
    id: 'singaraja',
    name: { en: 'Singaraja', ar: 'سينغاراجا', id: 'Singaraja' },
    cat: 'settlement',
    rank: 1,
    lng: 115.088056,
    lat: -8.111944,
    ele: null,
    desc: {
      en: 'Main town of northern Bali and seat of Buleleng Regency. It was the colonial capital of Bali and the Lesser Sunda Islands from 1849 to 1960.',
      ar: 'المدينة الرئيسية في شمال بالي ومقر إقليم بوليلينغ. كانت العاصمة الاستعمارية لبالي وجزر سوندا الصغرى من 1849 إلى 1960.',
      id: 'Kota utama di Bali utara dan pusat Kabupaten Buleleng. Kota ini menjadi ibu kota kolonial Bali dan Kepulauan Sunda Kecil dari 1849 hingga 1960.',
    },
  },
  {
    id: 'tamblingan',
    name: { en: 'Lake Tamblingan', ar: 'بحيرة تامبلينغان', id: 'Danau Tamblingan' },
    cat: 'lake',
    rank: 2,
    lng: 115.097003,
    lat: -8.257056,
    ele: 1217,
    desc: {
      en: 'The smallest and westernmost of the three lakes in the ancient Bedugul caldera (about 1.6 km²).',
      ar: 'أصغر البحيرات الثلاث في كالديرا بيدوغول القديمة وأقصاها غرباً (نحو 1.6 كم²).',
      id: 'Danau terkecil dan paling barat dari tiga danau di kaldera purba Bedugul (sekitar 1,6 km²).',
    },
  },
  {
    id: 'buyan',
    name: { en: 'Lake Buyan', ar: 'بحيرة بويان', id: 'Danau Buyan' },
    cat: 'lake',
    rank: 2,
    lng: 115.122778,
    lat: -8.244722,
    ele: null,
    desc: {
      en: 'The largest of the three Bedugul caldera lakes (about 490 ha), lying between Tamblingan and Beratan.',
      ar: 'أكبر بحيرات كالديرا بيدوغول الثلاث (نحو 490 هكتاراً)، وتقع بين تامبلينغان وبراتان.',
      id: 'Danau terbesar dari tiga danau kaldera Bedugul (sekitar 490 ha), terletak di antara Tamblingan dan Beratan.',
    },
  },
  {
    id: 'beratan',
    name: { en: 'Lake Beratan', ar: 'بحيرة براتان', id: 'Danau Beratan' },
    cat: 'lake',
    rank: 1,
    lng: 115.173889,
    lat: -8.272222,
    ele: null,
    desc: {
      en: 'Easternmost of the three caldera lakes, in Candikuning village near Bedugul. A major irrigation source for central Bali.',
      ar: 'أقصى بحيرات الكالديرا الثلاث شرقاً، في قرية تشانديكونينغ قرب بيدوغول، ومصدر رئيسي للري في وسط بالي.',
      id: 'Danau paling timur dari tiga danau kaldera, di Desa Candikuning dekat Bedugul. Sumber irigasi utama bagi Bali tengah.',
    },
  },
  {
    id: 'ulun-danu',
    name: {
      en: 'Pura Ulun Danu Beratan',
      ar: 'معبد أولون دانو براتان',
      id: 'Pura Ulun Danu Beratan',
    },
    cat: 'temple',
    rank: 3,
    lng: 115.166389,
    lat: -8.275278,
    ele: null,
    desc: {
      en: 'Lakeside water temple on Lake Beratan, built in 1633 and dedicated to Dewi Danu, the goddess of lakes and water.',
      ar: 'معبد مائي على ضفة بحيرة براتان، بُني عام 1633 ومكرَّس لديوي دانو، إلهة البحيرات والمياه.',
      id: 'Pura air di tepi Danau Beratan, dibangun pada 1633 dan dipersembahkan untuk Dewi Danu, dewi danau dan air.',
    },
  },
  {
    id: 'bedugul',
    name: { en: 'Bedugul', ar: 'بيدوغول', id: 'Bedugul' },
    cat: 'settlement',
    rank: 2,
    lng: 115.171389,
    lat: -8.285,
    ele: null,
    desc: {
      en: 'Highland resort area at the south end of Lake Beratan, home to the Bali Botanic Garden (founded 1959).',
      ar: 'منطقة مصايف جبلية عند الطرف الجنوبي لبحيرة براتان، وفيها حديقة بالي النباتية (تأسست عام 1959).',
      id: 'Kawasan wisata dataran tinggi di ujung selatan Danau Beratan, tempat Kebun Raya Bali (didirikan 1959).',
    },
  },
  {
    id: 'batukaru',
    name: { en: 'Mount Batukaru', ar: 'جبل باتوكارو', id: 'Gunung Batukaru' },
    cat: 'volcano',
    rank: 2,
    lng: 115.0875,
    lat: -8.334444,
    ele: 2276,
    desc: {
      en: 'Second-highest summit on Bali after Mount Agung, south-west of the Bedugul lakes.',
      ar: 'ثاني أعلى قمة في بالي بعد جبل أغونغ، جنوب غرب بحيرات بيدوغول.',
      id: 'Puncak tertinggi kedua di Bali setelah Gunung Agung, di barat daya danau-danau Bedugul.',
    },
  },
  {
    id: 'batur',
    name: { en: 'Mount Batur', ar: 'جبل باتور', id: 'Gunung Batur' },
    cat: 'volcano',
    rank: 1,
    lng: 115.3775,
    lat: -8.238889,
    ele: 1717,
    desc: {
      en: 'Active volcano standing inside a large caldera that formed about 29,300 years ago. Its most recent eruption was in 2000.',
      ar: 'بركان نشط يقوم داخل كالديرا واسعة تكوّنت قبل نحو 29,300 عام. آخر ثوراته كانت عام 2000.',
      id: 'Gunung api aktif yang berdiri di dalam kaldera besar yang terbentuk sekitar 29.300 tahun lalu. Letusan terakhirnya terjadi pada tahun 2000.',
    },
  },
  {
    id: 'lake-batur',
    name: { en: 'Lake Batur', ar: 'بحيرة باتور', id: 'Danau Batur' },
    cat: 'lake',
    rank: 1,
    lng: 115.408333,
    lat: -8.258333,
    ele: 1031,
    desc: {
      en: 'Crater lake filling the eastern side of the Batur caldera, south-east of the active cone. About 15.9 km² and up to 88 m deep.',
      ar: 'بحيرة فوهة تملأ الجانب الشرقي من كالديرا باتور، جنوب شرق المخروط النشط. مساحتها نحو 15.9 كم² ويصل عمقها إلى 88 م.',
      id: 'Danau kawah yang mengisi sisi timur kaldera Batur, di tenggara kerucut aktif. Luasnya sekitar 15,9 km² dengan kedalaman hingga 88 m.',
    },
  },
  {
    id: 'agung',
    name: { en: 'Mount Agung', ar: 'جبل أغونغ', id: 'Gunung Agung' },
    cat: 'volcano',
    rank: 1,
    lng: 115.503333,
    lat: -8.340833,
    ele: 3031,
    desc: {
      en: 'The highest point on Bali, an active volcano south-east of the Batur caldera.',
      ar: 'أعلى نقطة في بالي، وهو بركان نشط جنوب شرق كالديرا باتور.',
      id: 'Titik tertinggi di Bali, gunung api aktif di tenggara kaldera Batur.',
    },
  },
  {
    id: 'amed',
    name: { en: 'Amed', ar: 'أميد', id: 'Amed' },
    cat: 'settlement',
    rank: 2,
    lng: 115.641667,
    lat: -8.334167,
    ele: null,
    desc: {
      en: 'Village in Abang district. The name is also used for a 14 km stretch of east-coast villages.',
      ar: 'قرية في مقاطعة أبانغ، ويُطلق الاسم أيضاً على شريط من قرى الساحل الشرقي طوله 14 كم.',
      id: 'Desa di Kecamatan Abang. Nama ini juga dipakai untuk deretan desa sepanjang 14 km di pesisir timur.',
    },
  },
  {
    id: 'ubud',
    name: { en: 'Ubud', ar: 'أوبود', id: 'Ubud' },
    cat: 'settlement',
    rank: 1,
    lng: 115.2651,
    lat: -8.5079,
    ele: null,
    desc: {
      en: 'District in Gianyar Regency known as Bali’s centre for arts and culture.',
      ar: 'مقاطعة في إقليم جيانيار تُعرف بأنها مركز الفنون والثقافة في بالي.',
      id: 'Kecamatan di Kabupaten Gianyar yang dikenal sebagai pusat seni dan budaya Bali.',
    },
  },
  {
    id: 'canggu',
    name: { en: 'Canggu', ar: 'تشانغو', id: 'Canggu' },
    cat: 'settlement',
    rank: 2,
    lng: 115.134167,
    lat: -8.655833,
    ele: null,
    desc: {
      en: 'Coastal village on the south-west coast that has grown quickly since the early 2020s, replacing much of its rice land.',
      ar: 'قرية ساحلية على الساحل الجنوبي الغربي نمت بسرعة منذ مطلع عشرينيات القرن الحالي، وحلّ العمران محل كثير من حقول الأرز فيها.',
      id: 'Desa pesisir di pantai barat daya yang berkembang pesat sejak awal 2020-an, menggantikan sebagian besar sawahnya.',
    },
  },
  {
    id: 'seminyak',
    name: { en: 'Seminyak', ar: 'سمينياك', id: 'Seminyak' },
    cat: 'settlement',
    rank: 2,
    lng: 115.160278,
    lat: -8.691944,
    ele: null,
    desc: {
      en: 'Tourist and residential area just north of Kuta, known for shopping and restaurants.',
      ar: 'منطقة سياحية وسكنية شمال كوتا مباشرة، تشتهر بالتسوق والمطاعم.',
      id: 'Kawasan wisata dan permukiman tepat di utara Kuta, terkenal dengan tempat belanja dan restorannya.',
    },
  },
  {
    id: 'denpasar',
    name: { en: 'Denpasar', ar: 'دينباسار', id: 'Denpasar' },
    cat: 'settlement',
    rank: 1,
    lng: 115.216667,
    lat: -8.65,
    ele: null,
    desc: {
      en: 'Provincial capital of Bali and its largest city.',
      ar: 'عاصمة مقاطعة بالي وأكبر مدنها.',
      id: 'Ibu kota Provinsi Bali dan kota terbesarnya.',
    },
  },
  {
    id: 'kuta',
    name: { en: 'Kuta', ar: 'كوتا', id: 'Kuta' },
    cat: 'settlement',
    rank: 1,
    lng: 115.172222,
    lat: -8.723056,
    ele: null,
    desc: {
      en: 'Former fishing village that became one of Bali’s first mass-tourism destinations.',
      ar: 'قرية صيد سابقة أصبحت من أوائل وجهات السياحة الجماعية في بالي.',
      id: 'Bekas desa nelayan yang menjadi salah satu tujuan wisata massal pertama di Bali.',
    },
  },
  {
    id: 'sanur',
    name: { en: 'Sanur', ar: 'سانور', id: 'Sanur' },
    cat: 'settlement',
    rank: 2,
    lng: 115.261111,
    lat: -8.675,
    ele: null,
    desc: {
      en: 'East-coast beach area of Denpasar. Its Bali Beach hotel (1966) was the island’s first five-star resort.',
      ar: 'منطقة شواطئ على الساحل الشرقي لدينباسار. كان فندق Bali Beach فيها (1966) أول منتجع بخمس نجوم في الجزيرة.',
      id: 'Kawasan pantai di pesisir timur Denpasar. Hotel Bali Beach (1966) di sana adalah resor bintang lima pertama di pulau ini.',
    },
  },
  {
    id: 'nusa-dua',
    name: { en: 'Nusa Dua', ar: 'نوسا دوا', id: 'Nusa Dua' },
    cat: 'settlement',
    rank: 2,
    lng: 115.233333,
    lat: -8.800278,
    ele: null,
    desc: {
      en: 'Planned resort enclave of about 350 ha built from the 1970s on the east side of the Bukit Peninsula.',
      ar: 'مجمّع منتجعات مخطَّط مساحته نحو 350 هكتاراً، بُني منذ سبعينيات القرن العشرين على الجانب الشرقي من شبه جزيرة بوكيت.',
      id: 'Kawasan resor terencana seluas sekitar 350 ha yang dibangun sejak 1970-an di sisi timur Semenanjung Bukit.',
    },
  },
  {
    id: 'uluwatu',
    name: { en: 'Uluwatu Temple', ar: 'معبد أولواتو', id: 'Pura Luhur Uluwatu' },
    cat: 'temple',
    rank: 1,
    lng: 115.085278,
    lat: -8.828889,
    ele: null,
    desc: {
      en: 'Sea temple on a 70 m cliff at the south-west tip of the Bukit Peninsula; the only sea temple that is also one of Bali’s nine directional temples.',
      ar: 'معبد بحري على جرف بارتفاع 70 م عند الطرف الجنوبي الغربي لشبه جزيرة بوكيت، وهو المعبد البحري الوحيد الذي يُعدّ أيضاً أحد معابد الاتجاهات التسعة في بالي.',
      id: 'Pura laut di atas tebing setinggi 70 m di ujung barat daya Semenanjung Bukit; satu-satunya pura laut yang juga termasuk sembilan pura arah mata angin Bali.',
    },
  },
  {
    id: 'lembongan',
    name: { en: 'Nusa Lembongan', ar: 'نوسا ليمبونغان', id: 'Nusa Lembongan' },
    cat: 'island',
    rank: 1,
    lng: 115.451117,
    lat: -8.681767,
    ele: null,
    desc: {
      en: 'The most visited of the three Nusa islands. Linked to Nusa Ceningan by a suspension bridge for foot and motorbike traffic, opened in 2017.',
      ar: 'أكثر جزر نوسا الثلاث زيارةً. يربطها بنوسا سينينغان جسر معلّق للمشاة والدراجات النارية افتُتح عام 2017.',
      id: 'Pulau yang paling banyak dikunjungi di antara tiga pulau Nusa. Terhubung ke Nusa Ceningan oleh jembatan gantung untuk pejalan kaki dan sepeda motor yang dibuka pada 2017.',
    },
  },
  {
    id: 'ceningan',
    name: { en: 'Nusa Ceningan', ar: 'نوسا سينينغان', id: 'Nusa Ceningan' },
    cat: 'island',
    rank: 2,
    lng: 115.451389,
    lat: -8.699722,
    ele: null,
    desc: {
      en: 'Small island between Nusa Lembongan (north) and Nusa Penida (east), separated from Lembongan by a shallow channel.',
      ar: 'جزيرة صغيرة بين نوسا ليمبونغان (شمالاً) ونوسا بينيدا (شرقاً)، يفصلها عن ليمبونغان ممر مائي ضحل.',
      id: 'Pulau kecil di antara Nusa Lembongan (utara) dan Nusa Penida (timur), dipisahkan dari Lembongan oleh selat dangkal.',
    },
  },
  {
    id: 'penida',
    name: { en: 'Nusa Penida', ar: 'نوسا بينيدا', id: 'Nusa Penida' },
    cat: 'island',
    rank: 1,
    lng: 115.5378,
    lat: -8.7346,
    ele: null,
    desc: {
      en: 'The largest of the Nusa islands, south-east of the Bukit Peninsula. Its highest point is Mount Mundi.',
      ar: 'أكبر جزر نوسا، جنوب شرق شبه جزيرة بوكيت. أعلى نقطة فيها جبل موندي.',
      id: 'Pulau terbesar di antara pulau-pulau Nusa, di tenggara Semenanjung Bukit. Titik tertingginya adalah Gunung Mundi.',
    },
  },
]

export function landmarkById(id: string): Landmark | undefined {
  return LANDMARKS.find((entry) => entry.id === id)
}

/** The name in the page language; English for any other locale. */
export function landmarkText(text: LocalText, locale: string): string {
  return locale === 'ar' ? text.ar : locale === 'id' ? text.id : text.en
}

const norm = (value: string) => value.trim().toLocaleLowerCase()

/**
 * The landmarks this viewer may get: any landmark that names, or sits within
 * `km` of, a place the viewer cannot see is left out. `hidden` is the
 * unredacted list of exactly those places (server-side only).
 */
export function visibleLandmarks(
  list: readonly Landmark[],
  hidden: readonly { name: Record<string, string>; lat: number; lon: number }[],
  km = 1.5,
): Landmark[] {
  if (hidden.length === 0) return [...list]
  const names = new Set(hidden.flatMap((place) => Object.values(place.name).map(norm)))
  return list.filter((l) => {
    const own = [l.name.en, l.name.ar, l.name.id].map(norm)
    if (own.some((name) => names.has(name))) return false
    return !hidden.some((place) => haversineKm({ lat: l.lat, lon: l.lng }, place) < km)
  })
}

/** What the page sends: one language, plus the Latin name for recognition. */
export function localizeLandmarks(list: readonly Landmark[], locale: string): MapLandmark[] {
  return list.map((l) => ({
    id: l.id,
    name: landmarkText(l.name, locale),
    latin: l.name.en,
    desc: landmarkText(l.desc, locale),
    cat: l.cat,
    rank: l.rank,
    lng: l.lng,
    lat: l.lat,
    ele: l.ele,
  }))
}
