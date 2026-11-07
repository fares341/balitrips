'use client'

import { useMemo, useState } from 'react'

import { BaliIcon, type BaliIconName } from '@/components/ui/bali-icon'
import {
  BENEFIT_ICONS,
  PAGE_TEXT_KEYS,
  type L10n,
  type PageContent,
  type PageSection,
  type PageTextKey,
} from '@/lib/itineraries/page-content'

import { useAdminT } from '../../../_ui/i18n-provider'

type Lang = 'ar' | 'en' | 'id'
const LANGS: { key: Lang; label: string; dir: 'rtl' | 'ltr' }[] = [
  { key: 'ar', label: 'العربية', dir: 'rtl' },
  { key: 'en', label: 'English', dir: 'ltr' },
  { key: 'id', label: 'Indonesia', dir: 'ltr' },
]

interface Row {
  rid: string
  icon?: BaliIconName
  label: L10n
  text: L10n
}

export interface PageContentDefaults {
  /** Translation per text key per language. */
  texts: Record<PageTextKey, Record<Lang, string>>
  benefits: { icon: BaliIconName; label: Record<Lang, string>; text: Record<Lang, string> }[]
  how: { label: Record<Lang, string>; text: Record<Lang, string> }[]
}

const GROUPS: { key: string; fields: PageTextKey[] }[] = [
  {
    key: 'hero',
    fields: ['heroFrom', 'boxTitle', 'boxFootnote', 'trustPay', 'trustFast', 'actsLine'],
  },
  {
    key: 'titles',
    fields: [
      'aboutTitle',
      'getTitle',
      'galleryTitle',
      'daysTitle',
      'daysNote',
      'fitTitle',
      'howTitle',
      'faqTitle',
      'othersTitle',
    ],
  },
  { key: 'custom', fields: ['customTitle', 'customBody', 'customCta'] },
]

let seq = 0
const rid = () => `r${++seq}`

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

/**
 * «محتوى الصفحة»: every text of the public page per language, the two
 * lists, and section order/visibility. Posts one JSON field
 * (`pageContent__json`), cleaned again on the server.
 */
export function PageContentEditor({
  initial,
  defaults,
  action,
}: {
  initial: PageContent
  defaults: PageContentDefaults
  action: (form: FormData) => void | Promise<void>
}) {
  const { t } = useAdminT()
  const [lang, setLang] = useState<Lang>('ar')
  const [texts, setTexts] = useState<Partial<Record<PageTextKey, L10n>>>(initial.texts)
  const [sections, setSections] = useState<PageSection[]>(initial.sections)
  const [benefits, setBenefits] = useState<Row[] | null>(
    initial.benefits?.map((row) => ({ rid: rid(), ...row })) ?? null,
  )
  const [how, setHow] = useState<Row[] | null>(
    initial.how?.map((row) => ({ rid: rid(), ...row })) ?? null,
  )
  const dir = LANGS.find((one) => one.key === lang)?.dir ?? 'rtl'

  const json = useMemo(
    () =>
      JSON.stringify({
        texts,
        sections,
        benefits: benefits?.map(({ icon, label, text }) => ({ icon, label, text })) ?? null,
        how: how?.map(({ label, text }) => ({ label, text })) ?? null,
      }),
    [texts, sections, benefits, how],
  )

  const setText = (key: PageTextKey, value: string) =>
    setTexts({ ...texts, [key]: { ...(texts[key] ?? {}), [lang]: value } })

  const dirtyEvent = (el: HTMLElement | null) =>
    el?.dispatchEvent(new Event('ie-dirty', { bubbles: true }))

  const listEditor = (
    kind: 'benefits' | 'how',
    rows: Row[] | null,
    setRows: (rows: Row[] | null) => void,
  ) => {
    const fallback: { icon?: BaliIconName; label: L10n; text: L10n }[] =
      kind === 'benefits'
        ? defaults.benefits.map((row) => ({ icon: row.icon, label: row.label, text: row.text }))
        : defaults.how.map((row) => ({ label: row.label, text: row.text }))
    if (rows === null) {
      return (
        <div className="ie-list is-default">
          <p className="a-hint">{t('ie.list_default')}</p>
          <ul>
            {fallback.map((row, index) => (
              <li key={index}>
                {row.icon ? <BaliIcon name={row.icon} size={20} /> : null}
                <b>{row.label[lang]}</b> <span className="a-muted">{row.text[lang]}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="a-btn ghost small"
            onClick={(event) => {
              setRows(
                fallback.map((row) => ({
                  rid: rid(),
                  icon: row.icon,
                  label: { ...row.label },
                  text: { ...row.text },
                })),
              )
              dirtyEvent(event.currentTarget)
            }}
          >
            {t('ie.list_customise')}
          </button>
        </div>
      )
    }
    const update = (index: number, patch: Partial<Row>) =>
      setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    return (
      <div className="ie-list">
        {rows.map((row, index) => (
          <div className="ie-item" key={row.rid}>
            <span className="ie-item-n" dir="ltr">
              {index + 1}
            </span>
            {kind === 'benefits' ? (
              <fieldset className="ie-icons">
                <legend>{t('ie.item_icon')}</legend>
                {BENEFIT_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className="ie-icon"
                    aria-pressed={row.icon === icon}
                    aria-label={icon}
                    title={icon}
                    onClick={(event) => {
                      update(index, { icon })
                      dirtyEvent(event.currentTarget)
                    }}
                  >
                    <BaliIcon name={icon} size={22} />
                  </button>
                ))}
              </fieldset>
            ) : null}
            <label className="a-field">
              <span>{t('ie.item_label')}</span>
              <input
                className="a-input"
                dir={dir}
                lang={lang}
                value={row.label[lang] ?? ''}
                maxLength={120}
                onChange={(event) =>
                  update(index, { label: { ...row.label, [lang]: event.target.value } })
                }
              />
            </label>
            <label className="a-field">
              <span>{t('ie.item_text')}</span>
              <textarea
                className="a-input"
                dir={dir}
                lang={lang}
                rows={2}
                value={row.text[lang] ?? ''}
                maxLength={300}
                onChange={(event) =>
                  update(index, { text: { ...row.text, [lang]: event.target.value } })
                }
              />
            </label>
            {!row.label.ar && !row.label.en && !row.label.id ? (
              <p className="a-error" role="alert">
                {t('err.required', { field: t('ie.item_label') })}
              </p>
            ) : null}
            <span className="a-actions">
              <button
                type="button"
                className="a-btn ghost small"
                aria-label={t('ie.up')}
                disabled={index === 0}
                onClick={(event) => {
                  setRows(move(rows, index, index - 1))
                  dirtyEvent(event.currentTarget)
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="a-btn ghost small"
                aria-label={t('ie.down')}
                disabled={index === rows.length - 1}
                onClick={(event) => {
                  setRows(move(rows, index, index + 1))
                  dirtyEvent(event.currentTarget)
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="a-btn danger small"
                onClick={(event) => {
                  dirtyEvent(event.currentTarget)
                  setRows(rows.filter((_, i) => i !== index))
                }}
              >
                {t('ie.remove')}
              </button>
            </span>
          </div>
        ))}
        <span className="a-actions">
          {rows.length < 12 ? (
            <button
              type="button"
              className="a-btn ghost small"
              onClick={(event) => {
                setRows([...rows, { rid: rid(), icon: 'tip', label: {}, text: {} }])
                dirtyEvent(event.currentTarget)
              }}
            >
              + {t('ie.list_add')}
            </button>
          ) : null}
          <button
            type="button"
            className="a-btn ghost small"
            onClick={(event) => {
              setRows(null)
              dirtyEvent(event.currentTarget)
            }}
          >
            {t('ie.list_reset')}
          </button>
        </span>
      </div>
    )
  }

  return (
    <form className="a-form" action={action} data-testid="ie-content-form">
      <input type="hidden" name="pageContent__json" value={json} />
      <div className="a-card ie-sticky-lang">
        <div className="ie-langs" role="group" aria-label={t('ie.lang')}>
          {LANGS.map((one) => (
            <button
              key={one.key}
              type="button"
              className="ie-lang-btn"
              aria-pressed={lang === one.key}
              onClick={() => setLang(one.key)}
              data-ie-ignore=""
            >
              {one.label}
            </button>
          ))}
        </div>
        <p className="a-hint">{t('ie.lang_hint')}</p>
      </div>

      <div className="a-card">
        <h2>{t('ie.sections_t')}</h2>
        <p className="a-hint">{t('ie.sections_hint')}</p>
        <ol className="ie-sections">
          {sections.map((section, index) => (
            <li key={section.key} className={section.hidden ? 'is-hidden' : undefined}>
              <label className="a-check">
                <input
                  type="checkbox"
                  checked={!section.hidden}
                  onChange={(event) =>
                    setSections(
                      sections.map((one, i) =>
                        i === index ? { ...one, hidden: !event.target.checked } : one,
                      ),
                    )
                  }
                />
                <span>{t(`ie.sec_${section.key}`)}</span>
              </label>
              <span className="a-actions">
                <button
                  type="button"
                  className="a-btn ghost small"
                  aria-label={`${t('ie.up')}: ${t(`ie.sec_${section.key}`)}`}
                  disabled={index === 0}
                  onClick={(event) => {
                    setSections(move(sections, index, index - 1))
                    dirtyEvent(event.currentTarget)
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="a-btn ghost small"
                  aria-label={`${t('ie.down')}: ${t(`ie.sec_${section.key}`)}`}
                  disabled={index === sections.length - 1}
                  onClick={(event) => {
                    setSections(move(sections, index, index + 1))
                    dirtyEvent(event.currentTarget)
                  }}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {GROUPS.map((group) => (
        <div className="a-card" key={group.key}>
          <h2>{t(`ie.group_${group.key}`)}</h2>
          <div className="ie-grid">
            {group.fields.map((key) => {
              const long = key === 'customBody' || key === 'daysNote' || key === 'boxFootnote'
              const id = `txt-${key}`
              const props = {
                id,
                className: 'a-input',
                dir,
                lang,
                value: texts[key]?.[lang] ?? '',
                placeholder: defaults.texts[key][lang],
                maxLength: 600,
              }
              return (
                <div className="a-field" key={key}>
                  <label htmlFor={id}>{t(`ie.txt_${key}`)}</label>
                  {long ? (
                    <textarea
                      {...props}
                      rows={2}
                      onChange={(event) => setText(key, event.target.value)}
                    />
                  ) : (
                    <input {...props} onChange={(event) => setText(key, event.target.value)} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="a-card">
        <h2>{t('ie.benefits_t')}</h2>
        {listEditor('benefits', benefits, setBenefits)}
      </div>
      <div className="a-card">
        <h2>{t('ie.how_t')}</h2>
        {listEditor('how', how, setHow)}
      </div>

      <div className="a-actions ie-save">
        <button className="a-btn" type="submit">
          {t('ie.save')}
        </button>
      </div>
    </form>
  )
}

/** Keys exist for the server to build `defaults.texts`. */
export const TEXT_KEYS = Object.keys(PAGE_TEXT_KEYS) as PageTextKey[]
