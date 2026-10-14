'use client'

/**
 * Toast.
 *
 * Ported from the `Toast` component in design/handoff/bt-ui.jsx and the
 * `toast()` helper that lived on the BT context in bt-app.jsx. The prototype
 * kept the message in the same god-context as the router, the cart and the
 * language; here it is its own provider with one job.
 *
 * Behaviour matches the handoff: a forest pill, centred at the bottom, sliding
 * up (`@keyframes btToast`), auto-dismissed after 2400ms, replaced rather than
 * stacked when a second message arrives.
 *
 * Two fixes:
 *
 *  1. **The live region is always mounted.** The handoff mounted the whole
 *     `role="status"` node together with its text. A live region inserted and
 *     populated in the same frame is unreliably announced — some screen
 *     reader / browser pairs never see the change because the region was not
 *     being observed when the text appeared. The empty region is in the DOM
 *     from the start and only its contents change.
 *  2. **The timer is keyed.** `toast(msg)` twice with the same string now
 *     restarts the countdown and re-announces, instead of leaving the first
 *     timer to dismiss a message the user just triggered again.
 *
 * v3 (bt.css "Toast"): a deep-forest card above the mobile tab bar and at
 * the bottom centre on desktop, 3.6s, with a check (or an alert for
 * `error`) and an optional trailing link ("View", "My Trip"). The host is
 * `.toasts`, always mounted as the live region.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'

export type ToastOptions = {
  /** Error styling (dark red) and an alert icon. */
  error?: boolean
  /** Trailing link, e.g. { href: '/my-trip', label: t('bt_my_trip') }. */
  link?: { href: string; label: string }
}

export type ToastApi = {
  /** Show a message. Already translated — this component holds no copy. */
  toast: (message: string, options?: ToastOptions) => void
  /** Dismiss the current message early. */
  dismiss: () => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Matches the 2400ms in bt-app.jsx. */
const DEFAULT_DURATION = 3600

export type ToastProviderProps = {
  children: ReactNode
  /** Visible duration in ms. */
  duration?: number
}

type ToastState = { key: number; message: string; options: ToastOptions } | null

export function ToastProvider({ children, duration = DEFAULT_DURATION }: ToastProviderProps) {
  const [current, setCurrent] = useState<ToastState>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextKey = useRef(0)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setCurrent(null)
  }, [clearTimer])

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      clearTimer()
      nextKey.current += 1
      setCurrent({ key: nextKey.current, message, options })
      timer.current = setTimeout(() => {
        timer.current = null
        setCurrent(null)
      }, duration)
    },
    [clearTimer, duration],
  )

  // A pending timer after unmount would call setState on a dead tree.
  useEffect(() => clearTimer, [clearTimer])

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The host is fixed and ignores the pointer; only the card takes it. */}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="true">
        {current && (
          <div key={current.key} className={current.options.error ? 'toast err' : 'toast'}>
            <Icon name={current.options.error ? 'alert' : 'check'} size={20} stroke={2.2} />
            <span className="toast-msg">{current.message}</span>
            {current.options.link !== undefined && (
              <Link href={current.options.link.href} onClick={dismiss}>
                {current.options.link.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Read the toast API.
 *
 * Throws rather than returning a silent no-op: a `toast()` that quietly does
 * nothing because a provider is missing is the kind of bug that ships.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) {
    throw new Error('useToast must be used inside a <ToastProvider>.')
  }
  return api
}
