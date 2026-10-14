'use server'

/**
 * Custom-trip questionnaire — server action.
 *
 * This is the half of the feature the prototype did not have. Its "submit"
 * button was `onClick={() => { setDone(true); window.scrollTo(0, 0) }}`: it
 * switched a local boolean, rendered four cards and offered a WhatsApp link.
 * Nothing was stored. If the traveller closed the tab, or opened WhatsApp and
 * did not press send, the business never learned they existed — the form
 * collected eight answers and produced no lead, no contact details and no way
 * to follow up.
 *
 * Every submission writes a `custom_trip_requests` row now, with the contact
 * details the handoff never asked for. The row is the deliverable; the
 * recommendations and the WhatsApp hand-off are what the traveller gets back.
 *
 * Everything is validated and re-derived here:
 *
 *  - dates must be real, not in the past, and in order — `daysBetweenInclusive`
 *    is only called once `isValidDateRange` has agreed, so a reversed range is
 *    an error rather than the handoff's silent "1 day";
 *  - interest keys are checked against the `categories` table. The handoff's
 *    list contained a key the catalogue did not carry, and its label lookup
 *    `(ACT_CATS.find((c) => c.key === k) || {}).label?.[lang]` resolved to
 *    `undefined`, so that chip rendered as an icon with no text;
 *  - the currency and the vehicle class come from the database, never from the
 *    form. A lead is not an order, but the same rule applies: the browser does
 *    not get to name a price or a vehicle.
 */

import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'

import { and, eq, gt, sql } from 'drizzle-orm'

import { db } from '@/db'
import { customTripRequests, users } from '@/db/schema'
import { defaultLocale, isLocale } from '@/i18n/config'
import { redirect } from '@/i18n/routing'
import { addItem, CartRejectedError } from '@/lib/cart'
import {
  daysBetweenInclusive,
  isPastInBali,
  isValidDateRange,
  vehicleForPassengers,
} from '@/lib/booking-rules'
import {
  listActivities,
  listCategories,
  listDriverVehicles,
  listRegions,
} from '@/lib/content/queries'

import { notifyStaff, notifyUser } from '@/lib/notify'
import { emailGuest } from '@/lib/notify/guest'
import { logActivity } from '@/lib/security/activity'

import { currentUserId } from '../_viewer/session'
import { catalogueCurrency, rankActivities, toMinorUnits } from './match'
import {
  AREAS_MAX,
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  EMAIL_MAX,
  NAME_MAX,
  NOTES_MAX,
  PAX_MAX,
  PAX_MIN,
  PHONE_MAX,
  THEME_KEYS,
  type CustomTripErrors,
  type CustomTripState,
  type ThemeKey,
} from './types'

/** How much of the catalogue the matcher considers. */
const CANDIDATE_LIMIT = 200

/** The taxonomy's "everything" sentinel — a filter, not an interest. */
const ALL_CATEGORY_KEY = 'all'

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Shape only. Cross-field rules (range order, past dates, real category keys)
 * need the database or the clock, so they run below rather than inside the
 * schema — keeping this a pure description of what the form posts.
 */
const schema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(EMAIL_MAX)),
  phone: z.string().trim().max(PHONE_MAX),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
  travellers: z.coerce.number().int().min(PAX_MIN).max(PAX_MAX),
  theme: z.enum(THEME_KEYS as readonly [ThemeKey, ...ThemeKey[]]),
  budget: z.coerce.number().int().min(BUDGET_MIN).max(BUDGET_MAX),
  interests: z.array(z.string().trim()),
  wantsDriver: z.boolean(),
  hasChildren: z.boolean(),
  wantsVipMap: z.boolean(),
  wantsLuxuryDining: z.boolean(),
  wantsAdventure: z.boolean(),
  preferredAreas: z.array(z.string().trim().max(64)).max(AREAS_MAX),
  notes: z.string().trim().max(NOTES_MAX),
  whatsappOptIn: z.boolean(),
})

export async function submitCustomTrip(
  _previous: CustomTripState,
  formData: FormData,
): Promise<CustomTripState> {
  const parsed = schema.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    startDate: formData.get('startDate') ?? '',
    endDate: formData.get('endDate') ?? '',
    travellers: formData.get('travellers') ?? '',
    theme: formData.get('theme') ?? '',
    budget: formData.get('budget') ?? '',
    interests: formData.getAll('interests').map(String),
    // A checkbox that is off is simply absent from the payload.
    wantsDriver: formData.get('wantsDriver') !== null,
    hasChildren: formData.get('hasChildren') !== null,
    wantsVipMap: formData.get('wantsVipMap') !== null,
    wantsLuxuryDining: formData.get('wantsLuxuryDining') !== null,
    wantsAdventure: formData.get('wantsAdventure') !== null,
    preferredAreas: formData.getAll('areas').map(String).slice(0, AREAS_MAX),
    notes: formData.get('notes') ?? '',
    whatsappOptIn: formData.get('whatsappOptIn') !== null,
  })

  if (!parsed.success) {
    return { status: 'error', reason: 'validation', fields: fieldErrorsFrom(parsed.error) }
  }

  const input = parsed.data
  const fields: CustomTripErrors = {}

  // -------------------------------------------------------------------
  // Dates
  // -------------------------------------------------------------------

  /**
   * Both or neither.
   *
   * A start with no end is not a trip, and the handoff's `daysBetween` turned
   * every incomplete or inverted range into "1 day" without telling anyone.
   */
  const hasStart = PLAIN_DATE.test(input.startDate)
  const hasEnd = PLAIN_DATE.test(input.endDate)

  let startDate: string | null = null
  let endDate: string | null = null
  let days: number | null = null

  if (input.startDate !== '' || input.endDate !== '') {
    if (!hasStart || !hasEnd) fields.dates = 'cp_err_dates'
    else if (isPastInBali(input.startDate) || isPastInBali(input.endDate)) {
      fields.dates = 'cp_err_past'
    } else if (!isValidDateRange(input.startDate, input.endDate)) {
      fields.dates = 'cp_err_order'
    } else {
      startDate = input.startDate
      endDate = input.endDate
      days = daysBetweenInclusive(startDate, endDate)
    }
  }

  // -------------------------------------------------------------------
  // Budget granularity
  // -------------------------------------------------------------------

  // The slider steps in 50s; a hand-crafted post should not slip between them.
  const budget = Math.round(input.budget / BUDGET_STEP) * BUDGET_STEP

  // -------------------------------------------------------------------
  // Interests, against the real taxonomy
  // -------------------------------------------------------------------

  const [categories, vehicles, regionRows] = await Promise.all([
    listCategories(),
    listDriverVehicles(),
    listRegions({ includeAreas: true }),
  ])

  // مفاتيح مناطق حقيقية فقط؛ المجهول يُسقط بدل تخزينه.
  const regionKeys = new Set(regionRows.map((row) => row.key))
  const preferredAreas = [...new Set(input.preferredAreas)].filter((key) => regionKeys.has(key))

  const validKeys = new Set(
    categories.map((category) => category.key).filter((key) => key !== ALL_CATEGORY_KEY),
  )

  // De-duplicated, order preserved, unknown keys dropped rather than stored.
  const interests = [...new Set(input.interests)].filter((key) => validKeys.has(key))
  if (interests.length === 0) fields.interests = 'cp_err_ints'

  if (Object.keys(fields).length > 0) {
    return { status: 'error', reason: 'validation', fields }
  }

  // -------------------------------------------------------------------
  // Derived, server-side
  // -------------------------------------------------------------------

  /**
   * The form posts the locale it was rendered in, so the catalogue is ordered
   * against the same strings the reader sees. Anything else falls back to the
   * authoring locale rather than being trusted.
   */
  const posted = formData.get('locale')
  const locale = typeof posted === 'string' && isLocale(posted) ? posted : defaultLocale

  const activities = await listActivities({ locale, limit: CANDIDATE_LIMIT })

  const currency = catalogueCurrency(vehicles, activities)
  const budgetPerPersonMinor = toMinorUnits(budget, currency)

  const vehicleClass = input.wantsDriver ? vehicleForPassengers(input.travellers) : null
  const vehicle =
    vehicleClass === null
      ? null
      : (vehicles.find((one) => one.vehicleClass === vehicleClass) ?? null)

  // Left out of the budget entirely when the fleet row is priced in another
  // currency — converting without a rate would be inventing a number.
  const driverDayRateMinor =
    vehicle !== null && vehicle.currency.toUpperCase() === currency ? vehicle.dayRateMinor : null

  const recommendations = rankActivities({
    activities,
    interests,
    theme: input.theme,
    travellers: input.travellers,
    days,
    budgetPerPersonMinor,
    currency,
    wantsDriver: input.wantsDriver,
    driverDayRateMinor,
  })

  // -------------------------------------------------------------------
  // The lead
  // -------------------------------------------------------------------

  const phone = input.phone === '' ? null : input.phone
  const notes = input.notes

  try {
    const userId = await currentUserId()

    const inserted = await db
      .insert(customTripRequests)
      .values({
        // Null for a guest. The lead is captured either way — requiring an
        // account to ask for a quote is how you lose the quote.
        userId,
        name: input.name,
        email: input.email,
        phone,
        startDate,
        endDate,
        // الوثيقة 22.4: عدد الأيام شاملاً اليومين، من التاريخين المتحقق منهما.
        days,
        travellers: input.travellers,
        theme: input.theme,
        budgetPerPersonMinor,
        currency,
        interests,
        wantsDriver: input.wantsDriver,
        hasChildren: input.hasChildren,
        wantsVipMap: input.wantsVipMap,
        wantsLuxuryDining: input.wantsLuxuryDining,
        wantsAdventure: input.wantsAdventure,
        preferredAreas: preferredAreas.length > 0 ? preferredAreas : null,
        notes: notes === '' ? null : notes,
      })
      .returning({ id: customTripRequests.id })

    const requestId = inserted[0]?.id
    if (requestId === undefined) return { status: 'error', reason: 'server' }

    // سجل النشاط: "تحديث الطلبات" (الوثيقة 15.1) — للطلبات من حساب مسجّل.
    if (userId !== null) {
      await logActivity({
        action: 'update_request',
        userId,
        details: { requestId, kind: 'custom_trip', event: 'created' },
      })
      // موافقة واتساب صريحة من النموذج (غير محددة افتراضياً). تُضاف فقط — عدم
      // التحديد لا يسحب موافقة سابقة؛ السحب من صفحة الإشعارات في الحساب.
      if (input.whatsappOptIn) {
        await db.update(users).set({ whatsappOptIn: true }).where(eq(users.id, userId))
      }
      await notifyUser(userId, 'custom_received', { name: input.name }, '/account/schedules')
    } else {
      // ضيف: تأكيد بالبريد مباشرة (لا حساب يحمل إشعاراً). عند التسجيل بنفس البريد
      // يُربط الطلب بالحساب تلقائياً (src/lib/auth/server.ts). بلا اسم المرسل في
      // النص: العنوان غير متحقق منه، فلا نجعل النموذج قناة لنص يكتبه غريب.
      // وحدّ للعنوان الواحد: 3 تأكيدات في الساعة — النموذج عام، فبدونه يصير أداة
      // لإغراق صندوق بريد أي شخص.
      const [recent] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(customTripRequests)
        .where(
          and(
            sql`lower(${customTripRequests.email}) = ${input.email.trim().toLowerCase()}`,
            gt(customTripRequests.createdAt, new Date(Date.now() - 60 * 60_000)),
          ),
        )
      if ((recent?.n ?? 0) <= 3)
        await emailGuest({
          to: input.email,
          locale,
          type: 'custom_received_guest',
          params: {},
          href: '/account/schedules',
        })
    }

    await notifyStaff(
      'staff_custom_request',
      { name: input.name, travellers: input.travellers },
      '/leads',
    )

    return {
      status: 'done',
      requestId,
      answers: {
        startDate,
        endDate,
        days,
        travellers: input.travellers,
        theme: input.theme,
        budgetPerPersonMinor,
        currency,
        interests,
        wantsDriver: input.wantsDriver,
        vehicleClass,
        notes,
      },
      recommendations,
    }
  } catch {
    // The traveller must not lose eight answers to a transient database error;
    // the form keeps its values and the client offers a retry.
    return { status: 'error', reason: 'server' }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * "ادفع" على عرض سعر جدول مخصص (الوثيقة 13.1): يضيف بند `custom` للسلة ويذهب
 * للدفع. النموذج يرسل معرّف الطلب فقط؛ `addItem` يتحقق أنه للمستخدم الحالي،
 * مسعَّر، وغير مدفوع، والسعر يُحسب من صف الطلب على الخادم عند الدفع.
 */
export async function payCustomQuote(form: FormData): Promise<void> {
  const locale = await getLocale()
  const raw = form.get('requestId')
  const requestId = typeof raw === 'string' && UUID.test(raw) ? raw : null

  let target = '/checkout'
  if (requestId === null) {
    target = '/account/schedules?quote=invalid'
  } else {
    try {
      await addItem({ kind: 'custom', refId: requestId, quantity: 1 })
      revalidatePath('/[locale]/my-trip', 'page')
      revalidatePath('/[locale]/checkout', 'page')
    } catch (error) {
      if (!(error instanceof CartRejectedError)) {
        console.error('[custom] could not add the quote to the cart', { requestId, error })
      }
      target = '/account/schedules?quote=invalid'
    }
  }
  redirect({ href: target, locale })
}

/** Map a Zod issue path onto the form's own field names. */
function fieldErrorsFrom(error: z.ZodError): CustomTripErrors {
  const fields: CustomTripErrors = {}

  for (const issue of error.issues) {
    const path = issue.path[0]
    if (path === 'name') fields.name = 'cp_err_name'
    else if (path === 'email') fields.email = 'cp_err_email'
    else if (path === 'phone') fields.phone = 'cp_err_phone'
    else if (path === 'notes') fields.notes = 'cp_err_notes'
    else if (path === 'startDate' || path === 'endDate') fields.dates = 'cp_err_dates'
    else if (path === 'interests') fields.interests = 'cp_err_ints'
  }

  // A malformed theme, traveller count or budget can only come from a payload
  // the form did not produce; report it against the dates line rather than
  // failing silently with no visible message.
  if (Object.keys(fields).length === 0) fields.dates = 'cp_err_dates'

  return fields
}
