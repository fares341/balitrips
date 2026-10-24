/**
 * WhatsApp automations — the catalogue from the client proposal
 * («نظام رسائل واتساب التلقائية», Oct 2026, phase one).
 *
 * One entry per automatic message. Each has:
 *  - the variables its text may use (`{name}`, `{order}`…), in the order they
 *    are passed to an approved provider template as {{1}}, {{2}}…;
 *  - a default text in Arabic, English and Indonesian (editable in Studio →
 *    WhatsApp; the defaults are the proposal's sample messages);
 *  - when it is sent (documentation for Studio; the wiring lives in
 *    `./dispatch.ts` and the sweep).
 *
 * Pure: no database, no clock — the tests and the Studio page import it.
 * The proposal's phase two (interactive service menu) is not built.
 */

import { locales, type Locale } from '@/i18n/config'

export const AUTOMATION_KEYS = [
  'order_received',
  'booking_confirmed',
  'booking_cancelled',
  'payment_success',
  'payment_incomplete',
  'payment_failed',
  'itinerary_purchased',
  'custom_itinerary_ready',
  'driver_confirmed',
  'trip_reminder',
  'trip_thanks',
  'review_request',
] as const

export type AutomationKey = (typeof AUTOMATION_KEYS)[number]

export function isAutomationKey(value: string): value is AutomationKey {
  return (AUTOMATION_KEYS as readonly string[]).includes(value)
}

export type AutomationTexts = Record<Locale, string>

export interface AutomationSpec {
  /** Variables, in template-parameter order ({{1}} = first). */
  vars: readonly string[]
  /** Default message per language. */
  defaults: AutomationTexts
}

export const AUTOMATIONS: Record<AutomationKey, AutomationSpec> = {
  order_received: {
    vars: ['name', 'order', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nشكرًا لاختيارك Bali Trips.\n\nتم استلام طلبك رقم #{order} بنجاح، وسيتم إشعارك فور تحديث حالته.\n\nتفاصيل الطلب: {link}',
      en: 'Hello {name},\nThank you for choosing Bali Trips.\n\nWe have received your order #{order} and will let you know as soon as its status changes.\n\nOrder details: {link}',
      id: 'Halo {name},\nTerima kasih telah memilih Bali Trips.\n\nPesanan Anda #{order} sudah kami terima. Kami akan mengabari Anda begitu statusnya berubah.\n\nDetail pesanan: {link}',
    },
  },
  booking_confirmed: {
    vars: ['name', 'activity', 'date', 'people', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nتم تأكيد حجزك بنجاح.\n\nالفعالية: {activity}\nالتاريخ: {date}\nعدد الأشخاص: {people}\n\nنتمنى لك تجربة رائعة مع Bali Trips.\nعرض الحجز: {link}',
      en: 'Hello {name},\nYour booking is confirmed.\n\nActivity: {activity}\nDate: {date}\nPeople: {people}\n\nWe wish you a wonderful experience with Bali Trips.\nView booking: {link}',
      id: 'Halo {name},\nPemesanan Anda sudah dikonfirmasi.\n\nAktivitas: {activity}\nTanggal: {date}\nJumlah orang: {people}\n\nSemoga pengalaman Anda bersama Bali Trips menyenangkan.\nLihat pemesanan: {link}',
    },
  },
  booking_cancelled: {
    vars: ['name', 'order', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nتم إلغاء حجزك رقم #{order}. يمكنك مراجعة تفاصيل الإلغاء من خلال حسابك.\n\nعرض التفاصيل: {link}',
      en: 'Hello {name},\nYour booking #{order} has been cancelled. You can review the cancellation details in your account.\n\nView details: {link}',
      id: 'Halo {name},\nPemesanan Anda #{order} telah dibatalkan. Detail pembatalan bisa Anda lihat di akun Anda.\n\nLihat detail: {link}',
    },
  },
  payment_success: {
    vars: ['name', 'amount', 'order'],
    defaults: {
      ar: 'مرحبًا {name}،\nتم استلام دفعتك بقيمة {amount} بنجاح للطلب #{order}.\n\nشكرًا لثقتك بمنصة Bali Trips.',
      en: 'Hello {name},\nWe have received your payment of {amount} for order #{order}.\n\nThank you for trusting Bali Trips.',
      id: 'Halo {name},\nPembayaran Anda sebesar {amount} untuk pesanan #{order} telah kami terima.\n\nTerima kasih atas kepercayaan Anda kepada Bali Trips.',
    },
  },
  payment_incomplete: {
    vars: ['name', 'order', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nعملية الدفع الخاصة بحجزك #{order} لم تكتمل بعد.\n\nيمكنك إتمام الدفع بأمان من خلال الرابط التالي:\n{link}',
      en: 'Hello {name},\nThe payment for your booking #{order} has not been completed yet.\n\nYou can complete it securely here:\n{link}',
      id: 'Halo {name},\nPembayaran untuk pemesanan Anda #{order} belum selesai.\n\nAnda dapat menyelesaikannya dengan aman di sini:\n{link}',
    },
  },
  payment_failed: {
    vars: ['name', 'order', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nتعذّر إتمام عملية الدفع الخاصة بطلبك #{order}.\n\nيمكنك إعادة المحاولة من خلال الرابط التالي:\n{link}',
      en: 'Hello {name},\nWe could not complete the payment for your order #{order}.\n\nYou can try again here:\n{link}',
      id: 'Halo {name},\nPembayaran untuk pesanan Anda #{order} tidak berhasil.\n\nAnda dapat mencoba lagi di sini:\n{link}',
    },
  },
  itinerary_purchased: {
    vars: ['name', 'itinerary', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nتم شراء جدولك السياحي «{itinerary}» بنجاح.\n\nيمكنك تحميل الملف والاحتفاظ به على هاتفك والرجوع إليه في أي وقت:\n{link}',
      en: 'Hello {name},\nYour travel itinerary “{itinerary}” is yours.\n\nDownload it, keep it on your phone and come back to it any time:\n{link}',
      id: 'Halo {name},\nItinerary perjalanan “{itinerary}” berhasil Anda beli.\n\nUnduh file-nya, simpan di ponsel, dan buka kapan saja:\n{link}',
    },
  },
  custom_itinerary_ready: {
    vars: ['name', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nيسعدنا إبلاغك بأن جدولك السياحي المخصص في بالي أصبح جاهزًا.\n\nيمكنك الاطلاع عليه وتحميله من خلال الرابط التالي:\n{link}',
      en: 'Hello {name},\nGood news: your custom Bali itinerary is ready.\n\nYou can view and download it here:\n{link}',
      id: 'Halo {name},\nKabar baik: itinerary Bali khusus Anda sudah siap.\n\nAnda dapat melihat dan mengunduhnya di sini:\n{link}',
    },
  },
  driver_confirmed: {
    vars: ['name', 'date', 'time', 'vehicle', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nتم تأكيد حجز السائق الخاص.\n\nالتاريخ: {date}\nوقت الاستلام: {time}\nالسيارة: {vehicle}\n\nتفاصيل الحجز متاحة في حسابك: {link}',
      en: 'Hello {name},\nYour private driver is confirmed.\n\nDate: {date}\nPick-up time: {time}\nVehicle: {vehicle}\n\nBooking details are in your account: {link}',
      id: 'Halo {name},\nSopir pribadi Anda sudah dikonfirmasi.\n\nTanggal: {date}\nWaktu penjemputan: {time}\nKendaraan: {vehicle}\n\nDetail pemesanan ada di akun Anda: {link}',
    },
  },
  trip_reminder: {
    vars: ['name', 'activity', 'date', 'time', 'link'],
    defaults: {
      ar: 'مرحبًا {name}،\nنذكّرك بأن موعد رحلتك غدًا ({date}) الساعة {time}.\n\nالفعالية: {activity}\nعرض الحجز: {link}',
      en: 'Hello {name},\nA reminder that your trip is tomorrow ({date}) at {time}.\n\nActivity: {activity}\nView booking: {link}',
      id: 'Halo {name},\nSekadar mengingatkan, perjalanan Anda besok ({date}) pukul {time}.\n\nAktivitas: {activity}\nLihat pemesanan: {link}',
    },
  },
  trip_thanks: {
    vars: ['name'],
    defaults: {
      ar: 'مرحبًا {name}،\nنتمنى أنك استمتعت بتجربتك معنا في بالي.\n\nشكرًا لاختيارك Bali Trips.',
      en: 'Hello {name},\nWe hope you enjoyed your experience with us in Bali.\n\nThank you for choosing Bali Trips.',
      id: 'Halo {name},\nKami harap Anda menikmati pengalaman bersama kami di Bali.\n\nTerima kasih telah memilih Bali Trips.',
    },
  },
  review_request: {
    vars: ['name', 'activity', 'link'],
    defaults: {
      ar: 'رأيك يهمنا!\n\nيسعدنا تقييمك لتجربتك الأخيرة معنا ({activity}).\nقيّم الرحلة: {link}',
      en: 'Your opinion matters!\n\nWe would love to hear how your recent experience with us went ({activity}).\nRate your trip: {link}',
      id: 'Pendapat Anda penting!\n\nKami ingin tahu kesan Anda tentang pengalaman terakhir bersama kami ({activity}).\nBeri ulasan: {link}',
    },
  },
}

/** Replace `{var}` placeholders; unknown ones are left visible so an editor notices. */
export function renderText(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? '') : whole,
  )
}

/** Values in template-parameter order ({{1}}, {{2}}…), never empty (Meta rejects ''). */
export function templateValues(key: AutomationKey, vars: Record<string, string>): string[] {
  return AUTOMATIONS[key].vars.map((name) => {
    const value = (vars[name] ?? '').trim()
    return value === '' ? '-' : value.slice(0, 900)
  })
}

/** The customer's language for a message: theirs if supported, otherwise English. */
export function messageLocale(raw: string | null | undefined): Locale {
  return raw && (locales as readonly string[]).includes(raw) ? (raw as Locale) : 'en'
}
