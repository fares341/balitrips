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
 * Renders the existing entries plus two blanks, so an editor appends without
 * any client-side repeater. `ffaq()` reads a fixed number of index slots and
 * drops rows whose English question is blank, which also makes deletion a
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
  const rowCount = Math.min(existing.length + 2, maxRows)

  return (
    <fieldset className="a-fieldset">
      <legend>{t('ui.faq_title')}</legend>
      <span className="a-hint">{t('ui.faq_hint', { max: maxRows })}</span>

      {Array.from({ length: rowCount }, (_, index) => {
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
      })}
    </fieldset>
  )
}
