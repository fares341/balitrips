import type { Section } from './types'

/**
 * Studio strings — owner requests (Mr. Saeed, Oct 2026): home hero info
 * strip (visa price), the «Shopping in Bali» card photo, category card
 * photos, the activity image report and the lawyer-review note on policies.
 * Keys `sr.*`; en and ar hold the same keys.
 */
const section: Section = {
  en: {
    'sr.home_title': 'Home page',
    'sr.home_hint':
      'Shown on the home page hero and cards. Time in Bali and the weather are automatic; the visa price shows only once you fill it in.',
    'sr.visa_title': 'Bali visa on arrival — current price',
    'sr.visa_hint':
      'Shown next to «Plan your trip» in the hero. Leave the amount empty to hide it. Enter the official price you have checked; the site never guesses one.',
    'sr.visa_amount': 'Amount',
    'sr.visa_amount_hint': 'As it should read, e.g. 500,000',
    'sr.visa_currency': 'Currency',
    'sr.visa_link': 'Link (optional)',
    'sr.visa_link_hint': 'An official page with the details (https://…).',
    'sr.visa_note': 'Short note (optional)',
    'sr.shop_title': '«Shopping in Bali» card',
    'sr.shop_image': 'Card photo',
    'sr.shop_image_hint':
      'Pick a licensed photo of a Bali market or mall. None = the built-in travel flat-lay photo.',
    'sr.save_home': 'Save home page',
    'sr.ok_home': 'Home page settings saved.',
    'sr.policy_lawyer_t': 'Drafts — to be reviewed by a lawyer.',
    'sr.policy_lawyer_b':
      'The public policy pages (privacy, terms, cancellation & refund, payment, cookies) carry full drafts in Arabic, English and Indonesian written from your rules. Have them reviewed by a lawyer before relying on them; visitors do not see this note.',
    'sr.category_image': 'Card photo (home guide)',
    'sr.category_image_none': '— none (a place photo or the icon) —',
    'sr.category_image_kept': '(current image, not in the latest 120)',
    'sr.category_image_hint':
      'Used on the home «Your free Bali guide» card. Upload a licensed photo in Media first.',
    'sr.img_title': 'Duplicate or unsuitable images',
    'sr.img_description':
      'Activities whose pictures need a look: no main image, the same picture twice, placeholder or SVG art, small files (under {w}×{h}), and — for merged activities — pictures from another source activity. The public page already shows each picture once.',
    'sr.img_back': 'Back to activities',
    'sr.img_none':
      'Nothing to fix: every activity has a main image and no repeated or unsuitable pictures.',
    'sr.img_col_activity': 'Activity',
    'sr.img_col_issues': 'What to fix',
    'sr.img_gallery': 'gallery',
    'sr.img_no_hero': 'No main image',
    'sr.img_duplicate': 'Same picture twice',
    'sr.img_placeholder': 'Placeholder / SVG',
    'sr.img_tiny': 'Too small',
    'sr.img_other_source': 'From another merged activity',
    'sr.img_where': 'in: {places}',
    'sr.img_from': 'came from «{names}» — check it matches',
  },
  ar: {
    'sr.home_title': 'الصفحة الرئيسية',
    'sr.home_hint':
      'يظهر في واجهة الصفحة الرئيسية وبطاقاتها. الوقت في بالي والطقس تلقائيان، وسعر التأشيرة لا يظهر إلا بعد أن تكتبه.',
    'sr.visa_title': 'تأشيرة الوصول إلى بالي — السعر الحالي',
    'sr.visa_hint':
      'يظهر بجانب «خطط رحلتك» في الواجهة. اترك المبلغ فارغًا لإخفائه. اكتب السعر الرسمي بعد التحقق منه؛ الموقع لا يخمّن سعرًا.',
    'sr.visa_amount': 'المبلغ',
    'sr.visa_amount_hint': 'كما يجب أن يظهر، مثل 500,000',
    'sr.visa_currency': 'العملة',
    'sr.visa_link': 'رابط (اختياري)',
    'sr.visa_link_hint': 'صفحة رسمية بالتفاصيل (https://…).',
    'sr.visa_note': 'ملاحظة قصيرة (اختيارية)',
    'sr.shop_title': 'بطاقة «التسوق في بالي»',
    'sr.shop_image': 'صورة البطاقة',
    'sr.shop_image_hint': 'اختر صورة مرخّصة لسوق أو مول في بالي. بدون اختيار = صورة السفر المدمجة.',
    'sr.save_home': 'حفظ الصفحة الرئيسية',
    'sr.ok_home': 'حُفظت إعدادات الصفحة الرئيسية.',
    'sr.policy_lawyer_t': 'مسودات — تحتاج مراجعة محامٍ.',
    'sr.policy_lawyer_b':
      'صفحات السياسات العامة (الخصوصية، الشروط، الإلغاء والاسترداد، الدفع، ملفات تعريف الارتباط) فيها مسودات كاملة بالعربية والإنجليزية والإندونيسية مكتوبة وفق قواعدك. راجعها مع محامٍ قبل الاعتماد عليها؛ هذه الملاحظة لا تظهر للزوار.',
    'sr.category_image': 'صورة البطاقة (دليل الرئيسية)',
    'sr.category_image_none': '— بدون (صورة مكان أو الأيقونة) —',
    'sr.category_image_kept': '(الصورة الحالية، ليست ضمن آخر 120)',
    'sr.category_image_hint':
      'تظهر في بطاقة «دليلك المجاني في بالي» في الرئيسية. ارفع صورة مرخّصة في الوسائط أولًا.',
    'sr.img_title': 'صور مكررة أو غير مناسبة',
    'sr.img_description':
      'الفعاليات التي تحتاج صورها مراجعة: بلا صورة رئيسية، أو الصورة نفسها مرتين، أو رسوم مؤقتة أو SVG، أو ملفات صغيرة (أقل من {w}×{h})، وفي الفعاليات المدمجة: صور جاءت من فعالية مصدر أخرى. الصفحة العامة تعرض كل صورة مرة واحدة.',
    'sr.img_back': 'العودة إلى الفعاليات',
    'sr.img_none': 'لا شيء يحتاج إصلاحًا: كل فعالية لها صورة رئيسية ولا صور مكررة أو غير مناسبة.',
    'sr.img_col_activity': 'الفعالية',
    'sr.img_col_issues': 'ما يحتاج إصلاحًا',
    'sr.img_gallery': 'المعرض',
    'sr.img_no_hero': 'بلا صورة رئيسية',
    'sr.img_duplicate': 'صورة مكررة',
    'sr.img_placeholder': 'صورة مؤقتة / SVG',
    'sr.img_tiny': 'صغيرة جدًا',
    'sr.img_other_source': 'من فعالية مدمجة أخرى',
    'sr.img_where': 'في: {places}',
    'sr.img_from': 'جاءت من «{names}» — تأكد أنها مناسبة',
  },
}

export default section
