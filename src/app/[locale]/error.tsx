'use client'

/**
 * Friendly, localized error screen for any public page that throws while
 * rendering (a slow or failed database call, a timeout). Rendered inside the
 * [locale] layout, so the header, footer and tab bar stay usable.
 *
 * The digest is the id Next writes next to the real error in the server log
 * (docker logs / journalctl), so support can match a visitor's report.
 */

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/routing'

import { PopularLinks } from './_ui/popular-links'

export default function LocaleError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string }
  retry?: () => void
  reset?: () => void
}) {
  const t = useTranslations()

  useEffect(() => {
    console.error(error)
  }, [error])

  const again = retry ?? reset

  return (
    <main className="nf">
      <title>{`${t('err5_title')} · Bali Trips`}</title>
      <div className="arc" aria-hidden="true" />
      <div className="stack nf-in" role="alert">
        <div className="nf-num" aria-hidden="true" dir="ltr">
          5<span>0</span>0
        </div>
        <h1 className="h2">{t('err5_title')}</h1>
        <p className="muted">{t('err5_body')}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {again !== undefined && (
            <button type="button" className="btn btn-primary" onClick={() => again()}>
              {t('err5_retry')}
            </button>
          )}
          <Link href="/" className="btn btn-ghost">
            {t('err5_home')}
          </Link>
        </div>
        {error.digest !== undefined && (
          <p className="muted" style={{ fontSize: 13 }}>
            {t('err5_ref')} <code dir="ltr">{error.digest}</code>
          </p>
        )}
        <PopularLinks headingId="err-pop-h" />
      </div>
    </main>
  )
}
