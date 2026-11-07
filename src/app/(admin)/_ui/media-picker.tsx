import { asc, desc, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { media } from '@/db/schema'
import type { Localized } from '@/db/schema'
import { mediaUrl } from '@/lib/content/queries'

import { MAX_UPLOAD_BYTES } from '../_lib/image/pipeline'
import { isPlaceholder } from '../_lib/media-refs'
import { uiI18n } from './i18n-server'
import { MediaPickerClient, type PickerInitial } from './media-picker-client'

/**
 * Hero image picker.
 *
 * A visual replacement for the `<select>` of object keys that every editor
 * used to carry. Choosing artwork from a dropdown of `seed-media/activities-
 * ubud-art-market.svg` strings is guesswork, and guesswork is how a temple
 * photograph ends up on a snorkelling tour.
 *
 * Deliberately server-rendered and JavaScript-free: it is a `<fieldset>` of
 * radio inputs wearing thumbnails, inside a `<details>` so it does not
 * dominate the form until it is opened. It therefore composes into ANY
 * existing editor form — no client component, no state, no hydration, and the
 * value posts as `heroImageId` exactly like the select box it replaces.
 *
 * The placeholder badge is the point of the whole component. 52 rows in this
 * database are generated artwork; an operator picking a hero image needs to
 * see at a glance which of them is still standing in for photography that has
 * not been licensed yet.
 */

export interface PickerItem {
  id: string
  objectKey: string
  alt: Localized | null
  credit: string | null
  width: number
  height: number
  name?: string | null
}

/**
 * Candidates for the picker.
 *
 * Newest first, because the image an operator wants is almost always the one
 * they have just uploaded. Capped — this is a grid of thumbnails, and an
 * unbounded one would be both a slow page and an unusable control. The cap is
 * surfaced in the UI rather than silently truncating.
 */
export const PICKER_LIMIT = 120

export async function loadPickerMedia(limit = PICKER_LIMIT): Promise<PickerItem[]> {
  return db
    .select({
      id: media.id,
      objectKey: media.objectKey,
      alt: media.alt,
      credit: media.credit,
      width: media.width,
      height: media.height,
      name: media.name,
    })
    .from(media)
    .where(isNull(media.deletedAt))
    .orderBy(desc(media.createdAt), asc(media.objectKey))
    .limit(limit)
}

export async function MediaPicker({
  name,
  label,
  items,
  value,
  hint,
}: {
  name: string
  label: string
  /** Kept for existing callers; the dialog loads and searches the library itself. */
  items?: readonly PickerItem[]
  value?: string | null
  hint?: string
}) {
  let initial: PickerInitial | null = null
  if (value) {
    const known = items?.find((item) => item.id === value)
    const row =
      known ??
      (
        await db
          .select({ id: media.id, objectKey: media.objectKey, name: media.name })
          .from(media)
          .where(eq(media.id, value))
          .limit(1)
      )[0]
    // A value that no longer resolves still round-trips (never silently cleared).
    initial = row
      ? {
          id: row.id,
          name: ('name' in row && row.name) || row.objectKey.split('/').pop() || row.id,
          url: mediaUrl(row.objectKey),
        }
      : { id: value, name: value, url: '' }
  }
  return (
    <MediaPickerClient
      name={name}
      label={label}
      hint={hint}
      initial={initial}
      maxBytes={MAX_UPLOAD_BYTES}
    />
  )
}

/**
 * Thumbnail.
 *
 * A plain `<img>`, not `next/image`: these are admin-only, already small, and
 * routing them through the optimiser would put an unbounded set of remote
 * patterns into `next.config.ts` for no user-visible benefit.
 */
export function MediaThumb({ item, size }: { item: PickerItem; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(item.objectKey)}
      alt=""
      width={size}
      height={Math.round((size * item.height) / Math.max(item.width, 1))}
      loading="lazy"
      decoding="async"
      style={{
        display: 'block',
        width: '100%',
        height: size,
        objectFit: 'cover',
        borderRadius: 'var(--r-sm)',
        background: 'var(--ivory-2)',
      }}
    />
  )
}

/** Says "generated placeholder" where that is true, and nothing where it is not. */
export async function PlaceholderNote({ credit }: { credit: string | null }) {
  if (!isPlaceholder(credit)) {
    return credit ? (
      <span className="a-hint" style={{ display: 'block' }}>
        {credit}
      </span>
    ) : null
  }

  const { t } = await uiI18n()
  return (
    <span className="a-pill warn" style={{ marginBlockStart: 4 }}>
      {t('ui.media_placeholder')}
    </span>
  )
}

/** Gallery (several images, ordered) — same dialog, search and inline upload. */
export async function MediaGalleryPicker({
  name,
  label,
  values,
  hint,
}: {
  name: string
  label: string
  values: readonly string[]
  hint?: string
}) {
  const ids = values.filter(Boolean)
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({ id: media.id, objectKey: media.objectKey, name: media.name })
          .from(media)
          .where(inArray(media.id, [...ids]))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const initialList: PickerInitial[] = ids.map((id) => {
    const row = byId.get(id)
    return row
      ? { id, name: row.name || row.objectKey.split('/').pop() || id, url: mediaUrl(row.objectKey) }
      : { id, name: id, url: '' }
  })
  return (
    <MediaPickerClient
      multiple
      name={name}
      label={label}
      hint={hint}
      initial={null}
      initialList={initialList}
      maxBytes={MAX_UPLOAD_BYTES}
    />
  )
}
