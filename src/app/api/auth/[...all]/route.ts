/**
 * Better Auth request handler.
 *
 * Everything under `/api/auth/*` — sign-in, sign-up, sign-out, the OAuth
 * redirect and callback, session reads, the password-reset request and the
 * reset itself — is served from here. Rate limiting, origin checks and CSRF
 * live inside `auth.handler`; see `src/lib/auth/server.ts`.
 *
 * The route is outside `[locale]` on purpose. `proxy.ts` excludes `/api` from
 * locale negotiation, and a locale-prefixed callback URL would have to be
 * registered three times with Google and Apple.
 */

import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/lib/auth/server'

/**
 * Node, not Edge: the credential hash is scrypt and the adapter talks to
 * Postgres over TCP through `postgres.js`.
 */
export const runtime = 'nodejs'

/** Reads cookies and sets them; nothing here is ever cacheable. */
export const dynamic = 'force-dynamic'

export const { GET, POST } = toNextJsHandler(auth.handler)
