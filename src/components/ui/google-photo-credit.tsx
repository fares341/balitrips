'use client'

/**
 * «Photo: <author> · Google Maps» on a Google place photo.
 *
 * Places API policy: wherever a Google photo is shown, show its
 * `authorAttributions` (name, linked to the author's profile) and Google
 * attribution, and let the user open the photo on Google Maps
 * (`googleMapsUri`). The attribution is fetched live from our own
 * `/api/places/<slug>/gphotos` (same lock rule as the photo) and never
 * stored; one request per place per page, shared by every slot of that place.
 *
 * Renders nothing for our own photos, so non-Google images are untouched.
 * Rendered after mount only (no server HTML), so there is no hydration
 * mismatch and Studio pages without an intl provider can use it too.
 */

import { useEffect, useState, type MouseEvent } from 'react'

import { parseGphotoUrl } from '@/lib/google-places/photo-urls'

export interface CreditAuthor {
  name: string
  uri: string | null
}
export interface CreditPhoto {
  authors: CreditAuthor[]
  mapsUri: string | null
}

const LABEL: Record<string, string> = { en: 'Photo', ar: 'صورة', id: 'Foto' }

export function creditLabel(lang: string | null | undefined): string {
  const base = (lang ?? 'en').slice(0, 2).toLowerCase()
  return LABEL[base] ?? LABEL.en!
}

const pending = new Map<string, Promise<CreditPhoto[]>>()

function loadCredits(slug: string): Promise<CreditPhoto[]> {
  let promise = pending.get(slug)
  if (!promise) {
    promise = fetch(`/api/places/${encodeURIComponent(slug)}/gphotos`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { photos: [] }))
      .then((body: { photos?: CreditPhoto[] }) => (Array.isArray(body.photos) ? body.photos : []))
      .catch(() => [])
    pending.set(slug, promise)
    // Live data: forget it once this page has used it.
    setTimeout(() => pending.delete(slug), 30_000)
  }
  return promise
}

const stop = (event: MouseEvent) => event.stopPropagation()

/** Presentational part, unit-tested on its own. */
export function GooglePhotoCreditView({
  photo,
  lang,
}: {
  photo: CreditPhoto | null
  lang?: string
}) {
  const authors = photo?.authors ?? []
  return (
    <span className="gp-credit" data-testid="gphoto-credit" onClick={stop}>
      {creditLabel(lang)}:{' '}
      {authors.length > 0
        ? authors.map((author, i) => (
            <span key={`${author.name}-${i}`}>
              {i > 0 ? ', ' : null}
              {author.uri ? (
                <a href={author.uri} target="_blank" rel="noopener noreferrer nofollow">
                  {author.name}
                </a>
              ) : (
                author.name
              )}
            </span>
          ))
        : null}
      {authors.length > 0 ? ' · ' : null}
      {photo?.mapsUri ? (
        <a href={photo.mapsUri} target="_blank" rel="noopener noreferrer nofollow">
          Google Maps
        </a>
      ) : (
        'Google Maps'
      )}
    </span>
  )
}

export function GooglePhotoCredit({ src }: { src: string | null | undefined }) {
  const parsed = parseGphotoUrl(src)
  const slug = parsed?.slug ?? null
  const index = parsed?.index ?? 0
  const [state, setState] = useState<{ slug: string; photos: CreditPhoto[] } | null>(null)
  const [lang, setLang] = useState('en')

  useEffect(() => {
    if (slug === null) return
    let live = true
    setLang(document.documentElement.lang || 'en')
    void loadCredits(slug).then((photos) => {
      if (live) setState({ slug, photos })
    })
    return () => {
      live = false
    }
  }, [slug])

  if (slug === null || state === null || state.slug !== slug) return null
  return <GooglePhotoCreditView photo={state.photos[index] ?? null} lang={lang} />
}
