'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { matchEntries } from '../_lib/search-text'
import { Icon } from './icons'

/**
 * Ctrl/⌘+K: jump to any Studio screen this person may open.
 *
 * The entries are built on the server (already filtered with `canOpen`), each
 * with its label in the active language plus search text in both Arabic and
 * English, so «طلبات» and "orders" find the same screen whatever language
 * the Studio is in. Arabic matching ignores diacritics, tatweel and the
 * hamza/ta-marbuta/alef-maqsura spellings people type interchangeably.
 */

export interface PaletteEntry {
  href: string
  label: string
  group: string
  search: string
}

export function CommandPalette({
  entries,
  labels,
}: {
  entries: PaletteEntry[]
  labels: { open: string; placeholder: string; empty: string; hint: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const results = useMemo(() => matchEntries(entries, query).slice(0, 40), [entries, query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        // Follow the dialog itself: Esc closes it natively, and React's
        // state must not be left thinking it is still open.
        const isOpen = dialog.current?.open ?? false
        if (isOpen) {
          dialog.current?.close()
        } else {
          dialog.current?.showModal()
          input.current?.focus()
        }
        setOpen(!isOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      input.current?.focus()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
    setCursor(0)
  }
  const go = (href: string) => {
    close()
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        className="a-palette-btn"
        onClick={() => {
          if (!dialog.current?.open) {
            dialog.current?.showModal()
            input.current?.focus()
          }
          setOpen(true)
        }}
      >
        <Icon name="search" size={18} />
        <span>{labels.open}</span>
        <kbd dir="ltr">Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="a-palette"
        aria-label={labels.open}
        onClose={close}
        onCancel={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div className="a-palette-box">
          <input
            ref={input}
            className="a-input a-palette-input"
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls="a-palette-list"
            aria-activedescendant={results[cursor] ? `a-pal-${cursor}` : undefined}
            placeholder={labels.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((c) => Math.min(c + 1, results.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (event.key === 'Enter') {
                const hit = results[cursor]
                if (hit) {
                  event.preventDefault()
                  go(hit.href)
                }
              }
            }}
          />
          <ul id="a-palette-list" role="listbox" className="a-palette-list">
            {results.length === 0 ? (
              <li className="a-palette-empty">{labels.empty}</li>
            ) : (
              results.map((entry, index) => (
                <li
                  key={entry.href}
                  id={`a-pal-${index}`}
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(entry.href)}
                >
                  <span>{entry.label}</span>
                  <small>{entry.group}</small>
                </li>
              ))
            )}
          </ul>
          <p className="a-palette-hint">{labels.hint}</p>
        </div>
      </dialog>
    </>
  )
}
