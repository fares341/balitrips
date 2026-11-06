/**
 * Popular public pages, used by the 404 and error screens so a visitor who
 * hit a dead end has somewhere useful to go. Client-safe (no server APIs):
 * the error boundary is a Client Component.
 */

'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/routing'

const POPULAR = [
  { href: '/activities', key: 'navr_act' },
  { href: '/itineraries', key: 'navr_itin' },
  { href: '/map', key: 'navr_map' },
  { href: '/plans', key: 'navr_plans' },
  { href: '/blog', key: 'navr_blog' },
  { href: '/contact', key: 'navr_contact' },
] as const

export function PopularLinks({ headingId }: { headingId: string }) {
  const t = useTranslations()
  return (
    <nav className="nf-pop" aria-labelledby={headingId}>
      <h2 id={headingId} className="nf-pop-h">
        {t('nf5_popular')}
      </h2>
      <ul role="list">
        {POPULAR.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false}>
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
