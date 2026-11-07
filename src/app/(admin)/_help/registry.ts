/**
 * Studio help registry — «دليل هذه الشاشة» for every screen, in one file so
 * it is easy to keep up to date. Arabic first, then English, then Indonesian.
 *
 * Each entry matches a Studio path (relative to the admin base). The first
 * matching entry wins, so put specific paths before general ones. To update a
 * guide, edit its text here; nothing else needs to change.
 */

export type HelpLocale = 'ar' | 'en' | 'id'
export const HELP_LOCALES: readonly HelpLocale[] = ['ar', 'en', 'id']

/** [ar, en, id] */
export type L3 = readonly [ar: string, en: string, id: string]

export interface HelpEntry {
  id: string
  /** Matched against the Studio path, e.g. /activities/123. */
  match: RegExp
  /** Screen to open from the guides page. */
  href: string
  title: L3
  purpose: L3
  steps: readonly L3[]
  /** Field → what it is and where it shows on the public site. */
  fields: readonly { name: L3; where: L3 }[]
  mistakes: readonly L3[]
  /** Set for a screen another team owns; it fills the text in later. */
  placeholder?: true
}

export function pickL3(value: L3, locale: HelpLocale): string {
  return value[HELP_LOCALES.indexOf(locale)] || value[1]
}

const IMG_STEP: L3 = [
  'الصور: اضغط «اختيار صورة» ← ابحث باسم الصورة أو اختر من آخر المرفوعات، أو اضغط «رفع صور جديدة» لرفعها من هنا مباشرة.',
  'Images: press “Choose image” → search by the image name or pick a recent upload, or press “Upload new images” to upload right there.',
  'Gambar: tekan “Pilih gambar” → cari menurut nama gambar atau pilih unggahan terbaru, atau tekan “Unggah gambar baru”.',
]
const SAVE_STEP: L3 = [
  'اضغط «حفظ». تظهر رسالة نجاح أعلى الصفحة. إذا غادرت قبل الحفظ ينبّهك النظام.',
  'Press “Save”. A success message appears at the top. Leaving before saving shows a warning.',
  'Tekan “Simpan”. Pesan berhasil muncul di atas. Keluar sebelum menyimpan akan memunculkan peringatan.',
]
const ARCHIVE_STEP: L3 = [
  'الحذف: زر «أرشفة» يخفي السجل من الموقع دون أن يكسر الحجوزات والطلبات القديمة. للاسترجاع: «المحذوفات» ← «استرجاع».',
  'Delete: “Archive” hides the record from the site without breaking past bookings or orders. To undo: “Archive bin” → “Restore”.',
  'Hapus: “Arsipkan” menyembunyikan data dari situs tanpa merusak pemesanan lama. Untuk membatalkan: “Arsip” → “Pulihkan”.',
]
const LANG_MISTAKE: L3 = [
  'ترك الترجمة الإنجليزية أو الإندونيسية فارغة: يظهر النص العربي/الإنجليزي بدلاً منها لزوّار تلك اللغة.',
  'Leaving English or Indonesian empty: visitors in that language see the fallback text instead.',
  'Mengosongkan bahasa Inggris atau Indonesia: pengunjung bahasa itu melihat teks cadangan.',
]
const NAME_FIELD = {
  name: ['الاسم (ar / en / id)', 'Name (ar / en / id)', 'Nama (ar / en / id)'] as L3,
  where: [
    'العنوان في البطاقة وأعلى الصفحة العامة.',
    'Title on the card and at the top of the public page.',
    'Judul pada kartu dan di atas halaman publik.',
  ] as L3,
}
const STATUS_FIELD = {
  name: ['الحالة (مسودة / منشور)', 'Status (draft / published)', 'Status (draf / terbit)'] as L3,
  where: [
    'المسودة لا تظهر للزوار؛ المنشور يظهر فوراً.',
    'Drafts are hidden from visitors; published shows straight away.',
    'Draf tersembunyi; terbit langsung tampil.',
  ] as L3,
}
const HERO_FIELD = {
  name: ['الصورة الرئيسية', 'Main (hero) image', 'Gambar utama'] as L3,
  where: [
    'صورة البطاقة وأعلى الصفحة. يُفضَّل أفقية بعرض 1600 بكسل أو أكثر.',
    'Card photo and page header. Landscape, 1600 px wide or more is best.',
    'Foto kartu dan header halaman. Lanskap, lebar ≥1600 px.',
  ] as L3,
}

export const HELP: readonly HelpEntry[] = [
  {
    id: 'media',
    match: /^\/media/,
    href: '/media',
    title: ['مكتبة الوسائط', 'Media library', 'Pustaka media'],
    purpose: [
      'هنا ترفع كل صورك مرة واحدة، ثم تختار أي صورة باسمها في أي قسم من اللوحة.',
      'Upload all your images here once, then pick any of them by name from any Studio section.',
      'Unggah semua gambar sekali di sini, lalu pilih menurut nama dari bagian mana pun.',
    ],
    steps: [
      [
        'اسحب الصور إلى المربع أو اضغط «اختيار ملفات» واختر عدة صور معاً.',
        'Drag images onto the box, or press “Choose files” and select many at once.',
        'Seret gambar ke kotak, atau tekan “Pilih file” dan pilih banyak sekaligus.',
      ],
      [
        'عدّل اسم كل صورة قبل الرفع إن أردت (الاسم يُؤخذ من اسم الملف)، ثم اضغط «رفع».',
        'Edit each name before uploading if you like (it comes from the file name), then press “Upload”.',
        'Ubah nama tiap gambar bila perlu (diambil dari nama file), lalu tekan “Unggah”.',
      ],
      [
        'الصور الكبيرة تُصغَّر تلقائياً على جهازك قبل الرفع، ويظهر شريط تقدّم لكل صورة.',
        'Large photos are shrunk on your device first; each file shows its own progress bar.',
        'Foto besar diperkecil di perangkat Anda; tiap file punya bilah progres.',
      ],
      [
        'لتغيير الاسم أو النص البديل: عدّل الحقول تحت الصورة واضغط «حفظ التفاصيل».',
        'To rename or change alt text: edit the fields under the image and press “Save details”.',
        'Untuk ganti nama/teks alt: ubah kolom di bawah gambar lalu “Simpan detail”.',
      ],
      [
        'للحذف: «أرشفة». تظهر لك عدد الأماكن التي تستخدم الصورة؛ الصورة المستخدمة في صفحة منشورة لا تُحذف حتى تستبدلها.',
        'To delete: “Archive”. You see how many places use it; an image on a published page cannot be removed until replaced.',
        'Hapus: “Arsipkan”. Terlihat berapa tempat memakainya; gambar di halaman terbit tidak bisa dihapus sebelum diganti.',
      ],
    ],
    fields: [
      {
        name: ['الاسم', 'Name', 'Nama'],
        where: [
          'للبحث والاختيار داخل اللوحة فقط، لا يظهر للزوار.',
          'For searching and picking in Studio only; visitors never see it.',
          'Hanya untuk mencari di Studio; tidak terlihat pengunjung.',
        ],
      },
      {
        name: ['النص البديل (ar/en/id)', 'Alt text (ar/en/id)', 'Teks alt (ar/en/id)'],
        where: [
          'وصف الصورة لقارئات الشاشة ومحركات البحث.',
          'Describes the image to screen readers and search engines.',
          'Deskripsi untuk pembaca layar dan mesin pencari.',
        ],
      },
      {
        name: ['المصدر/الحقوق', 'Credit', 'Kredit'],
        where: [
          'يظهر تحت الصورة عند الحاجة (اسم المصوّر).',
          'Shown under the photo when needed (photographer).',
          'Tampil di bawah foto bila perlu (fotografer).',
        ],
      },
    ],
    mistakes: [
      [
        'رفع صور بصيغة HEIC أو PDF: المقبول JPG و PNG و WebP فقط.',
        'Uploading HEIC or PDF: only JPG, PNG and WebP are accepted.',
        'Mengunggah HEIC/PDF: hanya JPG, PNG, WebP.',
      ],
      [
        'أسماء ملفات مثل IMG_2034: غيّرها لاسم واضح مثل «معبد أولون دانو» لتجدها بسرعة.',
        'File names like IMG_2034: rename to something clear like “Ulun Danu temple”.',
        'Nama seperti IMG_2034: ganti dengan nama jelas seperti “Pura Ulun Danu”.',
      ],
    ],
  },
  {
    id: 'home-content',
    match: /^\/home-content/,
    href: '/home-content',
    title: ['الصفحة الرئيسية', 'Home page', 'Beranda'],
    purpose: [
      'تعديل كل نصوص وصور الصفحة الرئيسية، وإظهار أو إخفاء أي قسم.',
      'Edit every text and photo on the home page, and show or hide each section.',
      'Ubah semua teks dan foto beranda, serta tampilkan/sembunyikan bagian.',
    ],
    steps: [
      [
        'افتح القسم الذي تريده (الواجهة، الخدمات، من نحن…).',
        'Open the section you want (hero, services, about…).',
        'Buka bagian yang diinginkan (hero, layanan, tentang…).',
      ],
      [
        'الحقول تبدأ بالنص الحالي في الموقع. عدّل العربية ثم الإنجليزية ثم الإندونيسية.',
        'Fields start with the text the site shows now. Edit Arabic, then English, then Indonesian.',
        'Kolom berisi teks saat ini. Ubah Arab, lalu Inggris, lalu Indonesia.',
      ],
      IMG_STEP,
      [
        'لإخفاء قسم: أزل علامة «إظهار هذا القسم».',
        'To hide a section: untick “Show this section”.',
        'Untuk menyembunyikan: hapus centang “Tampilkan bagian ini”.',
      ],
      SAVE_STEP,
    ],
    fields: [
      {
        name: ['حقل فارغ', 'An empty field', 'Kolom kosong'],
        where: [
          'يعيد النص الأصلي للموقع.',
          'Brings back the built-in text.',
          'Mengembalikan teks bawaan.',
        ],
      },
      {
        name: ['صورة غير مختارة', 'No image picked', 'Tanpa gambar'],
        where: [
          'تبقى الصورة الأصلية (تظهر معاينتها تحت الحقل).',
          'The built-in photo stays (previewed under the field).',
          'Foto bawaan tetap (pratinjau di bawah kolom).',
        ],
      },
    ],
    mistakes: [
      [
        'نصوص طويلة جداً في العنوان الرئيسي تكسر التصميم على الجوال. اجعلها قصيرة.',
        'Very long hero titles break the phone layout. Keep them short.',
        'Judul hero yang terlalu panjang merusak tampilan ponsel.',
      ],
      LANG_MISTAKE,
    ],
  },
  {
    id: 'activities',
    match: /^\/activities/,
    href: '/activities',
    title: ['الفعاليات', 'Activities', 'Aktivitas'],
    purpose: [
      'إضافة الفعاليات والجولات وتعديل أسعارها وصورها وباقاتها.',
      'Add tours and activities, and edit their prices, photos and options.',
      'Tambah tur/aktivitas, ubah harga, foto, dan opsi.',
    ],
    steps: [
      [
        'إضافة: «فعالية جديدة» ← اكتب الاسم والمنطقة ← «حفظ».',
        'Add: “New activity” → name and region → “Save”.',
        'Tambah: “Aktivitas baru” → nama dan wilayah → “Simpan”.',
      ],
      [
        'الأسعار والباقات من تبويب «الباقات»: لكل باقة سعر وصورة ومحتويات.',
        'Prices and options are in the “Packages” tab: each has a price, photo and contents.',
        'Harga dan paket di tab “Paket”: tiap paket punya harga, foto, isi.',
      ],
      IMG_STEP,
      [
        'الترتيب: اسحب الفعاليات في القائمة أو استخدم أسهم الترتيب.',
        'Order: drag activities in the list or use the order arrows.',
        'Urutan: seret di daftar atau pakai panah urutan.',
      ],
      ARCHIVE_STEP,
    ],
    fields: [
      NAME_FIELD,
      STATUS_FIELD,
      HERO_FIELD,
      {
        name: ['معرض الصور', 'Gallery', 'Galeri'],
        where: [
          'الصور المتحركة في صفحة الفعالية، بالترتيب الذي تختاره.',
          'The photo slider on the activity page, in your order.',
          'Slider foto di halaman aktivitas sesuai urutan Anda.',
        ],
      },
    ],
    mistakes: [
      [
        'نشر فعالية بلا سعر أو بلا صورة: تظهر ناقصة. راجع «الجاهزية» قبل النشر.',
        'Publishing without a price or photo looks broken. Check “Readiness” first.',
        'Menerbitkan tanpa harga/foto terlihat rusak. Cek “Kesiapan”.',
      ],
      LANG_MISTAKE,
    ],
  },
  {
    id: 'places',
    match: /^\/places/,
    href: '/places',
    title: ['الأماكن (الخريطة)', 'Places (map)', 'Tempat (peta)'],
    purpose: [
      'أماكن الخريطة التفاعلية: مطاعم، معالم، مستشفيات، مساجد…',
      'Places on the interactive map: restaurants, sights, hospitals, mosques…',
      'Tempat di peta interaktif: restoran, objek wisata, RS, masjid…',
    ],
    steps: [
      [
        'إضافة: «مكان جديد» ← الاسم ← حدّد الموقع على الخريطة ← التصنيف.',
        'Add: “New place” → name → set the pin on the map → category.',
        'Tambah: “Tempat baru” → nama → tandai di peta → kategori.',
      ],
      IMG_STEP,
      [
        '«مجاني» يجعل المكان ظاهراً لكل الزوار؛ غير ذلك يظهر للمشتركين فقط.',
        '“Free” shows the place to everyone; otherwise subscribers only.',
        '“Gratis” tampil untuk semua; selain itu hanya pelanggan.',
      ],
      SAVE_STEP,
      ARCHIVE_STEP,
    ],
    fields: [
      NAME_FIELD,
      STATUS_FIELD,
      HERO_FIELD,
      {
        name: ['الإحداثيات', 'Coordinates', 'Koordinat'],
        where: [
          'مكان الدبوس على الخريطة.',
          'Where the pin sits on the map.',
          'Posisi pin di peta.',
        ],
      },
    ],
    mistakes: [
      [
        'نسيان التصنيف: لا يظهر المكان عند تصفية الخريطة.',
        'No category: the place is missing from map filters.',
        'Tanpa kategori: tidak muncul di filter peta.',
      ],
    ],
  },
  {
    id: 'packages',
    match: /^\/packages/,
    href: '/packages',
    title: ['الباقات', 'Packages', 'Paket'],
    purpose: [
      'باقات تجمع عدة فعاليات بأيام وسعر واحد.',
      'Bundles of several activities over days at one price.',
      'Paket beberapa aktivitas dalam beberapa hari, satu harga.',
    ],
    steps: [
      [
        '«باقة جديدة» ← الاسم والسعر ← «حفظ».',
        '“New package” → name and price → “Save”.',
        '“Paket baru” → nama, harga → “Simpan”.',
      ],
      [
        'أضف الفعاليات وحدّد يوم كل منها، ورتّبها بالسحب.',
        'Add the activities, set the day of each, drag to order.',
        'Tambah aktivitas, atur harinya, seret untuk mengurutkan.',
      ],
      IMG_STEP,
      ARCHIVE_STEP,
    ],
    fields: [NAME_FIELD, STATUS_FIELD, HERO_FIELD],
    mistakes: [LANG_MISTAKE],
  },
  {
    id: 'articles',
    match: /^\/articles/,
    href: '/articles',
    title: ['المقالات (المدونة)', 'Articles (blog)', 'Artikel (blog)'],
    purpose: [
      'مقالات المدونة ونصائح السفر.',
      'Blog posts and travel tips.',
      'Artikel blog dan tips.',
    ],
    steps: [
      [
        '«مقال جديد» ← العنوان والنص.',
        '“New article” → title and body.',
        '“Artikel baru” → judul dan isi.',
      ],
      IMG_STEP,
      [
        'غيّر الحالة إلى «منشور» ليظهر في الصفحة الرئيسية والمدونة.',
        'Set status to “Published” to show it on the home page and blog.',
        'Ubah status ke “Terbit” agar tampil di beranda dan blog.',
      ],
      ARCHIVE_STEP,
    ],
    fields: [NAME_FIELD, STATUS_FIELD, HERO_FIELD],
    mistakes: [LANG_MISTAKE],
  },
  {
    id: 'landmarks',
    match: /^\/landmarks/,
    href: '/landmarks',
    title: ['المعالم', 'Landmarks', 'Landmark'],
    purpose: [
      'المعالم السياحية وصفحاتها.',
      'Tourist landmarks and their pages.',
      'Landmark wisata dan halamannya.',
    ],
    steps: [
      [
        '«معلم جديد» ← الاسم والمنطقة.',
        '“New landmark” → name and region.',
        '“Landmark baru” → nama dan wilayah.',
      ],
      IMG_STEP,
      SAVE_STEP,
      ARCHIVE_STEP,
    ],
    fields: [NAME_FIELD, STATUS_FIELD, HERO_FIELD],
    mistakes: [LANG_MISTAKE],
  },
  {
    id: 'reviews',
    match: /^\/reviews/,
    href: '/reviews',
    title: ['التقييمات', 'Reviews', 'Ulasan'],
    purpose: [
      'آراء العملاء التي تظهر في الصفحة الرئيسية وصفحات الفعاليات.',
      'Customer reviews shown on the home page and activity pages.',
      'Ulasan pelanggan di beranda dan halaman aktivitas.',
    ],
    steps: [
      [
        '«تقييم جديد» ← اسم العميل والنص والنجوم.',
        '“New review” → name, text, stars.',
        '“Ulasan baru” → nama, teks, bintang.',
      ],
      [
        'زر «نشر/إخفاء» يتحكم بظهوره.',
        'The “Publish/Hide” button controls whether it shows.',
        'Tombol “Terbitkan/Sembunyikan” mengatur tampilannya.',
      ],
      ARCHIVE_STEP,
    ],
    fields: [],
    mistakes: [
      [
        'كتابة تقييمات غير حقيقية: ممنوع، أضف آراء عملاء حقيقيين فقط.',
        'Never invent reviews: add real customer reviews only.',
        'Jangan mengarang ulasan: hanya ulasan asli.',
      ],
    ],
  },
  {
    id: 'taxonomy',
    match: /^\/taxonomy/,
    href: '/taxonomy',
    title: ['التصنيفات والمناطق', 'Categories & regions', 'Kategori & wilayah'],
    purpose: [
      'تصنيفات الفعاليات والأماكن، والمناطق، والوسوم، وصورها.',
      'Categories of activities and places, regions, tags and their photos.',
      'Kategori, wilayah, tag dan fotonya.',
    ],
    steps: [
      [
        'أضف أو عدّل من النموذج في كل جزء.',
        'Add or edit using the form in each part.',
        'Tambah/ubah lewat formulir tiap bagian.',
      ],
      IMG_STEP,
      [
        'الحذف يُرفض إذا كان التصنيف مستخدماً؛ انقل العناصر أولاً.',
        'Delete is refused while a category is in use; move the items first.',
        'Hapus ditolak bila masih dipakai; pindahkan dulu.',
      ],
    ],
    fields: [],
    mistakes: [LANG_MISTAKE],
  },
  {
    id: 'archive',
    match: /^\/archive/,
    href: '/archive',
    title: ['المحذوفات', 'Archive bin', 'Arsip'],
    purpose: [
      'كل ما أرشفته (فعاليات، باقات، أماكن، مقالات، معالم، تقييمات، إضافات، موردون) مع زر استرجاع.',
      'Everything you archived (activities, packages, places, articles, landmarks, reviews, add-ons, suppliers) with a Restore button.',
      'Semua yang diarsipkan, dengan tombol Pulihkan.',
    ],
    steps: [
      [
        'اضغط «استرجاع». يعود السجل مخفياً (مسودة) لتراجعه ثم تنشره.',
        'Press “Restore”. It comes back hidden (draft) so you can check it, then publish.',
        'Tekan “Pulihkan”. Kembali sebagai draf; periksa lalu terbitkan.',
      ],
    ],
    fields: [],
    mistakes: [],
  },
  {
    id: 'addons',
    match: /^\/addons/,
    href: '/addons',
    title: ['الإضافات', 'Add-ons', 'Tambahan'],
    purpose: [
      'إضافات تُباع مع الفعاليات (تصوير، وجبة…).',
      'Extras sold with activities (photos, meal…).',
      'Tambahan yang dijual dengan aktivitas.',
    ],
    steps: [
      [
        '«إضافة جديدة» ← الاسم والسعر والصورة.',
        '“New add-on” → name, price, image.',
        '“Tambahan baru” → nama, harga, gambar.',
      ],
      IMG_STEP,
      ARCHIVE_STEP,
    ],
    fields: [],
    mistakes: [],
  },
  {
    id: 'discounts',
    match: /^\/discounts/,
    href: '/discounts',
    title: ['أكواد الخصم', 'Discount codes', 'Kode diskon'],
    purpose: [
      'إنشاء أكواد الخصم وإيقافها.',
      'Create and switch off discount codes.',
      'Buat dan matikan kode diskon.',
    ],
    steps: [
      [
        '«كود جديد» ← الكود والنسبة والمدة.',
        '“New code” → code, amount, dates.',
        '“Kode baru” → kode, nilai, tanggal.',
      ],
      [
        'الكود المستخدم في طلبات لا يُحذف — أوقفه بدلاً من ذلك.',
        'A code used on orders cannot be deleted — switch it off instead.',
        'Kode yang sudah dipakai tidak bisa dihapus — matikan saja.',
      ],
    ],
    fields: [],
    mistakes: [],
  },
  {
    id: 'vehicles',
    match: /^\/vehicles/,
    href: '/vehicles',
    title: ['السيارات والسائق', 'Vehicles & driver', 'Kendaraan & sopir'],
    purpose: [
      'أنواع السيارات وأسعار السائق.',
      'Vehicle types and driver pricing.',
      'Jenis kendaraan dan harga sopir.',
    ],
    steps: [SAVE_STEP],
    fields: [],
    mistakes: [],
  },
  {
    id: 'suppliers',
    match: /^\/suppliers/,
    href: '/suppliers',
    title: ['الموردون', 'Suppliers', 'Pemasok'],
    purpose: [
      'الموردون وعروض التكلفة.',
      'Suppliers and their cost offers.',
      'Pemasok dan penawaran biaya.',
    ],
    steps: [SAVE_STEP, ARCHIVE_STEP],
    fields: [],
    mistakes: [],
  },
  {
    id: 'orders',
    match: /^\/orders/,
    href: '/orders',
    title: ['الطلبات', 'Orders', 'Pesanan'],
    purpose: [
      'متابعة الحجوزات والدفع والاسترداد.',
      'Follow bookings, payment and refunds.',
      'Pantau pemesanan, pembayaran, refund.',
    ],
    steps: [
      [
        'افتح الطلب لرؤية تفاصيله وتأكيده.',
        'Open an order to see and confirm it.',
        'Buka pesanan untuk melihat dan mengonfirmasi.',
      ],
      [
        'الطلبات لا تُحذف أبداً حفاظاً على السجل المالي.',
        'Orders are never deleted, to keep the financial record.',
        'Pesanan tidak pernah dihapus demi catatan keuangan.',
      ],
    ],
    fields: [],
    mistakes: [],
  },
  {
    id: 'config',
    match: /^\/config/,
    href: '/config',
    title: ['الإعدادات', 'Settings', 'Pengaturan'],
    purpose: [
      'العملات والرسوم والتواصل والسياسات وإعدادات الخريطة.',
      'Currencies, fees, contact details, policies and map settings.',
      'Mata uang, biaya, kontak, kebijakan, peta.',
    ],
    steps: [SAVE_STEP],
    fields: [],
    mistakes: [
      [
        'رقم واتساب بمسافات أو +: اكتب الأرقام فقط.',
        'WhatsApp number with spaces or +: digits only.',
        'Nomor WhatsApp dengan spasi/+: angka saja.',
      ],
    ],
  },
  {
    id: 'itineraries',
    match: /^\/itineraries/,
    href: '/itineraries',
    title: ['البرامج السياحية', 'Itineraries', 'Itinerary'],
    purpose: [
      'سيُكتب هذا الدليل مع محرّر البرامج الجديد.',
      'This guide will be written with the new itinerary editor.',
      'Panduan ini akan ditulis bersama editor itinerary baru.',
    ],
    steps: [],
    fields: [],
    mistakes: [],
    placeholder: true,
  },
  {
    id: 'help',
    match: /^\/help/,
    href: '/help',
    title: ['دليل لوحة التحكم', 'Studio guide', 'Panduan Studio'],
    purpose: [
      'كل أدلة الشاشات في مكان واحد مع بحث.',
      'Every screen guide in one place, with search.',
      'Semua panduan layar di satu tempat, dengan pencarian.',
    ],
    steps: [
      [
        'في أي شاشة اضغط «؟ دليل هذه الشاشة» أسفل الصفحة.',
        'On any screen press “? Guide for this screen” at the bottom.',
        'Di layar mana pun tekan “? Panduan layar ini”.',
      ],
    ],
    fields: [],
    mistakes: [],
  },
  {
    id: 'dashboard',
    match: /^\/?$/,
    href: '',
    title: ['الرئيسية', 'Dashboard', 'Dasbor'],
    purpose: [
      'ملخص اليوم: الطلبات الجديدة والمهام والتنبيهات.',
      'Today at a glance: new orders, tasks and alerts.',
      'Ringkasan hari ini: pesanan, tugas, peringatan.',
    ],
    steps: [
      [
        'استخدم القائمة الجانبية للوصول لأي قسم، أو Ctrl+K للبحث السريع.',
        'Use the side menu for any section, or Ctrl+K to search.',
        'Pakai menu samping, atau Ctrl+K untuk mencari.',
      ],
    ],
    fields: [],
    mistakes: [],
  },
]

/** A generic guide for screens without their own entry yet. */
export const GENERIC_HELP: HelpEntry = {
  id: 'generic',
  match: /.*/,
  href: '/help',
  title: ['دليل عام', 'General guide', 'Panduan umum'],
  purpose: [
    'كل الشاشات تعمل بنفس الطريقة: قائمة ← فتح عنصر ← تعديل ← حفظ.',
    'Every screen works the same way: list → open an item → edit → save.',
    'Semua layar sama: daftar → buka → ubah → simpan.',
  ],
  steps: [IMG_STEP, SAVE_STEP, ARCHIVE_STEP],
  fields: [],
  mistakes: [LANG_MISTAKE],
}

export function helpFor(studioPath: string): HelpEntry {
  return HELP.find((entry) => entry.match.test(studioPath)) ?? GENERIC_HELP
}

/** Plain text of an entry (for search), in every language. */
export function helpText(entry: HelpEntry): string {
  return [
    ...entry.title,
    ...entry.purpose,
    ...entry.steps.flat(),
    ...entry.fields.flatMap((field) => [...field.name, ...field.where]),
    ...entry.mistakes.flat(),
  ]
    .join(' ')
    .toLowerCase()
}
