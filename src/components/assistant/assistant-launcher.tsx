'use client'

/**
 * The floating "Ask AI" button, on every public page (mounted once by the
 * locale layout, so the conversation survives navigation).
 *
 * Cheap until used: the button is a few hundred bytes; the panel and its
 * streaming code are loaded on the first tap, and availability is asked then
 * (`GET /api/assistant`). When the assistant is switched off or has no key,
 * the panel says so politely and offers WhatsApp — nothing else on the page
 * depends on it.
 *
 * Position: bottom inline-end, stacked above the WhatsApp button where that
 * is shown, above the phone tab bar, and on the map above its Map/List bar.
 */

import dynamic from 'next/dynamic'
import { useLocale, useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { useWhatsappLink } from '@/components/layout/contact-context'
import { Icon } from '@/components/ui'
import { usePathname } from '@/i18n/routing'

import type { AssistantStatus } from './assistant-panel'

const AssistantPanel = dynamic(
  () => import('./assistant-panel').then((module) => module.AssistantPanel),
  { ssr: false },
)

/** Where the WhatsApp button hides (whatsapp-fab.tsx): the assistant takes its spot. */
const NO_WHATSAPP = ['/map', '/checkout']

export function AssistantLauncher() {
  const t = useTranslations()
  const locale = useLocale()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<AssistantStatus>({ state: 'unknown' })
  const button = useRef<HTMLButtonElement>(null)

  const waHref = useWhatsappLink()
  const onMap = pathname === '/map' || pathname.startsWith('/map/')
  const solo =
    waHref === null ||
    NO_WHATSAPP.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  function openPanel() {
    setLoaded(true)
    setOpen(true)
    if (status.state === 'unknown' || status.state === 'off') {
      setStatus({ state: 'loading' })
      fetch(`/api/assistant?locale=${encodeURIComponent(locale)}`, { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          const value = data as { available?: unknown; welcome?: unknown } | null
          setStatus(
            value?.available === true
              ? { state: 'ok', welcome: typeof value.welcome === 'string' ? value.welcome : null }
              : { state: 'off' },
          )
        })
        .catch(() => setStatus({ state: 'off' }))
    }
  }

  function closePanel() {
    setOpen(false)
    // Back to where the visitor was.
    requestAnimationFrame(() => button.current?.focus())
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`ai-fab${solo ? ' is-solo' : ''}${onMap ? ' is-map' : ''}`}
        hidden={open}
        onClick={openPanel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('ai_fab_aria')}
      >
        <Icon name="sparkle" size={20} />
        <span className="ai-fab-label">{t('ai_fab')}</span>
      </button>
      {loaded ? <AssistantPanel open={open} status={status} onClose={closePanel} /> : null}
    </>
  )
}
