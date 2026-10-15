'use server'

import { randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { mapPlaces, placeTags, tags } from '@/db/schema'
import { isStorageConfigured, publicUrl, uploadPublic } from '@/lib/storage'

import { adminHref } from '../../_lib/admin-path'
import { feventRange } from '../../_lib/bali-time'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fenum,
  ffloat,
  fint,
  fintOrNull,
  flines,
  flocalizedOrNull,
  flocalizedRequired,
  fmulti,
  freq,
  fstr,
  fuuidOrNull,
  isUuid,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/places')

/** Which entitlement unlocks a locked place. */
const ENTITLEMENTS = ['map_access', 'vip'] as const

type Outcome = { ok: string } | { err: string }

/**
 * The public map and place pages read the places table on every request
 * (they are per-viewer, so never cached), but anything Next did cache for
 * them — the client router cache included — is dropped here so a Studio
 * edit shows up on the very next visit.
 */
function refreshPublicMap(): void {
  revalidatePath('/[locale]/map', 'page')
  revalidatePath('/[locale]/places/[slug]', 'page')
}

export async function savePlace(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/places/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const lat = ffloat(form, 'lat', t('places.latitude'))
    const lon = ffloat(form, 'lon', t('places.longitude'))
    if (lat < -90 || lat > 90) throw new Error(t('places.err_lat_range'))
    if (lon < -180 || lon > 180) throw new Error(t('places.err_lon_range'))

    const ratingTenths = fintOrNull(form, 'ratingTenths', t('places.rating'))
    if (ratingTenths !== null && (ratingTenths < 0 || ratingTenths > 50)) {
      throw new Error(t('places.err_rating_range'))
    }

    const { eventStartsAt, eventEndsAt } = feventRange(form, {
      start: t('places.event_starts'),
      end: t('places.event_ends'),
    })

    const values = {
      slug: assertSlug(freq(form, 'slug', t('common.slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('common.name')),
      category: flocalizedOrNull(form, 'category'),
      description: flocalizedOrNull(form, 'description'),
      lat,
      lon,
      regionId: fuuidOrNull(form, 'regionId', t('places.region')),
      activityId: fuuidOrNull(form, 'activityId', t('places.activity')),
      /**
       * The freemium gate. A locked place is REDACTED server-side — an
       * unentitled client receives a count and a marker, never the name,
       * coordinates, rating or image. The prototype shipped all of it and
       * merely blurred it in CSS, which any reader of the DOM could undo.
       */
      isFree: fbool(form, 'isFree'),
      requiredEntitlement: fenum(form, 'requiredEntitlement', ENTITLEMENTS, 'map_access'),
      isHiddenGem: fbool(form, 'isHiddenGem'),
      isHidden: fbool(form, 'isHidden'),
      canFavorite: fbool(form, 'canFavorite'),
      canAddToTrip: fbool(form, 'canAddToTrip'),
      priority: fint(form, 'priority', 0, t('places.search_priority')),
      sortOrder: fint(form, 'sortOrder', 0, t('places.sort_order')),
      categoryId: fuuidOrNull(form, 'categoryId', t('places.category')),
      detailedDescription: flocalizedOrNull(form, 'detailedDescription'),
      videos: flines(form, 'videos')
        .filter((url) => /^https:\/\//.test(url) || url.startsWith('/media/'))
        .slice(0, 10),
      galleryImageIds: fmulti(form, 'galleryImageIds').filter(isUuid).slice(0, 24),
      subCategoryIds: fmulti(form, 'subCategoryIds').filter(isUuid).slice(0, 10),
      internalNotes: fstr(form, 'internalNotes'),
      openingHours: fstr(form, 'openingHours'),
      rating: ratingTenths === null ? null : ratingTenths / 10,
      heroImageId: fuuidOrNull(form, 'heroImageId', t('places.hero_image')),
      eventStartsAt,
      eventEndsAt,
      status,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('places.err_gone'))

      const [row] =
        id === 'new'
          ? await tx
              .insert(mapPlaces)
              .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(mapPlaces)
              .set({
                ...values,
                publishedAt:
                  status === 'published'
                    ? (before?.publishedAt ?? new Date())
                    : (before?.publishedAt ?? null),
              })
              .where(eq(mapPlaces.id, id))
              .returning()

      if (!row) throw new Error(t('places.err_save_failed'))

      // Tags: the place_tags rows are the source of truth; the legacy jsonb
      // column is rewritten from them (English labels) so pin colours and
      // anything still reading it stay in step.
      const tagIds = fmulti(form, 'tagIds').filter((value) => isUuid(value))
      await tx.delete(placeTags).where(eq(placeTags.placeId, row.id))
      if (tagIds.length > 0) {
        await tx
          .insert(placeTags)
          .values(tagIds.map((tagId) => ({ placeId: row.id, tagId })))
          .onConflictDoNothing()
        const labels = await tx
          .select({ label: tags.label, key: tags.key })
          .from(tags)
          .where(inArray(tags.id, tagIds))
        await tx
          .update(mapPlaces)
          .set({ tags: labels.map((tag) => tag.label.en || tag.key) })
          .where(eq(mapPlaces.id, row.id))
      } else {
        await tx.update(mapPlaces).set({ tags: [] }).where(eq(mapPlaces.id, row.id))
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'map_place.create' : 'map_place.update',
          entityType: 'map_place',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/places/${savedId}`)
    refreshPublicMap()
    outcome = { ok: t('places.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

/**
 * Flip the freemium gate from the list.
 *
 * Audited like everything else: "who made the whole map free last Tuesday"
 * is a question that has to have an answer.
 */
export async function setPlaceFree(id: string, isFree: boolean): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1)
      if (!before) throw new Error(t('places.err_gone'))

      const [after] = await tx
        .update(mapPlaces)
        .set({ isFree })
        .where(eq(mapPlaces.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: isFree ? 'map_place.unlock' : 'map_place.lock',
          entityType: 'map_place',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    refreshPublicMap()
    outcome = { ok: isFree ? t('places.ok_free') : t('places.ok_locked') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deletePlace(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1)
      if (!before) throw new Error(t('places.err_gone'))

      await tx
        .update(mapPlaces)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(mapPlaces.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'map_place.delete',
          entityType: 'map_place',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    refreshPublicMap()
    outcome = { ok: t('places.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/* --------------------------------------------------------------------------
   رفع فيديو للمكان (الوثيقة 6.3، العقد: "إضافة الصور والفيديوهات للأماكن")
   -------------------------------------------------------------------------- */

const MAX_VIDEO_BYTES = 24 * 1024 * 1024
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' }

/** يتحقق من التوقيع الفعلي للملف — الامتداد والنوع المعلن قد يكذبان. */
function videoKind(bytes: Uint8Array): 'mp4' | 'webm' | null {
  if (bytes.length > 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp') return 'mp4'
  if (
    bytes.length > 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return 'webm'
  return null
}

export async function uploadPlaceVideo(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error(t('places.err_choose_video'))
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error(t('places.err_video_too_large'))
    }
    if (!(file.type in VIDEO_TYPES)) throw new Error(t('places.err_video_type'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = videoKind(bytes)
    if (kind === null) throw new Error(t('places.err_video_invalid'))

    const [before] = await db.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1)
    if (!before) throw new Error(t('places.err_gone'))
    if ((before.videos ?? []).length >= 10) throw new Error(t('places.err_too_many_videos'))

    const key = `media/videos/${id}/${randomUUID()}.${kind}`
    let url: string
    if (isStorageConfigured()) {
      await uploadPublic({ key, body: bytes, contentType: `video/${kind}` })
      url = publicUrl(key)
    } else {
      // بلا Spaces: public/media (المجلد media_data في الإنتاج)، يخدمه
      // src/app/media/[...path]/route.ts — كما تفعل صور مكتبة الوسائط.
      const { mkdir, writeFile } = await import('node:fs/promises')
      const path = await import('node:path')
      const target = path.join(process.cwd(), 'public', key)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes)
      url = `/${key}`
    }

    const videos = [...(before.videos ?? []), url]
    await db.update(mapPlaces).set({ videos }).where(eq(mapPlaces.id, id))
    await writeAudit({
      actor: session,
      action: 'map_place.video_upload',
      entityType: 'map_place',
      entityId: id,
      before: { videos: before.videos },
      after: { videos, bytes: bytes.byteLength },
    })
    refreshPublicMap()
    outcome = { ok: t('places.ok_video') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(adminHref(`/places/${id}`), outcome))
}
