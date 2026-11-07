import type { Messages, Section } from './types'

/**
 * Studio strings — full-control pass (Nov 2026): bulk media upload and the
 * <MediaPicker>, home page content, archive bin, screen guides, quick tour,
 * unsaved-changes guard. Written as [en, ar] pairs.
 */
const PAIRS: Record<string, readonly [en: string, ar: string]> = {
  'nav.help': ['Studio guide', 'دليل لوحة التحكم'],
  'nav.home_content': ['Home page', 'الصفحة الرئيسية'],
  'nav.archive': ['Archive bin', 'المحذوفات'],

  // Media upload + picker
  'mc.bulk_heading': ['Upload images', 'رفع الصور'],
  'mc.bulk_hint': [
    'Upload many images at once. Each one is named from its file name (you can rename it any time), and big photos are made smaller on your device before upload.',
    'ارفع صوراً كثيرة دفعة واحدة. كل صورة تأخذ اسمها من اسم الملف (ويمكنك تغييره في أي وقت)، والصور الكبيرة تُصغَّر على جهازك قبل الرفع.',
  ],
  'mc.drop_title': ['Drag your images here', 'اسحب صورك إلى هنا'],
  'mc.drop_hint': [
    'or choose several files. JPG, PNG or WebP, up to {max} MB each.',
    'أو اختر عدة ملفات. JPG أو PNG أو WebP، حتى {max} ميغابايت للصورة.',
  ],
  'mc.choose_files': ['Choose files', 'اختيار ملفات'],
  'mc.name': ['Image name', 'اسم الصورة'],
  'mc.name_hint': [
    'Used to find and pick the image in Studio. Not shown to visitors.',
    'تبحث به وتختار الصورة داخل اللوحة. لا يظهر للزوار.',
  ],
  'mc.state_queued': ['Ready', 'جاهزة للرفع'],
  'mc.state_resizing': ['Making it smaller…', 'جارٍ تصغيرها…'],
  'mc.state_uploading': ['Uploading…', 'جارٍ الرفع…'],
  'mc.state_done': ['Uploaded', 'تم الرفع'],
  'mc.state_error': ['Failed', 'فشل'],
  'mc.remove': ['Remove', 'إزالة'],
  'mc.upload_n': ['Upload {n} images', 'رفع {n} صور'],
  'mc.uploading_n': ['Uploading {done} of {total}…', 'جارٍ رفع {done} من {total}…'],
  'mc.clear': ['Clear the list', 'مسح القائمة'],
  'mc.err_type': [
    '“{name}” is not a JPG, PNG or WebP image.',
    'الملف «{name}» ليس صورة JPG أو PNG أو WebP.',
  ],
  'mc.err_too_big': [
    '“{name}” is {size} MB even after shrinking; the limit is {max} MB.',
    'حجم «{name}» ‏{size} ميغابايت حتى بعد التصغير، والحد {max} ميغابايت.',
  ],
  'mc.err_network': [
    'Connection lost while uploading. Try again.',
    'انقطع الاتصال أثناء الرفع. حاول مرة أخرى.',
  ],
  'mc.err_bad_request': ['The upload could not be read.', 'تعذّرت قراءة الملف المرفوع.'],
  'mc.err_name_required': ['Give the image a name.', 'اكتب اسماً للصورة.'],
  'mc.err_load': ['Could not load the images. Try again.', 'تعذّر تحميل الصور. حاول مرة أخرى.'],
  'mc.search_ph': ['Search by image name…', 'ابحث باسم الصورة…'],
  'mc.upload_new': ['Upload new images', 'رفع صور جديدة'],
  'mc.hide_upload': ['Hide upload', 'إخفاء الرفع'],
  'mc.recent': ['Recent uploads', 'آخر المرفوعات'],
  'mc.results': ['Search results', 'نتائج البحث'],
  'mc.no_results': ['No image with that name.', 'لا توجد صورة بهذا الاسم.'],
  'mc.close': ['Close', 'إغلاق'],
  'mc.clear_image': ['Remove image', 'إزالة الصورة'],
  'mc.add_images': ['Add images', 'إضافة صور'],
  'mc.done_n': ['Done ({n} selected)', 'تم ({n} مختارة)'],
  'mc.move_up': ['Move up', 'تحريك لأعلى'],
  'mc.move_down': ['Move down', 'تحريك لأسفل'],
  'mc.delete_used': [
    'This image is used in {count} places. Archive it anyway? (Images on published pages are refused until you replace them.)',
    'هذه الصورة مستخدمة في {count} أماكن. هل تريد أرشفتها؟ (الصور المستخدمة في صفحات منشورة لا تُؤرشف حتى تستبدلها.)',
  ],
  'mc.delete_unused': [
    'This image is not used anywhere. Archive it? You can restore it later from “Archive bin”.',
    'هذه الصورة غير مستخدمة في أي مكان. أرشفتها؟ يمكنك استرجاعها لاحقاً من «المحذوفات».',
  ],

  // Quick tour (media library)
  'tour.media_upload_t': ['1. Upload everything at once', '١. ارفع كل صورك مرة واحدة'],
  'tour.media_upload_d': [
    'Drag all your images onto the upload box, or choose many files. Each gets its own progress bar.',
    'اسحب كل صورك إلى مربع الرفع أو اختر ملفات كثيرة. لكل صورة شريط تقدّم.',
  ],
  'tour.media_name_t': ['2. Give clear names', '٢. أعطها أسماء واضحة'],
  'tour.media_name_d': [
    'The name comes from the file name. Rename it to something you will search for, like “Uluwatu sunset”.',
    'الاسم يأتي من اسم الملف. غيّره لاسم تبحث به لاحقاً مثل «غروب أولواتو».',
  ],
  'tour.media_pick_t': ['3. Pick by name anywhere', '٣. اختر بالاسم في أي مكان'],
  'tour.media_pick_d': [
    'In any image field press “Choose image”, type the name, and click the photo. You can also upload from there.',
    'في أي حقل صورة اضغط «اختيار صورة» واكتب الاسم واضغط الصورة. ويمكنك الرفع من هناك أيضاً.',
  ],
  'tour.media_delete_t': ['4. Safe delete', '٤. حذف آمن'],
  'tour.media_delete_d': [
    'Archive shows how many places use an image. Images on live pages are protected, and anything archived can be restored.',
    'الأرشفة تعرض عدد الأماكن التي تستخدم الصورة. صور الصفحات المنشورة محمية، وكل ما يُؤرشف يمكن استرجاعه.',
  ],
  'tour.next': ['Next', 'التالي'],
  'tour.skip': ['Skip', 'تخطي'],
  'tour.done': ['Got it', 'فهمت'],
  'tour.again': ['Show the quick tour again', 'إعادة الجولة السريعة'],

  // Home page content
  'hc.title': ['Home page', 'الصفحة الرئيسية'],
  'hc.description': [
    'Every text and photo on the home page, per section, in Arabic, English and Indonesian. Fields start with what the site shows today; an empty field brings back the original text.',
    'كل نصوص وصور الصفحة الرئيسية حسب القسم، بالعربية والإنجليزية والإندونيسية. الحقول تبدأ بما يظهر في الموقع الآن، والحقل الفارغ يعيد النص الأصلي.',
  ],
  'hc.view_site': ['View the home page', 'عرض الصفحة الرئيسية'],
  'hc.save': ['Save home page', 'حفظ الصفحة الرئيسية'],
  'hc.ok_saved': [
    'Home page saved. The site updates within a few seconds.',
    'تم حفظ الصفحة الرئيسية. يتحدّث الموقع خلال ثوانٍ.',
  ],
  'hc.show_section': ['Show this section', 'إظهار هذا القسم'],
  'hc.hidden_pill': ['Hidden', 'مخفي'],
  'hc.changed_pill': ['{n} edited', '{n} معدّل'],
  'hc.slot_hint': [
    'Empty = the built-in photo (preview below).',
    'فارغ = الصورة الأصلية (معاينتها بالأسفل).',
  ],
  'hc.builtin_photo': ['Built-in photo shown now', 'الصورة الأصلية المعروضة الآن'],
  'hc.slot_hero_penida': ['Hero video cover — Nusa Penida', 'غلاف فيديو الواجهة — نوسا بينيدا'],
  'hc.slot_hero_rice': ['Hero video cover — rice terraces', 'غلاف فيديو الواجهة — مدرجات الأرز'],
  'hc.slot_hero_uluwatu': ['Hero video cover — Uluwatu', 'غلاف فيديو الواجهة — أولواتو'],
  'hc.slot_svc_map': ['Card photo — Interactive map', 'صورة بطاقة — الخريطة التفاعلية'],
  'hc.slot_svc_act': ['Card photo — Activities', 'صورة بطاقة — الأنشطة'],
  'hc.slot_svc_itin': ['Card photo — Itineraries', 'صورة بطاقة — البرامج'],
  'hc.slot_svc_pkg': ['Card photo — Packages', 'صورة بطاقة — الباقات'],
  'hc.slot_svc_cust': ['Card photo — Custom trip', 'صورة بطاقة — رحلة مخصّصة'],
  'hc.slot_about': ['About slider photo ({name})', 'صورة شريط «من نحن» ({name})'],
  'hc.slot_custom': ['Custom trip photo', 'صورة قسم الرحلة المخصّصة'],
  'hc.sec_hero': ['Hero (top of the page)', 'الواجهة (أعلى الصفحة)'],
  'hc.sec_hero_hint': [
    'Big title, line under it, search box and the place names on each video. Also the page title in Google.',
    'العنوان الكبير والسطر تحته ومربع البحث وأسماء الأماكن على كل فيديو، وعنوان الصفحة في جوجل.',
  ],
  'hc.sec_svc': ['“What are you planning today?” cards', 'بطاقات «ماذا تخطط اليوم؟»'],
  'hc.sec_svc_hint': [
    'Title, text and photo of each service card.',
    'عنوان ونص وصورة كل بطاقة خدمة.',
  ],
  'hc.sec_guide': ['Free Bali guide', 'دليلك المجاني لبالي'],
  'hc.sec_guide_hint': [
    'Section texts. Card photos come from Taxonomy (category photo).',
    'نصوص القسم. صور البطاقات من «التصنيفات» (صورة التصنيف).',
  ],
  'hc.sec_mr': ['Most requested activities', 'الأكثر طلباً'],
  'hc.sec_mr_hint': [
    'Section texts. The activities are the ones marked “show on home” in Activities.',
    'نصوص القسم. الأنشطة هي المحددة «إظهار في الرئيسية» داخل الأنشطة.',
  ],
  'hc.sec_about': ['Who we are', 'من نحن'],
  'hc.sec_about_hint': [
    'Title, text, the three values and the 10 slider photos.',
    'العنوان والنص والقيم الثلاث وصور الشريط العشر.',
  ],
  'hc.sec_reviews': ['Reviews', 'آراء العملاء'],
  'hc.sec_reviews_hint': [
    'Section texts. The reviews come from Reviews.',
    'نصوص القسم. الآراء من قسم «التقييمات».',
  ],
  'hc.sec_custom': ['Custom trip', 'الرحلة المخصّصة'],
  'hc.sec_custom_hint': ['Title, text, buttons and photo.', 'العنوان والنص والأزرار والصورة.'],
  'hc.sec_blog': ['Blog', 'المدونة'],
  'hc.sec_blog_hint': [
    'Section texts. The posts come from Articles.',
    'نصوص القسم. المقالات من قسم «المقالات».',
  ],

  // Archive bin
  'arc.title': ['Archive bin', 'المحذوفات'],
  'arc.description': [
    'Everything archived from Studio. Deleting never breaks bookings or orders; restore brings a record back as a hidden draft.',
    'كل ما أُرشف من اللوحة. الحذف لا يكسر الحجوزات أو الطلبات أبداً، والاسترجاع يعيد السجل مسودة مخفية.',
  ],
  'arc.empty': ['Nothing archived.', 'لا يوجد شيء محذوف.'],
  'arc.col_kind': ['Type', 'النوع'],
  'arc.col_name': ['Name', 'الاسم'],
  'arc.col_when': ['Archived', 'تاريخ الأرشفة'],
  'arc.restore': ['Restore', 'استرجاع'],
  'arc.ok_restored': [
    'Restored as a hidden draft. Open it and publish when ready.',
    'تم الاسترجاع كمسودة مخفية. افتحه وانشره عندما يكون جاهزاً.',
  ],
  'arc.err_gone': ['That record is not in the archive.', 'هذا السجل غير موجود في المحذوفات.'],
  'arc.kind_activities': ['Activity', 'فعالية'],
  'arc.kind_packages': ['Package', 'باقة'],
  'arc.kind_places': ['Map place', 'مكان'],
  'arc.kind_articles': ['Article', 'مقال'],
  'arc.kind_landmarks': ['Landmark', 'معلم'],
  'arc.kind_reviews': ['Review', 'تقييم'],
  'arc.kind_addons': ['Add-on', 'إضافة'],
  'arc.kind_suppliers': ['Supplier', 'مورد'],
  'arc.kind_plans': ['Access plan', 'باقة وصول'],
  'arc.kind_media': ['Image', 'صورة'],

  // Guides
  'help.button': ['Guide for this screen', 'دليل هذه الشاشة'],
  'help.steps': ['How to', 'خطوة بخطوة'],
  'help.fields': ['What each field means', 'معنى كل حقل'],
  'help.mistakes': ['Common mistakes', 'أخطاء شائعة'],
  'help.all_guides': ['All guides', 'كل الأدلة'],
  'help.placeholder': [
    'This screen is being rebuilt; its guide comes with it.',
    'هذه الشاشة يُعاد بناؤها، وسيأتي دليلها معها.',
  ],
  'help.page_title': ['Studio guide', 'دليل لوحة التحكم'],
  'help.page_description': [
    'Short, practical guides for every screen. The “Guide for this screen” button opens the right one anywhere in Studio.',
    'أدلة قصيرة وعملية لكل شاشة. زر «دليل هذه الشاشة» يفتح الدليل المناسب في أي مكان من اللوحة.',
  ],
  'help.search_ph': ['Search the guides…', 'ابحث في الأدلة…'],
  'help.no_results': ['No guide matches.', 'لا يوجد دليل مطابق.'],
  'help.open_screen': ['Open this screen', 'افتح هذه الشاشة'],

  'ux.unsaved_confirm': [
    'You have unsaved changes. Leave this page without saving?',
    'لديك تغييرات غير محفوظة. هل تريد مغادرة الصفحة دون حفظ؟',
  ],
}

function split(index: 0 | 1): Messages {
  const out: Messages = {}
  for (const [key, pair] of Object.entries(PAIRS)) out[key] = pair[index]
  return out
}

const section: Section = { en: split(0), ar: split(1) }

export default section
