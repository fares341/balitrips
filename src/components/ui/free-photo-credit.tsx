'use client'

/**
 * «Photo: <author> · <licence> · <source>» on a free photo (Wikimedia
 * Commons, Openverse, Unsplash). CC BY / BY-SA require the author, the
 * licence (linked) and a link to the source; Unsplash asks for the
 * photographer and Unsplash, both linked with referral parameters.
 *
 * Same look and placement as the Google credit (`.gp-credit`). The credit
 * is looked up by the media id in the photo URL, batched into one request
 * per page tick, and renders nothing for our own uploads. Rendered after
 * mount only, so there is no hydration mismatch.
 */

import { useEffect, useState, type MouseEvent } from 'react'

import { mediaIdFromUrl, SOURCE_LABEL, type PhotoCredit } from '@/lib/free-photos/attribution'

import { creditLabel } from './google-photo-credit'

const cache = new Map<string, Promise<PhotoCredit | null>>()
let batch: { ids: Set<string>; resolvers: Map<string, (c: PhotoCredit | null) => void> } | null =
  null

function flush() {
  const current = batch
  batch = null
  if (!current) return
  const ids = [...current.ids]
  fetch(`/api/photo-credits?ids=${ids.join(',')}`)
    .then((r) => (r.ok ? r.json() : { credits: {} }))
    .catch(() => ({ credits: {} }))
    .then((body: { credits?: Record<string, PhotoCredit> }) => {
      for (const id of ids) current.resolvers.get(id)?.(body.credits?.[id] ?? null)
    })
}

export function loadCredit(id: string): Promise<PhotoCredit | null> {
  let p = cache.get(id)
  if (!p) {
    p = new Promise((resolve) => {
      if (!batch) {
        batch = { ids: new Set(), resolvers: new Map() }
        setTimeout(flush, 0)
      }
      batch.ids.add(id)
      batch.resolvers.set(id, resolve)
      if (batch.ids.size >= 60) flush()
    })
    cache.set(id, p)
  }
  return p
}

const stop = (event: MouseEvent) => event.stopPropagation()

function Link({ href, children }: { href: string | null; children: string }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ) : (
    <>{children}</>
  )
}

export function FreePhotoCreditView({ credit, lang }: { credit: PhotoCredit; lang?: string }) {
  const author = (credit.author ?? '').trim() || 'Unknown author'
  return (
    <span className="gp-credit" data-testid="free-photo-credit" onClick={stop}>
      {creditLabel(lang)}: <Link href={credit.authorUrl}>{author.slice(0, 80)}</Link>
      {' · '}
      <Link href={credit.licenseUrl}>{credit.license}</Link>
      {' · '}
      <Link href={credit.sourceUrl}>{SOURCE_LABEL[credit.source] ?? credit.source}</Link>
    </span>
  )
}

export function FreePhotoCredit({ src }: { src: string | null | undefined }) {
  const id = mediaIdFromUrl(src)
  const [state, setState] = useState<{
    id: string
    credit: PhotoCredit | null
    lang: string
  } | null>(null)
  useEffect(() => {
    if (id === null) return
    let live = true
    void loadCredit(id).then((credit) => {
      if (live) setState({ id, credit, lang: document.documentElement.lang || 'en' })
    })
    return () => {
      live = false
    }
  }, [id])
  if (id === null || state === null || state.id !== id || state.credit === null) return null
  return <FreePhotoCreditView credit={state.credit} lang={state.lang} />
}
