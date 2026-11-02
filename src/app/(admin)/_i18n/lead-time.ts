import type { Section } from './types'

/**
 * Studio strings — «أقرب موعد للحجز» per activity (migration 0037). Keys
 * `lead.*`; en and ar hold the same keys.
 */
const section: Section = {
  en: {
    'lead.title': 'Earliest booking day',
    'lead.intro':
      'Controls the first day a customer can pick, on Bali time. Dates before it are greyed out in the calendar and refused at checkout.',
    'lead.mode': 'Customers can book',
    'lead.mode_same_day': 'Same day (until the hours below before the start)',
    'lead.mode_tomorrow': 'From tomorrow',
    'lead.mode_day_after': 'From the day after tomorrow',
    'lead.mode_days': 'After a number of days',
    'lead.days': 'Number of days',
    'lead.days_hint':
      'Only for «After a number of days». 3 means a visitor today can book from 3 days later.',
    'lead.hours_hint':
      'Extra notice before the start time, in hours. With «Same day», 4 means a 14:00 tour closes at 10:00. Use 0 with the day options if the day rule is enough.',
    'lead.cutoff': 'Daily cutoff (Bali time, optional)',
    'lead.cutoff_hint':
      'After this time, the earliest day moves one day later. Example: «From tomorrow» + 18:00 — bookings for tomorrow close at 18:00 today.',
    'lead.err_days': 'Enter a number of days between 1 and 365.',
    'lead.err_cutoff': 'The daily cutoff must be a time like 18:00.',
  },
  ar: {
    'lead.title': 'أقرب موعد للحجز',
    'lead.intro':
      'يحدد أول يوم يستطيع العميل اختياره، بتوقيت بالي. الأيام التي قبله تظهر معطلة في التقويم ويرفضها الدفع.',
    'lead.mode': 'يستطيع العميل الحجز',
    'lead.mode_same_day': 'في نفس اليوم (حتى عدد الساعات أدناه قبل الموعد)',
    'lead.mode_tomorrow': 'من الغد',
    'lead.mode_day_after': 'من بعد الغد',
    'lead.mode_days': 'بعد عدد أيام',
    'lead.days': 'عدد الأيام',
    'lead.days_hint': 'لخيار «بعد عدد أيام» فقط. 3 تعني أن زائر اليوم يحجز من بعد 3 أيام.',
    'lead.hours_hint':
      'مهلة إضافية قبل موعد البدء بالساعات. مع «نفس اليوم»، 4 تعني أن جولة 14:00 يُغلق حجزها 10:00. ضع 0 مع خيارات الأيام إن كانت تكفي.',
    'lead.cutoff': 'آخر وقت للحجز يومياً (بتوقيت بالي، اختياري)',
    'lead.cutoff_hint':
      'بعد هذا الوقت ينتقل أقرب موعد يوماً واحداً. مثال: «من الغد» + 18:00 — حجوزات الغد تُغلق الساعة 18:00 اليوم.',
    'lead.err_days': 'أدخل عدد أيام بين 1 و365.',
    'lead.err_cutoff': 'آخر وقت للحجز يجب أن يكون وقتاً مثل 18:00.',
  },
}

export default section
