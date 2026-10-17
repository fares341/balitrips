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
    'This file couldn’t be used: {detail}',
    'تعذّر استخدام هذا الملف: {detail}',
  ],
  'media.description': [
    'Upload photos here. They are resized for phones and computers automatically, and hidden location details are removed.',
    'ارفع الصور من هنا. تُجهَّز تلقائياً بمقاسات مناسبة للجوال والكمبيوتر، وتُزال منها بيانات الموقع المخفية.',
  ],
  'media.placeholder_warn': [
    'of the images below are temporary sample images, not real photos. Replace them with your own photos, and clear the “sample” credit when you do.',
    'من الصور أدناه صور مؤقتة وليست صوراً حقيقية. استبدلها بصورك الخاصة، وامسح حقوق «الصورة المؤقتة» عند ذلك.',
  ],
  'media.show_placeholders': ['Show only sample images', 'عرض الصور المؤقتة فقط'],
  'media.svg_warn': [
    'images are drawings in a format that can’t be uploaded here. They are safe, but please replace them with real photos before launch.',
    'من الصور رسومات بصيغة لا يمكن رفعها من هنا. هي آمنة، لكن استبدلها بصور حقيقية قبل الإطلاق.',
  ],
  'media.no_sharp': [
    'Photo resizing isn’t available right now, so new uploads are shown at full size and pages may load slower. Contact your technical team.',
    'تجهيز مقاسات الصور غير متاح حالياً، لذلك تُعرض الصور الجديدة بحجمها الكامل وقد تبطؤ الصفحات. تواصل مع فريقك التقني.',
  ],
  'media.upload_heading': ['Upload', 'رفع صورة'],
  'media.upload_hint': [
    'JPEG, PNG or WebP photos, up to {max}. Hidden details such as the GPS location most phones add are removed automatically.',
    'صور بصيغة JPEG أو PNG أو WebP، حتى {max}. تُزال تلقائياً البيانات المخفية مثل موقع GPS الذي تضيفه معظم الهواتف.',
  ],
  'media.image_file': ['Image file', 'ملف الصورة'],
  'media.credit': ['Credit', 'حقوق الصورة'],
  'media.credit_hint': [
    'Photographer and licence. Leave blank only for artwork you own outright.',
    'اسم المصوّر والترخيص. اتركه فارغاً فقط للأعمال المملوكة لكم بالكامل.',
  ],
  'media.credit_placeholder': ['© Name — licence', '© الاسم — الترخيص'],
  'media.alt_text': ['Image description', 'وصف الصورة'],
  'media.alt_hint': [
    'A short description of the photo, read aloud to blind visitors and shown if the photo can’t load. English is enough to start; other languages use it until you translate them.',
    'وصف قصير للصورة يُقرأ للزوار المكفوفين ويظهر إذا تعذّر تحميلها. يكفي الإنجليزي للبداية، وتستخدمه اللغات الأخرى حتى تترجمها.',
  ],
  'media.upload_btn': ['Upload image', 'رفع الصورة'],
  'media.search_placeholder': ['File name, description or credit', 'اسم الملف أو الوصف أو الحقوق'],
  'media.source': ['Source', 'المصدر'],
  'media.kind_placeholder': ['Sample images', 'الصور المؤقتة'],
  'media.kind_real': ['Real photos', 'الصور الحقيقية'],
  'media.state': ['State', 'الحالة'],
  'media.state_live': ['Live', 'نشطة'],
  'media.state_archived': ['Archived', 'مؤرشفة'],
  'media.reset': ['Reset', 'إعادة ضبط'],
  'media.empty': ['No images match those filters.', 'لا توجد صور مطابقة لهذه الفلاتر.'],
  'media.pill_placeholder': ['sample image', 'صورة مؤقتة'],
  'media.pill_uploaded': ['uploaded', 'مرفوعة'],
  'media.pill_archived': ['archived', 'مؤرشفة'],
  'media.pill_not_ingested': ['not resized', 'غير مجهّزة'],
  'media.pill_no_derivatives': ['not resized', 'غير مجهّزة'],
  'media.pill_derivatives': ['ready for all screens', 'جاهزة لكل الشاشات'],
  'media.pill_used': ['used: {count}', 'مستخدمة: {count}'],
  'media.pill_unused': ['unused', 'غير مستخدمة'],
  'media.key': ['File name', 'اسم الملف'],
  'media.size': ['Size', 'الحجم'],
  'media.added': ['Added', 'أُضيفت'],
  'media.used_by': ['Used by', 'مستخدمة في'],
  'media.restore': ['Restore', 'استعادة'],
  'media.credit_replace_hint': [
    'Replace this credit once you use a real photo — it is what marks the image as a sample.',
    'استبدل هذه الحقوق عند استخدام صورة حقيقية — فهي ما يجعل الصورة تُعدّ مؤقتة.',
  ],
  'media.save_details': ['Save details', 'حفظ التفاصيل'],
  'media.real_credit': ['Real credit', 'الحقوق الفعلية'],
  'media.real_credit_placeholder': ['© Photographer — licence', '© المصوّر — الترخيص'],
  'media.not_placeholder_btn': ['This is a real photo', 'هذه صورة حقيقية'],
  'media.archive': ['Archive', 'أرشفة'],
  'media.archive_blocked': [
    'Can’t be archived yet — still used on published pages: {count}.',
    'لا يمكن أرشفتها بعد — ما زالت مستخدمة في صفحات منشورة: {count}.',
  ],
  'media.err_choose_image': ['Choose an image to upload.', 'اختر صورة لرفعها.'],
  'media.err_too_large': [
    'That file is {size}. The limit is {max} — resize or re-export it first.',
    'حجم الملف {size}، والحد الأقصى {max} — صغّر الصورة أو أعد تصديرها أولاً.',
  ],
  'media.err_row_write': [
    'The photo was uploaded but couldn’t be saved. Please try again.',
    'تم رفع الصورة لكن تعذّر حفظها. حاول مرة أخرى.',
  ],
  'media.ok_uploaded': [
    'Photo uploaded ({width}×{height}, {size}).',
    'تم رفع الصورة ({width}×{height}، {size}).',
  ],
  'media.ok_uploaded_unoptimised': [
    'Photo uploaded ({width}×{height}, {size}). It will be shown at full size because photo resizing isn’t available right now.',
    'تم رفع الصورة ({width}×{height}، {size}). ستُعرض بحجمها الكامل لأن تجهيز المقاسات غير متاح حالياً.',
  ],
  'media.err_gone': ['That image no longer exists', 'هذه الصورة لم تعد موجودة'],
  'media.ok_saved': ['Image details saved.', 'تم حفظ تفاصيل الصورة.'],
  'media.err_already_archived': [
    'That image is already archived, or no longer exists',
    'هذه الصورة مؤرشفة مسبقاً أو لم تعد موجودة',
  ],
  'media.err_still_used': [
    'Still used on published pages ({count}): {named}{more}. Unpublish them or choose a different photo first.',
    'ما زالت مستخدمة في صفحات منشورة ({count}): {named}{more}. ألغِ نشرها أو اختر صورة أخرى أولاً.',
  ],
  'media.and_more': [' and {count} more', ' و{count} غيرها'],
  'media.ok_archived': [
    'Photo archived. You can restore it at any time.',
    'تمت أرشفة الصورة. يمكنك استعادتها في أي وقت.',
  ],
  'media.err_not_archived': ['That image is not archived', 'هذه الصورة ليست مؤرشفة'],
  'media.ok_restored': ['Image restored.', 'تمت استعادة الصورة.'],
  'media.err_not_placeholder': [
    'That image isn’t marked as a sample image.',
    'هذه الصورة ليست مُعلَّمة كصورة مؤقتة.',
  ],
  'media.ok_credit': [
    'Credit updated — this image now counts as a real photo.',
    'تم تحديث الحقوق — أصبحت هذه الصورة تُعدّ صورة حقيقية.',
  ],

  // -------------------------------------------------------------------------
  // PDF files
  // -------------------------------------------------------------------------
  'files.title': ['PDF files', 'ملفات PDF'],
  'files.description': [
    'Every PDF the website gives to customers: itinerary plans (per version and language) and custom-trip plans. To replace an itinerary PDF, open the itinerary; to upload or withdraw a custom plan, open the request.',
    'كل ملفات PDF التي يقدّمها الموقع للعملاء: خطط الرحلات (لكل إصدار ولغة) وخطط الرحلات الخاصة. لاستبدال ملف خطة رحلة افتح خطة الرحلة، ولرفع خطة خاصة أو سحبها افتح الطلب.',
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
  'files.lead_link': ['Request / withdraw', 'الطلب / سحب'],
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
    'Cards on the Explore page. Link a landmark to an activity so visitors can book it straight away.',
    'بطاقات صفحة الاستكشاف. اربط المعلم بنشاط ليتمكن الزوار من حجزه مباشرة.',
  ],
  'landmarks.new': ['New landmark', 'معلم جديد'],
  'landmarks.reset': ['Reset', 'إعادة ضبط'],
  'landmarks.empty': ['No landmarks yet.', 'لا توجد معالم بعد.'],
  'landmarks.col_region': ['Region', 'المنطقة'],
  'landmarks.col_linked_activity': ['Linked activity', 'النشاط المرتبط'],
  'landmarks.col_order': ['Order', 'الترتيب'],
  'landmarks.back': ['Back to list', 'العودة إلى القائمة'],
  'landmarks.identity': ['Basic details', 'البيانات الأساسية'],
  'landmarks.legacy_id': ['Old reference code', 'رمز المرجع القديم'],
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
  'landmarks.err_save_failed': ['Couldn’t save. Please try again.', 'تعذّر الحفظ. حاول مرة أخرى.'],
  'landmarks.ok_saved': ['Landmark saved.', 'تم حفظ المعلم.'],
  'landmarks.ok_archived': ['Landmark archived.', 'تمت أرشفة المعلم.'],

  // -------------------------------------------------------------------------
  // Map places
  // -------------------------------------------------------------------------
  'places.title': ['Map places', 'أماكن الخريطة'],
  'places.description': [
    'Free to view: {count}. The other places are only shown to customers with a map plan.',
    'الأماكن المتاحة مجاناً: {count}. أما البقية فلا تظهر إلا للعملاء الذين لديهم باقة خريطة.',
  ],
  'places.new': ['New place', 'مكان جديد'],
  'places.access': ['Access', 'الوصول'],
  'places.free': ['Free', 'مجاني'],
  'places.locked': ['Needs a plan', 'يتطلب باقة'],
  'places.reset': ['Reset', 'إعادة ضبط'],
  'places.empty': ['No places match those filters.', 'لا توجد أماكن مطابقة لهذه الفلاتر.'],
  'places.col_category': ['Category', 'التصنيف'],
  'places.col_region': ['Region', 'المنطقة'],
  'places.col_coordinates': ['Coordinates', 'الإحداثيات'],
  'places.col_access': ['Access', 'الوصول'],
  'places.pill_free': ['free', 'مجاني'],
  'places.lock': ['Make paid', 'جعله مدفوعاً'],
  'places.make_free': ['Make free', 'جعله مجانياً'],
  'places.new_title': ['New map place', 'مكان جديد على الخريطة'],
  'places.editor_description': [
    'Set the location by clicking the map, searching, or pasting a Google Maps link.',
    'حدّد الموقع بالضغط على الخريطة، أو بالبحث، أو بلصق رابط من خرائط Google.',
  ],
  'places.back': ['Back to list', 'العودة إلى القائمة'],
  'places.identity': ['Basic details', 'البيانات الأساسية'],
  'places.legacy_id': ['Old reference code', 'رمز المرجع القديم'],
  'places.copy': ['Copy', 'النصوص'],
  'places.category': ['Category', 'التصنيف'],
  'places.description_field': ['Description', 'الوصف'],
  'places.detailed_description': ['Detailed description', 'الوصف التفصيلي'],
  'places.free_to_view': ['Free to view', 'متاح مجاناً'],
  'places.free_to_view_hint': [
    'Free places are shown to everyone. Paid places show only a marker to visitors without a plan — never the name or exact location.',
    'الأماكن المجانية تظهر للجميع. أما المدفوعة فيرى الزائر بلا باقة علامة فقط — دون الاسم أو الموقع الدقيق.',
  ],
  'places.required_entitlement': ['Plan needed', 'الباقة المطلوبة'],
  'places.required_entitlement_hint': [
    'Which plan unlocks this place. Ignored while the place is free.',
    'الباقة التي تفتح هذا المكان. لا تُستخدم ما دام المكان مجانياً.',
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
  'places.latitude_hint': [
    'Filled in automatically when you place the pin.',
    'يُملأ تلقائياً عند وضع الدبوس.',
  ],
  'places.longitude': ['Longitude', 'خط الطول'],
  'places.longitude_hint': [
    'Filled in automatically when you place the pin.',
    'يُملأ تلقائياً عند وضع الدبوس.',
  ],
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
    'The map couldn’t load. Check your internet connection, or type the coordinates instead.',
    'تعذّر تحميل الخريطة. تحقّق من اتصال الإنترنت، أو اكتب الإحداثيات بدلاً من ذلك.',
  ],
  'places.on_map': ['See on the map', 'عرض على الخريطة'],
  'places.pick_paste_label': [
    'Paste a Google Maps link or “lat, lng”',
    'الصق رابط خرائط Google أو «خط العرض، خط الطول»',
  ],
  'places.pick_paste_btn': ['Read coordinates', 'استخرج الإحداثيات'],
  'places.pick_paste_hint': [
    'In Google Maps: drop a pin on the place, then copy the address from the browser bar (or the coordinates shown under the pin).',
    'في خرائط Google: ضع دبوساً على المكان، ثم انسخ الرابط من شريط المتصفح (أو الإحداثيات الظاهرة تحت الدبوس).',
  ],
  'places.pick_paste_ok': [
    'Coordinates read from the {source}. Check the pin below.',
    'استُخرجت الإحداثيات من {source}. تحقّق من الدبوس أدناه.',
  ],
  'places.pick_src_pin': ['dropped pin in the link', 'الدبوس الموجود في الرابط'],
  'places.pick_src_centre': [
    'map centre in the link (not a pin — it may be a little off)',
    'مركز الخريطة في الرابط (ليس دبوساً — قد يكون منحرفاً قليلاً)',
  ],
  'places.pick_src_query': ['link', 'الرابط'],
  'places.pick_src_pair': ['text', 'النص'],
  'places.pick_paste_err': [
    'No coordinates in that text. Short links (maps.app.goo.gl) don’t contain them — open the link and copy the full address from the browser bar.',
    'لا توجد إحداثيات في هذا النص. الروابط المختصرة (maps.app.goo.gl) لا تحتويها — افتح الرابط وانسخ العنوان الكامل من شريط المتصفح.',
  ],
  'places.pick_search_label': [
    'Or search by name or address (Bali)',
    'أو ابحث بالاسم أو العنوان (بالي)',
  ],
  'places.pick_search_placeholder': [
    'e.g. Tegallalang rice terraces',
    'مثال: Tegallalang rice terraces',
  ],
  'places.pick_searching': ['Searching…', 'جارٍ البحث…'],
  'places.pick_search_none': ['No matches in Bali.', 'لا نتائج في بالي.'],
  'places.pick_search_err': [
    'Search is unavailable right now — paste a link or click the map instead.',
    'البحث غير متاح الآن — الصق رابطاً أو اضغط على الخريطة بدلاً من ذلك.',
  ],
  'places.pick_search_credit': [
    'Search: Photon by komoot · © OpenStreetMap contributors',
    'البحث: Photon من komoot · © OpenStreetMap contributors',
  ],
  'places.pick_water': [
    'The pin is in the sea or a lake — check it is on the place itself.',
    'الدبوس في البحر أو في بحيرة — تأكد أنه على المكان نفسه.',
  ],
  'places.pick_dupe': [
    'Another place is within 50 m: “{name}” — possible duplicate.',
    'يوجد مكان آخر على بعد أقل من 50 م: «{name}» — قد يكون مكرراً.',
  ],
  'places.pick_dupe_open': ['Open it', 'افتحه'],
  'places.pick_gmaps': ['Open in Google Maps', 'افتح في خرائط Google'],
  'places.preview': ['Preview as visitor', 'معاينة كما يراها الزائر'],
  'places.preview_hint': [
    'The place card visitors get on the public map, as last saved.',
    'بطاقة المكان كما يراها الزوار على الخريطة العامة، حسب آخر حفظ.',
  ],
  'places.warn_no_photo': [
    'No main photo — visitors see a plain grey image instead of the place.',
    'لا توجد صورة رئيسية — سيرى الزوار صورة رمادية بدلاً من صورة المكان.',
  ],
  'places.warn_no_name': ['The {lang} name is missing.', 'الاسم باللغة {lang} غير موجود.'],
  'places.warn_draft': [
    'Saved as a draft — it is not on the public map until it is published.',
    'محفوظ كمسودة — لن يظهر على الخريطة العامة حتى يُنشر.',
  ],
  'places.warn_hidden': [
    'Hidden — it is not shown on the public map.',
    'مخفي — لا يظهر على الخريطة العامة.',
  ],
  'places.saved_live': ['Saved and live.', 'تم الحفظ وهو منشور.'],
  'places.saved_on_map': ['See it on the public map', 'شاهده على الخريطة العامة'],
  'places.saved_page': ['Public page', 'الصفحة العامة'],
  'places.opening_hours': ['Opening hours', 'ساعات العمل'],
  'places.rating': ['Rating', 'التقييم'],
  'places.rating_tenths': ['Rating (×10)', 'التقييم (×10)'],
  'places.rating_tenths_hint': ['Enter 47 for a 4.7 rating.', 'اكتب 47 لتقييم 4.7.'],
  'places.region': ['Region', 'المنطقة'],
  'places.activity': ['Activity', 'النشاط'],
  'places.linked_activity': ['Linked activity', 'النشاط المرتبط'],
  'places.hero_image': ['Hero image', 'الصورة الرئيسية'],
  'places.category_filters': ['Category (for filters)', 'التصنيف (للفلاتر)'],
  'places.event_starts': ['Event starts (Bali time)', 'بداية الفعالية (بتوقيت بالي)'],
  'places.event_starts_hint': [
    'Only for events on a set date (category “Events”). Leave empty for a permanent place.',
    'للفعاليات ذات التاريخ المحدد فقط (تصنيف «الفعاليات»). اتركه فارغاً لمكان دائم.',
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
    'One video link per line (YouTube, Vimeo or an .mp4 link).',
    'رابط فيديو واحد في كل سطر (YouTube أو Vimeo أو رابط ‎.mp4).',
  ],
  'places.internal_notes': ['Internal notes', 'ملاحظات داخلية'],
  'places.internal_notes_hint': [
    'Only your team sees these. Never shown on the website.',
    'يراها فريقك فقط، ولا تظهر في الموقع أبداً.',
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
    'The rating must be between 0 and 50 (0.0 to 5.0).',
    'يجب أن يكون التقييم بين 0 و50 (أي من 0.0 إلى 5.0).',
  ],
  'places.err_gone': ['That place no longer exists', 'هذا المكان لم يعد موجوداً'],
  'places.err_save_failed': ['Couldn’t save. Please try again.', 'تعذّر الحفظ. حاول مرة أخرى.'],
  'places.ok_saved': ['Place saved.', 'تم حفظ المكان.'],
  'places.ok_free': ['Place is now free to view.', 'أصبح المكان متاحاً مجاناً.'],
  'places.ok_locked': ['This place now needs a plan.', 'أصبح هذا المكان يتطلب باقة.'],
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
  'reviews.order_id': ['Order number', 'رقم الطلب'],
  'reviews.order_id_hint': [
    'Choose the order when the review comes from a real booking. It then shows as verified.',
    'حدّد الطلب عندما يأتي التقييم من حجز حقيقي، وسيظهر حينها كتقييم موثّق.',
  ],
  'reviews.copy': ['Copy', 'النصوص'],
  'reviews.author_country': ['Author country', 'بلد الكاتب'],
  'reviews.body': ['Body', 'النص'],
  'reviews.save': ['Save review', 'حفظ التقييم'],
  'reviews.archive': ['Archive', 'الأرشفة'],
  'reviews.archive_btn': ['Archive review', 'أرشفة التقييم'],
  'reviews.err_stars_range': ['Stars must be between 1 and 5', 'يجب أن يكون عدد النجوم بين 1 و5'],
  'reviews.err_gone': ['That review no longer exists', 'هذا التقييم لم يعد موجوداً'],
  'reviews.err_save_failed': ['Couldn’t save. Please try again.', 'تعذّر الحفظ. حاول مرة أخرى.'],
  'reviews.ok_saved': ['Review saved.', 'تم حفظ التقييم.'],
  'reviews.ok_published': ['Review published.', 'تم نشر التقييم.'],
  'reviews.ok_hidden': ['Review hidden.', 'تم إخفاء التقييم.'],
  'reviews.ok_archived': ['Review archived.', 'تمت أرشفة التقييم.'],

  // -------------------------------------------------------------------------
  // Taxonomy
  // -------------------------------------------------------------------------
  'taxonomy.title': ['Categories & regions', 'التصنيفات والمناطق'],
  'taxonomy.description': [
    'Categories, areas and tags used for filters and search. Something still in use can’t be deleted — move its items to another one first.',
    'التصنيفات والمناطق والوسوم المستخدمة في التصفية والبحث. لا يمكن حذف عنصر ما زال مستخدماً — انقل عناصره إلى عنصر آخر أولاً.',
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
  'taxonomy.key': ['Short code', 'رمز مختصر'],
  'taxonomy.label': ['Name', 'الاسم'],
  'taxonomy.icon': ['Icon', 'الأيقونة'],
  'taxonomy.sort_order': ['Sort order', 'ترتيب العرض'],
  'taxonomy.parent_area': ['Parent area', 'المنطقة الأم'],
  'taxonomy.add_new': ['Add new', 'إضافة جديد'],
  'taxonomy.key_placeholder': ['e.g. rice-terraces', 'مثل rice-terraces'],
  'taxonomy.err_number_range': [
    '{label} must be a number between {min} and {max}',
    'يجب أن يكون {label} رقماً بين {min} و{max}',
  ],
  'taxonomy.err_icon': [
    '“{icon}” isn’t one of the available icons.',
    '«{icon}» ليست من الأيقونات المتاحة.',
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
    'Items still in this region: {count}. Move them to another region first.',
    'عناصر ما زالت في هذه المنطقة: {count}. انقلها إلى منطقة أخرى أولاً.',
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
    'Every place on the map — including drafts, hidden places and paid places. Click a pin to edit the place.',
    'كل الأماكن على الخريطة — بما فيها المسودات والمخفية والمدفوعة. اضغط على أي دبوس لتعديل المكان.',
  ],
  'map.places_list': ['Places list', 'قائمة الأماكن'],
  'map.legend': ['Show', 'إظهار'],
  'map.legend_free': ['Free', 'مجاني'],
  'map.legend_locked': ['Paid (needs a plan)', 'مدفوع (يتطلب باقة)'],
  'map.legend_draft': ['Draft', 'مسودة'],
  'map.legend_hidden': ['Hidden', 'مخفي'],
  'map.count': ['{shown} of {total} places shown', 'يُعرض {shown} من {total} مكاناً'],
  'map.edit': ['edit', 'تعديل'],
  'map.loading': ['Loading the map…', 'جارٍ تحميل الخريطة…'],
  'map.failed': [
    'The map couldn’t load. Check your internet connection — the places list still works.',
    'تعذّر تحميل الخريطة. تحقّق من اتصال الإنترنت — قائمة الأماكن ما زالت تعمل.',
  ],
  'map.settings': ['Map settings', 'إعدادات الخريطة'],
  'map.settings_hint': [
    'These apply to the map on the website, the place editor and this page.',
    'تنطبق على الخريطة في الموقع وعلى محرر الأماكن وهذه الصفحة.',
  ],
  'map.satellite': ['Satellite imagery (optional)', 'صور القمر الصناعي (اختيارية)'],
  'map.satellite_intro': [
    'By default the website uses a free standard map. To show satellite photos instead, choose a provider, paste the key from your account with them, and tick the licence box.',
    'يستخدم الموقع افتراضياً خريطة عادية مجانية. لعرض صور القمر الصناعي بدلاً منها اختر مزوّداً، والصق المفتاح من حسابك لديه، وضع علامة على مربع الترخيص.',
  ],
  'map.sat_none': ['Standard map only (default)', 'الخريطة العادية فقط (الافتراضي)'],
  'map.sat_none_note': ['Free, no account needed.', 'مجانية ولا تحتاج إلى حساب.'],
  'map.sat_esri': ['Esri satellite photos', 'صور القمر الصناعي من Esri'],
  'map.sat_esri_note': [
    'Needs an Esri (ArcGIS) account. Free up to a monthly limit, then paid by usage.',
    'يتطلب حساباً لدى Esri (ArcGIS). مجاني حتى حد شهري، ثم يُدفع حسب الاستخدام.',
  ],
  'map.sat_mapbox': ['Mapbox satellite photos', 'صور القمر الصناعي من Mapbox'],
  'map.sat_mapbox_note': [
    'Needs a Mapbox account. Free up to a monthly limit, then paid by usage. The Mapbox logo is shown on the map.',
    'يتطلب حساباً لدى Mapbox. مجاني حتى حد شهري، ثم يُدفع حسب الاستخدام. يظهر شعار Mapbox على الخريطة.',
  ],
  'map.esri_key': ['Esri key', 'مفتاح Esri'],
  'map.esri_key_hint': [
    'Copy it from your Esri account. Ask your technical team to limit it to this website.',
    'انسخه من حسابك لدى Esri. اطلب من فريقك التقني أن يقصره على هذا الموقع.',
  ],
  'map.mapbox_token': ['Mapbox key', 'مفتاح Mapbox'],
  'map.mapbox_token_hint': [
    'Copy the public key (it starts with pk.) from your Mapbox account. Ask your technical team to limit it to this website.',
    'انسخ المفتاح العام (يبدأ بـ pk.) من حسابك لدى Mapbox. اطلب من فريقك التقني أن يقصره على هذا الموقع.',
  ],
  'map.licence_confirm': [
    'I confirm we have a paid plan or licence with this provider that allows business use.',
    'أؤكد أن لدينا باقة أو ترخيصاً لدى هذا المزوّد يسمح بالاستخدام التجاري.',
  ],
  'map.keys_public': [
    'Only paste the public key meant for websites — never a private or secret key.',
    'الصق فقط المفتاح العام المخصص للمواقع — لا تلصق أبداً مفتاحاً خاصاً أو سرياً.',
  ],
  'map.sat_status_off': [
    'Satellite photos are off: the standard map is shown.',
    'صور القمر الصناعي متوقفة: تُعرض الخريطة العادية.',
  ],
  'map.sat_status_inactive': [
    'Satellite photos are NOT showing — the key or the licence tick is missing, so the standard map is shown.',
    'صور القمر الصناعي لا تظهر — ينقص المفتاح أو علامة الترخيص، لذا تُعرض الخريطة العادية.',
  ],
  'map.sat_status_on': [
    'Satellite is active: {provider}.',
    'صور القمر الصناعي مفعّلة: {provider}.',
  ],
  'map.exaggeration': ['Mountain height effect', 'إبراز ارتفاع الجبال'],
  'map.exaggeration_hint': [
    '{min} = real height, up to {max} for more dramatic mountains.',
    '{min} = الارتفاع الحقيقي، وحتى {max} لجبال أكثر بروزاً.',
  ],
  'map.tilt': ['Map tilt when opened (degrees)', 'ميل الخريطة عند فتحها (بالدرجات)'],
  'map.tilt_hint': [
    '{min} = looking straight down, up to {max}.',
    '{min} = النظر من الأعلى مباشرة، وحتى {max}.',
  ],
  'map.save': ['Save map settings', 'حفظ إعدادات الخريطة'],
  'map.ok_saved': ['Map settings saved.', 'تم حفظ إعدادات الخريطة.'],
  'media.svg_pill': ['drawing', 'رسم'],
  'places.required_map': ['Map plan', 'باقة الخريطة'],
  'places.required_vip': ['VIP plan', 'باقة VIP'],
  'media.reject_unreadable': [
    'it isn’t a JPEG, PNG or WebP photo, or the file is damaged. Save or export it again as JPEG and try once more.',
    'ليست صورة بصيغة JPEG أو PNG أو WebP، أو أن الملف تالف. احفظها أو صدّرها من جديد بصيغة JPEG وحاول مرة أخرى.',
  ],
  'media.reject_too_large': [
    'the file is {size} and the limit is {max}. Make the photo smaller and try again.',
    'حجم الملف {size} والحد الأقصى {max}. صغّر الصورة وحاول مرة أخرى.',
  ],
  'media.reject_too_narrow': [
    'the photo is only {width} pixels wide; it needs to be at least {min}. Please use a larger photo.',
    'عرض الصورة {width} بكسل فقط، ويجب ألا يقل عن {min}. استخدم صورة أكبر.',
  ],
  'media.reject_too_many_pixels': [
    'the photo’s resolution is too high. Resize it (for example to 4000 pixels wide) and try again.',
    'دقة الصورة عالية جداً. صغّر أبعادها (مثلاً إلى عرض 4000 بكسل) وحاول مرة أخرى.',
  ],
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
