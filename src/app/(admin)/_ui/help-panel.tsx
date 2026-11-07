'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { helpFor, HELP_LOCALES, type HelpEntry, type HelpLocale, pickL3 } from '../_help/registry'
import { useAdminT } from './i18n-provider'

const LANG_LABEL: Record<HelpLocale, string> = { ar: 'العربية', en: 'English', id: 'Indonesia' }

/** One guide, in one language (also used by the guides page). */
export function HelpBody({ entry, locale }: { entry: HelpEntry; locale: HelpLocale }) {
  const { t } = useAdminT()
  const p = (value: readonly [string, string, string]) => pickL3(value, locale)
  return (
    <div className="help-body" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <p className="help-purpose">{p(entry.purpose)}</p>
      {entry.placeholder ? <p className="a-hint">{t('help.placeholder')}</p> : null}
      {entry.steps.length > 0 ? (
        <>
          <h4>{t('help.steps')}</h4>
          <ol>
            {entry.steps.map((step, index) => (
              <li key={index}>{p(step)}</li>
            ))}
          </ol>
        </>
      ) : null}
      {entry.fields.length > 0 ? (
        <>
          <h4>{t('help.fields')}</h4>
          <dl>
            {entry.fields.map((field, index) => (
              <div key={index}>
                <dt>{p(field.name)}</dt>
                <dd>{p(field.where)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {entry.mistakes.length > 0 ? (
        <>
          <h4>{t('help.mistakes')}</h4>
          <ul>
            {entry.mistakes.map((mistake, index) => (
              <li key={index}>{p(mistake)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

export function HelpLangSwitch({
  value,
  onChange,
}: {
  value: HelpLocale
  onChange: (next: HelpLocale) => void
}) {
  return (
    <div className="help-langs" role="group">
      {HELP_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={`a-btn small ${locale === value ? 'primary' : 'ghost'}`}
          aria-pressed={locale === value}
          onClick={() => onChange(locale)}
        >
          {LANG_LABEL[locale]}
        </button>
      ))}
    </div>
  )
}

/** «؟ دليل هذه الشاشة» — floating button + side panel, on every Studio screen. */
export function HelpButton({ base }: { base: string }) {
  const { t } = useAdminT()
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<HelpLocale>('ar')

  const studioPath = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  const entry = helpFor(studioPath.replace(/^\/studio/, ''))

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className="help-fab"
        aria-expanded={open}
        aria-controls="help-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">؟</span> {t('help.button')}
      </button>
      {open ? (
        <aside id="help-panel" className="help-panel" aria-label={t('help.button')}>
          <div className="help-head">
            <h3>{pickL3(entry.title, lang)}</h3>
            <button type="button" className="a-btn ghost small" onClick={() => setOpen(false)}>
              {t('mc.close')}
            </button>
          </div>
          <HelpLangSwitch value={lang} onChange={setLang} />
          <HelpBody entry={entry} locale={lang} />
          <div className="help-foot">
            {entry.id === 'media' ? (
              <button
                type="button"
                className="a-btn small"
                onClick={() => {
                  setOpen(false)
                  window.dispatchEvent(new Event('studio-tour:media'))
                }}
              >
                {t('tour.again')}
              </button>
            ) : null}
            <a className="a-btn ghost small" href={`${base}/help`}>
              {t('help.all_guides')}
            </a>
          </div>
        </aside>
      ) : null}
    </>
  )
}
