'use client'

/**
 * Floating "Chat with us" button.
 *
 * Rendered once by the locale layout, so it is on every public page. It is a
 * plain link to `wa.me` — no widget script, no third-party request until the
 * visitor taps it.
 *
 * Hidden when:
 *  - `NEXT_PUBLIC_WHATSAPP_NUMBER` is not configured (a button that opens a
 *    chat with nobody is worse than none);
 *  - on the map and checkout, where the bottom of the screen belongs to the
 *    place sheet and the pay button.
 *
 * Positioned with `inset-inline-end`, so it sits bottom-right in English and
 * bottom-left in Arabic. On phones it floats above the bottom tab bar
 * (`.wa-fab` in bt.css), never over it; below toasts and modals.
 */

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { usePathname } from '@/i18n/routing'

import { whatsappLink } from './contact-config'

const HIDDEN_ON = ['/map', '/checkout']

export function WhatsAppFab() {
  const t = useTranslations()
  const pathname = usePathname()
  const href = whatsappLink()

  if (href === null) return null
  if (HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null

  return (
    <a
      href={href}
      className="wa-fab"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('wa_chat_aria')}
    >
      <Icon name="whatsapp" size={22} />
      <span className="wa-fab-label">{t('wa_chat')}</span>
    </a>
  )
}
