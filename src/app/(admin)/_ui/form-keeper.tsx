'use client'

import { useEffect, useRef, useState } from 'react'

import { useAdminT } from './i18n-provider'

type Problem = { id: string; label: string; message: string }

function labelOf(el: HTMLElement): string {
  const own = (el as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? ''
  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim() ?? ''
  const text = legend && own && legend !== own ? `${legend} — ${own}` : own || legend
  return text.replace(/\*$/, '').trim() || (el as HTMLInputElement).name
}

/**
 * Keeps a server-action form honest about failures (owner report, Oct 2026:
 * «the data doesn't save»):
 *
 *  - when the browser refuses to submit (a required or badly formatted
 *    field), a summary at the top names every field and what is wrong,
 *    instead of one bubble that disappears;
 *  - what was typed is kept for this tab (sessionStorage) and put back when
 *    the action redirects here with `?err=`, so a refused save never wipes
 *    the form. A successful save (`?ok=`) forgets it.
 *
 * Text fields, selects and checkboxes only (files are never stored).
 */
export function FormKeeper({ storageKey }: { storageKey: string }) {
  const { t } = useAdminT()
  const ref = useRef<HTMLDivElement>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const key = `form-keeper:${storageKey}`
    const params = new URLSearchParams(window.location.search)
    try {
      if (params.has('ok')) window.sessionStorage.removeItem(key)
      const saved = params.has('err') ? window.sessionStorage.getItem(key) : null
      if (saved) {
        const entries = JSON.parse(saved) as [string, string][]
        const byName = new Map<string, string[]>()
        for (const [name, value] of entries) byName.set(name, [...(byName.get(name) ?? []), value])
        for (const el of Array.from(form.elements)) {
          const field = el as HTMLInputElement
          if (!field.name || field.type === 'file' || field.type === 'hidden') continue
          if (!byName.has(field.name)) {
            if (field.type === 'checkbox') field.checked = false
            continue
          }
          const values = byName.get(field.name) ?? []
          if (field.type === 'checkbox' || field.type === 'radio') {
            field.checked = values.includes(field.value)
          } else {
            field.value = values[0] ?? ''
          }
        }
        setRestored(true)
      }
    } catch {
      // Storage blocked: the form still works, it just starts empty.
    }

    const onSubmit = () => {
      setProblems([])
      try {
        const entries: [string, string][] = []
        for (const [name, value] of new FormData(form)) {
          if (typeof value === 'string' && !name.startsWith('$ACTION')) entries.push([name, value])
        }
        window.sessionStorage.setItem(key, JSON.stringify(entries))
      } catch {
        // ignore
      }
    }
    let timer: number | undefined
    const found: Problem[] = []
    const onInvalid = (event: Event) => {
      const el = event.target as HTMLInputElement
      found.push({
        id: el.id,
        label: labelOf(el),
        message: el.validationMessage,
      })
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setProblems([...found])
        found.length = 0
        ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }, 30)
    }
    form.addEventListener('submit', onSubmit)
    form.addEventListener('invalid', onInvalid, true)
    return () => {
      form.removeEventListener('submit', onSubmit)
      form.removeEventListener('invalid', onInvalid, true)
      window.clearTimeout(timer)
    }
  }, [storageKey])

  return (
    <div ref={ref} data-testid="form-keeper">
      {problems.length > 0 ? (
        <div className="a-flash err" role="alert" data-testid="form-errors">
          <div>
            <b>{t('an.errors_title')}</b>
            <ul>
              {problems.map((problem, index) => (
                <li key={index}>
                  {problem.id ? <a href={`#${problem.id}`}>{problem.label}</a> : problem.label}
                  {problem.message ? `: ${problem.message}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {restored ? (
        <p className="a-hint" role="status">
          {t('an.kept')}
        </p>
      ) : null}
    </div>
  )
}
