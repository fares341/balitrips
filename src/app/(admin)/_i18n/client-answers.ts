import type { Section } from './types'

/**
 * Studio strings — client answers (Oct 2026): vehicles and driver prices for
 * packages, authorised bookings (charge after the supplier confirms), a place
 * opened on the map on its own. en and ar hold the same keys.
 */
const section: Section = {
  en: {
    'nav.vehicles': 'Vehicles & driver prices',
    'veh.title': 'Vehicles & driver prices',
    'veh.description':
      'Every package includes a driver. A package day costs the chosen vehicle’s day price for the zone the day is in. Prices as on the client’s sheets; the site sells in USD.',
    'veh.rate': 'Exchange rate',
    'veh.sar_per_usd': 'SAR per 1 USD',
    'veh.sar_hint': 'Used when a zone has no USD price: USD = SAR ÷ this rate.',
    'veh.add': 'Add a vehicle',
    'veh.key': 'Code',
    'veh.key_hint': 'Lower-case letters, digits and dashes. Leave empty to skip.',
    'veh.class': 'Class',
    'veh.class_standard': 'Standard',
    'veh.class_van': 'Large van',
    'veh.class_luxury': 'Luxury (own icon on the site)',
    'veh.luxury': 'Luxury',
    'veh.capacity': 'Seats (travellers)',
    'veh.to_confirm': 'To confirm — the client has not given this yet.',
    'veh.capacity_confirmed': 'Capacity confirmed by the owner',
    'veh.active': 'Offered on packages',
    'veh.remove': 'Remove this vehicle',
    'veh.name': 'Name',
    'veh.note': 'Note',
    'veh.zones': 'Zones and day prices',
    'veh.zone': 'Zone',
    'veh.areas': 'Areas',
    'veh.site_price': 'Day price on the site',
    'veh.region_zones': 'Zone of each area',
    'veh.region_zones_hint':
      'Automatic = the zone whose area list names the area, else zone 1. Choose a zone to override.',
    'veh.auto': 'Automatic (zone {zone})',
    'veh.save': 'Save vehicles',
    'veh.back': 'Back to packages',
    'veh.ok_saved': 'Vehicles and prices saved.',
    'veh.lead_vehicle': 'Vehicle',
    'veh.lead_estimate': 'Estimate shown to the customer',

    'ca.order_authorized': 'Held — awaiting supplier',
    'ca.payment_authorized': 'Authorised (held)',
    'ca.heading': 'Charge after the supplier confirms',
    'ca.hint':
      'The amount is held on the customer’s card, not charged. Confirm with the supplier, then charge it. If the supplier cannot run it, release the hold — nothing is charged and the customer is told. Unconfirmed holds are released automatically after 6 days (Stripe keeps a hold about 7).',
    'ca.capture': 'Supplier confirmed — charge',
    'ca.release': 'Supplier refused — release',
    'ca.ok_captured': 'Charged. The order is paid.',
    'ca.ok_released': 'Hold released. Nothing was charged; the customer was told.',
    'ca.err_not_found': 'Order not found.',
    'ca.err_not_authorized': 'This order is no longer waiting for the supplier.',
    'ca.err_no_payment': 'No held payment on this order.',
    'ca.err_provider_refused':
      'The payment provider refused (the hold may have expired). Check Studio → Payments.',

    'places.free_override': 'Free even in a VIP category',
    'places.free_override_hint':
      'Opens this one place to everyone on the map (for example Sekumpul waterfall), whatever its category.',
  },
  ar: {
    'nav.vehicles': 'السيارات وأسعار السائق',
    'veh.title': 'السيارات وأسعار السائق',
    'veh.description':
      'كل الباقات تشمل سائقًا. يوم الباقة يكلّف سعر يوم السيارة المختارة حسب منطقة ذلك اليوم. الأسعار كما في كشوف العميل، والموقع يبيع بالدولار.',
    'veh.rate': 'سعر الصرف',
    'veh.sar_per_usd': 'ريال سعودي لكل 1 دولار',
    'veh.sar_hint': 'يُستخدم حين لا يوجد سعر بالدولار للمنطقة: الدولار = الريال ÷ هذا السعر.',
    'veh.add': 'إضافة سيارة',
    'veh.key': 'الرمز',
    'veh.key_hint': 'أحرف إنجليزية صغيرة وأرقام وشرطات. اتركه فارغًا للتجاهل.',
    'veh.class': 'الفئة',
    'veh.class_standard': 'عادية',
    'veh.class_van': 'فان كبير',
    'veh.class_luxury': 'فاخرة (لها أيقونة خاصة في الموقع)',
    'veh.luxury': 'فاخرة',
    'veh.capacity': 'عدد المقاعد (المسافرين)',
    'veh.to_confirm': 'للتأكيد — لم يحدده العميل بعد.',
    'veh.capacity_confirmed': 'السعة مؤكدة من المالك',
    'veh.active': 'معروضة في الباقات',
    'veh.remove': 'حذف هذه السيارة',
    'veh.name': 'الاسم',
    'veh.note': 'ملاحظة',
    'veh.zones': 'المناطق وأسعار اليوم',
    'veh.zone': 'المنطقة',
    'veh.areas': 'الأماكن',
    'veh.site_price': 'سعر اليوم في الموقع',
    'veh.region_zones': 'منطقة كل مكان',
    'veh.region_zones_hint':
      'تلقائي = المنطقة التي تذكر قائمتها هذا المكان، وإلا المنطقة 1. اختر منطقة لتغييرها.',
    'veh.auto': 'تلقائي (المنطقة {zone})',
    'veh.save': 'حفظ السيارات',
    'veh.back': 'العودة للباقات',
    'veh.ok_saved': 'حُفظت السيارات والأسعار.',
    'veh.lead_vehicle': 'السيارة',
    'veh.lead_estimate': 'التقدير المعروض للعميل',

    'ca.order_authorized': 'محجوز — بانتظار المورد',
    'ca.payment_authorized': 'مُفوَّض (محجوز)',
    'ca.heading': 'السحب بعد تأكيد المورد',
    'ca.hint':
      'المبلغ محجوز على بطاقة العميل ولم يُسحب. أكّد مع المورد ثم اسحب المبلغ. إن تعذّر على المورد التنفيذ ففُك الحجز — لا يُخصم شيء ويُبلَّغ العميل. الحجوزات غير المؤكدة تُفك تلقائيًا بعد 6 أيام (Stripe يحتفظ بالحجز نحو 7 أيام).',
    'ca.capture': 'أكد المورد — اسحب المبلغ',
    'ca.release': 'رفض المورد — فُك الحجز',
    'ca.ok_captured': 'سُحب المبلغ. الطلب مدفوع.',
    'ca.ok_released': 'فُك الحجز ولم يُخصم شيء، وأُبلغ العميل.',
    'ca.err_not_found': 'الطلب غير موجود.',
    'ca.err_not_authorized': 'هذا الطلب لم يعد بانتظار المورد.',
    'ca.err_no_payment': 'لا يوجد مبلغ محجوز على هذا الطلب.',
    'ca.err_provider_refused':
      'رفض مزوّد الدفع (ربما انتهت مدة الحجز). راجع الاستوديو ← المدفوعات.',

    'places.free_override': 'مجاني حتى في تصنيف VIP',
    'places.free_override_hint':
      'يفتح هذا المكان وحده للجميع على الخريطة (مثل شلال سيكومبول) مهما كان تصنيفه.',
  },
}

export default section
