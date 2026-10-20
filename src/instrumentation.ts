/**
 * Phase 6: server errors into the error log (Studio → System health).
 *
 * Next calls `onRequestError` for every error it captures while handling a
 * request — Server Components, route handlers, Server Actions and the proxy.
 * The recorder scrubs and groups them (src/lib/monitoring/errors.ts); the
 * console line Next already prints is unchanged.
 *
 * Node runtime only: the recorder needs Postgres. Redirects and 404s thrown
 * as control flow (`NEXT_REDIRECT`, `NEXT_NOT_FOUND`, `NEXT_HTTP_ERROR_FALLBACK`)
 * are not errors and are skipped.
 */

import type { Instrumentation } from 'next'

export function register(): void {
  // Nothing to set up; `onRequestError` does the work.
}

function isControlFlow(error: unknown): boolean {
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : ''
  return /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest)
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (isControlFlow(error)) return
  // The NEXT_RUNTIME check wraps the import (the pattern Next documents) so
  // an edge build can drop the Postgres-backed recorder entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recordError } = await import('@/lib/monitoring/errors')
    const source =
      context.routeType === 'route'
        ? 'route'
        : context.routeType === 'action'
          ? 'action'
          : context.routeType === 'proxy'
            ? 'proxy'
            : 'render'
    await recordError(error, {
      source,
      path: request.path,
      details: {
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
      },
    })
  }
}
