'use client'

/**
 * Hero search with instant suggestions (client feedback, Oct 2026).
 *
 * A combobox over the plain GET form (`/search?q=`), so with no JavaScript
 * the box still searches. Suggestions come from a small index the page
 * sends with the HTML (`SuggestEntry[]`: regions, map types, activities,
 * free places), matched in the browser by `suggestFrom` — prefix, word
 * start, anything inside a word, then one or two typos — so "شا" shows
 * تشانغو and "او" shows أوبود on the first key press, without a request.
 *
 * Choosing a suggestion opens its own view (a region or type on the map,
 * the activity or place page). The last row always searches the full text.
 *
 * Keyboard: ↓/↑ move (wrapping), Enter opens the highlighted row or
 * searches, Escape closes (a second Escape clears), Tab leaves. Touch: rows
 * are 48px tall and a tap opens; tapping outside closes.
 * ARIA 1.2 combobox: the input owns the listbox through aria-controls and
 * aria-activedescendant; the count is announced in a polite live region.
 */

import { useRouter } from 'next/navigation'
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { Icon, type IconName } from '@/components/ui'
import {
  highlightRange,
  suggestFrom,
  type SuggestEntry,
  type SuggestKind,
} from '@/lib/search/fuzzy'

export interface HeroSearchLabels {
  label: string
  placeholder: string
  submit: string
  /** "Search for “{q}”" — `{q}` is replaced. */
  searchFor: string
  /** "{n} suggestions" for screen readers — `{n}` is replaced. */
  count: string
  kinds: Record<SuggestKind, string>
}

const KIND_ICON: Record<SuggestKind, IconName> = {
  region: 'pin',
  category: 'map',
  activity: 'compass',
  place: 'pin',
}

const MAX_QUERY = 64

function Marked({ text, query }: { text: string; query: string }): ReactNode {
  const range = highlightRange(text, query)
  if (range === null) return text
  const [start, end] = range
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  )
}

export function HeroSearch({
  action,
  entries,
  labels,
}: {
  action: string
  entries: readonly SuggestEntry[]
  labels: HeroSearchLabels
}) {
  const router = useRouter()
  const id = useId()
  const listId = `${id}-list`
  const rootRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // Typing stays instant even on a slow phone: matching follows a beat behind.
  const deferred = useDeferredValue(value)
  const query = deferred.trim()
  const hits = useMemo(() => suggestFrom(entries, query), [entries, query])

  // Rows: the suggestions, then "search for …" (always last, always there).
  const rowCount = query === '' ? 0 : hits.length + 1
  const showList = open && rowCount > 0

  // Close on a tap or click anywhere else.
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the highlighted row in view inside a short list on phones.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id])

  const searchAll = () => {
    const text = value.trim()
    if (text === '') {
      inputRef.current?.focus()
      return
    }
    setOpen(false)
    router.push(`${action}?q=${encodeURIComponent(text.slice(0, MAX_QUERY))}`)
  }

  const choose = (index: number) => {
    const hit = hits[index]
    if (hit === undefined) {
      searchAll()
      return
    }
    setValue(hit.entry.label)
    setOpen(false)
    router.push(hit.entry.href)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
        if (rowCount === 0) return
        event.preventDefault()
        setOpen(true)
        setActive((current) => (current + 1) % rowCount)
        break
      case 'ArrowUp':
        if (rowCount === 0) return
        event.preventDefault()
        setOpen(true)
        setActive((current) => (current <= 0 ? rowCount - 1 : current - 1))
        break
      case 'Enter':
        if (showList && active >= 0) {
          event.preventDefault()
          choose(active)
        }
        // otherwise the form submits normally (→ /search?q=)
        break
      case 'Escape':
        if (showList) {
          event.preventDefault()
          setOpen(false)
          setActive(-1)
        } else if (value !== '') {
          event.preventDefault()
          setValue('')
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const allIndex = hits.length
  const optionId = (index: number) => `${id}-o${index}`

  return (
    <form
      ref={rootRef}
      className={`hv-search${showList ? ' is-open' : ''}`}
      action={action}
      method="get"
      role="search"
      onSubmit={(event) => {
        if (value.trim() === '') {
          event.preventDefault()
          inputRef.current?.focus()
        }
      }}
    >
      <div className="hv-search-bar">
        <Icon name="search" size={20} />
        <label htmlFor={`${id}-q`} className="sr-only">
          {labels.label}
        </label>
        <input
          ref={inputRef}
          id={`${id}-q`}
          name="q"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          placeholder={labels.placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={MAX_QUERY}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button className="btn btn-primary" type="submit">
          {labels.submit}
        </button>
      </div>

      <div className="hv-sg" data-open={showList ? 'true' : 'false'}>
        <ul id={listId} role="listbox" aria-label={labels.label} className="hv-sg-list">
          {showList &&
            hits.map((hit, index) => (
              <li
                key={hit.entry.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className="hv-sg-row"
                // Keep focus in the box so the list does not close before the tap lands.
                onPointerDown={(event) => event.preventDefault()}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span className="hv-sg-ic" aria-hidden="true">
                  <Icon name={KIND_ICON[hit.entry.kind]} size={18} />
                </span>
                <span className="hv-sg-tx">
                  <b>
                    <Marked text={hit.entry.label} query={query} />
                  </b>
                  <small>
                    {labels.kinds[hit.entry.kind]}
                    {hit.entry.sub !== null && ` · ${hit.entry.sub}`}
                  </small>
                </span>
              </li>
            ))}
          {showList && (
            <li
              key="all"
              id={optionId(allIndex)}
              role="option"
              aria-selected={active === allIndex}
              className="hv-sg-row hv-sg-all"
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => setActive(allIndex)}
              onClick={() => choose(allIndex)}
            >
              <span className="hv-sg-ic" aria-hidden="true">
                <Icon name="search" size={18} />
              </span>
              <span className="hv-sg-tx">
                <b>{labels.searchFor.replace('{q}', query)}</b>
              </span>
            </li>
          )}
        </ul>
      </div>
      <span className="sr-only" aria-live="polite">
        {showList ? labels.count.replace('{n}', String(hits.length)) : ''}
      </span>
    </form>
  )
}
