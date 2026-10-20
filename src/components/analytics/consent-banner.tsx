'use client'

/**
 * Cookie consent banner: necessary (always) / statistics / marketing.
 *
 * Shown until the visitor chooses, and again from "Cookie settings"
 * (/cookies, footer). Not a modal — the page stays usable — but it is the
 * first thing a keyboard user reaches after the skip link. "Accept all" and
 * "Necessary only" are equal buttons: refusing is as easy as accepting.
 *
 * Nothing optional runs until a choice is stored: the tracker reads the same
 * cookie (./consent-store).
 */

import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { useLocale } from 'next-intl'

import { Link } from '@/i18n/routing'
import { CONSENT_OPEN_EVENT, parseConsent } from '@/lib/analytics/consent'

import { consentSnapshot, subscribeConsent, writeConsent } from './consent-store'
import { consentStrings } from './strings'

import './consent.css'

export function ConsentBanner() {
  const locale = useLocale()
  const s = consentStrings(locale)
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribeConsent,
    consentSnapshot,
    () => undefined,
  )
  const stored = raw === undefined ? null : parseConsent(raw)
  const [reopened, setReopened] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const titleId = useId()

  useEffect(() => {
    const open = () => {
      const current = parseConsent(consentSnapshot())
      setAnalytics(current?.analytics ?? false)
      setMarketing(current?.marketing ?? false)
      setChoosing(true)
      setReopened(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, open)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open)
  }, [])

  // Server render and first paint: undefined → render nothing.
  if (raw === undefined) return null
  if (stored !== null && !reopened) return null

  const save = (next: { analytics: boolean; marketing: boolean }) => {
    writeConsent(next, stored)
    setReopened(false)
    setChoosing(false)
  }

  return (
    <section
      className="bt-consent"
      role="region"
      aria-labelledby={titleId}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="bt-consent-inner">
        <h2 id={titleId} className="bt-consent-title">
          {s.title}
        </h2>
        <p className="bt-consent-body">
          {s.body}{' '}
          <Link href="/cookies" className="bt-consent-link">
            {s.policy}
          </Link>
        </p>

        {choosing ? (
          <fieldset className="bt-consent-groups">
            <legend className="sr-only">{s.customize}</legend>
            <label className="bt-consent-group">
              <input type="checkbox" checked disabled aria-describedby={`${titleId}-n`} />
              <span>
                <b>
                  {s.necessary} <small>({s.alwaysOn})</small>
                </b>
                <span id={`${titleId}-n`}>{s.necessaryHint}</span>
              </span>
            </label>
            <label className="bt-consent-group">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                aria-describedby={`${titleId}-a`}
              />
              <span>
                <b>{s.analytics}</b>
                <span id={`${titleId}-a`}>{s.analyticsHint}</span>
              </span>
            </label>
            <label className="bt-consent-group">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                aria-describedby={`${titleId}-m`}
              />
              <span>
                <b>{s.marketing}</b>
                <span id={`${titleId}-m`}>{s.marketingHint}</span>
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className="bt-consent-actions">
          {choosing ? (
            <button
              type="button"
              className="bt-consent-btn primary"
              onClick={() => save({ analytics, marketing })}
            >
              {s.save}
            </button>
          ) : (
            <button
              type="button"
              className="bt-consent-btn"
              onClick={() => {
                setAnalytics(stored?.analytics ?? false)
                setMarketing(stored?.marketing ?? false)
                setChoosing(true)
              }}
            >
              {s.customize}
            </button>
          )}
          <button
            type="button"
            className="bt-consent-btn primary"
            onClick={() => save({ analytics: false, marketing: false })}
          >
            {s.necessaryOnly}
          </button>
          <button
            type="button"
            className="bt-consent-btn primary"
            onClick={() => save({ analytics: true, marketing: true })}
          >
            {s.acceptAll}
          </button>
        </div>
      </div>
    </section>
  )
}

/** "Cookie settings" — re-opens the banner (used on /cookies and in the footer). */
export function CookieSettingsButton({ className }: { className?: string }) {
  const locale = useLocale()
  return (
    <button
      type="button"
      className={className ?? 'bt-consent-manage'}
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
    >
      {consentStrings(locale).manage}
    </button>
  )
}
