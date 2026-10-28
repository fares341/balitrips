import type { Section } from './types'

/**
 * Studio strings — owner questions (Oct 2026): the operations guide, launch
 * readiness, bookings waiting for the operator, mobile orders and the
 * activity operator / contract. Keys `oo.*` (plus two `nav.*`); en and ar
 * hold the same keys.
 */
const section: Section = {
  en: {
    'nav.guide': 'Operations guide',
    'nav.readiness': 'Content readiness',

    'oo.left': '{d}d {h}h',
    'oo.guide_link': 'Operations guide',

    'oo.d_att_supplier': 'Bookings waiting for the operator',
    'oo.d_att_supplier_hint':
      'The card is held, not charged. Confirm with the operator, then charge or release. Released automatically after {days} days.',
    'oo.d_wait_title': 'Waiting for the operator',
    'oo.d_wait_hint':
      'Each booking below has the amount held on the card. Confirm with the operator, then open it and charge or release. Without a decision it is released automatically {days} days after payment.',
    'oo.d_wait_all': 'All {n} waiting bookings',

    'oo.o_quick': 'Quick filters',
    'oo.o_waiting': 'Waiting for operator',
    'oo.o_paid': 'Paid — to confirm',
    'oo.o_all': 'All orders',
    'oo.o_release_in': 'Auto-release in {left}',
    'oo.o_after_capture':
      'After charging, the order is «paid»: press «Confirm order» below once the booking is in hand — the customer then gets the confirmation (and the WhatsApp message, if switched on).',

    'oo.guide_title': 'Operations guide',
    'oo.guide_desc':
      'How a booking and a custom trip run, step by step — what the team does and what happens on its own.',
    'oo.guide_to_orders': 'Go to orders',
    'oo.guide_toc': 'On this page',
    'oo.guide_booking': 'Ready bookings (activities, packages, driver)',
    'oo.guide_custom': 'Custom trips',
    'oo.guide_buttons': 'The buttons on an order',
    'oo.guide_booking_intro':
      'The customer is never charged before the operator confirms: at checkout the amount is only held on the card. The team has {days} days to charge it or release it.',
    'oo.guide_custom_intro':
      'A custom trip is a request first. It becomes a sale when the team sets a price and the customer pays it; then the team prepares and uploads the plan.',
    'oo.g_who_customer': 'Customer',
    'oo.g_who_team': 'Team',
    'oo.g_who_auto': 'Automatic',
    'oo.g_b1_t': 'The customer books and pays',
    'oo.g_b1_b':
      'The amount is held on the card, not charged. The order shows as «Held — awaiting supplier».',
    'oo.g_b2_t': 'The team is alerted',
    'oo.g_b2_b':
      'An email goes to the team (STAFF_ALERT_EMAILS, else the admins) and, if a team alerts number is set in Studio → WhatsApp with Mazbot connected, a WhatsApp message. The booking appears on the dashboard with the time left.',
    'oo.g_b2_link': 'Bookings waiting now',
    'oo.g_b3_t': 'Confirm with the operator',
    'oo.g_b3_b':
      'Call or message the operator (their contact is in the activity editor → Operator) and check the date, time and number of people.',
    'oo.g_b4_t': 'Operator says yes: «Supplier confirmed — charge»',
    'oo.g_b4_b':
      'The held amount is charged and the order becomes «paid»: the bookings go to their supplier and the invoice number is issued. If the charge fails, nothing changes and you can try again.',
    'oo.g_b5_t': 'Then «Confirm order»',
    'oo.g_b5_b':
      'The order becomes «confirmed» and the customer is told (on the site and by email; by WhatsApp «booking confirmed» if that automation is on). You can also record the operator’s confirmation per line with its reference.',
    'oo.g_b6_t': 'Operator says no: «Supplier refused — release»',
    'oo.g_b6_b':
      'The hold is cancelled — nothing is charged — the order is cancelled, its availability returned and the customer told.',
    'oo.g_b7_t': 'No decision: reminders, then automatic release',
    'oo.g_b7_b':
      'The team is reminded after 24 hours and again after 4 days. After {days} days without a decision the hold is released automatically (card holds expire after about 7 days), exactly like «release».',
    'oo.g_b8_t': 'Before and after the trip',
    'oo.g_b8_b':
      'With WhatsApp automations switched on (Studio → WhatsApp) and the customer’s consent: a reminder about 24 hours before the start, a thank-you the evening of the last day, and a review request the next morning.',
    'oo.g_b8_link': 'WhatsApp settings',
    'oo.g_c1_t': 'The customer sends a request',
    'oo.g_c1_b':
      'From the custom-trip page. The team gets an alert and it appears in Leads as «New».',
    'oo.g_c2_t': 'Review it in Leads',
    'oo.g_c2_b': 'Open the request, contact the customer if needed and move it to «Under review».',
    'oo.g_c2_link': 'New requests',
    'oo.g_c3_t': 'Set the price (quote)',
    'oo.g_c3_b':
      'A manager (admin) sets the price on the request. The customer is told and sees a «Pay» button in their account. The request must be linked to the customer’s account.',
    'oo.g_c4_t': 'The customer pays',
    'oo.g_c4_b':
      'Charged at once (nothing to confirm with an operator). The request moves to «In progress».',
    'oo.g_c5_t': 'Upload the plan (PDF)',
    'oo.g_c5_b':
      'Upload the plan on the request. The customer is told and can read it in their account; you can also send the link by WhatsApp. The request becomes «Waiting for the customer».',
    'oo.g_c6_t': 'Mark it completed',
    'oo.g_c6_b':
      'When the customer is happy, set the status to «Completed». If the WhatsApp automation «custom itinerary ready» is on, the customer gets that message.',
    'oo.g_btn_capture_t': 'Supplier confirmed — charge',
    'oo.g_btn_capture_b': 'Charges the held amount. Only for orders still waiting.',
    'oo.g_btn_release_t': 'Supplier refused — release',
    'oo.g_btn_release_b':
      'Cancels the hold, nothing is charged, the order is cancelled and the customer told.',
    'oo.g_btn_confirm_t': 'Confirm order',
    'oo.g_btn_confirm_b': 'For a paid order: marks it confirmed and tells the customer.',
    'oo.g_btn_line_t': 'Supplier confirmation per line',
    'oo.g_btn_line_b':
      'In «Suppliers» on the order: record the operator’s reference for one activity, optionally telling the customer.',
    'oo.g_btn_digital_t': 'Itineraries and map plans',
    'oo.g_btn_digital_b':
      'Digital products are charged at once — no operator step, no {days}-day hold.',

    'oo.r_title': 'Content readiness',
    'oo.r_desc':
      'What is still missing before launch. Each line links to where it is fixed. The photo list downloads as a CSV for the trip to Bali.',
    'oo.r_export': 'Photo-trip list (CSV)',
    'oo.r_summary': 'Checklist',
    'oo.r_ok': 'Ready',
    'oo.r_todo': 'To do',
    'oo.r_open': 'Open',
    'oo.r_photos': '{n} of {total} published places have no photo',
    'oo.r_activities':
      '{n} of {total} activities are missing packages, a price, a meeting point, a duration or a photo',
    'oo.r_itineraries': '{n} of {total} itineraries have no level prices',
    'oo.r_packages_ok': '{n} packages published',
    'oo.r_packages_none': 'No package is published — the Packages section is hidden from the site',
    'oo.r_blog_ok': '{n} articles published',
    'oo.r_blog_none': 'No article is published — the blog is hidden from the site',
    'oo.r_visa_ok': 'Visa price is set',
    'oo.r_visa_none': 'Visa price is not set (Configuration → Home page)',
    'oo.r_guide_ok': 'Every free-guide category has places',
    'oo.r_guide_empty': 'Free-guide categories with no places (hidden on the home page): {list}',
    'oo.r_public_note':
      'Empty sections hide themselves on the site (packages, blog, empty guide cards and areas) and come back on their own once content is published.',
    'oo.r_places_title': 'Places without photos ({n})',
    'oo.r_act_title': 'Activities with gaps ({n})',
    'oo.r_it_title': 'Itineraries without level prices ({n})',
    'oo.r_it_gap': 'Economy / mid / luxury prices empty',
    'oo.r_gap_packages': 'No packages',
    'oo.r_gap_price': 'No price',
    'oo.r_gap_meeting': 'No meeting point',
    'oo.r_gap_duration': 'No duration',
    'oo.r_gap_photo': 'No photo',
    'oo.r_none_left': 'Nothing missing here.',
    'oo.r_more': 'And {n} more — all of them are in the CSV.',
    'oo.csv_area': 'Area',
    'oo.csv_type': 'Type',
    'oo.csv_name': 'Name',
    'oo.csv_needs': 'Needs',
    'oo.csv_link': 'Studio link',
    'oo.csv_place': 'Place',
    'oo.csv_activity': 'Activity',
    'oo.csv_need_photo': 'Photos',
    'oo.csv_need_photo_video': 'Photos + video',

    'oo.op_private':
      'Staff only. Nothing on this tab is ever shown on the website, and the contract file has no public link.',
    'oo.op_details': 'Operator',
    'oo.op_name': 'Operator name',
    'oo.op_contact': 'Contact person',
    'oo.op_phone': 'Phone / WhatsApp',
    'oo.op_phone_hint': 'With the country code, e.g. +62 812…',
    'oo.op_email': 'Email',
    'oo.op_commission': 'Commission / net price notes',
    'oo.op_commission_hint': 'What we pay the operator and our margin, as agreed.',
    'oo.op_cancellation': 'Operator cancellation terms',
    'oo.op_save': 'Save operator',
    'oo.op_contract': 'Contract (PDF)',
    'oo.op_download': 'Download {name}',
    'oo.op_remove': 'Remove',
    'oo.op_no_contract': 'No contract uploaded yet.',
    'oo.op_upload': 'Contract file',
    'oo.op_upload_hint': 'PDF, up to 15 MB. Kept in private storage.',
    'oo.op_upload_btn': 'Upload contract',
    'oo.op_replace': 'Replace contract',
    'oo.op_summary': 'Contract summary',
    'oo.op_summarize': 'Summarise the contract',
    'oo.op_no_ai':
      'The AI summary needs the OpenRouter key (OPENROUTER_API_KEY) on the server. Ask the developer to set it; until then the button is off.',
    'oo.op_ai_note':
      'Generated by AI from the contract text. It can miss or misread clauses — check it against the contract before relying on it.',
    'oo.op_s_prices': 'Prices / net / commission',
    'oo.op_s_paymentTerms': 'Payment terms',
    'oo.op_s_cancellation': 'Cancellation and refunds',
    'oo.op_s_liabilities': 'Liabilities and insurance',
    'oo.op_s_duration': 'Duration and renewal',
    'oo.op_s_redFlags': 'Points to check',
    'oo.op_s_other': 'Other',
    'oo.op_summary_meta': 'Model: {model} ·',
    'oo.op_summary_none': 'No summary yet. Press «Summarise the contract».',
    'oo.op_summary_need_file': 'Upload the contract first.',
    'oo.op_err_role': 'Your role cannot see operator contracts.',
    'oo.op_err_email': 'That email address does not look right.',
    'oo.op_err_choose': 'Choose a PDF file.',
    'oo.op_err_large': 'The file is larger than 15 MB.',
    'oo.op_err_pdf': 'That file is not a PDF.',
    'oo.op_err_storage':
      'Private storage is not configured on the server, so the contract cannot be kept safely.',
    'oo.op_err_no_ai': 'No AI key is configured on the server (OPENROUTER_API_KEY).',
    'oo.op_err_no_contract': 'Upload the contract first.',
    'oo.op_err_read': 'The contract file could not be read.',
    'oo.op_err_scanned':
      'The PDF has no readable text (probably a scan). Ask the operator for a text PDF or summarise it by hand.',
    'oo.op_err_ai': 'The AI summary failed ({code}). Try again in a minute.',
    'oo.op_ok_saved': 'Operator saved.',
    'oo.op_ok_uploaded': 'Contract uploaded.',
    'oo.op_ok_removed': 'Contract removed.',
    'oo.op_ok_summary': 'Summary ready — check it against the contract.',
  },
  ar: {
    'nav.guide': 'دليل التشغيل',
    'nav.readiness': 'جاهزية المحتوى',

    'oo.left': '{d} يوم {h} ساعة',
    'oo.guide_link': 'دليل التشغيل',

    'oo.d_att_supplier': 'حجوزات بانتظار تأكيد المشغّل',
    'oo.d_att_supplier_hint':
      'المبلغ محجوز على البطاقة ولم يُسحب. أكّد مع المشغّل ثم اسحب أو فُك الحجز. يُفك تلقائيًا بعد {days} أيام.',
    'oo.d_wait_title': 'بانتظار تأكيد المشغّل',
    'oo.d_wait_hint':
      'كل حجز هنا مبلغه محجوز على البطاقة. أكّد مع المشغّل ثم افتحه واسحب المبلغ أو فُك الحجز. بلا قرار يُفك تلقائيًا بعد {days} أيام من الدفع.',
    'oo.d_wait_all': 'كل الحجوزات المنتظرة ({n})',

    'oo.o_quick': 'تصفية سريعة',
    'oo.o_waiting': 'بانتظار المشغّل',
    'oo.o_paid': 'مدفوعة — للتأكيد',
    'oo.o_all': 'كل الطلبات',
    'oo.o_release_in': 'فك تلقائي بعد {left}',
    'oo.o_after_capture':
      'بعد السحب يصبح الطلب «مدفوعًا»: اضغط «تأكيد الطلب» بالأسفل عندما يصبح الحجز مؤكدًا — فيصل العميلَ التأكيد (ورسالة واتساب إن كانت مفعّلة).',

    'oo.guide_title': 'دليل التشغيل',
    'oo.guide_desc':
      'كيف يسير الحجز والرحلة المخصصة خطوة بخطوة — ما يفعله الفريق وما يحدث تلقائيًا.',
    'oo.guide_to_orders': 'إلى الطلبات',
    'oo.guide_toc': 'في هذه الصفحة',
    'oo.guide_booking': 'الحجوزات الجاهزة (الأنشطة والباقات والسائق)',
    'oo.guide_custom': 'الرحلات المخصصة',
    'oo.guide_buttons': 'أزرار صفحة الطلب',
    'oo.guide_booking_intro':
      'لا يُخصم من العميل شيء قبل تأكيد المشغّل: عند الدفع يُحجز المبلغ على البطاقة فقط. أمام الفريق {days} أيام لسحبه أو فك الحجز.',
    'oo.guide_custom_intro':
      'الرحلة المخصصة طلبٌ أولًا، وتصبح بيعًا عندما يحدد الفريق السعر ويدفعه العميل، ثم يجهّز الفريق الجدول ويرفعه.',
    'oo.g_who_customer': 'العميل',
    'oo.g_who_team': 'الفريق',
    'oo.g_who_auto': 'تلقائي',
    'oo.g_b1_t': 'العميل يحجز ويدفع',
    'oo.g_b1_b': 'يُحجز المبلغ على البطاقة ولا يُسحب. يظهر الطلب بحالة «محجوز — بانتظار المورد».',
    'oo.g_b2_t': 'تنبيه الفريق',
    'oo.g_b2_b':
      'يصل بريد للفريق (STAFF_ALERT_EMAILS وإلا المدراء)، ورسالة واتساب إن ضُبط «رقم تنبيهات الفريق» في Studio ← واتساب مع ربط Mazbot. ويظهر الحجز في الرئيسية مع الوقت المتبقي.',
    'oo.g_b2_link': 'الحجوزات المنتظرة الآن',
    'oo.g_b3_t': 'التأكيد مع المشغّل',
    'oo.g_b3_b':
      'اتصل بالمشغّل أو راسله (بياناته في محرر النشاط ← المشغّل) وتحقق من التاريخ والوقت وعدد الأشخاص.',
    'oo.g_b4_t': 'المشغّل وافق: «أكد المورد — اسحب المبلغ»',
    'oo.g_b4_b':
      'يُسحب المبلغ المحجوز ويصبح الطلب «مدفوعًا»: تذهب الحجوزات إلى المورد ويصدر رقم الفاتورة. إن فشل السحب لا يتغير شيء ويمكنك المحاولة مجددًا.',
    'oo.g_b5_t': 'ثم «تأكيد الطلب»',
    'oo.g_b5_b':
      'يصبح الطلب «مؤكدًا» ويُبلَّغ العميل (في الموقع وبالبريد، وبواتساب «تم تأكيد الحجز» إن كانت الرسالة مفعّلة). ويمكنك أيضًا تسجيل تأكيد المشغّل لكل بند مع رقمه المرجعي.',
    'oo.g_b6_t': 'المشغّل رفض: «رفض المورد — فُك الحجز»',
    'oo.g_b6_b':
      'يُلغى الحجز على البطاقة — لا يُخصم شيء — ويُلغى الطلب وتعود سعته ويُبلَّغ العميل.',
    'oo.g_b7_t': 'بلا قرار: تذكير ثم فك تلقائي',
    'oo.g_b7_b':
      'يُذكَّر الفريق بعد 24 ساعة ثم بعد 4 أيام. بعد {days} أيام بلا قرار يُفك الحجز تلقائيًا (حجز البطاقة ينتهي بعد نحو 7 أيام)، تمامًا مثل «فُك الحجز».',
    'oo.g_b8_t': 'قبل الرحلة وبعدها',
    'oo.g_b8_b':
      'عند تفعيل رسائل واتساب التلقائية (Studio ← واتساب) وبموافقة العميل: تذكير قبل البداية بنحو 24 ساعة، وشكر مساء آخر يوم، وطلب تقييم صباح اليوم التالي.',
    'oo.g_b8_link': 'إعدادات واتساب',
    'oo.g_c1_t': 'العميل يرسل طلبًا',
    'oo.g_c1_b':
      'من صفحة الرحلة المخصصة. يصل تنبيه للفريق ويظهر الطلب في «العملاء المحتملون» بحالة «جديد».',
    'oo.g_c2_t': 'مراجعته في العملاء المحتملين',
    'oo.g_c2_b': 'افتح الطلب، وتواصل مع العميل عند الحاجة، وانقله إلى «تحت المراجعة».',
    'oo.g_c2_link': 'الطلبات الجديدة',
    'oo.g_c3_t': 'تحديد السعر (عرض السعر)',
    'oo.g_c3_b':
      'يحدد المدير السعر على الطلب، فيُبلَّغ العميل ويظهر له زر «ادفع» في حسابه. يجب أن يكون الطلب مربوطًا بحساب العميل.',
    'oo.g_c4_t': 'العميل يدفع',
    'oo.g_c4_b': 'يُسحب المبلغ فورًا (لا تأكيد مع مشغّل)، وينتقل الطلب إلى «قيد التنفيذ».',
    'oo.g_c5_t': 'رفع الجدول (PDF)',
    'oo.g_c5_b':
      'ارفع الجدول على الطلب، فيُبلَّغ العميل ويقرؤه في حسابه، ويمكنك إرسال الرابط بواتساب أيضًا. تصبح حالة الطلب «بانتظار رد العميل».',
    'oo.g_c6_t': 'إغلاقه كمكتمل',
    'oo.g_c6_b':
      'عندما يرضى العميل اجعل الحالة «مكتمل». إن كانت رسالة واتساب «الجدول المخصص جاهز» مفعّلة تصله.',
    'oo.g_btn_capture_t': 'أكد المورد — اسحب المبلغ',
    'oo.g_btn_capture_b': 'يسحب المبلغ المحجوز. للطلبات المنتظرة فقط.',
    'oo.g_btn_release_t': 'رفض المورد — فُك الحجز',
    'oo.g_btn_release_b': 'يلغي الحجز على البطاقة بلا خصم، ويلغي الطلب ويبلّغ العميل.',
    'oo.g_btn_confirm_t': 'تأكيد الطلب',
    'oo.g_btn_confirm_b': 'للطلب المدفوع: يجعله مؤكدًا ويبلّغ العميل.',
    'oo.g_btn_line_t': 'تأكيد المورد لكل بند',
    'oo.g_btn_line_b':
      'في قسم «الموردون» داخل الطلب: سجّل رقم المشغّل المرجعي لنشاط واحد، مع إبلاغ العميل اختياريًا.',
    'oo.g_btn_digital_t': 'الجداول وباقات الخريطة',
    'oo.g_btn_digital_b': 'المنتجات الرقمية تُسحب فورًا — لا خطوة مشغّل ولا حجز {days} أيام.',

    'oo.r_title': 'جاهزية المحتوى',
    'oo.r_desc':
      'ما ينقص قبل الإطلاق. كل سطر يوصلك لمكان إصلاحه، وقائمة التصوير تُنزَّل CSV لرحلة بالي.',
    'oo.r_export': 'قائمة التصوير للرحلة (CSV)',
    'oo.r_summary': 'قائمة التحقق',
    'oo.r_ok': 'جاهز',
    'oo.r_todo': 'ناقص',
    'oo.r_open': 'افتح',
    'oo.r_photos': '{n} من {total} مكانًا منشورًا بلا صور',
    'oo.r_activities': '{n} من {total} نشاطًا ينقصها باقات أو سعر أو نقطة لقاء أو مدة أو صورة',
    'oo.r_itineraries': '{n} من {total} جدولًا بلا أسعار المستويات',
    'oo.r_packages_ok': '{n} باقة منشورة',
    'oo.r_packages_none': 'لا توجد باقة منشورة — قسم الباقات مخفي من الموقع',
    'oo.r_blog_ok': '{n} مقالًا منشورًا',
    'oo.r_blog_none': 'لا يوجد مقال منشور — المدونة مخفية من الموقع',
    'oo.r_visa_ok': 'سعر الفيزا مضبوط',
    'oo.r_visa_none': 'سعر الفيزا غير مضبوط (الإعدادات ← الصفحة الرئيسية)',
    'oo.r_guide_ok': 'كل فئات الدليل المجاني فيها أماكن',
    'oo.r_guide_empty': 'فئات في الدليل المجاني بلا أماكن (مخفية من الرئيسية): {list}',
    'oo.r_public_note':
      'الأقسام الفارغة تختفي من الموقع تلقائيًا (الباقات والمدونة وبطاقات الدليل والمناطق الفارغة) وتعود وحدها عند نشر المحتوى.',
    'oo.r_places_title': 'أماكن بلا صور ({n})',
    'oo.r_act_title': 'أنشطة ينقصها شيء ({n})',
    'oo.r_it_title': 'جداول بلا أسعار المستويات ({n})',
    'oo.r_it_gap': 'أسعار الاقتصادي/المتوسط/الفاخر فارغة',
    'oo.r_gap_packages': 'بلا باقات',
    'oo.r_gap_price': 'بلا سعر',
    'oo.r_gap_meeting': 'بلا نقطة لقاء',
    'oo.r_gap_duration': 'بلا مدة',
    'oo.r_gap_photo': 'بلا صورة',
    'oo.r_none_left': 'لا شيء ناقص هنا.',
    'oo.r_more': 'و{n} غيرها — كلها في ملف CSV.',
    'oo.csv_area': 'المنطقة',
    'oo.csv_type': 'النوع',
    'oo.csv_name': 'الاسم',
    'oo.csv_needs': 'المطلوب',
    'oo.csv_link': 'رابط الاستوديو',
    'oo.csv_place': 'مكان',
    'oo.csv_activity': 'نشاط',
    'oo.csv_need_photo': 'صور',
    'oo.csv_need_photo_video': 'صور + فيديو',

    'oo.op_private': 'للفريق فقط. لا يظهر شيء من هذا القسم في الموقع، وملف العقد بلا رابط عام.',
    'oo.op_details': 'المشغّل',
    'oo.op_name': 'اسم المشغّل',
    'oo.op_contact': 'الشخص المسؤول',
    'oo.op_phone': 'الهاتف / واتساب',
    'oo.op_phone_hint': 'مع رمز الدولة، مثل ‎+62 812…',
    'oo.op_email': 'البريد الإلكتروني',
    'oo.op_commission': 'ملاحظات العمولة / السعر الصافي',
    'oo.op_commission_hint': 'ما ندفعه للمشغّل وهامشنا حسب الاتفاق.',
    'oo.op_cancellation': 'شروط الإلغاء لدى المشغّل',
    'oo.op_save': 'حفظ المشغّل',
    'oo.op_contract': 'العقد (PDF)',
    'oo.op_download': 'تنزيل {name}',
    'oo.op_remove': 'حذف',
    'oo.op_no_contract': 'لم يُرفع عقد بعد.',
    'oo.op_upload': 'ملف العقد',
    'oo.op_upload_hint': 'PDF حتى 15 ميغابايت. يُحفظ في تخزين خاص.',
    'oo.op_upload_btn': 'رفع العقد',
    'oo.op_replace': 'استبدال العقد',
    'oo.op_summary': 'ملخص العقد',
    'oo.op_summarize': 'تلخيص العقد',
    'oo.op_no_ai':
      'التلخيص بالذكاء الاصطناعي يحتاج مفتاح OpenRouter ‏(OPENROUTER_API_KEY) على الخادم. اطلب من المطوّر ضبطه؛ حتى ذلك الحين الزر معطّل.',
    'oo.op_ai_note':
      'مُولَّد بالذكاء الاصطناعي من نص العقد، وقد يُغفل بندًا أو يسيء فهمه — راجِعه مع العقد قبل الاعتماد عليه.',
    'oo.op_s_prices': 'الأسعار / الصافي / العمولة',
    'oo.op_s_paymentTerms': 'شروط الدفع',
    'oo.op_s_cancellation': 'الإلغاء والاسترداد',
    'oo.op_s_liabilities': 'المسؤوليات والتأمين',
    'oo.op_s_duration': 'المدة والتجديد',
    'oo.op_s_redFlags': 'نقاط تحتاج انتباهًا',
    'oo.op_s_other': 'أخرى',
    'oo.op_summary_meta': 'النموذج: {model} ·',
    'oo.op_summary_none': 'لا يوجد ملخص بعد. اضغط «تلخيص العقد».',
    'oo.op_summary_need_file': 'ارفع العقد أولًا.',
    'oo.op_err_role': 'دورك لا يسمح بالاطلاع على عقود المشغّلين.',
    'oo.op_err_email': 'عنوان البريد غير صحيح.',
    'oo.op_err_choose': 'اختر ملف PDF.',
    'oo.op_err_large': 'الملف أكبر من 15 ميغابايت.',
    'oo.op_err_pdf': 'هذا الملف ليس PDF.',
    'oo.op_err_storage': 'التخزين الخاص غير مضبوط على الخادم، فلا يمكن حفظ العقد بأمان.',
    'oo.op_err_no_ai': 'لا يوجد مفتاح ذكاء اصطناعي على الخادم (OPENROUTER_API_KEY).',
    'oo.op_err_no_contract': 'ارفع العقد أولًا.',
    'oo.op_err_read': 'تعذّرت قراءة ملف العقد.',
    'oo.op_err_scanned':
      'ملف PDF بلا نص مقروء (غالبًا صورة ممسوحة). اطلب من المشغّل نسخة نصية أو لخّصه يدويًا.',
    'oo.op_err_ai': 'فشل التلخيص ({code}). حاول بعد دقيقة.',
    'oo.op_ok_saved': 'حُفظ المشغّل.',
    'oo.op_ok_uploaded': 'رُفع العقد.',
    'oo.op_ok_removed': 'حُذف العقد.',
    'oo.op_ok_summary': 'الملخص جاهز — راجعه مع العقد.',
  },
}

export default section
