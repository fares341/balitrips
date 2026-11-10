/**
 * Studio help registry — «دليل هذه الشاشة» for every screen, in one file so
 * it is easy to keep up to date. Arabic first, then English, then Indonesian.
 *
 * Each entry matches a Studio path (relative to the admin base). The first
 * matching entry wins, so put specific paths before general ones. To update a
 * guide, edit its text here; nothing else needs to change.
 */

import {
  ITINERARY_HELP,
  ITINERARY_HELP_TABS,
  type ItineraryHelpTab,
} from '../studio/itineraries/_help'

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

/** One itinerary-editor guide topic as a single step: «title: step · step …». */
function itineraryTopic(tab: ItineraryHelpTab | 'delete'): L3 {
  const one = (locale: HelpLocale) => {
    const topic = ITINERARY_HELP[locale][tab]
    return `${topic.title}: ${topic.steps.join(' ')}`
  }
  return [one('ar'), one('en'), one('id')]
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

const SC_TEXT_STEP: L3 = [
  'الحقول تبدأ بالنص الظاهر الآن في الموقع. عدّل العربية ثم الإنجليزية ثم الإندونيسية. الحقل الذي تتركه كما هو أو تمسحه يبقى بالنص الأصلي.',
  'Fields start with the text the site shows now. Edit Arabic, then English, then Indonesian. A field left as it is (or cleared) keeps the original text.',
  'Kolom berisi teks yang tampil sekarang. Ubah Arab, Inggris, lalu Indonesia. Kolom yang tidak diubah (atau dikosongkan) tetap memakai teks asli.',
]
const SC_SHOW_STEP: L3 = [
  'لإخفاء قسم أزل علامة «إظهار هذا القسم» ثم احفظ.',
  'To hide a section, untick “Show this section”, then save.',
  'Untuk menyembunyikan bagian, hapus centang “Tampilkan bagian ini”, lalu simpan.',
]
const SC_PREVIEW_STEP: L3 = [
  'اضغط «حفظ» ثم «عرض الصفحة» لترى التغيير في الموقع (يظهر خلال ثوانٍ).',
  'Press “Save”, then “View the page” to see the change on the site (within seconds).',
  'Tekan “Simpan”, lalu “Lihat halaman” untuk melihat perubahan (dalam hitungan detik).',
]
const SC_BRACES_MISTAKE: L3 = [
  'لا تحذف أو تغيّر الكلمات بين الأقواس مثل {n} أو {name}: الموقع يضع مكانها رقماً أو اسماً.',
  'Do not delete or change words in braces like {n} or {name}: the site fills them with a number or a name.',
  'Jangan hapus atau ubah kata dalam kurung seperti {n} atau {name}: situs mengisinya dengan angka atau nama.',
]

/** One guide per «محتوى الموقع» screen (pages with their own parts first). */
const SITE_CONTENT_HELP: readonly HelpEntry[] = [
  {
    id: 'site-content-contact',
    match: /^\/site-content\/contact/,
    href: '/site-content/contact',
    title: ['اتصل بنا', 'Contact us', 'Hubungi kami'],
    purpose: [
      'رقم واتساب والبريد والمكاتب ونصوص صفحة اتصل بنا. الرقم والبريد يُستخدمان في كل الموقع (الفوتر وزر واتساب والسياسات).',
      'The WhatsApp number, email, offices and texts of the contact page. The number and email are used across the site (footer, WhatsApp button, policies).',
      'Nomor WhatsApp, email, kantor, dan teks halaman kontak. Nomor dan email dipakai di seluruh situs.',
    ],
    steps: [
      [
        'رقم واتساب بالأرقام فقط مع رمز الدولة (مثل 9665…)، ثم الرقم كما تريد أن يظهر.',
        'WhatsApp number in digits with the country code (e.g. 9665…), then the number as you want it shown.',
        'Nomor WhatsApp berupa angka dengan kode negara (mis. 9665…), lalu nomor seperti yang ingin ditampilkan.',
      ],
      [
        'المكاتب: سطر لكل مكتب، ويمكن ترتيبها بالسحب.',
        'Offices: one line per office; drag to reorder.',
        'Kantor: satu baris per kantor; seret untuk mengurutkan.',
      ],
      SC_TEXT_STEP,
      SC_PREVIEW_STEP,
    ],
    fields: [
      {
        name: ['رقم واتساب', 'WhatsApp number', 'Nomor WhatsApp'],
        where: [
          'زر واتساب العائم، الفوتر، صفحة اتصل بنا، السياسات.',
          'Floating WhatsApp button, footer, contact page, policies.',
          'Tombol WhatsApp, footer, halaman kontak, kebijakan.',
        ],
      },
    ],
    mistakes: [
      [
        'لا تكتب + أو مسافات في «رقم واتساب»؛ اكتبها في «الرقم كما يظهر».',
        'No + or spaces in “WhatsApp number”; put them in “Number as shown”.',
        'Tanpa + atau spasi di “Nomor WhatsApp”; tulis di “Nomor yang ditampilkan”.',
      ],
    ],
  },
  {
    id: 'site-content-faq',
    match: /^\/site-content\/faq/,
    href: '/site-content/faq',
    title: ['الأسئلة الشائعة', 'FAQ', 'FAQ'],
    purpose: [
      'أسئلة صفحة الأسئلة الشائعة: أضف سؤالاً، عدّل، احذف، رتّب بالسحب، أو أخفِ سؤالاً دون حذفه.',
      'The questions of the FAQ page: add, edit, delete, drag to reorder, or hide one without deleting it.',
      'Pertanyaan halaman FAQ: tambah, ubah, hapus, seret untuk mengurutkan, atau sembunyikan.',
    ],
    steps: [
      [
        '«+ إضافة سؤال» ← اكتب السؤال والجواب بالعربية ثم الإنجليزية ثم الإندونيسية ← اختر المجموعة.',
        '“+ Add a question” → write the question and answer in Arabic, English, Indonesian → pick the group.',
        '“+ Tambah pertanyaan” → tulis pertanyaan dan jawaban → pilih grup.',
      ],
      [
        'للعودة للأسئلة الأصلية ضع علامة «الرجوع للأسئلة الأصلية» ثم احفظ.',
        'To go back to the original questions, tick “Go back to the original questions” and save.',
        'Untuk kembali ke pertanyaan asli, centang “Kembali ke pertanyaan asli” lalu simpan.',
      ],
      SC_PREVIEW_STEP,
    ],
    fields: [],
    mistakes: [LANG_MISTAKE],
  },
  {
    id: 'site-content-header',
    match: /^\/site-content\/header/,
    href: '/site-content/header',
    title: ['الهيدر', 'Header', 'Header'],
    purpose: [
      'روابط القائمة أعلى كل صفحة (وفي قائمة الجوال) وزر «ابدأ التخطيط».',
      'The menu links at the top of every page (and in the phone menu) and the “Start planning” button.',
      'Tautan menu di atas setiap halaman (dan menu ponsel) serta tombol “Mulai merencanakan”.',
    ],
    steps: [
      [
        'كل رابط: العنوان (مثل /activities) والاسم بثلاث لغات. اسحب لإعادة الترتيب، × للحذف.',
        'Each link: the address (like /activities) and its label in three languages. Drag to reorder, × to remove.',
        'Setiap tautan: alamat (mis. /activities) dan label tiga bahasa. Seret untuk mengurutkan, × untuk menghapus.',
      ],
      SC_TEXT_STEP,
      SC_PREVIEW_STEP,
    ],
    fields: [],
    mistakes: [
      [
        'الروابط الخارجية يجب أن تبدأ بـ https://',
        'External links must start with https://',
        'Tautan luar harus diawali https://',
      ],
    ],
  },
  {
    id: 'site-content-footer',
    match: /^\/site-content\/footer/,
    href: '/site-content/footer',
    title: ['الفوتر', 'Footer', 'Footer'],
    purpose: [
      'أعمدة وروابط أسفل الموقع، وحسابات التواصل الاجتماعي، والنبذة وسطر الحقوق.',
      'The footer columns and links, social accounts, the about text and the legal line.',
      'Kolom dan tautan footer, akun sosial, teks tentang, dan baris hak cipta.',
    ],
    steps: [
      [
        'رتّب أو عدّل روابط «روابط سريعة» و«العمود العام»، أو أخفِ عموداً كاملاً.',
        'Reorder or edit the “Quick links” and “General” links, or hide a whole column.',
        'Urutkan atau ubah tautan, atau sembunyikan satu kolom.',
      ],
      [
        'حسابات التواصل: ألصق الرابط الكامل؛ الحساب الفارغ لا يظهر.',
        'Social accounts: paste the full link; empty ones are not shown.',
        'Akun sosial: tempel tautan lengkap; yang kosong tidak tampil.',
      ],
      SC_SHOW_STEP,
      SC_PREVIEW_STEP,
    ],
    fields: [],
    mistakes: [SC_BRACES_MISTAKE],
  },
  {
    id: 'site-content-videos',
    match: /^\/site-content\/videos/,
    href: '/site-content/videos',
    title: ['فيديوهات الواجهة', 'Hero videos', 'Video hero'],
    purpose: [
      'استبدال الفيديوهات الثلاثة أعلى الصفحة الرئيسية وصور الغلاف.',
      'Replace the three videos at the top of the home page and their posters.',
      'Ganti tiga video di atas beranda dan gambar sampulnya.',
    ],
    steps: [
      [
        'اختر ملف MP4 (أو WebM) حتى 24 ميغابايت ← «رفع الفيديو». يظهر في الموقع فوراً.',
        'Choose an MP4 (or WebM) file up to 24 MB → “Upload video”. It shows on the site straight away.',
        'Pilih file MP4 (atau WebM) maks 24 MB → “Unggah video”.',
      ],
      [
        '«إرجاع الفيديو الأصلي» يعيد الفيديو المدمج.',
        '“Back to the original video” restores the built-in clip.',
        '“Kembalikan video asli” memulihkan video bawaan.',
      ],
      IMG_STEP,
    ],
    fields: [],
    mistakes: [
      [
        'استخدم فيديو طولياً قصيراً بلا صوت تملك حقوقه؛ الفيديو الطويل يبطئ الصفحة.',
        'Use a short, silent portrait clip you own the rights to; long videos slow the page down.',
        'Gunakan klip potret pendek tanpa suara yang Anda miliki haknya.',
      ],
    ],
  },
  ...(
    [
      ['about', 'من نحن', 'About us', 'Tentang kami'],
      ['services', 'الخدمات', 'Services', 'Layanan'],
      ['custom', 'صمّم رحلتك', 'Design your trip', 'Rancang perjalanan'],
      ['help', 'مركز المساعدة', 'Help centre', 'Pusat bantuan'],
      [
        'platform-use',
        'سياسة استخدام المنصة',
        'Platform use policy',
        'Kebijakan penggunaan platform',
      ],
      ['map-use', 'سياسة استخدام الخريطة', 'Map use policy', 'Kebijakan penggunaan peta'],
      ['payment-methods', 'طرق الدفع', 'Payment methods', 'Metode pembayaran'],
      ['credits', 'حقوق الصور', 'Image credits', 'Kredit gambar'],
    ] as const
  ).map(([id, ar, en, idn]): HelpEntry => ({
    id: `site-content-${id}`,
    match: new RegExp(`^/site-content/${id}`),
    href: `/site-content/${id}`,
    title: [ar, en, idn],
    purpose: [
      `نصوص وصور وأقسام صفحة «${ar}» في الموقع.`,
      `The texts, photos and sections of the “${en}” page.`,
      `Teks, foto, dan bagian halaman “${idn}”.`,
    ],
    steps: [SC_TEXT_STEP, IMG_STEP, SC_SHOW_STEP, SC_PREVIEW_STEP],
    fields: [],
    mistakes: [SC_BRACES_MISTAKE, LANG_MISTAKE],
  })),
  {
    id: 'site-content',
    match: /^\/site-content/,
    href: '/site-content',
    title: ['صفحات الموقع', 'Site pages', 'Halaman situs'],
    purpose: [
      'كل صفحات الموقع في مكان واحد: اختر صفحة لتعديل نصوصها وصورها وأقسامها.',
      'Every page of the site in one place: pick a page to edit its texts, photos and sections.',
      'Semua halaman situs: pilih halaman untuk mengubah teks, foto, dan bagiannya.',
    ],
    steps: [
      [
        'اضغط على بطاقة الصفحة لفتح شاشتها.',
        'Press a page card to open its screen.',
        'Tekan kartu halaman untuk membukanya.',
      ],
      [
        'أي نص آخر غير موجود هنا تجده في «الترجمات» بالبحث.',
        'Any other text not here is in “Translations”, with search.',
        'Teks lain ada di “Terjemahan”, dengan pencarian.',
      ],
    ],
    fields: [],
    mistakes: [],
  },
  {
    id: 'translations',
    match: /^\/translations/,
    href: '/translations',
    title: ['نصوص الموقع', 'Website texts', 'Teks situs'],
    purpose: [
      'كل نصوص الموقع بثلاث لغات. أي تعديل هنا يظهر مباشرة في الموقع.',
      'Every text of the site in three languages. A change here shows on the site straight away.',
      'Semua teks situs dalam tiga bahasa. Perubahan langsung tampil di situs.',
    ],
    steps: [
      [
        'ابحث بكلمة من النص (بأي لغة) أو بالمفتاح، أو اختر «المعدّلة فقط».',
        'Search a word of the text (any language) or the key, or pick “Edited only”.',
        'Cari kata dari teks (bahasa apa pun) atau kuncinya, atau pilih “Yang diubah saja”.',
      ],
      [
        'عدّل النص ثم «حفظ». «عرض الفرق» يبيّن ما تغيّر عن الأصل، و«إرجاع للنص الأصلي» يلغي التعديل.',
        'Edit the text, then “Save”. “Show the difference” shows what changed; “Back to the original text” undoes it.',
        'Ubah teks lalu “Simpan”. “Tampilkan perbedaan” menunjukkan perubahan; “Kembali ke teks asli” membatalkannya.',
      ],
    ],
    fields: [],
    mistakes: [SC_BRACES_MISTAKE],
  },
]

export const HELP: readonly HelpEntry[] = [
  ...SITE_CONTENT_HELP,
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
    title: ['الأنشطة', 'Activities', 'Aktivitas'],
    purpose: [
      'إضافة الأنشطة والجولات وتعديل أسعارها وصورها وباقاتها.',
      'Add tours and activities, and edit their prices, photos and options.',
      'Tambah tur/aktivitas, ubah harga, foto, dan opsi.',
    ],
    steps: [
      [
        'إضافة: «نشاط جديد» ← اكتب الاسم والمنطقة ← «حفظ».',
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
        'الترتيب: اسحب الأنشطة في القائمة أو استخدم أسهم الترتيب.',
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
          'الصور المتحركة في صفحة النشاط، بالترتيب الذي تختاره.',
          'The photo slider on the activity page, in your order.',
          'Slider foto di halaman aktivitas sesuai urutan Anda.',
        ],
      },
    ],
    mistakes: [
      [
        'نشر نشاط بلا سعر أو بلا صورة: يظهر ناقصاً. راجع «الجاهزية» قبل النشر.',
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
    title: ['أماكن الخريطة', 'Map places', 'Tempat di peta'],
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
      [
        'أقسام المطاعم (عربية، برجر…): ضع علامة على كل ما ينطبق بعد حفظ التصنيف؛ تظهر صفاً ثانياً في الخريطة.',
        'Restaurant sections (Arabic, Burgers…): tick all that apply once the category is saved; they show as a second row on the map.',
        'Bagian restoran (Arab, Burger…): centang semua yang sesuai setelah kategori disimpan; tampil sebagai baris kedua di peta.',
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
      'باقات تجمع عدة أنشطة بأيام وسعر واحد.',
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
        'أضف الأنشطة وحدّد يوم كل منها، ورتّبها بالسحب.',
        'Add the activities, set the day of each, drag to order.',
        'Tambah aktivitas, atur harinya, seret untuk mengurutkan.',
      ],
      [
        'ترتيب الباقات في الموقع: في القائمة افتح «ترتيب العرض» واسحب الباقات؛ يُحفظ تلقائياً.',
        'Order on the site: in the list open “Order on the site” and drag the packages; it saves by itself.',
        'Urutan di situs: di daftar buka “Urutan di situs” dan seret paketnya; tersimpan otomatis.',
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
    title: ['المقالات', 'Articles', 'Artikel'],
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
      'آراء العملاء التي تظهر في الصفحة الرئيسية وصفحات الأنشطة.',
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
      'تصنيفات الأنشطة والأماكن، والمناطق، والوسوم، وصورها.',
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
      [
        'الأقسام: «قسم من» يجعل التصنيف قسماً من تصنيف رئيسي (مثل عربية تحت المطاعم). مستوى واحد فقط.',
        'Sections: “Section of” makes a category a section of a main one (e.g. Arabic under Restaurants). One level only.',
        'Bagian: “Bagian dari” menjadikan kategori bagian dari kategori utama (mis. Arab di bawah Restoran). Satu tingkat saja.',
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
    title: ['الخدمات الإضافية', 'Extras', 'Tambahan'],
    purpose: [
      'إضافات تُباع مع الأنشطة (تصوير، وجبة…).',
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
    title: ['الخصومات والقسائم', 'Discounts & coupons', 'Diskon & kupon'],
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
    title: ['الجداول السياحية', 'Itineraries', 'Itinerary'],
    purpose: [
      'الجداول السياحية الجاهزة: الصفحة العامة قبل الشراء، والأيام والأماكن الخاصة بالمشتري، والأسعار وملف PDF.',
      'Ready-made itineraries: the public page before purchase, the buyer-only days and places, pricing and the PDF.',
      'Itinerary siap pakai: halaman publik sebelum membeli, hari dan tempat khusus pembeli, harga dan PDF.',
    ],
    // One step per editor tab, from the editor's own «؟ دليل» (studio/itineraries/_help.ts).
    steps: ITINERARY_HELP_TABS.map((tab) => itineraryTopic(tab)),
    fields: [],
    mistakes: [itineraryTopic('delete')],
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
    title: ['الرئيسية', 'Home', 'Beranda'],
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
