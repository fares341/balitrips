import type { Section } from './types'

/**
 * Studio strings — phase 3: itinerary day places, how an itinerary is sold,
 * map access (Free / VIP), packages that create bookings, VIP settings.
 * Plain words for a non-technical owner. en and ar must hold the same keys.
 */
const section: Section = {
  en: {
    'nav.vip': 'VIP settings',
    'audit.entity_itinerary_day': 'Itinerary day',

    // ── How it is sold ──
    'p3.section_sale': 'How this itinerary is sold',
    'p3.sale_hint':
      'Tick every way customers may buy it. Only the ticked ways appear on the website.',
    'p3.sale_digital': 'The itinerary on its own',
    'p3.sale_digital_hint': 'Customers buy the plan (pages and PDF) by itself.',
    'p3.sale_activities': 'The itinerary + bookable activities',
    'p3.sale_activities_hint':
      'Customers can also book the activities of the days you mark "can be booked", with the dates worked out from their trip start date.',
    'p3.sale_packages': 'Inside a package',
    'p3.sale_packages_hint': 'Shows the packages you link below on the itinerary page.',
    'p3.sale_custom': 'Ask for a custom trip like this one',
    'p3.sale_custom_hint':
      'Shows a button to the custom trip request form, already filled in with this itinerary.',

    // ── Map access ──
    'p3.map_access': 'What it gives on the map',
    'p3.map_access_hint':
      'The map has two levels: Free and VIP. VIP is never given unless you choose one of the VIP options here.',
    'p3.map_free_only': 'Free map only',
    'p3.map_free_only_hint': 'Buying the itinerary does not open VIP places.',
    'p3.map_vip_included': 'VIP included',
    'p3.map_vip_included_hint':
      'Buying the itinerary opens VIP for the customer, with no end date. (Itineraries that already "included the map" are here.)',
    'p3.map_vip_addon': 'VIP as an optional extra when buying',
    'p3.map_vip_addon_hint':
      'Customers see an unticked box "Add VIP map" next to the buy button. If they tick it, VIP is added as its own line with its own price.',
    'p3.map_vip_later': 'VIP offered later',
    'p3.map_vip_later_hint':
      'Nothing at purchase. In My Trip the customer sees "Upgrade to VIP" while they do not have VIP.',
    'p3.vip_plan': 'VIP plan to offer',
    'p3.vip_plan_hint':
      'Which VIP plan (price, length, devices) is offered as the extra or upgrade.',
    'p3.vip_plan_auto': 'The cheapest published VIP plan',
    'p3.no_vip_plans': 'There is no VIP plan yet. Add one in Plans (map access: VIP).',

    // ── Day places ──
    'p3.day_bookable': 'Can be booked from the itinerary',
    'p3.day_bookable_hint':
      'Used when "The itinerary + bookable activities" is ticked. Only for a day with an activity.',
    'p3.day_places_title': 'Places on day {number}',
    'p3.day_places_hint':
      'Search the map places and add them in the order the traveller visits them. Drag by the handle (or use the arrows) to change the order, then press Save.',
    'p3.day_places_empty': 'No places on this day yet.',
    'p3.search_places': 'Add a place',
    'p3.search_places_ph': 'Type a place name…',
    'p3.search_none': 'No place matches. Check the spelling, or add the place in Places first.',
    'p3.access_free': 'free',
    'p3.access_map': 'map members',
    'p3.access_vip': 'VIP only',
    'p3.visit_time': 'Time',
    'p3.note_add': 'Add a short tip',
    'p3.note_edit': 'Edit the tip',
    'p3.day_places_save': 'Save the places of this day',
    'p3.saved': 'Saved.',
    'p3.unsaved': 'Not saved yet.',
    'p3.save_failed': 'Could not save. Please try again.',
    'p3.place_gone': 'This place was removed from the map.',
    'p3.err_too_many_places': 'A day can have at most {max} places.',
    'p3.err_place_twice': 'The same place is on this day twice.',
    'p3.err_time': 'Write the time like 09:30.',

    // ── Packages linked to the itinerary ──
    'p3.section_packages': 'Packages that include this itinerary',
    'p3.packages_hint':
      'Link packages here to sell the itinerary inside them. The first one (or the one marked main) is shown first.',
    'p3.packages_off':
      'Customers will not see these until "Inside a package" is ticked above (and saved).',
    'p3.packages_empty': 'No package linked yet.',
    'p3.link_package': 'Package',
    'p3.link_choose': 'Choose a package',
    'p3.price_rule': 'Price rule',
    'p3.rule_included': 'Included in the package price',
    'p3.rule_included_hint': 'The package price already covers the itinerary.',
    'p3.rule_extra': 'Sold next to the package',
    'p3.rule_extra_hint': 'The itinerary is offered beside the package, at its own price.',
    'p3.rule_deducted_on_upgrade': 'Deducted when upgrading',
    'p3.rule_deducted_on_upgrade_hint':
      'The package includes it, and a customer who already bought the itinerary pays the package minus what they paid for it.',
    'p3.link_default': 'Main package',
    'p3.link_save': 'Save',
    'p3.link_add': 'Link package',
    'p3.ok_link_added': 'Package linked.',
    'p3.ok_link_saved': 'Saved.',
    'p3.ok_link_removed': 'Package unlinked.',
    'p3.err_pick_package': 'Choose a package.',
    'p3.err_link_exists': 'That package is already linked.',
    'p3.err_link_gone': 'That link no longer exists.',

    // ── Package editor ──
    'p3.pkg_itinerary': 'Itinerary included',
    'p3.pkg_itinerary_hint':
      'The customer gets this itinerary (pages and PDF) when the package is paid.',
    'p3.pkg_no_itinerary': 'No itinerary',
    'p3.pkg_vip': 'VIP map included',
    'p3.pkg_vip_hint':
      'The customer gets the VIP plan chosen next to it when the package is paid. A refund of the package takes it back.',
    'p3.err_vip_plan_needed': 'Choose which VIP plan comes with the package.',
    'p3.pkg_preview': 'Preview',
    'p3.pkg_activities': 'Activities in this package',
    'p3.pkg_activities_hint':
      'When the package is paid, each activity becomes its own booking for its supplier, on the chosen day of the trip. Drag to change the order.',
    'p3.pkg_activities_empty': 'No activity in this package yet.',
    'p3.pkg_day': 'Day of the trip',
    'p3.pkg_day_unset': 'Not fixed — we arrange it',
    'p3.pkg_choose_activity': 'Choose an activity',
    'p3.pkg_add_activity': 'Add activity',
    'p3.err_pick_activity': 'Choose an activity.',
    'p3.err_activity_twice': 'That activity is already in the package.',
    'p3.ok_activity_added': 'Activity added.',
    'p3.ok_activity_saved': 'Saved.',
    'p3.ok_activity_removed': 'Activity removed.',
    'p3.pkg_cost': 'Cost and profit (estimate)',
    'p3.pkg_cost_hint':
      'For {n} people, using the supplier each booking would be given to today. The real cost is saved on each booking when it is paid.',
    'p3.pkg_cost_supplier': 'Supplier',
    'p3.pkg_cost_amount': 'Cost',
    'p3.pkg_cost_no_supplier': 'No supplier',
    'p3.pkg_cost_total': 'Total cost',
    'p3.pkg_cost_price': 'Price for {n} people',
    'p3.pkg_cost_margin': 'Profit',
    'p3.pkg_cost_incomplete':
      'Not known yet: {n} activity(ies) have no supplier or a cost in another currency.',

    // ── VIP settings ──
    'p3.vip_settings': 'VIP settings',
    'p3.vip_settings_description':
      'Where VIP map access is offered. VIP is given only when it is paid for, or when you give it by hand.',
    'p3.back_to_plans': 'Back to plans',
    'p3.vip_rules_title': 'How customers get VIP',
    'p3.vip_rule_1': 'They buy a VIP plan on its own (if allowed below).',
    'p3.vip_rule_2':
      'They buy an itinerary set to "VIP included", or tick "Add VIP map" on an itinerary set to "VIP as an optional extra".',
    'p3.vip_rule_3': 'They buy a package with "VIP map included".',
    'p3.vip_rule_4':
      'You give it by hand in Access. A refund takes back the VIP that the refunded item gave.',
    'p3.vip_where': 'Where VIP is offered',
    'p3.vip_standalone': 'Sell VIP plans on their own',
    'p3.vip_standalone_hint':
      'Off: VIP plans disappear from the plans page and can only come with an itinerary or package.',
    'p3.vip_upsell': 'Offer "Add VIP" at checkout',
    'p3.vip_upsell_hint':
      'Shown at checkout when the trip has an itinerary or activities, nothing in it gives VIP, and the customer has no VIP.',
    'p3.vip_upsell_plan': 'VIP plan offered at checkout',
    'p3.vip_refund_note': 'Refund note shown with VIP offers',
    'p3.vip_refund_note_hint':
      'Short, e.g. "VIP can be refunded within 24 hours if not used." Leave empty to show nothing.',
    'p3.vip_save': 'Save VIP settings',
    'p3.ok_vip_saved': 'VIP settings saved.',
    'p3.vip_plans': 'VIP plans',
    'p3.vip_plans_hint':
      'Price, how long it lasts and how many devices can use it are set on each plan.',
    'p3.vip_manage_people': 'Give, extend or take back VIP for a customer:',

    // ── Access: extend ──
    'p3.extend': 'Extend',
    'p3.extend_days': 'Days to add',
    'p3.ok_extended': 'Extended by {days} days.',
    'p3.err_extend_days': 'Write a number of days between 1 and 3650.',
    'p3.err_extend_lifetime': 'This access has no end date, so there is nothing to extend.',
  },
  ar: {
    'nav.vip': 'إعدادات VIP',
    'audit.entity_itinerary_day': 'يوم في الجدول',

    'p3.section_sale': 'طرق بيع هذا الجدول',
    'p3.sale_hint': 'اختر كل طريقة يمكن للعميل الشراء بها. تظهر في الموقع الطرق المختارة فقط.',
    'p3.sale_digital': 'الجدول وحده',
    'p3.sale_digital_hint': 'يشتري العميل الجدول (الصفحات وملف PDF) وحده.',
    'p3.sale_activities': 'الجدول + أنشطة يمكن حجزها',
    'p3.sale_activities_hint':
      'يستطيع العميل أيضاً حجز أنشطة الأيام التي تعلّمها "يمكن حجزه"، وتُحسب التواريخ من تاريخ بداية رحلته.',
    'p3.sale_packages': 'ضمن باقة',
    'p3.sale_packages_hint': 'تظهر الباقات التي تربطها في الأسفل داخل صفحة الجدول.',
    'p3.sale_custom': 'طلب رحلة مخصصة مثل هذا الجدول',
    'p3.sale_custom_hint': 'يظهر زر لنموذج طلب الرحلة المخصصة، مملوءاً مسبقاً باسم هذا الجدول.',

    'p3.map_access': 'ماذا يعطي على الخريطة',
    'p3.map_access_hint':
      'للخريطة مستويان: مجاني وVIP. لا يُعطى VIP أبداً إلا إذا اخترت أحد خيارات VIP هنا.',
    'p3.map_free_only': 'الخريطة المجانية فقط',
    'p3.map_free_only_hint': 'شراء الجدول لا يفتح أماكن VIP.',
    'p3.map_vip_included': 'VIP مشمول',
    'p3.map_vip_included_hint':
      'شراء الجدول يفتح VIP للعميل بلا تاريخ انتهاء. (الجداول التي كانت "تشمل الخريطة" موجودة هنا.)',
    'p3.map_vip_addon': 'VIP إضافة اختيارية عند الشراء',
    'p3.map_vip_addon_hint':
      'يرى العميل مربعاً غير محدد "أضف خريطة VIP" بجانب زر الشراء. إن اختاره يُضاف VIP كبند مستقل بسعره.',
    'p3.map_vip_later': 'عرض VIP لاحقاً',
    'p3.map_vip_later_hint':
      'لا شيء عند الشراء. في "رحلتي" يرى العميل زر "الترقية إلى VIP" ما دام لا يملك VIP.',
    'p3.vip_plan': 'باقة VIP المعروضة',
    'p3.vip_plan_hint': 'أي باقة VIP (السعر والمدة والأجهزة) تُعرض كإضافة أو ترقية.',
    'p3.vip_plan_auto': 'أرخص باقة VIP منشورة',
    'p3.no_vip_plans': 'لا توجد باقة VIP بعد. أضفها من الباقات (الوصول للخريطة: VIP).',

    'p3.day_bookable': 'يمكن حجزه من صفحة الجدول',
    'p3.day_bookable_hint': 'يُستخدم عند اختيار "الجدول + أنشطة يمكن حجزها". فقط ليوم فيه نشاط.',
    'p3.day_places_title': 'أماكن اليوم {number}',
    'p3.day_places_hint':
      'ابحث في أماكن الخريطة وأضفها بترتيب الزيارة. اسحب من المقبض (أو استخدم الأسهم) لتغيير الترتيب، ثم اضغط حفظ.',
    'p3.day_places_empty': 'لا توجد أماكن في هذا اليوم بعد.',
    'p3.search_places': 'إضافة مكان',
    'p3.search_places_ph': 'اكتب اسم المكان…',
    'p3.search_none': 'لا يوجد مكان بهذا الاسم. تأكد من الكتابة، أو أضف المكان أولاً من الأماكن.',
    'p3.access_free': 'مجاني',
    'p3.access_map': 'للمشتركين',
    'p3.access_vip': 'VIP فقط',
    'p3.visit_time': 'الوقت',
    'p3.note_add': 'أضف نصيحة قصيرة',
    'p3.note_edit': 'تعديل النصيحة',
    'p3.day_places_save': 'حفظ أماكن هذا اليوم',
    'p3.saved': 'تم الحفظ.',
    'p3.unsaved': 'لم يُحفظ بعد.',
    'p3.save_failed': 'تعذّر الحفظ. حاول مرة أخرى.',
    'p3.place_gone': 'هذا المكان حُذف من الخريطة.',
    'p3.err_too_many_places': 'لا يمكن أن يحتوي اليوم على أكثر من {max} مكاناً.',
    'p3.err_place_twice': 'المكان نفسه موجود مرتين في هذا اليوم.',
    'p3.err_time': 'اكتب الوقت هكذا 09:30.',

    'p3.section_packages': 'باقات تشمل هذا الجدول',
    'p3.packages_hint': 'اربط باقات هنا لبيع الجدول ضمنها. تظهر الأولى (أو المعلّمة رئيسية) أولاً.',
    'p3.packages_off': 'لن يراها العملاء حتى تختار "ضمن باقة" في الأعلى (وتحفظ).',
    'p3.packages_empty': 'لا توجد باقة مرتبطة بعد.',
    'p3.link_package': 'الباقة',
    'p3.link_choose': 'اختر باقة',
    'p3.price_rule': 'طريقة السعر',
    'p3.rule_included': 'مشمول في سعر الباقة',
    'p3.rule_included_hint': 'سعر الباقة يغطي الجدول.',
    'p3.rule_extra': 'يُباع بجانب الباقة',
    'p3.rule_extra_hint': 'يُعرض الجدول بجانب الباقة بسعره الخاص.',
    'p3.rule_deducted_on_upgrade': 'يُخصم عند الترقية',
    'p3.rule_deducted_on_upgrade_hint':
      'الباقة تشمله، والعميل الذي اشترى الجدول سابقاً يدفع سعر الباقة ناقص ما دفعه للجدول.',
    'p3.link_default': 'الباقة الرئيسية',
    'p3.link_save': 'حفظ',
    'p3.link_add': 'ربط الباقة',
    'p3.ok_link_added': 'تم ربط الباقة.',
    'p3.ok_link_saved': 'تم الحفظ.',
    'p3.ok_link_removed': 'تم فك ربط الباقة.',
    'p3.err_pick_package': 'اختر باقة.',
    'p3.err_link_exists': 'هذه الباقة مرتبطة بالفعل.',
    'p3.err_link_gone': 'هذا الربط لم يعد موجوداً.',

    'p3.pkg_itinerary': 'الجدول المشمول',
    'p3.pkg_itinerary_hint': 'يحصل العميل على هذا الجدول (الصفحات وPDF) عند دفع الباقة.',
    'p3.pkg_no_itinerary': 'بدون جدول',
    'p3.pkg_vip': 'خريطة VIP مشمولة',
    'p3.pkg_vip_hint':
      'يحصل العميل على باقة VIP المختارة بجانبه عند دفع الباقة. استرداد الباقة يسحبها.',
    'p3.err_vip_plan_needed': 'اختر باقة VIP التي تأتي مع الباقة.',
    'p3.pkg_preview': 'معاينة',
    'p3.pkg_activities': 'أنشطة هذه الباقة',
    'p3.pkg_activities_hint':
      'عند دفع الباقة يصبح كل نشاط حجزاً مستقلاً لمورّده، في اليوم المختار من الرحلة. اسحب لتغيير الترتيب.',
    'p3.pkg_activities_empty': 'لا يوجد نشاط في هذه الباقة بعد.',
    'p3.pkg_day': 'يوم الرحلة',
    'p3.pkg_day_unset': 'غير محدد — نرتّبه نحن',
    'p3.pkg_choose_activity': 'اختر نشاطاً',
    'p3.pkg_add_activity': 'إضافة نشاط',
    'p3.err_pick_activity': 'اختر نشاطاً.',
    'p3.err_activity_twice': 'هذا النشاط موجود في الباقة بالفعل.',
    'p3.ok_activity_added': 'تمت إضافة النشاط.',
    'p3.ok_activity_saved': 'تم الحفظ.',
    'p3.ok_activity_removed': 'تمت إزالة النشاط.',
    'p3.pkg_cost': 'التكلفة والربح (تقديري)',
    'p3.pkg_cost_hint':
      'لعدد {n} أشخاص، حسب المورّد الذي سيُعطى له كل حجز اليوم. التكلفة الفعلية تُحفظ على كل حجز عند دفعه.',
    'p3.pkg_cost_supplier': 'المورّد',
    'p3.pkg_cost_amount': 'التكلفة',
    'p3.pkg_cost_no_supplier': 'لا يوجد مورّد',
    'p3.pkg_cost_total': 'إجمالي التكلفة',
    'p3.pkg_cost_price': 'السعر لعدد {n} أشخاص',
    'p3.pkg_cost_margin': 'الربح',
    'p3.pkg_cost_incomplete': 'غير معروف بعد: {n} نشاط بلا مورّد أو بتكلفة بعملة أخرى.',

    'p3.vip_settings': 'إعدادات VIP',
    'p3.vip_settings_description':
      'أين تُعرض خريطة VIP. لا يُعطى VIP إلا إذا دُفع ثمنه، أو إذا منحته أنت يدوياً.',
    'p3.back_to_plans': 'العودة إلى الباقات',
    'p3.vip_rules_title': 'كيف يحصل العميل على VIP',
    'p3.vip_rule_1': 'يشتري باقة VIP وحدها (إن كان ذلك مسموحاً في الأسفل).',
    'p3.vip_rule_2':
      'يشتري جدولاً مضبوطاً على "VIP مشمول"، أو يختار "أضف خريطة VIP" في جدول مضبوط على "VIP إضافة اختيارية".',
    'p3.vip_rule_3': 'يشتري باقة فيها "خريطة VIP مشمولة".',
    'p3.vip_rule_4':
      'تمنحه أنت يدوياً من صفحة الوصول. الاسترداد يسحب VIP الذي أعطاه البند المسترد.',
    'p3.vip_where': 'أين يُعرض VIP',
    'p3.vip_standalone': 'بيع باقات VIP وحدها',
    'p3.vip_standalone_hint':
      'عند الإيقاف: تختفي باقات VIP من صفحة الباقات ولا تأتي إلا مع جدول أو باقة.',
    'p3.vip_upsell': 'عرض "أضف VIP" عند الدفع',
    'p3.vip_upsell_hint':
      'يظهر عند الدفع إذا كانت الرحلة فيها جدول أو أنشطة، ولا شيء فيها يعطي VIP، والعميل لا يملك VIP.',
    'p3.vip_upsell_plan': 'باقة VIP المعروضة عند الدفع',
    'p3.vip_refund_note': 'ملاحظة الاسترداد مع عروض VIP',
    'p3.vip_refund_note_hint':
      'قصيرة، مثل: "يمكن استرداد VIP خلال 24 ساعة إن لم يُستخدم." اتركها فارغة لعدم إظهار شيء.',
    'p3.vip_save': 'حفظ إعدادات VIP',
    'p3.ok_vip_saved': 'تم حفظ إعدادات VIP.',
    'p3.vip_plans': 'باقات VIP',
    'p3.vip_plans_hint': 'السعر والمدة وعدد الأجهزة تُضبط في كل باقة.',
    'p3.vip_manage_people': 'منح VIP لعميل أو تمديده أو سحبه:',

    'p3.extend': 'تمديد',
    'p3.extend_days': 'الأيام المضافة',
    'p3.ok_extended': 'تم التمديد {days} يوماً.',
    'p3.err_extend_days': 'اكتب عدد أيام بين 1 و3650.',
    'p3.err_extend_lifetime': 'هذا الوصول بلا تاريخ انتهاء، فلا يوجد ما يُمدَّد.',
  },
}

export default section
