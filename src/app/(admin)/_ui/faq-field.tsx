import type { ReactNode } from 'react'

import type { Localized } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import { TextArea, TextInput } from './field'
import { uiI18n } from './i18n-server'

export interface FaqEntryValue {
  q: Localized
  a: Localized
}

/**
 * FAQ rows.
 *
 * Renders the existing entries plus one blank; more blanks open one at a
 * time from "+ add another question". `ffaq()` reads a fixed number of index slots and
 * drops rows whose question is blank in every language, which also makes deletion a
 * matter of clearing the question.
 *
 * The prototype shipped ONE FAQ list shared across all fifteen activities;
 * these are genuinely per-activity.
 */
export async function FaqField({
  name = 'faq',
  entries,
  maxRows,
}: {
  name?: string
  entries: readonly FaqEntryValue[] | null | undefined
  maxRows: number
}) {
  const { t } = await uiI18n()
  const existing = entries ?? []
  // Existing rows plus one blank are open; every further blank sits inside a
  // "+ add another question" fold nested in the previous one, so each click
  // opens exactly one more row — no client script needed.
  const openCount = Math.min(existing.length + 1, maxRows)

  const row = (index: number) => {
    const entry = existing[index]
    return (
      <div className="a-day" key={index}>
        <div className="a-day-no">{t('ui.faq_question_no', { number: index + 1 })}</div>
        <div className="a-l10n">
          {locales.map((locale) => (
            <div className="a-field" key={`q-${locale}`}>
              <label htmlFor={`${name}_q_${locale}_${index}`}>
                {t('ui.faq_question_in', { language: localeConfig[locale].label })}
              </label>
              <TextInput
                id={`${name}_q_${locale}_${index}`}
                name={`${name}_q_${locale}_${index}`}
                defaultValue={entry?.q?.[locale] ?? ''}
                lang={locale}
                dir={localeConfig[locale].dir}
              />
            </div>
          ))}
        </div>
        <div className="a-l10n">
          {locales.map((locale) => (
            <div className="a-field" key={`a-${locale}`}>
              <label htmlFor={`${name}_a_${locale}_${index}`}>
                {t('ui.faq_answer_in', { language: localeConfig[locale].label })}
              </label>
              <TextArea
                id={`${name}_a_${locale}_${index}`}
                name={`${name}_a_${locale}_${index}`}
                rows={3}
                defaultValue={entry?.a?.[locale] ?? ''}
                lang={locale}
                dir={localeConfig[locale].dir}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const more = (index: number): ReactNode =>
    index >= maxRows ? null : (
      <details className="a-faq-more">
        <summary className="a-btn ghost small">{t('ui.faq_add')}</summary>
        {row(index)}
        {more(index + 1)}
      </details>
    )

  return (
    <fieldset className="a-fieldset">
      <legend>{t('ui.faq_title')}</legend>
      <span className="a-hint">{t('ui.faq_hint', { max: maxRows })}</span>
      {Array.from({ length: openCount }, (_, index) => row(index))}
      {more(openCount)}
    </fieldset>
  )
}
