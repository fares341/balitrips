'use client'

/**
 * An assistant reply, rendered from the markdown-lite tree in
 * `@/lib/assistant/links` — text nodes only (React escapes them), bold, lists
 * and allow-listed links. Never `dangerouslySetInnerHTML`.
 */

import { useMemo } from 'react'

import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { parseReply, type Inline } from '@/lib/assistant/links'

/** `/ar/activities/x` → `/activities/x`: the locale-aware Link adds the visitor's own. */
function withoutLocale(href: string): string {
  const match = /^\/([a-z]{2})(?=\/|$|\?|#)/.exec(href)
  if (match && (locales as readonly string[]).includes(match[1] ?? '')) {
    const rest = href.slice(match[0].length)
    return rest === '' ? '/' : rest.startsWith('/') ? rest : `/${rest}`
  }
  return href
}

function InlineParts({ parts, onNavigate }: { parts: Inline[]; onNavigate?: () => void }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'bold') return <strong key={index}>{part.text}</strong>
        if (part.type === 'link') {
          return part.external ? (
            <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow">
              {part.text}
            </a>
          ) : (
            <Link key={index} href={withoutLocale(part.href)} onClick={onNavigate}>
              {part.text}
            </Link>
          )
        }
        return <span key={index}>{part.text}</span>
      })}
    </>
  )
}

export function Reply({
  text,
  origin,
  onNavigate,
}: {
  text: string
  origin: string | null
  /** Phones: close the full-screen sheet when a link inside it is followed. */
  onNavigate?: () => void
}) {
  const blocks = useMemo(() => parseReply(text, origin), [text, origin])
  return (
    <div className="ai-reply">
      {blocks.map((block, index) => {
        if (block.type === 'p')
          return (
            <p key={index}>
              <InlineParts parts={block.parts} onNavigate={onNavigate} />
            </p>
          )
        const List = block.type === 'ul' ? 'ul' : 'ol'
        return (
          <List key={index}>
            {block.items.map((item, i) => (
              <li key={i}>
                <InlineParts parts={item} onNavigate={onNavigate} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
