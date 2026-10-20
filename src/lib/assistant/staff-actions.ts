/**
 * Running a Studio-assistant proposal after the staff member pressed Confirm.
 *
 * Every kind calls the EXISTING Studio server action — the same function the
 * Studio page's form posts to — so the action's own `requireCapability()`
 * (with the second-factor check), validation, transaction and audit row all
 * apply, with the confirming staff member's own session. We check the
 * capability first as well, to answer cleanly instead of with a 404.
 *
 * Those actions end in `redirect(…?ok=… | ?err=…)`, the Studio's banner
 * protocol. Called from here, the redirect is an exception carrying the
 * target URL in its digest; we read the outcome from it instead of following
 * it.
 */

import { savePlace } from '@/app/(admin)/studio/places/actions'
import { setActivityStatus } from '@/app/(admin)/studio/activities/actions'
import { setArticleStatus } from '@/app/(admin)/studio/articles/actions'
import { publishItinerary, unpublishItinerary } from '@/app/(admin)/studio/itineraries/actions'
import { setContactMessageStatus, setTripRequestStatus } from '@/app/(admin)/studio/leads/actions'
import { saveRequestNotes } from '@/app/(admin)/studio/leads/request-actions'
import { setBookingStatus } from '@/app/(admin)/studio/orders/actions'
import { setPackageStatus } from '@/app/(admin)/studio/packages/actions'
import { localizeMessage, type MessageVars } from '@/app/(admin)/_lib/result'

export interface StaffOutcome {
  ok: boolean
  /** The Studio's own banner text (already in the staff member's language). */
  message: string
  /** Where the Studio would have gone next. */
  href: string | null
}

/**
 * Outcome of a Studio action from the redirect it threw (`NEXT_REDIRECT;
 * replace;/studio-x/orders/1?ok=Saved;307;`), or null for anything else.
 */
export function outcomeFromRedirect(
  error: unknown,
  t: (key: string, vars?: MessageVars) => string,
): StaffOutcome | null {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return null
  const digest = (error as { digest?: unknown }).digest
  if (typeof digest !== 'string') return null
  if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404')) {
    return { ok: false, message: 'forbidden', href: null }
  }
  if (!digest.startsWith('NEXT_REDIRECT;')) return null
  // `NEXT_REDIRECT;<type>;<url>;<status>;` — the url is the part that looks
  // like one (found by shape, not position, in case the framing changes).
  const parts = digest.split(';')
  const target =
    parts.slice(1).find((part) => part.startsWith('/') || /^https?:\/\//.test(part)) ?? ''
  let url: URL
  try {
    url = new URL(target, 'http://studio.local')
  } catch {
    return { ok: false, message: 'error', href: null }
  }
  const href = `${url.pathname}`
  const ok = url.searchParams.get('ok')
  const err = url.searchParams.get('err')
  if (ok !== null) return { ok: true, message: localizeMessage(ok, t), href }
  if (err !== null) return { ok: false, message: localizeMessage(err, t), href }
  // A redirect with no outcome: the second-factor screen, or the sign-in page.
  return {
    ok: false,
    message: url.pathname.endsWith('/security') ? 'two_factor_required' : 'error',
    href,
  }
}

function form(fields: Record<string, string | undefined | null>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) data.set(key, value)
  }
  return data
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')

/** Invoke the Studio action for this proposal. Throws its redirect. */
async function invoke(kind: string, args: Record<string, unknown>, existingNotes: string | null) {
  switch (kind) {
    case 'booking_status':
      return setBookingStatus(
        str(args.orderId),
        form({
          orderItemId: str(args.orderItemId),
          bookingStatus: str(args.status),
          notify: args.notify === true ? 'on' : null,
        }),
      )
    case 'content_status': {
      const id = str(args.id)
      const status = args.publish === true ? 'published' : 'draft'
      switch (args.type) {
        case 'activity':
          return setActivityStatus(id, status)
        case 'package':
          return setPackageStatus(id, status)
        case 'article':
          return setArticleStatus(id, status)
        case 'itinerary':
          return args.publish === true ? publishItinerary(id) : unpublishItinerary(id)
        default:
          throw new Error('unknown content type')
      }
    }
    case 'place_draft': {
      const category =
        typeof args.categoryLabel === 'object' && args.categoryLabel !== null
          ? (args.categoryLabel as Record<string, unknown>)
          : {}
      return savePlace(
        'new',
        form({
          slug: str(args.slug),
          name_en: str(args.nameEn),
          name_ar: str(args.nameAr),
          name_id: str(args.nameId),
          category_en: str(category.en),
          category_ar: str(category.ar),
          description_en: str(args.descriptionEn),
          description_ar: str(args.descriptionAr),
          lat: String(args.lat),
          lon: String(args.lon),
          regionId: typeof args.regionId === 'string' ? args.regionId : '',
          categoryId: typeof args.categoryId === 'string' ? args.categoryId : '',
          // Inside the free area a new place is free, like its neighbours.
          isFree: args.isFree === true ? 'on' : null,
          requiredEntitlement: 'map_access',
          canFavorite: 'on',
          canAddToTrip: 'on',
          priority: '0',
          sortOrder: '0',
          status: 'draft',
        }),
      )
    }
    case 'lead_status':
      return setTripRequestStatus(str(args.requestId), form({ status: str(args.status) }))
    case 'lead_note': {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
      const note = `${stamp} UTC — ${str(args.note)}`
      const combined = existingNotes ? `${existingNotes.trimEnd()}\n\n${note}` : note
      return saveRequestNotes(str(args.requestId), form({ adminNotes: combined.slice(-5000) }))
    }
    case 'contact_status':
      return setContactMessageStatus(str(args.messageId), form({ status: str(args.status) }))
    default:
      throw new Error('unknown action')
  }
}

export async function runStaffAction(
  kind: string,
  args: Record<string, unknown>,
  t: (key: string, vars?: MessageVars) => string,
  existingNotes: string | null = null,
): Promise<StaffOutcome> {
  try {
    await invoke(kind, args, existingNotes)
  } catch (error) {
    const outcome = outcomeFromRedirect(error, t)
    if (outcome !== null) return outcome
    console.error(
      '[assistant] studio action failed',
      kind,
      error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    )
    return { ok: false, message: 'error', href: null }
  }
  // Every Studio action redirects; returning normally is unexpected.
  return { ok: true, message: 'done', href: null }
}
