'use client'

/**
 * Site search overlay.
 *
 * Ported from `SearchOverlay` in design/handoff/bt-ui.jsx — same skin
 * (`.bt-search-scrim` / `.bt-search` / `.bt-search-bar` / `.bt-search-hit`),
 * same twelve-row cap, same thumbnail-title-subtitle-tag row. What is behind
 * it is entirely different:
 *
 *  1. **Results come from Postgres, not from five arrays in the bundle.** The
 *     handoff filtered `ACTIVITIES`, `MAP_PLACES`, `ITINERARIES`, `PACKAGES`
 *     and `ARTICLES` in the browser with `includes()`, which shipped the whole
 *     catalogue to every visitor and matched nothing a translator had left
 *     blank. `/api/search` runs the real cross-entity query.
 *  2. **Every hit is a link to a real URL.** `navigate(h.route, { id })` pushed
 *     `"#activity"`, so a result could not be opened in a new tab, copied,
 *     or crawled. These are `<Link>`s, so cmd-click and right-click work.
 *  3. **Keyboard navigation exists.** The handoff's rows were buttons in tab
 *     order after the input: reaching the third result meant three Tabs, and
 *     nothing indicated which row was current. Arrow keys move a highlighted
 *     option, Enter opens it, and `aria-activedescendant` reports it.
 *  4. **Typing does not fire a request per character.** Debounced, and every
 *     in-flight request is aborted when the query changes — otherwise a slow
 *     response for "ba" can land after the one for "batur" and overwrite it.
 *
 * The dialog mechanics — focus trap, focus restore, ref-counted body scroll
 * lock, portal, Escape, scrim-click discipline — are `<Modal>`'s, which exists
 * because the handoff reimplemented (and under-implemented) them three times.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Modal } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/routing'
import type { SearchResponse, SearchResponseHit } from '@/app/api/search/route'

/** Matches the floor the route handler enforces; below it, nothing is asked. */
const MIN_QUERY_LENGTH = 2

/**
 * Long enough that a normal typing rhythm produces one request per word,
 * short enough that the list feels live.
 */
const DEBOUNCE_MS = 220

const HOME_HREF = '/'

/**
 * Off-screen but readable by assistive tech.
 *
 * Inline because src/styles is owned elsewhere and carries no `.sr-only`
 * utility; `insetInlineStart` hides it off the correct edge in both
 * directions.
 */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  insetInlineStart: -9999,
  width: 1,
  height: 1,
  overflow: 'hidden',
  margin: 0,
}

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

/* --------------------------------------------------------------------------
   Data
   -------------------------------------------------------------------------- */

/** Stable reference, so the short-query branch does not churn consumers. */
const EMPTY_HITS: SearchResponseHit[] = []

function useSearch(query: string, locale: Locale) {
  const [hits, setHits] = useState<SearchResponseHit[]>([])
  const [status, setStatus] = useState<Status>('idle')

  const trimmed = query.trim()
  const tooShort = trimmed.length < MIN_QUERY_LENGTH

  useEffect(() => {
    // Nothing to fetch, and nothing to reset: the short-query case is DERIVED
    // below rather than written into state here. Clearing it in the effect
    // meant every keystroke that dropped under the threshold queued an extra
    // render just to blank a value the render already knows is unused.
    if (tooShort) return

    const controller = new AbortController()

    const timer = setTimeout(() => {
      // Marked here rather than in the effect body: a keystroke that is
      // superseded before the debounce elapses should never have flashed a
      // spinner, and setting state synchronously in an effect queues an
      // extra render on every character typed.
      setStatus('loading')

      const url = `/api/search?q=${encodeURIComponent(trimmed)}&locale=${encodeURIComponent(locale)}`

      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`search failed: ${response.status}`)
          return (await response.json()) as SearchResponse
        })
        .then((data) => {
          setHits(data.hits)
          setStatus(data.hits.length === 0 ? 'empty' : 'ready')
        })
        .catch((error: unknown) => {
          // An abort is this effect's own cleanup, not a failure — reporting
          // it would flash "something went wrong" on every keystroke.
          if (controller.signal.aborted) return
          console.error('[search] request failed', error)
          setHits([])
          setStatus('error')
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, tooShort, locale])

  // Derived, so a query falling below the threshold reads as idle immediately
  // rather than after an effect has run.
  return tooShort ? { hits: EMPTY_HITS, status: 'idle' as Status } : { hits, status }
}

/* --------------------------------------------------------------------------
   Overlay
   -------------------------------------------------------------------------- */

export type SearchOverlayProps = {
  open: boolean
  onClose: () => void
  /** Prefills the box, e.g. from `/search?q=…`. */
  initialQuery?: string
  /** Called with the trimmed query after each settled search. */
  onQueryChange?: (query: string) => void
}

export function SearchOverlay({
  open,
  onClose,
  initialQuery = '',
  onQueryChange,
}: SearchOverlayProps) {
  const t = useTranslations()
  const format = useFormatter()
  const locale = useLocale() as Locale
  const router = useRouter()

  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { hits, status } = useSearch(query, locale)

  const baseId = useId()
  const listId = `${baseId}-results`
  const optionId = (index: number) => `${baseId}-hit-${index}`

  /*
   * Reopening must not show the last visitor's query or a stale highlight.
   * Adjusted during render — React's "adjusting state when a prop changes"
   * pattern — rather than in an effect, which would paint the old contents
   * for a frame first.
   */
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setQuery(initialQuery)
      setActive(0)
    }
  }

  // A shorter result list must not leave the highlight past its end.
  const [lastCount, setLastCount] = useState(hits.length)
  if (lastCount !== hits.length) {
    setLastCount(hits.length)
    setActive(0)
  }

  const notifyQuery = onQueryChange
  useEffect(() => {
    if (notifyQuery === undefined) return
    notifyQuery(query.trim())
  }, [query, notifyQuery])

  // Keep the highlighted row inside the scrolling result panel.
  useEffect(() => {
    if (hits.length === 0) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, hits.length])

  const go = useCallback(
    (href: string) => {
      onClose()
      router.push(href)
    },
    [onClose, router],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (hits.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => (index + 1) % hits.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((index) => (index - 1 + hits.length) % hits.length)
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(hits.length - 1)
        break
      case 'Enter': {
        const hit = hits[active]
        if (hit === undefined) return
        event.preventDefault()
        go(hit.href)
        break
      }
      default:
        break
    }
  }

  /** Area, category or excerpt; "N days" for the two that ship a day count. */
  const subtitleOf = (hit: SearchResponseHit): string | null => {
    if (hit.subtitle !== null && hit.subtitle !== '') return hit.subtitle
    if (hit.days === null) return null
    return t('c_days_n', { n: hit.days })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t('srch_t')}
      initialFocus={inputRef}
      showClose={false}
      scrimClassName="bt-search-scrim"
      panelClassName="bt-search"
    >
      <div className="bt-search-bar">
        <Icon name="search" size={22} color="var(--muted)" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('c_search')}
          aria-label={t('srch_t')}
          type="search"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
        />
        <button
          type="button"
          className="bt-modal-x"
          style={{ position: 'static' }}
          onClick={onClose}
          aria-label={t('c_close')}
        >
          <Icon name="cross" size={20} />
        </button>
      </div>

      <div className="bt-search-results" ref={listRef}>
        {/* One live region, always mounted, so the count is announced when it
            changes rather than when the node appears. */}
        <p style={VISUALLY_HIDDEN} role="status" aria-live="polite">
          {status === 'ready' ? `${format.number(hits.length)} ${t('srch_count')}` : ''}
        </p>

        {status === 'idle' && (
          <p className="muted" style={{ padding: '24px 4px', textAlign: 'center', margin: 0 }}>
            {t('srch_hint')}
          </p>
        )}

        {status === 'loading' && (
          <p className="muted" style={{ padding: '24px 4px', textAlign: 'center', margin: 0 }}>
            {t('c_loading')}
          </p>
        )}

        {status === 'empty' && (
          <p className="muted" style={{ padding: '24px 4px', textAlign: 'center', margin: 0 }}>
            {t('c_search_empty')}
          </p>
        )}

        {status === 'error' && (
          <p className="muted" style={{ padding: '24px 4px', textAlign: 'center', margin: 0 }}>
            {t('c_error')}
          </p>
        )}

        {hits.length > 0 && (
          <div id={listId} role="listbox" aria-label={t('srch_t')}>
            {hits.map((hit, index) => {
              const subtitle = subtitleOf(hit)
              const isActive = index === active

              return (
                <Link
                  key={`${hit.type}:${hit.id}`}
                  href={hit.href}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={isActive}
                  // Focus stays in the input — that is what makes
                  // aria-activedescendant the right pattern here — so the rows
                  // are never tab stops of their own.
                  tabIndex={-1}
                  className="bt-search-hit"
                  style={isActive ? { background: 'var(--ivory-2)' } : undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={onClose}
                >
                  <Photo
                    src={hit.imageUrl}
                    alt={hit.imageAlt}
                    radius={10}
                    style={{ width: 48, height: 48, flexShrink: 0 }}
                  />
                  <span style={{ textAlign: 'start', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5, display: 'block' }}>
                      {hit.title}
                    </span>
                    {subtitle !== null && (
                      <span
                        className="muted"
                        style={{
                          fontSize: 12.5,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {subtitle}
                      </span>
                    )}
                  </span>
                  <span className="tag tag-forest" style={{ whiteSpace: 'nowrap' }}>
                    {t(`srch_ty_${hit.type}`)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------------------------
   Route-mounted variant
   -------------------------------------------------------------------------- */

export type SearchPageOverlayProps = {
  /** Initial `?q=`, read on the server so the first paint already has it. */
  initialQuery?: string
}

/**
 * The overlay as `/search`.
 *
 * The header's search control is a `<Link href="/search">`, which is the point:
 * search has an address. Closing it steps back to wherever the visitor came
 * from, and falls through to the home page when they arrived here directly —
 * `router.back()` on a fresh tab would leave them on `about:blank`.
 *
 * The query is mirrored into the address bar with `history.replaceState`
 * rather than `router.replace`, so `/search?q=batur` is copyable and
 * bookmarkable without a server round trip on every settled keystroke.
 */
export function SearchPageOverlay({ initialQuery = '' }: SearchPageOverlayProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  const close = useCallback(() => {
    setOpen(false)
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.replace(HOME_HREF)
  }, [router])

  const syncUrl = useCallback((query: string) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (query === '') url.searchParams.delete('q')
    else url.searchParams.set('q', query)
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
  }, [])

  return (
    <SearchOverlay
      open={open}
      onClose={close}
      initialQuery={initialQuery}
      onQueryChange={syncUrl}
    />
  )
}
