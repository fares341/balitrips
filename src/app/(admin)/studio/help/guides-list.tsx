'use client'

import { useMemo, useState } from 'react'

import { HELP, helpText, type HelpLocale, pickL3 } from '../../_help/registry'
import { useAdminT } from '../../_ui/i18n-provider'
import { HelpBody, HelpLangSwitch } from '../../_ui/help-panel'

export function GuidesList({ base }: { base: string }) {
  const { t } = useAdminT()
  const [q, setQ] = useState('')
  const [lang, setLang] = useState<HelpLocale>('ar')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle === '' ? HELP : HELP.filter((entry) => helpText(entry).includes(needle))
  }, [q])

  return (
    <>
      <div className="a-card help-tools">
        <input
          className="a-input"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('help.search_ph')}
          aria-label={t('help.search_ph')}
        />
        <HelpLangSwitch value={lang} onChange={setLang} />
      </div>
      {shown.length === 0 ? <p className="a-hint">{t('help.no_results')}</p> : null}
      {shown.map((entry) => (
        <details className="a-card help-entry" key={entry.id} open={q.trim() !== ''}>
          <summary>
            <b>{pickL3(entry.title, lang)}</b>
          </summary>
          <HelpBody entry={entry} locale={lang} />
          <a className="a-btn small" href={`${base}${entry.href}`}>
            {t('help.open_screen')}
          </a>
        </details>
      ))}
    </>
  )
}
