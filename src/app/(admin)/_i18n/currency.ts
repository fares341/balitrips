import type { Section } from './types'

/**
 * Studio strings — one base currency (SAR) and «العملة والصرف» (Nov 2026).
 * Listed last in ./index so these replace the older `config.currencies_*`.
 */
const section: Section = {
  en: {
    'config.currencies_title': 'Currency & exchange',
    'config.currencies_hint':
      'Every price is stored and charged in Saudi riyals (SAR). Visitors see an approximate («≈») price in their country’s currency, converted with the rates below; they can change it with the currency switcher.',
    'config.base_currency': 'Base currency',
    'config.base_currency_hint': 'Fixed: all prices are entered and charged in SAR.',
    'config.default_presentment': 'Default display currency',
    'config.default_presentment_hint':
      'Shown when the visitor’s country is unknown or its currency is not listed. Normally SAR.',
    'config.presentment_list': 'Display currencies (switcher)',
    'config.presentment_list_hint': 'One 3-letter code per line. SAR is always offered.',
    'config.rates': 'Rates: units of each currency per 1 SAR',
    'config.rates_hint':
      'One per line, e.g. «USD 0.2667» or «EGP 12.93». Every listed currency needs a rate. Changes are logged.',
    'config.rates_usd': '1 USD = {sar} SAR (used to convert old USD orders and sheets).',
    'config.rates_updated': 'Last changed {when} ({source}).',
    'config.auto_refresh': 'Refresh rates daily from a free feed (worker job; off by default)',
    'config.save_currencies': 'Save currency & exchange',
    'config.ok_currencies': 'Currency and exchange settings saved.',
    'config.err_rate_missing': 'Add a rate for: {currencies}.',
    'veh.sar_per_usd': 'SAR per 1 USD',
    'veh.sar_hint':
      'Read from Configuration → Currency & exchange. Driver prices are SAR; a zone with only a USD price is converted at this rate.',
    'veh.sar_where': 'Edit in Configuration',
    'cur.health_title': 'Currency health',
    'cur.health_ok': 'Every price is in SAR.',
    'cur.health_bad':
      '{n} items are not priced in SAR. They are converted at the Studio rate when sold; re-save them in SAR.',
    'cur.health_col_kind': 'Type',
    'cur.health_col_item': 'Item',
    'cur.health_col_cur': 'Currency',
    'cur.sar_only': 'Prices are in Saudi riyals (ر.س).',
  },
  ar: {
    'config.currencies_title': 'العملة والصرف',
    'config.currencies_hint':
      'كل الأسعار تُخزَّن وتُدفع بالريال السعودي (ر.س). يرى الزائر سعرًا تقريبيًا («≈») بعملة بلده محسوبًا بالأسعار أدناه، ويمكنه تغييره من مبدّل العملة.',
    'config.base_currency': 'العملة الأساسية',
    'config.base_currency_hint': 'ثابتة: كل الأسعار تُدخل وتُدفع بالريال السعودي.',
    'config.default_presentment': 'عملة العرض الافتراضية',
    'config.default_presentment_hint':
      'تظهر حين لا نعرف بلد الزائر أو حين لا تكون عملته في القائمة. عادةً الريال.',
    'config.presentment_list': 'عملات العرض (المبدّل)',
    'config.presentment_list_hint': 'رمز من 3 أحرف في كل سطر. الريال متاح دائمًا.',
    'config.rates': 'الأسعار: كم وحدة من كل عملة مقابل 1 ريال',
    'config.rates_hint':
      'سطر لكل عملة، مثل «USD 0.2667» أو «EGP 12.93». كل عملة في القائمة تحتاج سعرًا. التغييرات تُسجَّل.',
    'config.rates_usd': '1 دولار = {sar} ر.س (لتحويل الطلبات والجداول القديمة بالدولار).',
    'config.rates_updated': 'آخر تغيير {when} ({source}).',
    'config.auto_refresh': 'تحديث الأسعار يوميًا من مصدر مجاني (مهمة خلفية؛ متوقفة افتراضيًا)',
    'config.save_currencies': 'حفظ العملة والصرف',
    'config.ok_currencies': 'تم حفظ إعدادات العملة والصرف.',
    'config.err_rate_missing': 'أضف سعرًا لـ: {currencies}.',
    'veh.sar_per_usd': 'ريال لكل 1 دولار',
    'veh.sar_hint':
      'يُقرأ من الإعدادات ← العملة والصرف. أسعار السائق بالريال؛ المنطقة التي لها سعر بالدولار فقط تُحوَّل بهذا السعر.',
    'veh.sar_where': 'تعديل في الإعدادات',
    'cur.health_title': 'صحة العملة',
    'cur.health_ok': 'كل الأسعار بالريال السعودي.',
    'cur.health_bad':
      '{n} عنصرًا ليست مسعّرة بالريال. تُحوَّل بسعر الاستوديو عند البيع؛ أعد حفظها بالريال.',
    'cur.health_col_kind': 'النوع',
    'cur.health_col_item': 'العنصر',
    'cur.health_col_cur': 'العملة',
    'cur.sar_only': 'الأسعار بالريال السعودي (ر.س).',
  },
}

export default section
