import type { Section } from './types'

/** Studio strings — system. Keys: `<area>.<name>`; en and ar must hold the same keys. */
const section: Section = {
  en: {
    // Two-factor (security)
    'security.meta_title': 'Security',
    'security.err_code_invalid':
      'That code is not valid. Check your phone’s clock and try the next one.',
    'security.err_code_reused':
      'That code has already been used. Wait for your authenticator to show the next one.',
    'security.qr_title': 'Scan to enrol',
    'security.page_title': 'Two-factor authentication',
    'security.page_intro':
      'Required for staff and administrator accounts. Until it is active, this is the only admin page you can reach.',
    'security.recovery_title': 'Recovery codes',
    'security.recovery_shown_once':
      'Shown once. Store them somewhere you can reach without this account — each works a single time.',
    'security.setup_title': 'Set up',
    'security.setup_text':
      'Generates a secret for your authenticator app. Nothing changes until you confirm it with a code, so closing this page cannot lock you out.',
    'security.start_setup': 'Start setup',
    'security.scan_title': 'Scan and confirm',
    'security.cannot_scan': 'Cannot scan?',
    'security.six_digit_code': 'Six-digit code',
    'security.checking': 'Checking…',
    'security.confirm': 'Confirm',
    'security.verify_title': 'Verify this session',
    'security.verify_text':
      'Two-factor is active. Enter a current code — or a recovery code — to unlock the admin in this browser.',
    'security.code': 'Code',
    'security.verify': 'Verify',
    'security.recovery_remaining':
      'Remaining: {count}. Replacing them invalidates the previous set immediately.',
    'security.current_code': 'Current code',
    'security.working': 'Working…',
    'security.replace_codes': 'Replace codes',
    'security.err_already_active_account': 'Two-factor is already active on this account.',
    'security.ok_scan': 'Scan the code below, then confirm with a six-digit code.',
    'security.err_already_active': 'Two-factor is already active.',
    'security.err_no_pending': 'Start the setup again — there is no pending secret.',
    'security.ok_enabled':
      'Two-factor is on. Store these recovery codes now — they are not shown again.',
    'security.err_not_set_up': 'Two-factor is not set up on this account yet.',
    'security.err_locked':
      'Too many wrong codes. Try again in {minutes} minutes. Use a recovery code once the lock ends if your phone is unavailable.',
    'security.err_bad_recovery': 'That recovery code is not valid, or it has already been used.',
    'security.ok_session_verified': 'Two-factor confirmed for this session.',
    'security.err_finish_setup': 'Finish setting up two-factor first.',
    'security.err_no_secret': 'This account has no two-factor secret.',
    'security.ok_regenerated': 'New recovery codes issued. The previous set no longer works.',

    // Translations
    'translations.title': 'Translations',
    'translations.description':
      "UI strings, editable without a deploy. Content copy is translated in each entity's own editor; the report below shows how far behind it is.",
    'translations.import_btn': 'Import bundled keys',
    'translations.stat_keys': 'Keys in database',
    'translations.stat_incomplete': 'Incomplete keys',
    'translations.stat_matching': 'Matching filter',
    'translations.empty_db':
      'No keys in the database yet. “Import bundled keys” copies every string from messages/en.json, messages/ar.json and messages/id.json. It never overwrites a row that already exists.',
    'translations.search': 'Search',
    'translations.search_placeholder': 'Key or English text',
    'translations.show': 'Show',
    'translations.show_all': 'Everything',
    'translations.show_any': 'Missing any locale',
    'translations.show_ar': 'Missing Arabic',
    'translations.show_id': 'Missing Indonesian',
    'translations.filter': 'Filter',
    'translations.reset': 'Reset',
    'translations.empty': 'No keys match those filters.',
    'translations.missing_locale': 'missing {locale}',
    'translations.save': 'Save',
    'translations.add_title': 'Add a key',
    'translations.key': 'Key',
    'translations.add_btn': 'Add key',
    'translations.gaps_title': 'Missing translations across content',
    'translations.gaps_hint':
      'English is the authoring locale, so a fresh record is legitimately English-only. A blank locale falls back to English at render time rather than showing an empty field, so this is a completeness queue, not a list of bugs.',
    'translations.col_entity': 'Entity',
    'translations.col_field': 'Field',
    'translations.col_rows': 'Rows',
    'translations.col_missing_ar': 'Missing Arabic',
    'translations.col_missing_id': 'Missing Indonesian',
    'translations.lang_en': 'English',
    'translations.lang_ar': 'Arabic',
    'translations.lang_id': 'Indonesian',
    'translations.entity_activities': 'Activities',
    'translations.entity_itineraries': 'Itineraries',
    'translations.entity_itinerary_days': 'Itinerary days',
    'translations.entity_packages': 'Packages',
    'translations.entity_articles': 'Articles',
    'translations.entity_landmarks': 'Landmarks',
    'translations.entity_map_places': 'Map places',
    'translations.entity_categories': 'Categories',
    'translations.entity_regions': 'Regions',
    'translations.entity_article_categories': 'Article categories',
    'translations.entity_driver_vehicles': 'Driver vehicles',
    'translations.field_name': 'name',
    'translations.field_description': 'description',
    'translations.field_cancellation_policy': 'cancellation policy',
    'translations.field_blurb': 'blurb',
    'translations.field_title': 'title',
    'translations.field_body': 'body',
    'translations.field_label': 'label',
    'translations.err_key_gone': 'That key no longer exists',
    'translations.ok_saved': 'Key saved.',
    'translations.err_key_format':
      'A key may contain letters, digits, dots, underscores and hyphens only',
    'translations.err_en_required': 'The English value is required',
    'translations.ok_added': 'Added "{key}".',
    'translations.ok_nothing_to_import':
      'Nothing to import — every bundled key is already in the database.',
    'translations.ok_imported': 'Keys imported from the bundled catalogues: {count}.',

    // Configuration
    'config.title': 'Configuration',
    'config.description':
      'Currencies, fees, contact details and the four policy pages. Each section saves on its own and every save is audited.',
    'config.invalid':
      'Stored values for {keys} do not match the expected shape and are being ignored — the site is running on the shipped defaults for them. Saving the section below repairs it.',
    'config.not_wired_title': 'Not yet wired to the public site.',
    'config.not_wired_body':
      'These values are stored and audited, but the customer-facing pages still read their own hard-coded constants. Connecting them means calling {fn} from {file} in the footer, the contact page and the four policy routes. Until that lands, treat this screen as the source of record, not the live configuration.',
    'config.currencies_title': 'Currencies and presentment',
    'config.currencies_hint':
      'The base currency is what the catalog is authored in. Changing it does {not} re-denominate anything — every price carries its own currency column — it changes which currency new authoring defaults to and which one totals are compared in.',
    'config.not': 'not',
    'config.base_currency': 'Base currency',
    'config.base_currency_hint': 'ISO 4217, e.g. USD.',
    'config.default_presentment': 'Default presentment currency',
    'config.default_presentment_hint':
      'Shown to a buyer whose own currency is not offered. Must appear in the list.',
    'config.presentment_list': 'Presentment currencies',
    'config.presentment_list_hint':
      'One ISO 4217 code per line. These are the currencies a buyer may be quoted in.',
    'config.save_currencies': 'Save currencies',
    'config.fees_title': 'Fees',
    'config.fees_hint':
      'Basis points and integer minor units, never percentages as floats — 250 bps is 2.50%, and a fee stored as {example} is how an invoice starts disagreeing with a settlement report by a cent. Fees are applied server-side in the pricing path; nothing here is assembled in the browser.',
    'config.service_fee': 'Service fee (bps)',
    'config.service_fee_hint': '{pct}% of the subtotal.',
    'config.booking_fee': 'Booking fee (minor units)',
    'config.booking_fee_hint': 'Flat, per order — currently {amount}.',
    'config.surcharge': 'Payment surcharge (bps)',
    'config.surcharge_hint':
      "{pct}%. Check the acquirer's rules before charging one — several card schemes forbid it outright.",
    'config.fee_currency': 'Fee currency',
    'config.fee_currency_hint': 'Applies to the flat fee.',
    'config.save_fees': 'Save fees',
    'config.contact_title': 'Contact',
    'config.contact_hint':
      'The WhatsApp number appears in the footer and on the contact page. It was hard-coded in two components, which is exactly how the two of them end up disagreeing.',
    'config.whatsapp_number': 'WhatsApp number',
    'config.whatsapp_number_hint':
      'E.164 without the +. Punctuation is stripped on save, so pasting +62 812 3456 7890 is fine.',
    'config.displayed_number': 'Displayed number',
    'config.displayed_number_hint': 'How it is printed. Formatting is free-form.',
    'config.support_email': 'Support e-mail',
    'config.link_preview': 'Link preview: {link}',
    'config.save_contact': 'Save contact details',
    'config.policies_title': 'Policy pages',
    'config.policies_hint':
      'The bodies of /terms, /privacy, /refund and /cookies. Plain text — a blank line starts a new paragraph, and nothing is interpreted as HTML, so a pasted policy cannot inject markup into a customer-facing page. Author English first; Arabic and Indonesian fall back to it until they are filled in.',
    'config.policy_terms': 'Terms of service',
    'config.policy_privacy': 'Privacy policy',
    'config.policy_refund': 'Refund and cancellation policy',
    'config.policy_cookies': 'Cookie policy',
    'config.note_terms':
      'The contract the traveller accepts at checkout. `orders.terms_version` pins the effective date below, so a later edit does not rewrite what an existing customer agreed to.',
    'config.note_privacy':
      'What is collected and why. Required before an app store, a payment provider or an EU/GCC visitor’s regulator will take the site seriously.',
    'config.note_refund':
      'A payment provider will not open a live account without one, and this text is the evidence that wins a “services not rendered” chargeback — a dispute window on future-dated travel runs up to ~540 days.',
    'config.note_cookies':
      'What the consent banner is actually consenting to. A banner that links to nothing is worse than no banner.',
    'config.placeholder': 'placeholder',
    'config.edited': 'edited',
    'config.missing_locales': 'missing: {locales}',
    'config.effective_date': 'Effective date',
    'config.effective_date_hint':
      'YYYY-MM-DD, authored by hand. Never derived from the save time — a date that moves on every edit silently rewrites terms someone already accepted.',
    'config.body': 'Body',
    'config.save_policy': 'Save: {policy}',
    'config.never_edited':
      'Never edited — running on the shipped default. Saving writes the first row.',
    'config.last_saved': 'Last saved {when} by {actor}.',
    'config.removed_account': 'an account since removed',
    'config.err_rejected': 'That value was rejected. {detail}',
    'config.err_no_presentment': 'List at least one presentment currency, one per line.',
    'config.err_default_not_listed':
      'The default presentment currency ({currency}) must also appear in the list of presentment currencies.',
    'config.ok_currencies': 'Currency settings saved.',
    'config.label_service_fee': 'Service fee',
    'config.label_booking_fee': 'Booking fee',
    'config.label_surcharge': 'Payment surcharge',
    'config.ok_fees': 'Fee schedule saved.',
    'config.ok_contact': 'Contact details saved.',
    'config.home_title': 'Home page',
    'config.home_hint':
      'The photo behind the home page headline. This one is live: saving updates the public home page in every language.',
    'config.home_hero_image': 'Hero image',
    'config.home_hero_image_hint':
      'A wide landscape photo works best (at least 2000px wide). With no image, the page shows its built-in artwork on a green gradient.',
    'config.save_home': 'Save home page',
    'config.ok_home': 'Home page saved.',
    'config.err_not_policy': '"{id}" is not a policy page.',
    'config.err_effective_required': 'Effective date is required (YYYY-MM-DD).',
    'config.err_en_body_required':
      'The English body is required — it is the authoring locale, and the other two fall back to it.',
    'config.ok_policy': 'Policy saved.',

    // Audit log
    'audit.title': 'Audit log',
    'audit.description':
      'Every admin mutation, with the fields that actually changed. Refunds, entitlement grants and role changes are the ones that have to be answerable months later.',
    'audit.search': 'Search',
    'audit.search_placeholder': 'Action, actor email or IP',
    'audit.entity_type': 'Entity type',
    'audit.any': 'Any',
    'audit.from': 'From',
    'audit.to': 'To',
    'audit.filter': 'Filter',
    'audit.reset': 'Reset',
    'audit.empty': 'Nothing recorded for those filters.',
    'audit.col_when': 'When',
    'audit.col_actor': 'Actor',
    'audit.col_action': 'Action',
    'audit.col_entity': 'Entity',
    'audit.col_before': 'Before',
    'audit.col_after': 'After',
    'audit.system': 'system',
  },
  ar: {
    'security.err_code_invalid': 'الرمز غير صحيح. تأكد من ضبط ساعة هاتفك وجرّب الرمز التالي.',
    'security.err_code_reused':
      'هذا الرمز استُخدم من قبل. انتظر حتى يظهر الرمز التالي في تطبيق المصادقة.',
    // Two-factor (security)
    'security.meta_title': 'الأمان',
    'security.qr_title': 'امسح الرمز للتسجيل',
    'security.page_title': 'التحقق بخطوتين',
    'security.page_intro':
      'مطلوب لحسابات الموظفين والمدراء. إلى أن يتم تفعيله، هذه هي الصفحة الوحيدة المتاحة لك في لوحة الإدارة.',
    'security.recovery_title': 'رموز الاسترداد',
    'security.recovery_shown_once':
      'تُعرض مرة واحدة فقط. احفظها في مكان يمكنك الوصول إليه دون هذا الحساب — كل رمز يعمل مرة واحدة.',
    'security.setup_title': 'الإعداد',
    'security.setup_text':
      'يُنشئ مفتاحاً سرياً لتطبيق المصادقة. لا يتغير شيء حتى تؤكده برمز، لذا فإن إغلاق هذه الصفحة لن يمنعك من الدخول.',
    'security.start_setup': 'بدء الإعداد',
    'security.scan_title': 'امسح الرمز ثم أكّد',
    'security.cannot_scan': 'تعذّر المسح؟',
    'security.six_digit_code': 'الرمز المكوّن من ستة أرقام',
    'security.checking': 'جارٍ التحقق…',
    'security.confirm': 'تأكيد',
    'security.verify_title': 'تحقق من هذه الجلسة',
    'security.verify_text':
      'التحقق بخطوتين مفعّل. أدخل الرمز الحالي — أو أحد رموز الاسترداد — لفتح لوحة الإدارة في هذا المتصفح.',
    'security.code': 'الرمز',
    'security.verify': 'تحقق',
    'security.recovery_remaining': 'المتبقي: {count}. استبدالها يُبطل المجموعة السابقة فوراً.',
    'security.current_code': 'الرمز الحالي',
    'security.working': 'جارٍ التنفيذ…',
    'security.replace_codes': 'استبدال الرموز',
    'security.err_already_active_account': 'التحقق بخطوتين مفعّل بالفعل على هذا الحساب.',
    'security.ok_scan': 'امسح الرمز أدناه، ثم أكّد برمز من ستة أرقام.',
    'security.err_already_active': 'التحقق بخطوتين مفعّل بالفعل.',
    'security.err_no_pending': 'ابدأ الإعداد من جديد — لا يوجد مفتاح سري بانتظار التأكيد.',
    'security.ok_enabled':
      'تم تفعيل التحقق بخطوتين. احفظ رموز الاسترداد هذه الآن — لن تُعرض مرة أخرى.',
    'security.err_not_set_up': 'التحقق بخطوتين غير مُعدّ على هذا الحساب بعد.',
    'security.err_locked':
      'رموز خاطئة كثيرة. حاول مجدداً بعد {minutes} دقيقة. استخدم رمز استرداد بعد انتهاء القفل إن لم يكن هاتفك متاحاً.',
    'security.err_bad_recovery': 'رمز الاسترداد هذا غير صالح، أو تم استخدامه من قبل.',
    'security.ok_session_verified': 'تم تأكيد التحقق بخطوتين لهذه الجلسة.',
    'security.err_finish_setup': 'أكمل إعداد التحقق بخطوتين أولاً.',
    'security.err_no_secret': 'لا يوجد مفتاح تحقق بخطوتين لهذا الحساب.',
    'security.ok_regenerated': 'تم إصدار رموز استرداد جديدة. المجموعة السابقة لم تعد تعمل.',

    // Translations
    'translations.title': 'الترجمات',
    'translations.description':
      'نصوص الواجهة، قابلة للتعديل دون نشر جديد. يُترجم نص المحتوى في محرر كل عنصر؛ ويوضح التقرير أدناه مقدار النقص فيه.',
    'translations.import_btn': 'استيراد المفاتيح المضمّنة',
    'translations.stat_keys': 'المفاتيح في قاعدة البيانات',
    'translations.stat_incomplete': 'مفاتيح غير مكتملة',
    'translations.stat_matching': 'مطابقة للتصفية',
    'translations.empty_db':
      'لا توجد مفاتيح في قاعدة البيانات بعد. «استيراد المفاتيح المضمّنة» ينسخ كل النصوص من messages/en.json وmessages/ar.json وmessages/id.json، ولا يستبدل أي صف موجود مسبقاً.',
    'translations.search': 'بحث',
    'translations.search_placeholder': 'المفتاح أو النص الإنجليزي',
    'translations.show': 'عرض',
    'translations.show_all': 'الكل',
    'translations.show_any': 'ينقصها أي لغة',
    'translations.show_ar': 'ينقصها العربية',
    'translations.show_id': 'ينقصها الإندونيسية',
    'translations.filter': 'تصفية',
    'translations.reset': 'إعادة تعيين',
    'translations.empty': 'لا توجد مفاتيح مطابقة لعوامل التصفية هذه.',
    'translations.missing_locale': 'ينقص {locale}',
    'translations.save': 'حفظ',
    'translations.add_title': 'إضافة مفتاح',
    'translations.key': 'المفتاح',
    'translations.add_btn': 'إضافة المفتاح',
    'translations.gaps_title': 'الترجمات الناقصة في المحتوى',
    'translations.gaps_hint':
      'الإنجليزية هي لغة التأليف، لذا من الطبيعي أن يكون السجل الجديد بالإنجليزية فقط. اللغة الفارغة تعود إلى الإنجليزية عند العرض بدلاً من إظهار حقل فارغ، فهذه قائمة إكمال وليست قائمة أخطاء.',
    'translations.col_entity': 'العنصر',
    'translations.col_field': 'الحقل',
    'translations.col_rows': 'الصفوف',
    'translations.col_missing_ar': 'ينقصها العربية',
    'translations.col_missing_id': 'ينقصها الإندونيسية',
    'translations.lang_en': 'الإنجليزية',
    'translations.lang_ar': 'العربية',
    'translations.lang_id': 'الإندونيسية',
    'translations.entity_activities': 'الأنشطة',
    'translations.entity_itineraries': 'برامج الرحلات',
    'translations.entity_itinerary_days': 'أيام البرامج',
    'translations.entity_packages': 'الباقات',
    'translations.entity_articles': 'المقالات',
    'translations.entity_landmarks': 'المعالم',
    'translations.entity_map_places': 'أماكن الخريطة',
    'translations.entity_categories': 'التصنيفات',
    'translations.entity_regions': 'المناطق',
    'translations.entity_article_categories': 'تصنيفات المقالات',
    'translations.entity_driver_vehicles': 'مركبات السائقين',
    'translations.field_name': 'الاسم',
    'translations.field_description': 'الوصف',
    'translations.field_cancellation_policy': 'سياسة الإلغاء',
    'translations.field_blurb': 'النبذة',
    'translations.field_title': 'العنوان',
    'translations.field_body': 'المحتوى',
    'translations.field_label': 'التسمية',
    'translations.err_key_gone': 'هذا المفتاح لم يعد موجوداً',
    'translations.ok_saved': 'تم حفظ المفتاح.',
    'translations.err_key_format':
      'يمكن أن يحتوي المفتاح على أحرف وأرقام ونقاط وشرطات سفلية وشرطات فقط',
    'translations.err_en_required': 'القيمة الإنجليزية مطلوبة',
    'translations.ok_added': 'تمت إضافة "{key}".',
    'translations.ok_nothing_to_import':
      'لا يوجد ما يُستورد — كل المفاتيح المضمّنة موجودة في قاعدة البيانات.',
    'translations.ok_imported': 'المفاتيح المستوردة من الملفات المضمّنة: {count}.',

    // Configuration
    'config.title': 'الإعدادات العامة',
    'config.description':
      'العملات والرسوم وبيانات التواصل وصفحات السياسات الأربع. كل قسم يُحفظ وحده، وكل حفظ يُسجَّل في سجل التدقيق.',
    'config.invalid':
      'القيم المخزنة لـ {keys} لا تطابق الشكل المتوقع ويتم تجاهلها — يعمل الموقع بالقيم الافتراضية لها. حفظ القسم المعني أدناه يصلحها.',
    'config.not_wired_title': 'غير مربوطة بالموقع العام بعد.',
    'config.not_wired_body':
      'هذه القيم مخزنة ومسجّلة في التدقيق، لكن صفحات العملاء ما زالت تقرأ ثوابتها المكتوبة في الكود. ربطها يعني استدعاء {fn} من {file} في التذييل وصفحة التواصل ومسارات السياسات الأربعة. إلى أن يتم ذلك، اعتبر هذه الشاشة المرجع المعتمد، لا الإعدادات الفعلية.',
    'config.currencies_title': 'العملات وعملات العرض',
    'config.currencies_hint':
      'العملة الأساسية هي العملة التي يُؤلَّف بها الكتالوج. تغييرها {not} يعيد تسعير أي شيء — لكل سعر عمود عملة خاص به — بل يغيّر العملة الافتراضية للعناصر الجديدة والعملة التي تُقارَن بها الإجماليات.',
    'config.not': 'لا',
    'config.base_currency': 'العملة الأساسية',
    'config.base_currency_hint': 'رمز ISO 4217، مثل USD.',
    'config.default_presentment': 'عملة العرض الافتراضية',
    'config.default_presentment_hint':
      'تُعرض للمشتري الذي لا تتوفر عملته. يجب أن تكون ضمن القائمة.',
    'config.presentment_list': 'عملات العرض',
    'config.presentment_list_hint':
      'رمز ISO 4217 واحد في كل سطر. هذه العملات التي يمكن عرض الأسعار بها للمشتري.',
    'config.save_currencies': 'حفظ العملات',
    'config.fees_title': 'الرسوم',
    'config.fees_hint':
      'نقاط أساس ووحدات صغرى صحيحة، وليست نسباً عشرية أبداً — 250 نقطة أساس تساوي 2.50%، والرسم المخزّن كـ {example} هو بداية اختلاف الفاتورة عن تقرير التسوية بسنت. تُطبَّق الرسوم على الخادم أثناء التسعير؛ لا شيء هنا يُحسب في المتصفح.',
    'config.service_fee': 'رسوم الخدمة (bps)',
    'config.service_fee_hint': '{pct}% من المجموع الفرعي.',
    'config.booking_fee': 'رسوم الحجز (بالوحدات الصغرى)',
    'config.booking_fee_hint': 'مبلغ ثابت لكل طلب — حالياً {amount}.',
    'config.surcharge': 'رسوم الدفع الإضافية (bps)',
    'config.surcharge_hint':
      '{pct}%. راجع قواعد جهة التحصيل قبل فرضها — عدة شبكات بطاقات تمنعها تماماً.',
    'config.fee_currency': 'عملة الرسوم',
    'config.fee_currency_hint': 'تُطبَّق على الرسم الثابت.',
    'config.save_fees': 'حفظ الرسوم',
    'config.contact_title': 'التواصل',
    'config.contact_hint':
      'رقم WhatsApp يظهر في التذييل وفي صفحة التواصل. كان مكتوباً في الكود داخل مكوّنين، وهكذا بالضبط ينتهي الأمر باختلافهما.',
    'config.whatsapp_number': 'رقم WhatsApp',
    'config.whatsapp_number_hint':
      'بصيغة E.164 دون علامة +. تُحذف الرموز عند الحفظ، لذا يمكنك لصق ‎+62 812 3456 7890 مباشرة.',
    'config.displayed_number': 'الرقم المعروض',
    'config.displayed_number_hint': 'طريقة ظهوره للزوار. التنسيق حر.',
    'config.support_email': 'بريد الدعم',
    'config.link_preview': 'معاينة الرابط: {link}',
    'config.save_contact': 'حفظ بيانات التواصل',
    'config.policies_title': 'صفحات السياسات',
    'config.policies_hint':
      'محتوى الصفحات ‎/terms و‎/privacy و‎/refund و‎/cookies. نص عادي — السطر الفارغ يبدأ فقرة جديدة، ولا يُفسَّر أي شيء كـ HTML، فلا يمكن لسياسة ملصوقة أن تحقن وسوماً في صفحة العملاء. اكتب الإنجليزية أولاً؛ تعود العربية والإندونيسية إليها حتى تُملأ.',
    'config.policy_terms': 'شروط الخدمة',
    'config.policy_privacy': 'سياسة الخصوصية',
    'config.policy_refund': 'سياسة الاسترداد والإلغاء',
    'config.policy_cookies': 'سياسة ملفات تعريف الارتباط',
    'config.note_terms':
      'العقد الذي يقبله المسافر عند الدفع. يثبّت `orders.terms_version` تاريخ السريان أدناه، فلا يعيد أي تعديل لاحق كتابة ما وافق عليه عميل سابق.',
    'config.note_privacy':
      'ما يُجمع ولماذا. مطلوبة قبل أن تأخذ متاجر التطبيقات أو مزودو الدفع أو الجهات التنظيمية لزوار الاتحاد الأوروبي والخليج الموقعَ بجدية.',
    'config.note_refund':
      'لن يفتح مزود الدفع حساباً فعلياً بدونها، وهذا النص هو الدليل الذي يكسب نزاع «خدمة لم تُقدَّم» — ونافذة النزاع على السفر المستقبلي قد تصل إلى نحو 540 يوماً.',
    'config.note_cookies':
      'ما يوافق عليه شريط الموافقة فعلاً. شريط لا يرتبط بأي صفحة أسوأ من عدم وجود شريط.',
    'config.placeholder': 'نص مؤقت',
    'config.edited': 'معدّلة',
    'config.missing_locales': 'ينقص: {locales}',
    'config.effective_date': 'تاريخ السريان',
    'config.effective_date_hint':
      'بصيغة YYYY-MM-DD ويُكتب يدوياً. لا يُشتق أبداً من وقت الحفظ — التاريخ الذي يتغير مع كل تعديل يعيد كتابة شروط قبلها أحدهم بالفعل دون أن يلاحظ أحد.',
    'config.body': 'المحتوى',
    'config.save_policy': 'حفظ: {policy}',
    'config.never_edited': 'لم يُعدَّل قط — يعمل بالقيمة الافتراضية. الحفظ يكتب أول صف.',
    'config.last_saved': 'آخر حفظ {when} بواسطة {actor}.',
    'config.removed_account': 'حساب أُزيل لاحقاً',
    'config.err_rejected': 'تم رفض هذه القيمة. {detail}',
    'config.err_no_presentment': 'أدخل عملة عرض واحدة على الأقل، واحدة في كل سطر.',
    'config.err_default_not_listed':
      'يجب أن تظهر عملة العرض الافتراضية ({currency}) أيضاً ضمن قائمة عملات العرض.',
    'config.ok_currencies': 'تم حفظ إعدادات العملات.',
    'config.label_service_fee': 'رسوم الخدمة',
    'config.label_booking_fee': 'رسوم الحجز',
    'config.label_surcharge': 'رسوم الدفع الإضافية',
    'config.ok_fees': 'تم حفظ جدول الرسوم.',
    'config.ok_contact': 'تم حفظ بيانات التواصل.',
    'config.home_title': 'الصفحة الرئيسية',
    'config.home_hint':
      'الصورة التي تظهر خلف عنوان الصفحة الرئيسية. هذا الإعداد مفعّل: الحفظ يحدّث الصفحة الرئيسية للزوار بكل اللغات.',
    'config.home_hero_image': 'صورة الواجهة',
    'config.home_hero_image_hint':
      'الأفضل صورة أفقية عريضة (2000 بكسل عرضاً على الأقل). بدون صورة تعرض الصفحة رسمتها الافتراضية على خلفية خضراء متدرجة.',
    'config.save_home': 'حفظ الصفحة الرئيسية',
    'config.ok_home': 'تم حفظ الصفحة الرئيسية.',
    'config.err_not_policy': '"{id}" ليست صفحة سياسة.',
    'config.err_effective_required': 'تاريخ السريان مطلوب (YYYY-MM-DD).',
    'config.err_en_body_required':
      'المحتوى الإنجليزي مطلوب — فهو لغة التأليف، واللغتان الأخريان تعودان إليه.',
    'config.ok_policy': 'تم حفظ السياسة.',

    // Audit log
    'audit.title': 'سجل التدقيق',
    'audit.description':
      'كل تعديل أجرته الإدارة، مع الحقول التي تغيّرت فعلاً. المبالغ المستردة ومنح الصلاحيات وتغيير الأدوار هي ما يجب أن يكون قابلاً للمساءلة بعد أشهر.',
    'audit.search': 'بحث',
    'audit.search_placeholder': 'الإجراء أو بريد المنفّذ أو IP',
    'audit.entity_type': 'نوع العنصر',
    'audit.any': 'الكل',
    'audit.from': 'من',
    'audit.to': 'إلى',
    'audit.filter': 'تصفية',
    'audit.reset': 'إعادة تعيين',
    'audit.empty': 'لا يوجد ما يطابق عوامل التصفية هذه.',
    'audit.col_when': 'الوقت',
    'audit.col_actor': 'المنفّذ',
    'audit.col_action': 'الإجراء',
    'audit.col_entity': 'العنصر',
    'audit.col_before': 'قبل',
    'audit.col_after': 'بعد',
    'audit.system': 'النظام',
  },
}

export default section
