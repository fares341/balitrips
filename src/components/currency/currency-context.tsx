'use client'

/**
 * Visitor display currency.
 *
 * Fetched once per page load from /api/currency (never cached), so static,
 * edge-cached HTML stays identical for everyone: the local amount appears
 * after hydration. The switcher writes the `bt_currency` cookie.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  convertUsdMinor,
  CURRENCY_COOKIE,
  DEFAULT_DISPLAY_CURRENCY,
  DISPLAY_CURRENCIES,
  FALLBACK_RATES,
  formatApprox,
  formatInCurrency,
  moneyRuns,
  isDisplayCurrency,
  type DisplayCurrency,
} from '@/lib/currency/shared'

type State = {
  currency: DisplayCurrency
  rates: Record<string, number>
  ready: boolean
  setCurrency: (currency: DisplayCurrency) => void
}

const CurrencyContext = createContext<State>({
  currency: DEFAULT_DISPLAY_CURRENCY,
  rates: FALLBACK_RATES,
  ready: false,
  setCurrency: () => {},
})

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(DEFAULT_DISPLAY_CURRENCY)
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/currency', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { currency?: unknown; rates?: Record<string, number> } | null) => {
        if (!alive || !body) return
        if (isDisplayCurrency(body.currency)) setCurrencyState(body.currency)
        if (body.rates) setRates(body.rates)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const setCurrency = useCallback((next: DisplayCurrency) => {
    setCurrencyState(next)
    try {
      document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // Cookies blocked: the choice lasts for this page only.
    }
  }, [])

  const value = useMemo(
    () => ({ currency, rates, ready, setCurrency }),
    [currency, rates, ready, setCurrency],
  )
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useDisplayCurrency(): State {
  return useContext(CurrencyContext)
}

/**
 * "≈ 375 ر.س" next to a USD price. Renders nothing for non-USD sources,
 * when the visitor's currency is USD, or before the currency is known.
 */
export function LocalPrice({
  minor,
  currency,
  className,
  except,
}: {
  minor: number
  currency: string
  className?: string
  /** Also render nothing when the visitor's currency is this one (e.g. SAR next to the SAR charge). */
  except?: string
}) {
  const locale = useLocale()
  const { currency: target, rates, ready } = useDisplayCurrency()
  if (!ready || target === 'USD' || currency.toUpperCase() !== 'USD' || minor <= 0) return null
  if (except !== undefined && target === except.toUpperCase()) return null
  const amount = convertUsdMinor(minor, target, rates)
  if (amount === null) return null
  return (
    <small
      className={className ?? 'local-price muted'}
      style={{ display: 'block', fontWeight: 500 }}
    >
      <bdi>≈ {formatApprox(amount, target, locale)}</bdi>
    </small>
  )
}

/**
 * A catalogue price in the visitor's display currency — the primary price
 * everywhere public. Server HTML (and the first client render) shows SAR at
 * the fallback rate, so static pages stay identical for everyone and hydrate
 * cleanly; it swaps to the detected/chosen currency once /api/currency
 * answers. Zero/negative amounts are formatted as-is (callers decide "free").
 */
export function Money({
  minor,
  currency,
  className,
}: {
  minor: number
  currency: string
  className?: string
}) {
  const locale = useLocale()
  const { currency: target, rates } = useDisplayCurrency()
  return (
    <bdi className={className} data-money="" suppressHydrationWarning>
      {moneyRuns(formatInCurrency(minor, currency, target, locale, rates)).map((r, i) =>
        r.arabic ? (
          <span key={i} className="money-sym" lang="ar">
            {r.text}
          </span>
        ) : (
          r.text
        ),
      )}
    </bdi>
  )
}

/** Compact <select> for the header / drawer. */
export function CurrencySwitcher({ className }: { className?: string }) {
  const t = useTranslations()
  const { currency, setCurrency } = useDisplayCurrency()
  return (
    <label className={className ?? 'currency-switcher'} style={{ display: 'inline-flex' }}>
      <span className="sr-only">{t('cur_label')}</span>
      <select
        value={currency}
        onChange={(e) => {
          if (isDisplayCurrency(e.target.value)) setCurrency(e.target.value)
        }}
        aria-label={t('cur_label')}
        dir="ltr"
        style={{
          border: '1px solid var(--line, #ddd)',
          borderRadius: 999,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: 13,
          padding: '4px 8px',
        }}
      >
        {DISPLAY_CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * An already-formatted price string, with any Arabic currency symbol set in
 * the Arabic brand face (.money-sym), the same way <Money> renders it.
 */
export function MoneyText({ text }: { text: string }) {
  return (
    <>
      {moneyRuns(text).map((r, i) =>
        r.arabic ? (
          <span key={i} className="money-sym" lang="ar">
            {r.text}
          </span>
        ) : (
          r.text
        ),
      )}
    </>
  )
}
