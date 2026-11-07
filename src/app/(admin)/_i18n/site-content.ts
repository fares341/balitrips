import type { Messages, Section } from './types'

/**
 * Studio strings — «محتوى الموقع» (every public page editable), live
 * «الترجمات», packages order, WhatsApp STOP (Nov 2026). [en, ar] pairs.
 */
const PAIRS: Record<string, readonly [en: string, ar: string]> = {
  'nav.group_site': ['Site content', 'محتوى الموقع'],
  'nav.site_content': ['Site pages', 'صفحات الموقع'],

  // Translations (live)
  'tr2.description': [
    'Every text on the public site, in Arabic, English and Indonesian. A saved change shows on the site within seconds; untouched texts keep the built-in wording.',
    'كل نصوص الموقع العام بالعربية والإنجليزية والإندونيسية. أي تعديل تحفظه يظهر في الموقع خلال ثوانٍ، والنصوص التي لم تُعدَّل تبقى كما هي.',
  ],
  'tr2.stat_edited': ['Edited texts', 'نصوص معدّلة'],
  'tr2.search_placeholder': ['Search a word or a key…', 'ابحث بكلمة أو بالمفتاح…'],
  'tr2.show_edited': ['Edited only', 'المعدّلة فقط'],
  'tr2.edited_pill': ['Edited', 'معدّل'],
  'tr2.diff': ['Show the difference from the original', 'عرض الفرق عن النص الأصلي'],
  'tr2.reset_key': ['Back to the original text', 'إرجاع للنص الأصلي'],
  'tr2.ok_saved': [
    'Saved “{key}”. It is live on the site.',
    'تم حفظ «{key}» وهو ظاهر الآن في الموقع.',
  ],
  'tr2.ok_reset': ['“{key}” is back to the original text.', 'رجع «{key}» إلى النص الأصلي.'],
  'tr2.ok_nothing': ['Nothing changed.', 'لا يوجد تغيير.'],
  'tr2.err_unknown_key': ['“{key}” is not a text of the site.', '«{key}» ليس من نصوص الموقع.'],
  'tr2.err_placeholder': [
    '“{key}” ({lang}): a word in braces was added that the original does not have. Keep the braces parts exactly as in the original.',
    '«{key}» ({lang}): أضفت كلمة بين أقواس { } غير موجودة في النص الأصلي. أبقِ فقط الأجزاء التي بين الأقواس كما هي.',
  ],
  'tr2.err_braces': [
    '“{key}” ({lang}): the { } braces do not match. Keep them exactly as in the original.',
    '«{key}» ({lang}): الأقواس { } غير مكتملة. أبقِها كما في النص الأصلي.',
  ],
  'tr2.err_too_long': ['“{key}” ({lang}) is too long.', '«{key}» ({lang}) طويل جداً.'],

  // Site content
  'sc.title': ['Site pages', 'صفحات الموقع'],
  'sc.description': [
    'Change the texts, photos and sections of every public page. Empty fields keep the built-in content.',
    'غيّر نصوص وصور وأقسام كل صفحة في الموقع. الحقل الفارغ يُبقي المحتوى الأصلي.',
  ],
  'sc.home_hint': ['Hero, services, about, reviews…', 'الواجهة، الخدمات، من نحن، التقييمات…'],
  'sc.translations_hint': [
    'Any other text of the site, searchable.',
    'أي نص آخر في الموقع، مع البحث.',
  ],
  'sc.hidden_n': ['{n} hidden', '{n} مخفي'],
  'sc.back': ['All pages', 'كل الصفحات'],
  'sc.preview': ['View the page', 'عرض الصفحة'],
  'sc.save': ['Save', 'حفظ'],
  'sc.ok_saved': [
    'Saved. The site shows it within seconds.',
    'تم الحفظ، ويظهر في الموقع خلال ثوانٍ.',
  ],
  'sc.slot': ['Photo: {name}', 'صورة: {name}'],
  'sc.err_href': [
    '“{href}” is not a valid link. Use a site path like /activities or a full https:// address.',
    '«{href}» ليس رابطاً صحيحاً. استخدم مساراً مثل /activities أو عنواناً كاملاً يبدأ بـ https://',
  ],
  'sc.page_about': ['About us', 'من نحن'],
  'sc.page_about_hint': [
    'Story, vision, what makes us different, trust.',
    'القصة، الرؤية، ما يميزنا، الثقة.',
  ],
  'sc.page_services': ['Services', 'الخدمات'],
  'sc.page_services_hint': [
    'The banner, the service cards and how it works.',
    'البانر وبطاقات الخدمات وطريقة العمل.',
  ],
  'sc.page_custom': ['Design your trip', 'صمّم رحلتك'],
  'sc.page_custom_hint': ['The banner and the “how it works” steps.', 'البانر وخطوات «كيف تعمل».'],
  'sc.page_contact': ['Contact us', 'اتصل بنا'],
  'sc.page_contact_hint': [
    'WhatsApp number, email, offices, hours and the page texts.',
    'رقم واتساب والبريد والمكاتب وساعات العمل ونصوص الصفحة.',
  ],
  'sc.page_faq': ['FAQ', 'الأسئلة الشائعة'],
  'sc.page_faq_hint': [
    'Add, edit, reorder or hide questions.',
    'أضف الأسئلة أو عدّلها أو رتّبها أو أخفِها.',
  ],
  'sc.page_help': ['Help centre', 'مركز المساعدة'],
  'sc.page_help_hint': ['Topics and the help cards.', 'المواضيع وبطاقات المساعدة.'],
  'sc.page_platform-use': ['Platform use policy', 'سياسة استخدام المنصة'],
  'sc.page_platform-use_hint': [
    'Title and every section of the policy.',
    'العنوان وكل أقسام السياسة.',
  ],
  'sc.page_map-use': ['Map use policy', 'سياسة استخدام الخريطة'],
  'sc.page_map-use_hint': ['Title and every section of the policy.', 'العنوان وكل أقسام السياسة.'],
  'sc.page_payment-methods': ['Payment methods', 'طرق الدفع'],
  'sc.page_payment-methods_hint': [
    'The methods and the refund note.',
    'طرق الدفع وملاحظة الاسترداد.',
  ],
  'sc.page_credits': ['Image credits', 'حقوق الصور'],
  'sc.page_credits_hint': [
    'Page texts (the list itself comes from the media library credits).',
    'نصوص الصفحة (القائمة نفسها من حقوق الصور في مكتبة الوسائط).',
  ],
  'sc.page_header': ['Header', 'الهيدر (أعلى الموقع)'],
  'sc.page_header_hint': [
    'Menu links and the “Start planning” button.',
    'روابط القائمة وزر «ابدأ التخطيط».',
  ],
  'sc.page_footer': ['Footer', 'الفوتر (أسفل الموقع)'],
  'sc.page_footer_hint': [
    'Columns, links, social accounts and the legal line.',
    'الأعمدة والروابط وحسابات التواصل وسطر الحقوق.',
  ],
  'sc.page_videos': ['Hero videos', 'فيديوهات الواجهة'],
  'sc.page_videos_hint': [
    'Replace the home page videos and their posters.',
    'استبدل فيديوهات الصفحة الرئيسية وصورها.',
  ],
  'sc.sec_hero': ['Top of the page', 'أعلى الصفحة'],
  'sc.sec_vision': ['Vision & mission', 'الرؤية والرسالة'],
  'sc.sec_diff': ['What makes us different', 'ما يميزنا'],
  'sc.sec_why': ['Why Bali', 'لماذا بالي'],
  'sc.sec_trust': ['How we earn your trust', 'كيف نكسب ثقتك'],
  'sc.sec_banner': ['Banner', 'البانر'],
  'sc.sec_cards': ['Cards', 'البطاقات'],
  'sc.sec_how': ['How it works', 'كيف تعمل'],
  'sc.sec_quiz': ['“Which trip suits me” quiz', 'اختبار «أي رحلة تناسبني»'],
  'sc.sec_head': ['Page title', 'عنوان الصفحة'],
  'sc.sec_quick': ['Quick links', 'روابط سريعة'],
  'sc.sec_form': ['Contact form', 'نموذج التواصل'],
  'sc.sec_help': ['“Still need help” box', 'صندوق «تحتاج مساعدة؟»'],
  'sc.sec_topics': ['Topics', 'المواضيع'],
  'sc.sec_body': ['Policy text', 'نص السياسة'],
  'sc.sec_methods': ['Methods', 'الطرق'],
  'sc.sec_refund': ['Refund note', 'ملاحظة الاسترداد'],
  'sc.sec_table': ['Credits table', 'جدول الحقوق'],
  'sc.sec_cta': ['Buttons', 'الأزرار'],
  'sc.sec_about': ['About text', 'نبذة'],
  'sc.sec_policies': ['Policies column', 'عمود السياسات'],
  'sc.sec_general': ['General column', 'العمود العام'],
  'sc.sec_legal': ['Legal line', 'سطر الحقوق'],
  'sc.contact_details': ['Contact details', 'بيانات التواصل'],
  'sc.contact_hint': [
    'Used everywhere: the footer, the WhatsApp button, /contact and the policies.',
    'تُستخدم في كل مكان: الفوتر وزر واتساب وصفحة اتصل بنا والسياسات.',
  ],
  'sc.wa_number': ['WhatsApp number', 'رقم واتساب'],
  'sc.wa_number_hint': [
    'With the country code, digits only: 9665…',
    'مع رمز الدولة، أرقام فقط: 9665…',
  ],
  'sc.wa_display': ['Number as shown', 'الرقم كما يظهر'],
  'sc.email': ['Email', 'البريد الإلكتروني'],
  'sc.offices': ['Offices', 'المكاتب'],
  'sc.offices_hint': ['One line per office.', 'سطر لكل مكتب.'],
  'sc.faq_list': ['Questions', 'الأسئلة'],
  'sc.faq_group': ['Group', 'المجموعة'],
  'sc.faq_group_auto': ['Same as before', 'كما كانت'],
  'sc.faq_reset': [
    'Go back to the original questions (discards this list)',
    'الرجوع للأسئلة الأصلية (يحذف هذه القائمة)',
  ],
  'sc.header_links': ['Menu links', 'روابط القائمة'],
  'sc.footer_links': ['Footer links', 'روابط الفوتر'],
  'sc.footer_quick': ['Quick links column', 'عمود الروابط السريعة'],
  'sc.footer_info': ['General column', 'العمود العام'],
  'sc.links_hint': [
    'Drag to reorder. Address: a site path (/activities) or a full https:// link.',
    'اسحب لإعادة الترتيب. العنوان: مسار في الموقع (/activities) أو رابط كامل https://',
  ],
  'sc.links_reset': ['Go back to the original links', 'الرجوع للروابط الأصلية'],
  'sc.link_href': ['Address', 'العنوان'],
  'sc.link_label': ['Label', 'الاسم'],
  'sc.link_add': ['Add a link', 'إضافة رابط'],
  'sc.cta_href': ['“Start planning” button leads to', 'زر «ابدأ التخطيط» يفتح'],
  'sc.cta_href_hint': ['Empty = the services page.', 'فارغ = صفحة الخدمات.'],
  'sc.social': ['Social accounts', 'حسابات التواصل'],
  'sc.social_hint': [
    'Full https:// links. Empty ones are not shown.',
    'روابط كاملة https://. الفارغ لا يظهر.',
  ],
  'sc.social_instagram': ['Instagram', 'إنستغرام'],
  'sc.social_tiktok': ['TikTok', 'تيك توك'],
  'sc.social_youtube': ['YouTube', 'يوتيوب'],
  'sc.social_facebook': ['Facebook', 'فيسبوك'],
  'sc.social_x': ['X (Twitter)', 'إكس (تويتر)'],
  'sc.social_snapchat': ['Snapchat', 'سناب شات'],
  'sc.videos_desc': [
    'The three videos at the top of the home page. Upload an MP4 (and optionally a WebM) to replace one; “Back to the original” restores the built-in clip.',
    'الفيديوهات الثلاثة أعلى الصفحة الرئيسية. ارفع ملف MP4 (ويمكن WebM أيضاً) لاستبدال أي منها، و«إرجاع الأصلي» يعيد الفيديو المدمج.',
  ],
  'sc.video_custom': ['Uploaded', 'مرفوع'],
  'sc.video_builtin': ['Built-in', 'الأصلي'],
  'sc.video_file': ['Video file', 'ملف الفيديو'],
  'sc.video_hint': [
    'MP4 or WebM, up to {max} MB. Portrait (9:16), short (about 8 seconds), no sound.',
    'MP4 أو WebM حتى {max} ميغابايت. طولي (9:16)، قصير (نحو 8 ثوانٍ)، بلا صوت.',
  ],
  'sc.video_upload': ['Upload video', 'رفع الفيديو'],
  'sc.video_reset': ['Back to the original video', 'إرجاع الفيديو الأصلي'],
  'sc.ok_video': [
    'Video uploaded. It is live on the home page.',
    'تم رفع الفيديو وهو ظاهر الآن في الصفحة الرئيسية.',
  ],
  'sc.ok_video_reset': ['The original video is back.', 'رجع الفيديو الأصلي.'],
  'sc.err_clip': ['This video slot does not exist.', 'خانة الفيديو غير موجودة.'],
  'sc.posters': ['Poster photos', 'صور الغلاف'],
  'sc.posters_hint': [
    'Shown before the video plays (and instead of it when motion is reduced).',
    'تظهر قبل تشغيل الفيديو (وبدلاً منه عند تقليل الحركة).',
  ],

  // Packages order
  'pkord.title': ['Order on the site', 'ترتيب العرض في الموقع'],
  'pkord.hint': [
    'Drag a package (or use ↑/↓) to set the order of the public packages page. It saves by itself.',
    'اسحب الباقة (أو استخدم ↑/↓) لترتيب صفحة الباقات في الموقع. يُحفظ تلقائياً.',
  ],

  // WhatsApp STOP
  'wstop.opted_out': ['Stopped WhatsApp (STOP)', 'أوقف واتساب (STOP)'],
  'wstop.opted_out_hint': [
    'This customer replied STOP: no WhatsApp message will be sent until they reply START.',
    'هذا العميل أرسل «إيقاف»: لن تُرسل له أي رسالة واتساب حتى يرسل «اشتراك».',
  ],
}

function split(index: 0 | 1): Messages {
  const out: Messages = {}
  for (const [key, pair] of Object.entries(PAIRS)) out[key] = pair[index]
  return out
}

const section: Section = { en: split(0), ar: split(1) }

export default section
