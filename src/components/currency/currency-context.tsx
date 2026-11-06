'use client'

/**
 * Visitor display currency.
 *
 * Decided on the server and applied before first paint (see the provider);
 * the switcher writes the `bt_currency` cookie.
 */

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { BASE_CURRENCY } from '@/lib/currency/fx'
import {
  CURRENCY_COOKIE,
  DEFAULT_DISPLAY_CURRENCY,
  formatSar,
  isDisplayCurrency,
  type DisplayCurrency,
} from '@/lib/currency/shared'

type State = {
  currency: DisplayCurrency
  rates: Record<string, number>
  supported: readonly string[]
  setCurrency: (currency: DisplayCurrency) => void
}

const CurrencyContext = createContext<State>({
  currency: DEFAULT_DISPLAY_CURRENCY,
  rates: { [BASE_CURRENCY]: 1 },
  supported: [BASE_CURRENCY],
  setCurrency: () => {},
})

type Runtime = { get: () => string; set: (code: string) => void }
const runtime = (): Runtime | undefined => (window as unknown as { __btMoney?: Runtime }).__btMoney

const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const snapshot = () =>
  runtime()?.get() ?? document.documentElement.getAttribute('data-cur') ?? BASE_CURRENCY
const serverSnapshot = () => DEFAULT_DISPLAY_CURRENCY

/**
 * The visitor's display currency. Decided on the server (`src/proxy.ts`
 * sets the geo cookie; the switcher cookie wins) and applied to the HTML
 * before first paint by the inline runtime (`@/lib/currency/money-runtime`);
 * this provider only mirrors it for the switcher.
 */
export function CurrencyProvider({
  children,
  rates,
  supported,
}: {
  children: React.ReactNode
  rates: Record<string, number>
  supported: readonly string[]
}) {
  const currency = useSyncExternalStore(subscribe, snapshot, serverSnapshot)

  const setCurrency = useCallback(
    (next: DisplayCurrency) => {
      if (!isDisplayCurrency(next, supported)) return
      try {
        document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      } catch {
        // Cookies blocked: the choice lasts for this page only.
      }
      runtime()?.set(next)
      listeners.forEach((fn) => fn())
    },
    [supported],
  )

  const value = useMemo(
    () => ({ currency, rates, supported, setCurrency }),
    [currency, rates, supported, setCurrency],
  )
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useDisplayCurrency(): State {
  return useContext(CurrencyContext)
}

/**
 * «≈ X» in the visitor's currency next to a SAR amount (checkout). Empty
 * for SAR visitors. Rendered empty and filled by the runtime, so the markup
 * is identical on the server and the client.
 */
export function LocalPrice({
  minor,
  currency,
  className,
}: {
  minor: number
  currency: string
  className?: string
}) {
  return (
    <small
      className={className ?? 'local-price muted'}
      style={{ display: 'block', fontWeight: 500 }}
    >
      <bdi
        data-money={minor}
        data-from={currency}
        data-money-mode="approx"
        suppressHydrationWarning
      />
    </small>
  )
}

/**
 * A catalogue price — the primary price everywhere public. Rendered as SAR
 * (identical HTML for every visitor, cache-friendly); the inline runtime
 * shows it in the visitor's currency with «≈» before first paint.
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
  return (
    <bdi className={className} data-money={minor} data-from={currency} suppressHydrationWarning>
      {formatSar(minor, currency, locale)}
    </bdi>
  )
}

/** Compact <select> for the header / drawer. */
export function CurrencySwitcher({ className }: { className?: string }) {
  const t = useTranslations()
  const { currency, setCurrency, supported } = useDisplayCurrency()
  return (
    <label className={className ?? 'currency-switcher'} style={{ display: 'inline-flex' }}>
      <span className="sr-only">{t('cur_label')}</span>
      <select
        value={currency}
        onChange={(e) => {
          setCurrency(e.target.value)
        }}
        aria-label={t('cur_label')}
        dir="ltr"
        className="currency-select"
      >
        {supported.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  )
}
