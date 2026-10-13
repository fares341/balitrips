import { asc, desc, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { media } from '@/db/schema'
import type { Localized } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { mediaUrl } from '@/lib/content/queries'

import { adminHref } from '../_lib/admin-path'
import { isPlaceholder } from '../_lib/media-refs'
import { uiI18n } from './i18n-server'

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
  items: readonly PickerItem[]
  value?: string | null
  hint?: string
}) {
  const { t, locale } = await uiI18n()
  const selected = items.find((item) => item.id === value) ?? null

  /**
   * A value that is not in the list — archived since, or older than the cap.
   *
   * It must still round-trip, or opening an editor and pressing Save would
   * silently clear the hero image. It is carried by an extra RADIO in the same
   * group, never by a hidden input alongside it: two controls sharing a name
   * both post, `FormData.get()` returns whichever appears first in the
   * document, and the operator's new choice would lose to the stale hidden
   * value with no indication anything had been ignored.
   */
  const orphanedValue = value && !selected ? value : null

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      {hint ? <span className="a-hint">{hint}</span> : null}

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBlockEnd: 10,
        }}
      >
        {selected ? (
          <>
            <MediaThumb item={selected} size={64} />
            <div style={{ minWidth: 0 }}>
              <div className="a-mono" dir="ltr" style={{ wordBreak: 'break-all' }}>
                {selected.objectKey}
              </div>
              <PlaceholderNote credit={selected.credit} />
            </div>
          </>
        ) : orphanedValue ? (
          <span className="a-hint">{t('ui.media_orphan', { limit: PICKER_LIMIT })}</span>
        ) : (
          <span className="a-hint">{t('ui.media_none')}</span>
        )}
      </div>

      <details>
        <summary className="a-btn ghost small">
          {selected || orphanedValue ? t('ui.media_change') : t('ui.media_choose')}
        </summary>

        {items.length === 0 && !orphanedValue ? (
          <p className="a-hint" style={{ marginBlockStart: 10 }}>
            {t('ui.media_library_empty')}{' '}
            <a href={adminHref('/media')}>{t('ui.media_upload_first')}</a>
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                gap: 10,
                marginBlockStart: 10,
                maxHeight: 420,
                overflowY: 'auto',
                padding: 4,
              }}
            >
              <label
                className="a-check"
                style={{
                  border: '1px dashed var(--line)',
                  borderRadius: 'var(--r-sm)',
                  padding: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <input type="radio" name={name} value="" defaultChecked={!value} />
                {t('ui.media_no_image')}
              </label>

              {orphanedValue ? (
                <label
                  className="a-check"
                  style={{
                    border: '1px solid var(--orange, var(--line))',
                    borderRadius: 'var(--r-sm)',
                    padding: 10,
                    alignItems: 'center',
                    textAlign: 'center',
                    fontSize: 11,
                  }}
                >
                  <input type="radio" name={name} value={orphanedValue} defaultChecked />
                  {t('ui.media_keep_current')}
                </label>
              ) : null}

              {items.map((item) => (
                <label
                  key={item.id}
                  className="a-check"
                  style={{
                    display: 'block',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-sm)',
                    padding: 6,
                    background: 'var(--white)',
                  }}
                >
                  <MediaThumb item={item} size={120} />
                  <span
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'flex-start',
                      marginBlockStart: 6,
                    }}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={item.id}
                      defaultChecked={item.id === value}
                    />
                    <span style={{ minWidth: 0, fontSize: 11 }}>
                      <span
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.objectKey}
                      >
                        {pick(item.alt, locale, item.objectKey)}
                      </span>
                      <PlaceholderNote credit={item.credit} />
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {items.length >= PICKER_LIMIT ? (
              <p className="a-hint" style={{ marginBlockStart: 8 }}>
                {t('ui.media_capped', { limit: PICKER_LIMIT })}{' '}
                <a href={adminHref('/media')}>{t('nav.media')}</a>
              </p>
            ) : null}
          </>
        )}
      </details>
    </fieldset>
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
