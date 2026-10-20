'use client'

import { useEffect } from 'react'

/**
 * Phase 6: reports uncaught browser errors to `/api/client-errors`, where they
 * join the server's error log (Studio → System health). Sends only the error
 * text, its stack and the page path — never the query string, form values or
 * anything typed. At most five reports per page load, each message once.
 */

const ENDPOINT = '/api/client-errors'
const MAX_REPORTS = 5

export function ErrorBeacon() {
  useEffect(() => {
    let sent = 0
    const seen = new Set<string>()

    function send(kind: 'error' | 'rejection', value: unknown) {
      if (sent >= MAX_REPORTS) return
      const error = value instanceof Error ? value : null
      const message = (error?.message ?? String(value ?? 'Unknown error')).slice(0, 2000)
      if (seen.has(message)) return
      seen.add(message)
      sent += 1
      const body = JSON.stringify({
        kind,
        message,
        name: error?.name?.slice(0, 120),
        stack: error?.stack?.slice(0, 8000),
        path: window.location.pathname.slice(0, 500),
      })
      try {
        const blob = new Blob([body], { type: 'application/json' })
        if (navigator.sendBeacon?.(ENDPOINT, blob)) return
        void fetch(ENDPOINT, {
          method: 'POST',
          body,
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => undefined)
      } catch {
        // Reporting must never become the error.
      }
    }

    const onError = (event: ErrorEvent) => send('error', event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => send('rejection', event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
