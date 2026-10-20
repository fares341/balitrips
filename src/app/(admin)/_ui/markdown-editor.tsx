'use client'

/**
 * The full-description editor: one textarea per language with a small
 * toolbar (heading, bold, italic, lists, link) and a preview that renders
 * exactly what the public page will show (`<Markdown>`, the same safe
 * subset). Posts `<name>_<locale>` like every other localized field.
 */

import { useRef, useState } from 'react'

import type { Localized } from '@/db/schema/_shared'
import { Markdown } from '@/components/shared/markdown'
import { localeConfig, type Locale } from '@/i18n/config'

import { useAdminT } from './i18n-provider'

const ORDER: readonly Locale[] = ['ar', 'en', 'id']

type Tool = 'h' | 'b' | 'i' | 'ul' | 'ol' | 'link'

/** Apply a tool to the selection; returns the new text and selection. */
function applyTool(
  text: string,
  start: number,
  end: number,
  tool: Tool,
  href: string | null,
): { text: string; start: number; end: number } {
  const selected = text.slice(start, end)
  const wrap = (before: string, after: string, fallback: string) => {
    const inner = selected === '' ? fallback : selected
    const next = `${text.slice(0, start)}${before}${inner}${after}${text.slice(end)}`
    return { text: next, start: start + before.length, end: start + before.length + inner.length }
  }
  if (tool === 'b') return wrap('**', '**', '…')
  if (tool === 'i') return wrap('*', '*', '…')
  if (tool === 'link') return wrap('[', `](${href ?? 'https://'})`, '…')

  // Line tools act on every line the selection touches.
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIndex = text.indexOf('\n', end)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const changed = lines.map((line, index) => {
    const bare = line.replace(/^(#{1,3}\s+|[-*•]\s+|\d{1,3}[.)]\s+)/, '')
    if (tool === 'h') return `## ${bare}`
    if (tool === 'ul') return `- ${bare}`
    return `${index + 1}. ${bare}`
  })
  const block = changed.join('\n')
  return {
    text: `${text.slice(0, lineStart)}${block}${text.slice(lineEnd)}`,
    start: lineStart,
    end: lineStart + block.length,
  }
}

export function MarkdownEditor({
  name,
  label,
  value,
  hint,
}: {
  name: string
  label: string
  value: Localized | null | undefined
  hint?: string
}) {
  const { t } = useAdminT()
  const [texts, setTexts] = useState<Record<Locale, string>>({
    ar: value?.ar ?? '',
    en: value?.en ?? '',
    id: value?.id ?? '',
  })
  const [preview, setPreview] = useState<Record<Locale, boolean>>({
    ar: false,
    en: false,
    id: false,
  })
  const areas = useRef<Partial<Record<Locale, HTMLTextAreaElement | null>>>({})

  const tool = (locale: Locale, which: Tool) => {
    const area = areas.current[locale]
    if (!area) return
    let href: string | null = null
    if (which === 'link') {
      href = window.prompt(t('ae.md_link_prompt'), 'https://')
      if (href === null || href.trim() === '') return
      href = href.trim()
    }
    const result = applyTool(area.value, area.selectionStart, area.selectionEnd, which, href)
    setTexts((current) => ({ ...current, [locale]: result.text }))
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(result.start, result.end)
    })
  }

  const tools: { key: Tool; label: string; glyph: string }[] = [
    { key: 'h', label: t('ae.md_h'), glyph: 'H' },
    { key: 'b', label: t('ae.md_b'), glyph: 'B' },
    { key: 'i', label: t('ae.md_i'), glyph: 'I' },
    { key: 'ul', label: t('ae.md_ul'), glyph: '•' },
    { key: 'ol', label: t('ae.md_ol'), glyph: '1.' },
    { key: 'link', label: t('ae.md_link'), glyph: t('ae.md_link') },
  ]

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      <span className="a-hint">
        {hint ? `${hint} ` : ''}
        {t('ae.md_hint')}
      </span>
      <div className="a-l10n">
        {ORDER.map((locale) => {
          const fieldName = `${name}_${locale}`
          const showing = preview[locale]
          return (
            <div className="a-field a-md" key={locale}>
              <label htmlFor={fieldName}>{localeConfig[locale].label}</label>
              <div className="a-md-bar" role="toolbar" aria-label={t('ae.md_toolbar')}>
                {tools.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="a-md-tool"
                    title={item.label}
                    aria-label={item.label}
                    disabled={showing}
                    onClick={() => tool(locale, item.key)}
                  >
                    <span aria-hidden="true" className={`g-${item.key}`}>
                      {item.glyph}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="a-md-tool a-md-toggle"
                  aria-pressed={showing}
                  onClick={() => setPreview((current) => ({ ...current, [locale]: !showing }))}
                >
                  {showing ? t('ae.md_edit') : t('ae.md_preview')}
                </button>
              </div>
              <textarea
                id={fieldName}
                name={fieldName}
                ref={(el) => {
                  areas.current[locale] = el
                }}
                className="a-textarea"
                rows={9}
                lang={locale}
                dir={localeConfig[locale].dir}
                value={texts[locale]}
                hidden={showing}
                onChange={(event) =>
                  setTexts((current) => ({ ...current, [locale]: event.target.value }))
                }
              />
              {showing ? (
                <div className="a-md-preview" lang={locale} dir={localeConfig[locale].dir}>
                  {texts[locale].trim() === '' ? (
                    <p className="a-hint">{t('ae.md_preview_empty')}</p>
                  ) : (
                    <Markdown source={texts[locale]} />
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
