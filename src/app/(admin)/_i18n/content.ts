import type { Messages, Section } from './types'

/**
 * Studio strings — content (media, files, landmarks, places, reviews, taxonomy).
 * Keys: `<area>.<name>`. Written as [en, ar] pairs so the two languages can
 * never drift apart; `section` below splits them into the usual shape.
 */
const PAIRS: Record<string, readonly [en: string, ar: string]> = {
  // -------------------------------------------------------------------------
  // Media library
  // -------------------------------------------------------------------------
  'media.title': ['Media library', 'مكتبة الوسائط'],
  'media.err_rejected': [
    'The file was not accepted: {detail}',
    'لم يُقبل الملف. التفاصيل (بالإنجليزية): {detail}',
  ],
  'media.description': [
    'Uploads run the ingest pipeline: size cap, magic-byte sniff, metadata strip, then an AVIF and WebP width ladder. Nothing is hot-linked.',
    'تمر كل صورة مرفوعة بمسار المعالجة: حد أقصى للحجم، ثم التحقق من نوع الملف من محتواه، ثم إزالة البيانات الوصفية، ثم توليد مقاسات AVIF وWebP. لا تُعرض أي صورة من موقع خارجي.',
  ],
  'media.placeholder_warn': [
    'of the images below are generated placeholders, not licensed photography. They exist so the layout could be judged before real imagery was licensed — replace them here, and clear the credit when you do.',
    'من الصور أدناه صور بديلة مولَّدة، وليست صوراً مرخّصة. وُضعت لتقييم التصميم قبل ترخيص الصور الفعلية — استبدلها من هنا، وامسح حقوق الصورة عند ذلك.',
  ],
  'media.show_placeholders': ['Show only placeholders', 'عرض الصور البديلة فقط'],
  'media.svg_warn': [
    'live rows are image/svg+xml, written directly by scripts/seed-media.mjs rather than through this screen. The ingest pipeline refuses SVG on upload, and for a good reason: it is executable XML, and serving one from the site’s own origin is stored XSS. These particular files are generated artwork with no scripting in them, so they are not dangerous — but they are outside the policy the rest of the library enforces, and they should be replaced with raster imagery before launch.',
    'سجلاً نشطاً من نوع image/svg+xml، أُدرجت مباشرة عبر scripts/seed-media.mjs وليس من هذه الشاشة. مسار المعالجة يرفض رفع ملفات SVG لسبب وجيه: فهي XML قابل للتنفيذ، وتقديمها من نطاق الموقع نفسه ثغرة XSS مخزّنة. هذه الملفات تحديداً رسومات مولَّدة بلا أي سكربت، فهي ليست خطرة — لكنها خارج السياسة التي تطبّقها بقية المكتبة، ويجب استبدالها بصور نقطية قبل الإطلاق.',
  ],
  'media.no_sharp': [
    'The sharp encoder is not available in this environment, so uploads are stored WITHOUT their AVIF/WebP ladder, under an unoptimised/ prefix. The site will serve the full-size original. Install the platform binary before uploading production imagery.',
    'مُرمِّز sharp غير متوفر في هذه البيئة، لذا تُحفظ الصور المرفوعة دون مقاسات AVIF/WebP، تحت البادئة unoptimised/. سيعرض الموقع الصورة الأصلية بحجمها الكامل. ثبّت الحزمة الخاصة بالمنصة قبل رفع صور الإنتاج.',
  ],
  'media.upload_heading': ['Upload', 'رفع صورة'],
  'media.upload_hint': [
    'JPEG, PNG or WebP, identified by their contents rather than their name. Up to {max} and 80 megapixels. EXIF — including the GPS coordinates most phones embed — is stripped before anything is stored. Objects go to {driver}.',
    'JPEG أو PNG أو WebP، ويُحدَّد النوع من محتوى الملف لا من اسمه. الحد الأقصى {max} و80 ميغابكسل. تُزال بيانات EXIF — ومنها إحداثيات GPS التي تضيفها معظم الهواتف — قبل الحفظ. تُحفظ الملفات في {driver}.',
  ],
  'media.driver_local': ['the local public/ directory', 'المجلد المحلي public/'],
  'media.image_file': ['Image file', 'ملف الصورة'],
  'media.credit': ['Credit', 'حقوق الصورة'],
  'media.credit_hint': [
    'Photographer and licence. Leave blank only for artwork you own outright.',
    'اسم المصوّر والترخيص. اتركه فارغاً فقط للأعمال المملوكة لكم بالكامل.',
  ],
  'media.credit_placeholder': ['© Name — licence', '© الاسم — الترخيص'],
  'media.alt_text': ['Alt text', 'النص البديل'],
  'media.alt_hint': [
    'Describes the image for a screen reader and for a failed load. Per-locale, because it is content: an English alt on an Arabic page is as useless as none. English is enough to start with — the others fall back to it.',
    'يصف الصورة لقارئ الشاشة وعند تعذّر تحميلها. يُكتب لكل لغة لأنه جزء من المحتوى: نص بديل إنجليزي في صفحة عربية لا يفيد شيئاً. يكفي الإنجليزي للبداية — وتعود إليه اللغات الأخرى عند غيابها.',
  ],
  'media.upload_btn': ['Upload image', 'رفع الصورة'],
  'media.search_placeholder': [
    'Object key, alt text or credit',
    'مفتاح الملف أو النص البديل أو الحقوق',
  ],
  'media.source': ['Source', 'المصدر'],
  'media.kind_placeholder': ['Generated placeholders', 'صور بديلة مولَّدة'],
  'media.kind_real': ['Everything else', 'كل ما عداها'],
  'media.state': ['State', 'الحالة'],
  'media.state_live': ['Live', 'نشطة'],
  'media.state_archived': ['Archived', 'مؤرشفة'],
  'media.reset': ['Reset', 'إعادة ضبط'],
  'media.empty': ['No images match those filters.', 'لا توجد صور مطابقة لهذه الفلاتر.'],
  'media.pill_placeholder': ['generated placeholder', 'صورة بديلة مولَّدة'],
  'media.pill_uploaded': ['uploaded', 'مرفوعة'],
  'media.pill_archived': ['archived', 'مؤرشفة'],
  'media.pill_not_ingested': ['never ingested', 'لم تُعالَج'],
  'media.pill_no_derivatives': ['no derivatives', 'بلا مقاسات مشتقة'],
  'media.pill_derivatives': ['derivatives: {count}', 'المقاسات المشتقة: {count}'],
  'media.pill_used': ['used: {count}', 'الاستخدام: {count}'],
  'media.pill_unused': ['unused', 'غير مستخدمة'],
  'media.key': ['Key', 'المفتاح'],
  'media.size': ['Size', 'الحجم'],
  'media.added': ['Added', 'أُضيفت'],
  'media.used_by': ['Used by', 'مستخدمة في'],
  'media.restore': ['Restore', 'استعادة'],
  'media.credit_replace_hint': [
    'Replace this once real photography is in place — it is what marks the image as a stand-in.',
    'استبدلها عند توفر الصورة الفعلية — فهي ما يميّز الصورة على أنها بديلة.',
  ],
  'media.save_details': ['Save details', 'حفظ التفاصيل'],
  'media.real_credit': ['Real credit', 'الحقوق الفعلية'],
  'media.real_credit_placeholder': ['© Photographer — licence', '© المصوّر — الترخيص'],
  'media.not_placeholder_btn': ['No longer a placeholder', 'لم تعد صورة بديلة'],
  'media.archive': ['Archive', 'أرشفة'],
  'media.archive_blocked': [
    'Will be refused — published records still using it: {count}.',
    'ستُرفض الأرشفة — سجلات منشورة ما زالت تستخدمها: {count}.',
  ],
  'media.err_choose_image': ['Choose an image to upload.', 'اختر صورة لرفعها.'],
  'media.err_too_large': [
    'That file is {size}. The limit is {max} — resize or re-export it first.',
    'حجم الملف {size}، والحد الأقصى {max} — صغّر الصورة أو أعد تصديرها أولاً.',
  ],
  'media.err_row_write': [
    'Upload succeeded but the media row could not be written.',
    'تم رفع الملف، لكن تعذّر حفظ سجل الصورة.',
  ],
  'media.ok_uploaded': [
    'Uploaded {width}x{height}, {size}, plus {count} derivatives.',
    'تم الرفع: {width}x{height}، {size}، والمقاسات المشتقة: {count}.',
  ],
  'media.ok_uploaded_unoptimised': [
    'Uploaded {width}x{height}, {size}. NO derivatives were generated — the sharp encoder is not installed, so this image is served at full size.',
    'تم الرفع: {width}x{height}، {size}. لم تُولَّد أي مقاسات مشتقة — مُرمِّز sharp غير مثبّت، لذا ستُعرض الصورة بحجمها الكامل.',
  ],
  'media.err_gone': ['That image no longer exists', 'هذه الصورة لم تعد موجودة'],
  'media.ok_saved': ['Image details saved.', 'تم حفظ تفاصيل الصورة.'],
  'media.err_already_archived': [
    'That image is already archived, or no longer exists',
    'هذه الصورة مؤرشفة مسبقاً أو لم تعد موجودة',
  ],
  'media.err_still_used': [
    'Still used by published records ({count}): {named}{more}. Unpublish them or pick a different image first.',
    'ما زالت مستخدمة في سجلات منشورة ({count}): {named}{more}. ألغِ نشرها أو اختر صورة أخرى أولاً.',
  ],
  'media.and_more': [' and {count} more', ' و{count} غيرها'],
  'media.ok_archived': [
    'Image archived. The stored objects are kept, so it can be restored.',
    'تمت أرشفة الصورة. الملفات المخزّنة باقية، لذا يمكن استعادتها.',
  ],
  'media.err_not_archived': ['That image is not archived', 'هذه الصورة ليست مؤرشفة'],
  'media.ok_restored': ['Image restored.', 'تمت استعادة الصورة.'],
  'media.err_not_placeholder': [
    'That image is not marked as a generated placeholder.',
    'هذه الصورة ليست مُعلَّمة كصورة بديلة مولَّدة.',
  ],
  'media.ok_credit': [
    'Credit updated — this image no longer reads as a placeholder.',
    'تم تحديث الحقوق — لم تعد هذه الصورة تُعدّ بديلة.',
  ],

  // -------------------------------------------------------------------------
  // PDF files
  // -------------------------------------------------------------------------
  'files.title': ['PDF files', 'ملفات PDF'],
  'files.description': [
    'Every PDF the site delivers: itinerary schedules (per version and language) and custom-trip plans. Read-only — replace an itinerary PDF on its itinerary page; upload, withdraw or re-send a custom plan on its lead.',
    'كل ملفات PDF التي يسلّمها الموقع: جداول البرامج (لكل إصدار ولغة) وخطط الرحلات المخصصة. للعرض فقط — استبدل ملف البرنامج من صفحة البرنامج، وارفع الخطة المخصصة أو اسحبها أو أعد إرسالها من صفحة الطلب.',
  ],
  'files.itinerary_pdfs': ['Itinerary PDFs', 'ملفات البرامج'],
  'files.empty_itinerary': ['No itinerary PDFs yet.', 'لا توجد ملفات برامج بعد.'],
  'files.col_itinerary': ['Itinerary', 'البرنامج'],
  'files.col_version': ['Version', 'الإصدار'],
  'files.col_language': ['Language', 'اللغة'],
  'files.col_size': ['Size', 'الحجم'],
  'files.col_uploaded': ['Uploaded', 'تاريخ الرفع'],
  'files.col_opens': ['Opens', 'مرات الفتح'],
  'files.col_downloads': ['Downloads', 'مرات التنزيل'],
  'files.col_request': ['Request', 'الطلب'],
  'files.col_customer': ['Customer', 'العميل'],
  'files.col_file': ['File', 'الملف'],
  'files.current': ['current', 'الحالي'],
  'files.older': ['older', 'أقدم'],
  'files.itinerary_link': ['Itinerary / replace', 'البرنامج / استبدال'],
  'files.archived_hidden': [
    'PDFs of archived itineraries not shown: {count}.',
    'ملفات برامج مؤرشفة غير معروضة: {count}.',
  ],
  'files.custom_plans': ['Custom-trip plans', 'خطط الرحلات المخصصة'],
  'files.empty_custom': ['No custom plans uploaded yet.', 'لم تُرفع أي خطط مخصصة بعد.'],
  'files.withdrawn': ['withdrawn', 'مسحوبة'],
  'files.delivered': ['delivered', 'مُسلَّمة'],
  'files.lead_link': ['Lead / withdraw', 'الطلب / سحب'],
  'files.trip_status_new': ['new', 'جديد'],
  'files.trip_status_under_review': ['under review', 'تحت المراجعة'],
  'files.trip_status_in_progress': ['in progress', 'قيد التنفيذ'],
  'files.trip_status_waiting_customer': ['waiting for customer', 'بانتظار رد العميل'],
  'files.trip_status_completed': ['completed', 'مكتمل'],
  'files.trip_status_cancelled': ['cancelled', 'ملغي'],

  // -------------------------------------------------------------------------
  // Landmarks
  // -------------------------------------------------------------------------
  'landmarks.title': ['Landmarks', 'المعالم'],
  'landmarks.description': [
    'Cards on the explore index. A landmark with a linked activity becomes a bookable entry point.',
    'بطاقات صفحة الاستكشاف. المعلم المرتبط بنشاط يصبح مدخلاً مباشراً للحجز.',
  ],
  'landmarks.new': ['New landmark', 'معلم جديد'],
  'landmarks.reset': ['Reset', 'إعادة ضبط'],
  'landmarks.empty': ['No landmarks yet.', 'لا توجد معالم بعد.'],
  'landmarks.col_region': ['Region', 'المنطقة'],
  'landmarks.col_linked_activity': ['Linked activity', 'النشاط المرتبط'],
  'landmarks.col_order': ['Order', 'الترتيب'],
  'landmarks.back': ['Back to list', 'العودة إلى القائمة'],
  'landmarks.identity': ['Identity', 'الهوية'],
  'landmarks.legacy_id': ['Legacy id', 'المعرّف القديم'],
  'landmarks.sort_order': ['Sort order', 'ترتيب العرض'],
  'landmarks.copy': ['Copy', 'النصوص'],
  'landmarks.blurb': ['Blurb', 'نبذة'],
  'landmarks.links': ['Links', 'الروابط'],
  'landmarks.region': ['Region', 'المنطقة'],
  'landmarks.activity': ['Activity', 'النشاط'],
  'landmarks.bookable_activity': ['Bookable activity', 'النشاط القابل للحجز'],
  'landmarks.activity_hint': [
    'Set this and the card links straight to a purchasable tour.',
    'عند تحديده، تنتقل البطاقة مباشرة إلى جولة قابلة للشراء.',
  ],
  'landmarks.hero_image': ['Hero image', 'الصورة الرئيسية'],
  'landmarks.save': ['Save landmark', 'حفظ المعلم'],
  'landmarks.archive': ['Archive', 'الأرشفة'],
  'landmarks.archive_btn': ['Archive landmark', 'أرشفة المعلم'],
  'landmarks.err_gone': ['That landmark no longer exists', 'هذا المعلم لم يعد موجوداً'],
  'landmarks.err_save_failed': ['Save failed', 'تعذّر الحفظ'],
  'landmarks.ok_saved': ['Landmark saved.', 'تم حفظ المعلم.'],
  'landmarks.ok_archived': ['Landmark archived.', 'تمت أرشفة المعلم.'],

  // -------------------------------------------------------------------------
  // Map places
  // -------------------------------------------------------------------------
  'places.title': ['Map places', 'أماكن الخريطة'],
  'places.description': [
    'Free to view: {count}. Everything else is redacted server-side for unentitled visitors — not blurred in CSS.',
    'الأماكن المتاحة مجاناً: {count}. أما البقية فتُحجب بياناتها على الخادم عن الزوار غير المشتركين — لا مجرد تمويه عبر CSS.',
  ],
  'places.new': ['New place', 'مكان جديد'],
  'places.access': ['Access', 'الوصول'],
  'places.free': ['Free', 'مجاني'],
  'places.locked': ['Requires entitlement', 'يتطلب اشتراكاً'],
  'places.reset': ['Reset', 'إعادة ضبط'],
  'places.empty': ['No places match those filters.', 'لا توجد أماكن مطابقة لهذه الفلاتر.'],
  'places.col_category': ['Category', 'التصنيف'],
  'places.col_region': ['Region', 'المنطقة'],
  'places.col_coordinates': ['Coordinates', 'الإحداثيات'],
  'places.col_access': ['Access', 'الوصول'],
  'places.pill_free': ['free', 'مجاني'],
  'places.lock': ['Lock', 'قفل'],
  'places.make_free': ['Make free', 'جعله مجانياً'],
  'places.new_title': ['New map place', 'مكان جديد على الخريطة'],
  'places.editor_description': [
    'Real coordinates are the only coordinate system. Card anchoring is derived from the projection, so a place can be added without hand-authoring pixel offsets.',
    'الإحداثيات الجغرافية الحقيقية هي النظام الوحيد. موضع البطاقة يُحسب من الإسقاط، لذا يمكن إضافة مكان دون ضبط إزاحات البكسل يدوياً.',
  ],
  'places.back': ['Back to list', 'العودة إلى القائمة'],
  'places.identity': ['Identity', 'الهوية'],
  'places.legacy_id': ['Legacy id', 'المعرّف القديم'],
  'places.copy': ['Copy', 'النصوص'],
  'places.category': ['Category', 'التصنيف'],
  'places.description_field': ['Description', 'الوصف'],
  'places.detailed_description': ['Detailed description', 'الوصف التفصيلي'],
  'places.free_to_view': ['Free to view', 'متاح مجاناً'],
  'places.free_to_view_hint': [
    'Free places are returned in full to everyone. Locked ones are redacted server-side: a marker and a count, never the name or coordinates.',
    'الأماكن المجانية تُرسل كاملة للجميع. أما المقفلة فتُحجب على الخادم: علامة وعدد فقط، دون الاسم أو الإحداثيات أبداً.',
  ],
  'places.required_entitlement': ['Required entitlement', 'الاشتراك المطلوب'],
  'places.required_entitlement_hint': [
    'Which purchase unlocks it. Ignored while the place is free.',
    'عملية الشراء التي تفتحه. يُتجاهل ما دام المكان مجانياً.',
  ],
  'places.hidden_gem': ['Hidden Gem', 'جوهرة مخفية'],
  'places.hidden_gem_hint': [
    'Hidden Gems are VIP-only, whatever the two fields above say.',
    'الجواهر المخفية لمشتركي VIP فقط، بغض النظر عن الحقلين أعلاه.',
  ],
  'places.hide': ['Hide from map and search', 'إخفاء من الخريطة والبحث'],
  'places.hide_hint': [
    'Stays published, but nobody sees it — e.g. temporarily closed.',
    'يبقى منشوراً لكن لا يراه أحد — مثلاً عند الإغلاق المؤقت.',
  ],
  'places.can_favorite': ['Can be saved to favorites', 'يمكن حفظه في المفضلة'],
  'places.can_add_to_trip': ['Can be added to My Trip', 'يمكن إضافته إلى رحلتي'],
  'places.search_priority': ['Search priority', 'أولوية البحث'],
  'places.search_priority_hint': [
    'Higher shows first in search. 0 = normal.',
    'القيمة الأعلى تظهر أولاً في البحث. 0 = عادي.',
  ],
  'places.sort_order': ['Sort order', 'ترتيب العرض'],
  'places.sort_order_hint': [
    'Lower shows first on the map list.',
    'القيمة الأقل تظهر أولاً في قائمة الخريطة.',
  ],
  'places.location': ['Location and detail', 'الموقع والتفاصيل'],
  'places.latitude': ['Latitude', 'خط العرض'],
  'places.latitude_hint': ['Decimal degrees, -90 to 90.', 'درجات عشرية، من -90 إلى 90.'],
  'places.longitude': ['Longitude', 'خط الطول'],
  'places.longitude_hint': ['Decimal degrees, -180 to 180.', 'درجات عشرية، من -180 إلى 180.'],
  'places.pick_label': ['Map for picking the location', 'خريطة لاختيار الموقع'],
  'places.pick_hint': [
    'Click the map or drag the pin to set the location — or type the numbers.',
    'اضغط على الخريطة أو اسحب الدبوس لتحديد الموقع — أو اكتب الأرقام.',
  ],
  'places.pick_none': [
    'No location yet — click the map to place the pin, or type the numbers.',
    'لا موقع بعد — اضغط على الخريطة لوضع الدبوس، أو اكتب الأرقام.',
  ],
  'places.pick_outside': [
    'This point is outside Bali — check the numbers.',
    'هذه النقطة خارج بالي — تحقّق من الأرقام.',
  ],
  'places.pick_center': ['Centre on the pin', 'توسيط الخريطة على الدبوس'],
  'places.pick_loading': ['Loading the map…', 'جارٍ تحميل الخريطة…'],
  'places.pick_failed': [
    'The map couldn’t load (no connection to the map servers). Type the coordinates instead.',
    'تعذّر تحميل الخريطة (لا اتصال بخوادم الخرائط). اكتب الإحداثيات بدلاً من ذلك.',
  ],
  'places.on_map': ['See on the map', 'عرض على الخريطة'],
  'places.opening_hours': ['Opening hours', 'ساعات العمل'],
  'places.rating': ['Rating', 'التقييم'],
  'places.rating_tenths': ['Rating (tenths)', 'التقييم (بالأعشار)'],
  'places.rating_tenths_hint': ['47 means 4.7.', '47 تعني 4.7.'],
  'places.region': ['Region', 'المنطقة'],
  'places.activity': ['Activity', 'النشاط'],
  'places.linked_activity': ['Linked activity', 'النشاط المرتبط'],
  'places.hero_image': ['Hero image', 'الصورة الرئيسية'],
  'places.category_filters': ['Category (for filters)', 'التصنيف (للفلاتر)'],
  'places.event_starts': ['Event starts (Bali time)', 'بداية الفعالية (بتوقيت بالي)'],
  'places.event_starts_hint': [
    'Only for dated events (category “events”). Empty = permanent place.',
    'للفعاليات ذات التاريخ فقط (التصنيف “events”). فارغ = مكان دائم.',
  ],
  'places.event_ends': ['Event ends (Bali time)', 'نهاية الفعالية (بتوقيت بالي)'],
  'places.event_ends_hint': [
    'Optional. Without it, the event leaves the Events page a day after it starts.',
    'اختياري. بدونه تختفي الفعالية من صفحة الفعاليات بعد يوم من بدايتها.',
  ],
  'places.tags': ['Tags', 'الوسوم'],
  'places.no_tags': ['No tags yet — add them in', 'لا توجد وسوم بعد — أضفها من'],
  'places.taxonomy_link': ['Categories & regions', 'التصنيفات والمناطق'],
  'places.inactive_suffix': [' (inactive)', ' (غير نشط)'],
  'places.sub_categories': ['Sub-categories', 'التصنيفات الفرعية'],
  'places.sub_categories_hint': [
    'Extra categories this place also belongs to (filters and search).',
    'تصنيفات إضافية ينتمي إليها المكان أيضاً (للفلاتر والبحث).',
  ],
  'places.gallery': ['Gallery images', 'صور المعرض'],
  'places.gallery_hint': [
    'Shown in the place panel after the hero image. Upload photos in the Media library.',
    'تظهر في لوحة المكان بعد الصورة الرئيسية. ارفع الصور من مكتبة الوسائط.',
  ],
  'places.videos': ['Videos', 'الفيديوهات'],
  'places.videos_hint': [
    'One URL per line (YouTube, Vimeo or .mp4).',
    'رابط واحد في كل سطر (YouTube أو Vimeo أو .mp4).',
  ],
  'places.internal_notes': ['Internal notes', 'ملاحظات داخلية'],
  'places.internal_notes_hint': [
    'Staff only. Never sent to the site.',
    'للفريق فقط، ولا تُرسل إلى الموقع أبداً.',
  ],
  'places.save': ['Save place', 'حفظ المكان'],
  'places.upload_video_heading': ['Upload a video', 'رفع فيديو'],
  'places.video_file': ['MP4 or WebM, up to 24 MB', 'MP4 أو WebM، حتى 24 MB'],
  'places.upload_video_btn': ['Upload video', 'رفع الفيديو'],
  'places.archive': ['Archive', 'الأرشفة'],
  'places.archive_btn': ['Archive place', 'أرشفة المكان'],
  'places.err_lat_range': [
    'Latitude must be between -90 and 90',
    'يجب أن يكون خط العرض بين -90 و90',
  ],
  'places.err_lon_range': [
    'Longitude must be between -180 and 180',
    'يجب أن يكون خط الطول بين -180 و180',
  ],
  'places.err_rating_range': [
    'Rating must be between 0 and 50 tenths (0.0–5.0)',
    'يجب أن يكون التقييم بين 0 و50 بالأعشار (0.0–5.0)',
  ],
  'places.err_gone': ['That place no longer exists', 'هذا المكان لم يعد موجوداً'],
  'places.err_save_failed': ['Save failed', 'تعذّر الحفظ'],
  'places.ok_saved': ['Place saved.', 'تم حفظ المكان.'],
  'places.ok_free': ['Place is now free to view.', 'أصبح المكان متاحاً مجاناً.'],
  'places.ok_locked': ['Place now requires an entitlement.', 'أصبح المكان يتطلب اشتراكاً.'],
  'places.ok_archived': ['Place archived.', 'تمت أرشفة المكان.'],
  'places.err_choose_video': ['Choose a video to upload.', 'اختر فيديو لرفعه.'],
  'places.err_video_too_large': [
    'Videos up to 24 MB. For longer clips, upload to YouTube and paste the link.',
    'الحد الأقصى للفيديو 24 MB. للمقاطع الأطول، ارفعها على YouTube والصق الرابط.',
  ],
  'places.err_video_type': ['Upload an MP4 or WebM video.', 'ارفع فيديو بصيغة MP4 أو WebM.'],
  'places.err_video_invalid': [
    'That file is not an MP4 or WebM video.',
    'هذا الملف ليس فيديو MP4 أو WebM.',
  ],
  'places.err_too_many_videos': [
    'A place can have at most 10 videos.',
    'الحد الأقصى 10 فيديوهات لكل مكان.',
  ],
  'places.ok_video': [
    'Video uploaded and added to the place.',
    'تم رفع الفيديو وإضافته إلى المكان.',
  ],

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------
  'reviews.title': ['Reviews', 'التقييمات'],
  'reviews.description': [
    'Every review belongs to an activity. One tied to a real order shows as verified.',
    'كل تقييم يتبع نشاطاً. التقييم المرتبط بطلب حقيقي يظهر كتقييم موثّق.',
  ],
  'reviews.new': ['New review', 'تقييم جديد'],
  'reviews.author': ['Author', 'الكاتب'],
  'reviews.state': ['State', 'الحالة'],
  'reviews.reset': ['Reset', 'إعادة ضبط'],
  'reviews.empty': ['No reviews match those filters.', 'لا توجد تقييمات مطابقة لهذه الفلاتر.'],
  'reviews.col_stars': ['Stars', 'النجوم'],
  'reviews.col_activity': ['Activity', 'النشاط'],
  'reviews.col_body': ['Body', 'النص'],
  'reviews.col_received': ['Received', 'تاريخ الاستلام'],
  'reviews.pill_verified': ['verified', 'موثّق'],
  'reviews.pill_unattached': ['unattached', 'غير مرتبط'],
  'reviews.pill_published': ['published', 'منشور'],
  'reviews.pill_hidden': ['hidden', 'مخفي'],
  'reviews.hide': ['Hide', 'إخفاء'],
  'reviews.publish': ['Publish', 'نشر'],
  'reviews.new_title': ['New review', 'تقييم جديد'],
  'reviews.back': ['Back to list', 'العودة إلى القائمة'],
  'reviews.review': ['Review', 'التقييم'],
  'reviews.author_name': ['Author name', 'اسم الكاتب'],
  'reviews.stars': ['Stars', 'النجوم'],
  'reviews.stars_hint': ['1 to 5.', 'من 1 إلى 5.'],
  'reviews.activity': ['Activity', 'النشاط'],
  'reviews.activity_hint': [
    'An unattached review is never shown next to a tour it does not belong to.',
    'التقييم غير المرتبط لا يظهر أبداً بجانب جولة لا يخصها.',
  ],
  'reviews.order': ['Order', 'الطلب'],
  'reviews.order_id': ['Order id', 'رقم الطلب'],
  'reviews.order_id_hint': [
    'Set when the review comes from a real booking. Shows as verified.',
    'يُحدَّد عندما يأتي التقييم من حجز حقيقي، ويظهر حينها كتقييم موثّق.',
  ],
  'reviews.copy': ['Copy', 'النصوص'],
  'reviews.author_country': ['Author country', 'بلد الكاتب'],
  'reviews.body': ['Body', 'النص'],
  'reviews.save': ['Save review', 'حفظ التقييم'],
  'reviews.archive': ['Archive', 'الأرشفة'],
  'reviews.archive_btn': ['Archive review', 'أرشفة التقييم'],
  'reviews.err_stars_range': ['Stars must be between 1 and 5', 'يجب أن يكون عدد النجوم بين 1 و5'],
  'reviews.err_gone': ['That review no longer exists', 'هذا التقييم لم يعد موجوداً'],
  'reviews.err_save_failed': ['Save failed', 'تعذّر الحفظ'],
  'reviews.ok_saved': ['Review saved.', 'تم حفظ التقييم.'],
  'reviews.ok_published': ['Review published.', 'تم نشر التقييم.'],
  'reviews.ok_hidden': ['Review hidden.', 'تم إخفاء التقييم.'],
  'reviews.ok_archived': ['Review archived.', 'تمت أرشفة التقييم.'],

  // -------------------------------------------------------------------------
  // Taxonomy
  // -------------------------------------------------------------------------
  'taxonomy.title': ['Categories & regions', 'التصنيفات والمناطق'],
  'taxonomy.description': [
    'Keys are stable identifiers used in URLs and filters; labels are translated. Nothing here soft-deletes, so a row still in use cannot be removed.',
    'المفاتيح معرّفات ثابتة تُستخدم في الروابط والفلاتر، أما التسميات فمترجمة. الحذف هنا نهائي، لذا لا يمكن حذف عنصر ما زال مستخدماً.',
  ],
  'taxonomy.sec_categories': [
    'Categories (activities & map places)',
    'التصنيفات (الأنشطة وأماكن الخريطة)',
  ],
  'taxonomy.sec_areas': ['Areas & neighbourhoods', 'المناطق والأحياء'],
  'taxonomy.sec_tags': ['Map place tags', 'وسوم أماكن الخريطة'],
  'taxonomy.sec_article_categories': ['Article categories', 'تصنيفات المقالات'],
  'taxonomy.parent': ['Inside region (for neighbourhoods)', 'ضمن منطقة (للأحياء)'],
  'taxonomy.top_level': ['— Top-level region —', '— منطقة رئيسية —'],
  'taxonomy.center_lat': ['Centre latitude', 'خط عرض المركز'],
  'taxonomy.center_lon': ['Centre longitude', 'خط طول المركز'],
  'taxonomy.radius': ['Radius', 'نصف القطر'],
  'taxonomy.radius_km': ['Approx. radius (km)', 'نصف القطر التقريبي (كم)'],
  'taxonomy.description_locale': ['Description · {language}', 'الوصف · {language}'],
  'taxonomy.key': ['Key', 'المفتاح'],
  'taxonomy.label': ['Label', 'التسمية'],
  'taxonomy.icon': ['Icon', 'الأيقونة'],
  'taxonomy.sort_order': ['Sort order', 'ترتيب العرض'],
  'taxonomy.parent_area': ['Parent area', 'المنطقة الأم'],
  'taxonomy.add_new': ['Add new', 'إضافة جديد'],
  'taxonomy.key_placeholder': ['lowercase-with-hyphens', 'lowercase-with-hyphens'],
  'taxonomy.err_number_range': [
    '{label} must be a number between {min} and {max}',
    'يجب أن يكون {label} رقماً بين {min} و{max}',
  ],
  'taxonomy.err_icon': [
    '"{icon}" is not a name in the icon set.',
    '"{icon}" ليس اسماً ضمن مجموعة الأيقونات.',
  ],
  'taxonomy.err_category_gone': ['That category no longer exists', 'هذا التصنيف لم يعد موجوداً'],
  'taxonomy.err_category_in_use': [
    'Activities still using this category: {count}. Reassign them first.',
    'أنشطة ما زالت تستخدم هذا التصنيف: {count}. انقلها إلى تصنيف آخر أولاً.',
  ],
  'taxonomy.ok_category_saved': ['Category saved.', 'تم حفظ التصنيف.'],
  'taxonomy.ok_category_deleted': ['Category deleted.', 'تم حذف التصنيف.'],
  'taxonomy.err_self_parent': [
    'An area cannot be its own parent',
    'لا يمكن أن تكون المنطقة أمّاً لنفسها',
  ],
  'taxonomy.err_parent_gone': ['The parent area no longer exists', 'المنطقة الأم لم تعد موجودة'],
  'taxonomy.err_parent_not_top': [
    'Pick a top-level region as the parent',
    'اختر منطقة رئيسية لتكون المنطقة الأم',
  ],
  'taxonomy.err_region_has_children': [
    'This region has neighbourhoods inside it, so it cannot be nested.',
    'هذه المنطقة تضم أحياء، لذا لا يمكن وضعها داخل منطقة أخرى.',
  ],
  'taxonomy.err_region_gone': ['That region no longer exists', 'هذه المنطقة لم تعد موجودة'],
  'taxonomy.err_region_in_use': [
    'Records still referencing this region: {count}. Reassign them first.',
    'سجلات ما زالت مرتبطة بهذه المنطقة: {count}. انقلها إلى منطقة أخرى أولاً.',
  ],
  'taxonomy.ok_region_saved': ['Region saved.', 'تم حفظ المنطقة.'],
  'taxonomy.ok_region_deleted': ['Region deleted.', 'تم حذف المنطقة.'],
  'taxonomy.err_article_category_gone': [
    'That article category no longer exists',
    'تصنيف المقالات هذا لم يعد موجوداً',
  ],
  'taxonomy.err_article_category_in_use': [
    'Articles still using this category: {count}. Reassign them first.',
    'مقالات ما زالت تستخدم هذا التصنيف: {count}. انقلها إلى تصنيف آخر أولاً.',
  ],
  'taxonomy.ok_article_category_saved': ['Article category saved.', 'تم حفظ تصنيف المقالات.'],
  'taxonomy.ok_article_category_deleted': ['Article category deleted.', 'تم حذف تصنيف المقالات.'],
  'taxonomy.err_tag_gone': ['That tag no longer exists', 'هذا الوسم لم يعد موجوداً'],
  'taxonomy.ok_tag_saved': ['Tag saved.', 'تم حفظ الوسم.'],
  'taxonomy.ok_tag_deleted': [
    'Tag deleted and removed from every place.',
    'تم حذف الوسم وإزالته من جميع الأماكن.',
  ],
  // -------------------------------------------------------------------------
  // Map overview (Studio → Map)
  // -------------------------------------------------------------------------
  'map.title': ['Map', 'الخريطة'],
  'map.description': [
    'Every place on the real map — drafts, hidden and locked ones included. Click a pin to edit the place.',
    'كل الأماكن على الخريطة الحقيقية — بما فيها المسودات والمخفية والمقفلة. اضغط على أي دبوس لتعديل المكان.',
  ],
  'map.places_list': ['Places list', 'قائمة الأماكن'],
  'map.legend': ['Show', 'إظهار'],
  'map.legend_free': ['Free', 'مجاني'],
  'map.legend_locked': ['Locked (needs a plan)', 'مقفل (يتطلب اشتراكاً)'],
  'map.legend_draft': ['Draft', 'مسودة'],
  'map.legend_hidden': ['Hidden', 'مخفي'],
  'map.count': ['{shown} of {total} places shown', 'يُعرض {shown} من {total} مكاناً'],
  'map.edit': ['edit', 'تعديل'],
  'map.loading': ['Loading the map…', 'جارٍ تحميل الخريطة…'],
  'map.failed': [
    'The map couldn’t load (no connection to the map servers). The places list still works.',
    'تعذّر تحميل الخريطة (لا اتصال بخوادم الخرائط). قائمة الأماكن ما زالت تعمل.',
  ],
  'map.settings': ['3D map settings', 'إعدادات الخريطة ثلاثية الأبعاد'],
  'map.settings_hint': [
    'Applies to the public 3D map, the place editor and this page.',
    'تنطبق على الخريطة العامة ثلاثية الأبعاد وعلى محرر الأماكن وهذه الصفحة.',
  ],
  'map.satellite': ['Satellite imagery (optional)', 'صور القمر الصناعي (اختيارية)'],
  'map.satellite_intro': [
    'The map is a licence-clean vector map by default (OpenFreeMap + AWS terrain). Satellite imagery is only shown when a provider is chosen, its key is entered AND the licence box below is ticked — otherwise the vector map is used.',
    'الخريطة افتراضياً خريطة متجهية نظيفة الترخيص (OpenFreeMap + تضاريس AWS). لا تظهر صور القمر الصناعي إلا عند اختيار مزوّد وإدخال مفتاحه ووضع علامة على مربع الترخيص أدناه — وإلا تُستخدم الخريطة المتجهية.',
  ],
  'map.sat_none': ['None — vector map only (default)', 'بدون — الخريطة المتجهية فقط (الافتراضي)'],
  'map.sat_none_note': [
    'No key, no cost. OpenFreeMap allows commercial use with attribution.',
    'بلا مفتاح وبلا تكلفة. يسمح OpenFreeMap بالاستخدام التجاري مع ذكر المصدر.',
  ],
  'map.sat_esri': [
    'Esri World Imagery (ArcGIS Location Platform)',
    'Esri World Imagery (منصة ArcGIS Location Platform)',
  ],
  'map.sat_esri_note': [
    'Needs an ArcGIS Location Platform account and API key. 2M basemap tiles/month free, then about $0.15 per 1,000 tiles.',
    'يتطلب حساباً ومفتاح API على ArcGIS Location Platform. مليونا بلاطة شهرياً مجاناً، ثم نحو 0.15 دولار لكل 1000 بلاطة.',
  ],
  'map.sat_mapbox': [
    'Mapbox Satellite (Mapbox Raster Tiles API)',
    'Mapbox Satellite (واجهة Mapbox Raster Tiles)',
  ],
  'map.sat_mapbox_note': [
    'Needs a Mapbox account and public access token. 750k tiles/month free, then about $0.25 per 1,000 tiles. Mapbox requires its wordmark on the map.',
    'يتطلب حساباً ورمز وصول عاماً من Mapbox. 750 ألف بلاطة شهرياً مجاناً، ثم نحو 0.25 دولار لكل 1000 بلاطة. تشترط Mapbox إظهار شعارها على الخريطة.',
  ],
  'map.esri_key': ['ArcGIS API key', 'مفتاح ArcGIS API'],
  'map.esri_key_hint': [
    'With the basemap/imagery privilege, restricted to this site’s domain.',
    'بصلاحية الخرائط الأساسية/الصور، ومقيّد بنطاق هذا الموقع.',
  ],
  'map.mapbox_token': ['Mapbox access token', 'رمز وصول Mapbox'],
  'map.mapbox_token_hint': [
    'A public token (pk.…) with a URL restriction to this site’s domain.',
    'رمز عام (pk.…) مقيّد برابط نطاق هذا الموقع.',
  ],
  'map.licence_confirm': [
    'I confirm we hold the licence/plan for commercial use of the chosen provider.',
    'أؤكد أننا نملك الترخيص/الخطة المناسبة للاستخدام التجاري لدى المزوّد المختار.',
  ],
  'map.keys_public': [
    'These keys are stored in the site settings and sent to visitors’ browsers (only the active one) — that is how map tiles work. Use public, domain-restricted keys only, never a secret key.',
    'تُحفظ هذه المفاتيح في إعدادات الموقع وتُرسل إلى متصفحات الزوار (المفعّل منها فقط) — هكذا تعمل بلاطات الخرائط. استخدم مفاتيح عامة مقيّدة بالنطاق فقط، ولا تستخدم مفتاحاً سرياً أبداً.',
  ],
  'map.sat_status_off': [
    'Satellite is off: the vector map is shown.',
    'صور القمر الصناعي متوقفة: تُعرض الخريطة المتجهية.',
  ],
  'map.sat_status_inactive': [
    'Satellite is NOT active — a key or the licence confirmation is missing, so the vector map is shown.',
    'صور القمر الصناعي غير مفعّلة — ينقص المفتاح أو تأكيد الترخيص، لذا تُعرض الخريطة المتجهية.',
  ],
  'map.sat_status_on': [
    'Satellite is active: {provider}.',
    'صور القمر الصناعي مفعّلة: {provider}.',
  ],
  'map.exaggeration': ['Terrain exaggeration', 'تضخيم التضاريس'],
  'map.exaggeration_hint': [
    '{min} = true scale, up to {max}.',
    '{min} = المقياس الحقيقي، وحتى {max}.',
  ],
  'map.tilt': ['Tilt of the 3D view (degrees)', 'ميل العرض ثلاثي الأبعاد (بالدرجات)'],
  'map.tilt_hint': ['{min} = straight down, up to {max}.', '{min} = من الأعلى مباشرة، وحتى {max}.'],
  'map.save': ['Save map settings', 'حفظ إعدادات الخريطة'],
  'map.ok_saved': ['Map settings saved.', 'تم حفظ إعدادات الخريطة.'],
}

function split(index: 0 | 1): Messages {
  const out: Messages = {}
  for (const [key, pair] of Object.entries(PAIRS)) out[key] = pair[index]
  return out
}

const section: Section = {
  en: split(0),
  ar: split(1),
}

export default section
