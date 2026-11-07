'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { useAdminT } from '../../../_ui/i18n-provider'
import { ITINERARY_HELP, type HelpLocale, type HelpTopic, type ItineraryHelpTab } from '../_help'

export interface EditorTab {
  key: ItineraryHelpTab
  label: string
  href: string
  disabled: boolean
}

/**
 * The editor's tab bar, «؟ دليل» side panel and unsaved-changes guard.
 *
 * Unsaved changes: any edit inside `[data-ie-panel]` marks the tab dirty
 * (a badge shows); leaving by a link or closing the page asks first. A
 * submit clears it — the server action redirects back with ?ok= or ?err=.
 */
export function EditorShell({
  tabs,
  current,
  children,
}: {
  tabs: EditorTab[]
  current: ItineraryHelpTab
  children: React.ReactNode
}) {
  const { t, locale } = useAdminT()
  const [dirty, setDirty] = useState(false)
  const [help, setHelp] = useState(false)
  const [helpLang, setHelpLang] = useState<HelpLocale>(locale === 'en' ? 'en' : 'ar')
  const panelRef = useRef<HTMLDivElement>(null)
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const mark = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-ie-ignore]')) return
      setDirty(true)
    }
    const clear = () => setDirty(false)
    panel.addEventListener('input', mark)
    panel.addEventListener('change', mark)
    panel.addEventListener('ie-dirty', mark)
    panel.addEventListener('submit', clear)
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current) return
      const link = (event.target as HTMLElement | null)?.closest('a[href]')
      if (!link || link.getAttribute('target') === '_blank') return
      if (!window.confirm(t('ie.unsaved_confirm'))) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        setDirty(false)
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      panel.removeEventListener('input', mark)
      panel.removeEventListener('change', mark)
      panel.removeEventListener('ie-dirty', mark)
      panel.removeEventListener('submit', clear)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [t])

  const guide = ITINERARY_HELP[helpLang]
  const topics: HelpTopic[] = [guide[current], ...(current === 'basics' ? [guide.delete] : [])]
  const others = tabs.filter((tab) => tab.key !== current).map((tab) => guide[tab.key])

  return (
    <div className="ie">
      <div className="ie-bar">
        <nav className="ie-tabs" aria-label={t('ie.tabs_label')}>
          {tabs.map((tab) =>
            tab.disabled ? (
              <span key={tab.key} className="ie-tab is-off" aria-disabled="true">
                {tab.label}
              </span>
            ) : (
              <Link
                key={tab.key}
                href={tab.href}
                className="ie-tab"
                aria-current={tab.key === current ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ),
          )}
        </nav>
        {dirty ? (
          <span className="ie-dirty" role="status">
            {t('ie.unsaved')}
          </span>
        ) : null}
        <button
          type="button"
          className="a-btn ghost small ie-help-btn"
          aria-expanded={help}
          aria-controls="ie-help"
          onClick={() => setHelp(!help)}
        >
          {t('ie.help_btn')}
        </button>
      </div>

      <div ref={panelRef} data-ie-panel="">
        {children}
      </div>

      {help ? (
        <>
          <div className="ie-help-veil" onClick={() => setHelp(false)} aria-hidden="true" />
          <aside
            id="ie-help"
            className="ie-help"
            dir={helpLang === 'ar' ? 'rtl' : 'ltr'}
            lang={helpLang}
            aria-label={t('ie.help_btn')}
          >
            <div className="ie-help-head">
              <div className="ie-langs" role="group">
                {(['ar', 'en', 'id'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className="ie-lang-btn"
                    aria-pressed={helpLang === lang}
                    onClick={() => setHelpLang(lang)}
                  >
                    {lang === 'ar' ? 'العربية' : lang === 'en' ? 'English' : 'Indonesia'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="a-btn ghost small"
                onClick={() => setHelp(false)}
                aria-label={t('ie.help_close')}
              >
                ✕
              </button>
            </div>
            {topics.map((topic) => (
              <section key={topic.id} className="ie-help-topic">
                <h3>{topic.title}</h3>
                <ol>
                  {topic.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            ))}
            {others.map((topic) => (
              <details key={topic.id} className="ie-help-more">
                <summary>{topic.title}</summary>
                <ol>
                  {topic.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            ))}
            {current !== 'basics' ? (
              <details className="ie-help-more">
                <summary>{guide.delete.title}</summary>
                <ol>
                  {guide.delete.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            ) : null}
          </aside>
        </>
      ) : null}
    </div>
  )
}
