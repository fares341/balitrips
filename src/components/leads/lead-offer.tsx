'use client'

/**
 * «خصم أول حجز» — the soft opt-in offer (owner, Nov 2026).
 *
 * Appears at most once per visitor: after the Studio delay (default 25 s) or
 * on exit intent on a desktop, at half the page on a phone. Never on the
 * cart, checkout, account, sign-in or policy pages, never while the cookie
 * banner is still open, and never again for 14 days after a close (never
 * again at all after it was sent). Closing is one tap, Escape, or a tap on
 * the backdrop. Nothing about the normal flow changes when it is ignored.
 *
 * The memory is one localStorage value, read and written inside try/catch: a
 * private window or blocked storage simply means the offer may show again.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { BaliIcon } from '@/components/ui/bali-icon'
import { usePathname } from '@/i18n/routing'
import { DIAL_CODES } from '@/lib/auth/phone'
import {
  isExcludedPath,
  mayShowOffer,
  OFFER_STORAGE_KEY,
  parseOfferMemory,
  reachedScrollTrigger,
  type OfferMemory,
} from '@/lib/leads/rules'

import {
  claimLeadOfferAction,
  leadOfferConfigAction,
  type OfferConfig,
  type OfferResult,
} from './offer-actions'

import './lead-offer.css'

function readMemory(): OfferMemory {
  try {
    return parseOfferMemory(window.localStorage.getItem(OFFER_STORAGE_KEY))
  } catch {
    return {}
  }
}

function writeMemory(patch: OfferMemory): void {
  try {
    const next = { ...readMemory(), ...patch }
    window.localStorage.setItem(OFFER_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: nothing to remember */
  }
}

export function LeadOffer() {
  const t = useTranslations()
  const locale = useLocale()
  const pathname = usePathname()
  const [config, setConfig] = useState<OfferConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<OfferResult | null>(null)
  const [dial, setDial] = useState('966')
  const [copied, setCopied] = useState(false)
  const shown = useRef(false)
  const titleId = useId()
  const firstField = useRef<HTMLInputElement>(null)

  const excluded = isExcludedPath(pathname)

  // Load the Studio settings once, only if this visitor may still see it.
  useEffect(() => {
    if (excluded || config !== null) return
    if (!mayShowOffer(readMemory(), Date.now())) return
    let alive = true
    leadOfferConfigAction(locale)
      .then((value) => {
        if (!alive) return
        setConfig(value)
        setDial(value.dial)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [excluded, config, locale])

  const show = useCallback(() => {
    if (shown.current) return
    if (document.querySelector('.bt-consent')) return // cookie banner first
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return // another dialog
    if (!mayShowOffer(readMemory(), Date.now())) return
    shown.current = true
    writeMemory({ shownAt: Date.now() })
    setOpen(true)
  }, [])

  // Triggers.
  useEffect(() => {
    if (!config?.enabled || excluded || shown.current) return
    const phone = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches
    if (phone) {
      const onScroll = () => {
        const doc = document.documentElement
        if (reachedScrollTrigger(window.scrollY, window.innerHeight, doc.scrollHeight)) show()
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => window.removeEventListener('scroll', onScroll)
    }
    const timer = window.setTimeout(show, config.delaySeconds * 1000)
    const onLeave = (event: MouseEvent) => {
      if (event.clientY <= 0 && event.relatedTarget === null) show()
    }
    document.addEventListener('mouseout', onLeave)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mouseout', onLeave)
    }
  }, [config, excluded, show])

  const close = useCallback(() => {
    setOpen(false)
    if (result?.ok) writeMemory({ doneAt: Date.now() })
    else writeMemory({ closedAt: Date.now() })
  }, [result])

  useEffect(() => {
    if (!open) return
    firstField.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open || !config) return null

  const headline = config.headline || t('lead_headline', { percent: config.percent })

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    try {
      const value = await claimLeadOfferAction({
        name: String(form.get('name') ?? ''),
        dial,
        phone: String(form.get('phone') ?? ''),
        email: String(form.get('email') ?? ''),
        consent: form.get('consent') === 'on',
        locale,
        website: String(form.get('website') ?? ''),
      })
      setResult(value)
      if (value.ok) writeMemory({ doneAt: Date.now() })
    } catch {
      setResult({ ok: false, error: 'failed' })
    } finally {
      setPending(false)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      /* the code is on screen anyway */
    }
  }

  const error = result && !result.ok ? result.error : null

  return (
    <div className="lo-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="lo-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="lo-close" onClick={close} aria-label={t('lead_close')}>
          <Icon name="cross" size={20} />
        </button>
        <div className="lo-badge" aria-hidden="true">
          <BaliIcon name="ticket" size={34} />
        </div>
        {result?.ok ? (
          <div className="lo-done">
            <h2 id={titleId} className="lo-title">
              {t('lead_done_t')}
            </h2>
            <p className="lo-sub">{t('lead_done_b', { percent: config.percent })}</p>
            <div className="lo-code" dir="ltr">
              <span>{result.code}</span>
              <button
                type="button"
                className="btn btn-ghost lo-copy"
                onClick={() => copy(result.code)}
              >
                {copied ? t('lead_copied') : t('lead_copy')}
              </button>
            </div>
            {result.validTo ? (
              <p className="lo-fine">{t('lead_valid_to', { date: result.validTo })}</p>
            ) : null}
            {result.sentWhatsapp || result.sentEmail ? (
              <p className="lo-fine">
                {result.sentWhatsapp ? t('lead_sent_wa') : t('lead_sent_email')}
              </p>
            ) : null}
            <button type="button" className="btn btn-primary lo-submit" onClick={close}>
              {t('lead_continue')}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <h2 id={titleId} className="lo-title">
              {headline}
            </h2>
            <p className="lo-sub">{t('lead_sub')}</p>
            <label className="lo-label" htmlFor={`${titleId}-name`}>
              {t('lead_name')}
            </label>
            <input
              ref={firstField}
              id={`${titleId}-name`}
              className="bt-input"
              name="name"
              autoComplete="name"
              maxLength={128}
              required
              aria-invalid={error === 'name' || undefined}
            />
            <label className="lo-label" htmlFor={`${titleId}-phone`}>
              {t('lead_phone')}
            </label>
            <div className="lo-phone" dir="ltr">
              <select
                className="bt-input lo-dial"
                aria-label={t('auth_dial_code')}
                value={dial}
                onChange={(e) => setDial(e.target.value)}
              >
                {DIAL_CODES.map((c) => (
                  <option key={c.iso} value={c.dial}>
                    {c.iso} +{c.dial}
                  </option>
                ))}
              </select>
              <input
                id={`${titleId}-phone`}
                className="bt-input"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                maxLength={20}
                required
                aria-invalid={error === 'phone_invalid' || undefined}
              />
            </div>
            <label className="lo-label" htmlFor={`${titleId}-email`}>
              {t('lead_email')} <span className="lo-opt">{t('lead_optional')}</span>
            </label>
            <input
              id={`${titleId}-email`}
              className="bt-input"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              maxLength={254}
              aria-invalid={error === 'email_invalid' || undefined}
            />
            <input
              className="lo-hp"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <label className="check lo-consent">
              <input type="checkbox" name="consent" />
              <span>{t('lead_consent')}</span>
            </label>
            {error ? (
              <p className="lo-err" role="alert">
                {t(`lead_e_${error}`)}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary lo-submit" disabled={pending}>
              {pending ? t('lead_sending') : t('lead_submit')}
            </button>
            <p className="lo-fine">{t('lead_fine')}</p>
            <button type="button" className="lo-skip" onClick={close}>
              {t('lead_no_thanks')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
