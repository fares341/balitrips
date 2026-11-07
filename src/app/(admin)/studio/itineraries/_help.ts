/**
 * «؟ دليل» — the itinerary editor guide, one topic per tab (owner, Nov 2026:
 * «دليل لكل شيء»). Pure data in the shared-registry shape
 * `{ id, title, steps[] }` per locale, so it can move into
 * `src/app/(admin)/_help/` once that registry is on main.
 */

export type HelpLocale = 'ar' | 'en' | 'id'

export interface HelpTopic {
  id: string
  title: string
  steps: string[]
}

export const ITINERARY_HELP_TABS = [
  'basics',
  'content',
  'faq',
  'days',
  'pricing',
  'pdf',
  'preview',
] as const
export type ItineraryHelpTab = (typeof ITINERARY_HELP_TABS)[number]

type Guide = Record<HelpLocale, Record<ItineraryHelpTab | 'delete', HelpTopic>>

export const ITINERARY_HELP: Guide = {
  ar: {
    basics: {
      id: 'itinerary.basics',
      title: 'إنشاء جدول وتعبئة الأساسيات',
      steps: [
        'من قائمة الجداول اضغط «جدول سياحي جديد».',
        'اكتب الاسم بالعربية (والإنجليزية والإندونيسية إن أمكن) والرابط المختصر بحروف إنجليزية صغيرة وشرطات، مثل family-4-days.',
        'الوصف القصير يظهر تحت العنوان في أعلى الصفحة العامة وعلى بطاقة الجدول.',
        'اختر صورة الغلاف من مكتبة الصور (ارفع صورًا جديدة من «مكتبة الوسائط»).',
        'الفئة المستهدفة: سطر لكل فئة (شباب، عوائل، عرسان) — تظهر كشارات وفي قسم «مناسب لمن؟».',
        'اضغط «حفظ». بعد أول حفظ تُفتح بقية التبويبات.',
        'عدد الأيام يُحسب تلقائيًا من تبويب «الأيام».',
        'الحالة: «مسودة» للفريق فقط، «نشر» يظهره للعملاء (يتطلب ملف PDF عربي)، و«إخفاء» يزيله من الموقع مع بقاء وصول المشترين.',
      ],
    },
    content: {
      id: 'itinerary.content',
      title: 'محتوى الصفحة العامة',
      steps: [
        'اختر اللغة من مبدّل اللغات أعلى التبويب، ثم اكتب نصوص تلك اللغة.',
        'الحقل الفارغ يعرض نص الموقع الافتراضي (الظاهر بالرمادي داخل الحقل)، فلا يتغير شيء حتى تكتب.',
        '«أقسام الصفحة»: أظهر أو أخفِ كل قسم وغيّر ترتيبه بالأسهم.',
        '«ماذا ستحصل عليه»: اضغط «تخصيص هذه القائمة» ثم عدّل البنود، أضف أو احذف، رتّبها، واختر أيقونة لكل بند.',
        '«كيف تعمل؟»: نفس الطريقة للخطوات.',
        'بطاقة «خصّص جدولك»، عنوان صندوق الشراء، شارات الثقة: نصوص تظهر بجانب السعر وأسفل الصفحة.',
        'صور «أيامك» و«طابع اليوم» في بطاقة الأيام بالأسفل؛ هي فقط ما يظهر عن الأيام قبل الشراء.',
        'الأرقام المميزة والصور ووصف SEO في بطاقة «معاينة الصفحة».',
        'اضغط «حفظ» في كل بطاقة. ستظهر رسالة نجاح أعلى الصفحة.',
      ],
    },
    faq: {
      id: 'itinerary.faq',
      title: 'الأسئلة الشائعة',
      steps: [
        'أضف سؤالًا وجوابًا لكل لغة.',
        'اسحب السؤال لتغيير ترتيبه.',
        'السؤال المخفي يبقى في الاستوديو ولا يظهر في الموقع.',
        'إن لم تضف أي سؤال تظهر أسئلة الموقع العامة.',
        'لا تكتب أسماء الأماكن أو تفاصيل الأيام هنا: الصفحة عامة قبل الشراء.',
      ],
    },
    days: {
      id: 'itinerary.days',
      title: 'الأيام (محتوى خاص بالمشتري)',
      steps: [
        'أضف يومًا لكل يوم من الرحلة، واكتب عنوانه ووصفه.',
        'اربط فعالية من الكتالوج أو اجعله «يوم حر».',
        'أضف أماكن اليوم من الخريطة بالترتيب، مع ملاحظة ووقت مقترح.',
        'كل هذا خاص: لا يظهر في الصفحة العامة أبدًا، ويصل للمشتري في ملف PDF وحسابه.',
        'فعّل «قابل للحجز» لتظهر فعالية اليوم في «فعاليات جدولي» بعد الشراء.',
      ],
    },
    pricing: {
      id: 'itinerary.pricing',
      title: 'خيارات الأسعار',
      steps: [
        '«السعر»: سعر الجدول وحده (الجدول فقط).',
        'المستويات (اقتصادي، متوسط، فاخر): اترك السعر فارغًا لإخفاء المستوى.',
        'الخريطة: اختر هل الجدول مجاني فقط، أو يشمل VIP، أو يعرض VIP كإضافة. خيار «الجدول + الخريطة» يُسعَّر من إعدادات الأسعار العامة.',
        '«خصم كل الفعاليات»: النسبة التي يحصل عليها المشتري عند حجز كل فعاليات جدوله.',
        'الباقات: اربط الجدول بباقات وحدد طريقة التسعير.',
        'صفحة الدفع تعيد حساب السعر على الخادم دائمًا.',
      ],
    },
    pdf: {
      id: 'itinerary.pdf',
      title: 'رفع ملف PDF وماذا يستلم المشتري',
      steps: [
        'اختر لغة الملف، ثم اسحب ملف PDF إلى المربع أو اضغط لاختياره (الحد الأقصى ظاهر تحت المربع).',
        'يظهر شريط التقدم أثناء الرفع، ثم رسالة نجاح برقم الإصدار.',
        'الملف المرفوع هو ما يصل للمشتري فور الدفع: بريد، واتساب، وحسابه — مختومًا باسمه ورقم طلبه.',
        'إن لم ترفع ملفًا للغة ما يُرسل الملف المولّد تلقائيًا من الأيام. جدول «ما يُرسل الآن» يوضح ذلك لكل لغة.',
        'رفع ملف جديد يحفظ القديم في السجل؛ تستطيع استعادته.',
        'فعّل «إبلاغ المشترين» لإرسال إشعار للمشترين الحاليين بالنسخة الجديدة.',
        'النشر يتطلب ملفًا عربيًا (مرفوعًا أو مولّدًا).',
      ],
    },
    preview: {
      id: 'itinerary.preview',
      title: 'المعاينة',
      steps: [
        'افتح «الصفحة العامة» بكل لغة لترى ما يراه العميل.',
        'المسودة والمخفي لا يظهران للعامة؛ انشر أولًا.',
        'افتح «صفحة المشتري» لترى ما يراه المشتري بعد الشراء (وضع معاينة بدون حجز).',
      ],
    },
    delete: {
      id: 'itinerary.delete',
      title: 'الحذف أم الإخفاء؟',
      steps: [
        'الحذف متاح فقط لجدول بلا مشترين.',
        'إن كان للجدول مشترون، استخدم «إخفاء من الموقع»: يختفي من الموقع والقائمة العامة، ويحتفظ كل مشترٍ بملفه وصفحاته.',
        'تستطيع إظهار الجدول المخفي مجددًا في أي وقت.',
        '«نسخ» ينشئ مسودة جديدة بنفس المحتوى والأيام (بدون ملفات PDF).',
      ],
    },
  },
  en: {
    basics: {
      id: 'itinerary.basics',
      title: 'Create an itinerary and fill the basics',
      steps: [
        'In the itineraries list press «New itinerary».',
        'Type the name (Arabic, English, Indonesian) and a slug in lowercase letters and dashes, e.g. family-4-days.',
        'The short description shows under the title at the top of the public page and on the card.',
        'Choose the cover image from the media library.',
        'Audience: one line per group — shown as chips and in «Who it suits».',
        'Press «Save». The other tabs open after the first save.',
        'The number of days is counted from the «Days» tab.',
        'Status: Draft is team-only, Publish puts it on sale (needs an Arabic PDF), Hide removes it from the site while buyers keep access.',
      ],
    },
    content: {
      id: 'itinerary.content',
      title: 'Public page content',
      steps: [
        'Pick the language in the switcher, then write that language.',
        'A blank field shows the site default (in grey), so nothing changes until you type.',
        '«Sections of the page»: show/hide and reorder each section.',
        '«What you get»: press «Customise this list», then edit, add, remove, reorder and pick an icon.',
        '«How it works»: the same for the steps.',
        'Customise card, buy box heading and trust badges are texts next to the price and at the bottom.',
        'Day images and «day mood» are in the days card below — the only day details shown before purchase.',
        'Stats, photos and SEO are in the «page preview» card.',
        'Press «Save» on each card; a success message appears at the top.',
      ],
    },
    faq: {
      id: 'itinerary.faq',
      title: 'FAQ',
      steps: [
        'Add a question and answer per language.',
        'Drag to reorder.',
        'A hidden question stays in the Studio only.',
        'No questions = the general site questions.',
        'Never write place names or day details: the page is public.',
      ],
    },
    days: {
      id: 'itinerary.days',
      title: 'Days (buyer-only content)',
      steps: [
        'Add one day per trip day with its title and description.',
        'Link a catalog activity or mark it a free day.',
        'Add the day’s map places in order, with a note and time.',
        'All of it is private: never on the public page; buyers get it in the PDF and their account.',
        'Tick «bookable» to offer the day’s activity in «My itinerary activities».',
      ],
    },
    pricing: {
      id: 'itinerary.pricing',
      title: 'Pricing options',
      steps: [
        '«Price» is the itinerary-only price.',
        'Levels (economy, mid, luxury): leave blank to hide a level.',
        'Map: free only, VIP included, or VIP as an add-on. «Itinerary + map» is priced from the global pricing settings.',
        '«All activities discount»: percent off when the buyer books every activity.',
        'Packages: link packages and choose the price rule.',
        'Checkout always recalculates prices on the server.',
      ],
    },
    pdf: {
      id: 'itinerary.pdf',
      title: 'Upload the PDF — what the buyer receives',
      steps: [
        'Choose the language, then drag the PDF into the box or tap to choose (size limit shown).',
        'A progress bar shows while uploading, then a success message with the version.',
        'This file reaches the buyer instantly after payment: e-mail, WhatsApp and their account — stamped with their name and order number.',
        'With no upload for a language the auto-generated PDF is sent. «Sent now» shows it per language.',
        'A new upload archives the old one; you can restore it.',
        'Tick «Tell existing buyers» to notify them of the new version.',
        'Publishing needs an Arabic PDF (uploaded or generated).',
      ],
    },
    preview: {
      id: 'itinerary.preview',
      title: 'Preview',
      steps: [
        'Open the public page in each language.',
        'Drafts and hidden itineraries are not public; publish first.',
        'Open the buyer page to see it after purchase (preview mode, no booking).',
      ],
    },
    delete: {
      id: 'itinerary.delete',
      title: 'Delete or hide?',
      steps: [
        'Delete works only for an itinerary with no buyers.',
        'With buyers, use «Hide from the site»: it leaves the site, buyers keep their files and pages.',
        'You can show a hidden itinerary again at any time.',
        '«Duplicate» creates a new draft with the same content and days (no PDFs).',
      ],
    },
  },
  id: {
    basics: {
      id: 'itinerary.basics',
      title: 'Membuat itinerary dan mengisi dasar',
      steps: [
        'Di daftar itinerary tekan «Itinerary baru».',
        'Tulis nama (Arab, Inggris, Indonesia) dan slug huruf kecil dengan tanda hubung, mis. family-4-days.',
        'Deskripsi singkat tampil di bawah judul halaman publik dan di kartu.',
        'Pilih gambar sampul dari pustaka media.',
        'Audiens: satu baris per kelompok.',
        'Tekan «Simpan». Tab lain terbuka setelah simpan pertama.',
        'Jumlah hari dihitung dari tab «Hari».',
        'Status: Draf untuk tim, Terbitkan untuk dijual (perlu PDF Arab), Sembunyikan menghapus dari situs tetapi pembeli tetap punya akses.',
      ],
    },
    content: {
      id: 'itinerary.content',
      title: 'Konten halaman publik',
      steps: [
        'Pilih bahasa di pengalih bahasa, lalu tulis teks bahasa itu.',
        'Kolom kosong memakai teks bawaan situs (abu-abu).',
        '«Bagian halaman»: tampilkan/sembunyikan dan urutkan.',
        '«Yang Anda dapatkan»: tekan «Sesuaikan daftar», ubah, tambah, hapus, urutkan, pilih ikon.',
        '«Cara kerja»: sama untuk langkah-langkah.',
        'Kartu kustom, judul kotak beli dan lencana kepercayaan tampil di dekat harga.',
        'Gambar hari dan «suasana hari» ada di kartu hari di bawah.',
        'Tekan «Simpan» di setiap kartu.',
      ],
    },
    faq: {
      id: 'itinerary.faq',
      title: 'FAQ',
      steps: [
        'Tambahkan pertanyaan dan jawaban per bahasa.',
        'Seret untuk mengurutkan.',
        'Pertanyaan tersembunyi hanya di Studio.',
        'Tanpa pertanyaan = pertanyaan umum situs.',
      ],
    },
    days: {
      id: 'itinerary.days',
      title: 'Hari (khusus pembeli)',
      steps: [
        'Tambahkan satu hari per hari perjalanan.',
        'Tautkan aktivitas katalog atau tandai hari bebas.',
        'Tambahkan tempat peta secara berurutan.',
        'Semua ini privat: tidak pernah di halaman publik.',
      ],
    },
    pricing: {
      id: 'itinerary.pricing',
      title: 'Opsi harga',
      steps: [
        '«Harga» adalah harga itinerary saja.',
        'Level: kosongkan untuk menyembunyikan.',
        'Peta: gratis, VIP termasuk, atau VIP tambahan.',
        'Diskon semua aktivitas: persen saat semua aktivitas dipesan.',
      ],
    },
    pdf: {
      id: 'itinerary.pdf',
      title: 'Unggah PDF — yang diterima pembeli',
      steps: [
        'Pilih bahasa, seret PDF ke kotak atau ketuk untuk memilih.',
        'File ini dikirim langsung setelah bayar: e-mail, WhatsApp, dan akun pembeli.',
        'Tanpa unggahan, PDF otomatis yang dikirim.',
        'Unggahan baru mengarsipkan yang lama; bisa dipulihkan.',
      ],
    },
    preview: {
      id: 'itinerary.preview',
      title: 'Pratinjau',
      steps: [
        'Buka halaman publik di setiap bahasa.',
        'Draf dan tersembunyi tidak publik.',
        'Buka halaman pembeli dalam mode pratinjau.',
      ],
    },
    delete: {
      id: 'itinerary.delete',
      title: 'Hapus atau sembunyikan?',
      steps: [
        'Hapus hanya untuk itinerary tanpa pembeli.',
        'Dengan pembeli, gunakan «Sembunyikan»: pembeli tetap punya akses.',
        '«Duplikat» membuat draf baru (tanpa PDF).',
      ],
    },
  },
}
