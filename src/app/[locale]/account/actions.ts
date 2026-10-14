'use server'

/**
 * Account mutations.
 *
 * The handoff left NINE buttons in this panel with no `onClick` at all — Save
 * changes, Create trip from favorites, Add to trip, Remove, Export schedule,
 * Download PDF, View, Download invoice and Renew. The profile inputs were
 * uncontrolled `defaultValue` boxes above a Save button with no handler, so
 * every edit was discarded the moment the panel closed and the traveller was
 * never told.
 *
 * Three rules hold here:
 *
 *  1. **Every action re-authenticates.** A Server Action is a POST endpoint
 *     that anyone can call directly; the session is resolved inside each one
 *     rather than trusted from a hidden field. Nothing takes a user id as an
 *     argument.
 *  2. **Nothing trusts the form for identity.** `refId` and `kind` describe
 *     *what*, never *whose* — the delete is scoped by `userId` in SQL, so a
 *     tampered id removes nothing rather than someone else's favorite.
 *  3. **Profile writes go through Better Auth, not straight to Drizzle.** The
 *     session cookie cache holds a five-minute copy of the user row; a direct
 *     `UPDATE` would leave the header, the sidebar and `getSession()` serving
 *     the old name for those five minutes, which looks exactly like the
 *     handoff's silently-discarded save. `auth.api.updateUser` rewrites the
 *     cached cookie in the same call.
 */

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { db } from '@/db'
import { favorites } from '@/db/schema'
import { MAX_NAME_LENGTH, MAX_PHONE_LENGTH, fieldErrors } from '@/components/auth/schemas'
import { CART_HREF } from '@/components/layout/routes'
import { defaultLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { isAPIError } from 'better-auth/api'

import { normalizePhone } from '@/lib/auth/phone'
import { auth } from '@/lib/auth/server'
import { requireUser } from '@/lib/auth/session'
import { activeUserOrNull, requireActiveUser } from '@/lib/security/require'
import { addItem } from '@/lib/cart'

import type { FavoriteActionState, ProfileFormState } from './_lib/contract'
import { isFavoriteKind, type FavoriteKind } from './_lib/queries'
import { addPlaceToTrip } from '../_actions/places'

/**
 * Every account route reads the session, so all of them are dynamic; this
 * clears the client Router Cache entry that would otherwise show the previous
 * values after a back navigation.
 */
function revalidateAccount(): void {
  revalidatePath('/[locale]/account', 'layout')
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Mirrors the sign-up rules, and the column widths behind them.
 *
 * `email` is deliberately absent: changing it is an identity change that has
 * to go through Better Auth's verification flow, not a text box on a profile
 * form. The field is rendered read-only with a note saying so.
 */
const profileSchema = z.object({
  name: z.string().trim().min(1, 'co_err_required').max(MAX_NAME_LENGTH, 'co_err_long'),
  phone: z
    .string()
    .trim()
    .max(MAX_PHONE_LENGTH, 'co_err_long')
    // Loose on purpose: a WhatsApp number typed by a traveller from any
    // country. Anything stricter rejects valid numbers, and that costs a
    // booking.
    // دولي (+ أو 00): الجوال مفتاح دخول (الوثيقة 3.2) ويجب أن يكون قابلاً للتوحيد.
    .refine((value) => value === '' || normalizePhone(value) !== null, 'auth_err_phone_intl'),
  // `users.country` is varchar(2); the control is a select, so this only
  // fires on a tampered payload — where it would otherwise be a 500.
  country: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[A-Za-z]{2}$/.test(value), 'auth_country_ph'),
})

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  // Redirects to the account page when there is no session, which is where
  // sign-in lives.
  await requireUser()

  const parsed = profileSchema.safeParse({
    name: text(formData.get('name')),
    phone: text(formData.get('phone')),
    country: text(formData.get('country')),
  })

  if (!parsed.success) {
    return { status: 'error', errors: fieldErrors(parsed.error), formError: null }
  }

  const rawLocale = text(formData.get('locale'))
  // An unknown locale would break the reset email and every transactional
  // message; fall back rather than persisting a value nothing can render.
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale

  try {
    await auth.api.updateUser({
      headers: await headers(),
      body: {
        name: parsed.data.name,
        // Empty means "not provided". Storing '' would make a blank phone
        // indistinguishable from one that was never asked for.
        phone: parsed.data.phone === '' ? null : parsed.data.phone,
        country: parsed.data.country === '' ? null : parsed.data.country.toUpperCase(),
        locale,
      },
    })
  } catch (error) {
    if (isAPIError(error) && error.body?.code === 'PHONE_TAKEN') {
      return { status: 'error', errors: { phone: 'auth_err_phone_taken' }, formError: null }
    }
    if (isAPIError(error) && error.body?.code === 'PHONE_REQUIRED') {
      return { status: 'error', errors: { phone: 'acct_phone_required' }, formError: null }
    }
    console.error('[account] profile update failed', error)
    return { status: 'error', errors: {}, formError: 'c_error' }
  }

  revalidateAccount()
  return { status: 'saved', errors: {}, formError: null }
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

function readFavoriteRef(formData: FormData): { kind: FavoriteKind; refId: string } | null {
  const kind = text(formData.get('kind'))
  const refId = text(formData.get('refId'))
  if (!isFavoriteKind(kind)) return null
  // uuid, and nothing else. A malformed value would make Postgres raise
  // rather than simply matching no rows.
  if (!z.uuid().safeParse(refId).success) return null
  return { kind, refId }
}

/**
 * Put a saved place into the trip.
 *
 * Goes through `addItem`, the same server-owned cart every other "add to trip"
 * button uses, so the price is snapshotted and recomputed by `buildQuote`
 * exactly as it is everywhere else. The handoff's button did nothing at all.
 */
export async function addFavoriteToTripAction(
  _previous: FavoriteActionState,
  formData: FormData,
): Promise<FavoriteActionState> {
  const user = await activeUserOrNull('favorite:add_to_trip')
  if (user === null) return { status: 'error', refId: null, messageKey: 'map_need_signin' }
  const ref = readFavoriteRef(formData)
  if (ref === null) return { status: 'error', refId: null, messageKey: 'c_error' }

  // The favorite must be this user's. Otherwise the action is a way to price
  // and add any catalogue id, including a map place whose name is redacted.
  const owned = await db
    .select({ refId: favorites.refId })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.kind, ref.kind),
        eq(favorites.refId, ref.refId),
      ),
    )
    .limit(1)

  if (owned[0] === undefined) return { status: 'error', refId: ref.refId, messageKey: 'c_error' }

  // مكان من الخريطة يذهب إلى "رحلتي" (trip_items) بنفس فحوص الخريطة —
  // لا إلى السلة كبند بسعر صفر كما كان.
  if (ref.kind === 'place') {
    const result = await addPlaceToTrip(ref.refId)
    if (!result.ok) {
      const key = result.reason === 'upgrade' ? 'map_need_plan' : 'map_not_allowed'
      return { status: 'error', refId: ref.refId, messageKey: key }
    }
    revalidateAccount()
    return { status: 'planned', refId: ref.refId, messageKey: null }
  }

  try {
    await addItem({ kind: ref.kind, refId: ref.refId })
  } catch (error) {
    console.error('[account] add favorite to trip failed', error)
    return { status: 'error', refId: ref.refId, messageKey: 'c_error' }
  }

  revalidatePath('/[locale]/my-trip', 'page')
  revalidateAccount()
  return { status: 'added', refId: ref.refId, messageKey: null }
}

/**
 * "Create trip from favorites".
 *
 * The handoff's button called `setTab("trip")` — it switched panels and added
 * nothing, which is a rename of the section rather than the thing the label
 * promises. This adds every saved place that is still purchasable to the trip
 * and then shows the traveller the trip it just built.
 *
 * `addItem` de-duplicates by booking, so pressing it twice does not buy
 * anything twice.
 */
export async function createTripFromFavoritesAction(formData: FormData): Promise<never> {
  // يعيد توجيهاً: محظور/جهاز مُزال ← صفحة الحساب مع السبب، غير مسجّل ← تسجيل الدخول.
  const user = await requireActiveUser('favorite:create_trip')
  const rawLocale = text(formData.get('locale'))
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale

  const rows = await db
    .select({ kind: favorites.kind, refId: favorites.refId })
    .from(favorites)
    .where(eq(favorites.userId, user.id))

  let carted = 0
  for (const row of rows) {
    if (!isFavoriteKind(row.kind)) continue
    try {
      if (row.kind === 'place') {
        await addPlaceToTrip(row.refId)
        continue
      }
      await addItem({ kind: row.kind, refId: row.refId })
      carted += 1
    } catch (error) {
      // One withdrawn place must not abandon the other eleven.
      console.error('[account] could not add favorite to trip', row.refId, error)
    }
  }

  revalidatePath('/[locale]/my-trip', 'page')
  revalidateAccount()
  // `getPathname` is the only thing that knows how `localePrefix: 'as-needed'`
  // maps a route to a path; it is typed `never`, which ends the action for the
  // compiler as well as at runtime.
  // أماكن فقط → "رحلتي"؛ أي شيء قابل للحجز → السلة.
  redirect(getPathname({ href: carted > 0 ? CART_HREF : '/account/trip', locale }))
}

export async function removeFavoriteAction(
  _previous: FavoriteActionState,
  formData: FormData,
): Promise<FavoriteActionState> {
  const user = await activeUserOrNull('favorite:remove')
  if (user === null) return { status: 'error', refId: null, messageKey: 'map_need_signin' }
  const ref = readFavoriteRef(formData)
  if (ref === null) return { status: 'error', refId: null, messageKey: 'c_error' }

  await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.userId, user.id),
        eq(favorites.kind, ref.kind),
        eq(favorites.refId, ref.refId),
      ),
    )

  revalidateAccount()
  return { status: 'removed', refId: ref.refId, messageKey: null }
}
