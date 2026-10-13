/**
 * Does this visitor get the Studio shortcut, and where does it point?
 *
 * WHY AN ENDPOINT rather than rendering the link in the layout.
 *
 * The header is mounted once in `[locale]/layout.tsx`, above every route. For
 * the layout to know the viewer's role it would have to read the session
 * cookie, and reading cookies in a layout opts EVERY page beneath it out of
 * static generation — the whole catalogue, in all three locales, turned
 * dynamic to decide one button. This keeps those pages static and asks the
 * question separately.
 *
 * WHY IT RETURNS THE PATH rather than the client knowing it.
 *
 * ADMIN_BASE_PATH is deliberately non-obvious and rotatable. Shipping it to
 * every browser in a bundle would undo that for the sake of a link nobody
 * else can use. Here the path leaves the server ONLY for a session that
 * already holds `admin.access` — everyone else gets `null`, which is the same
 * response an anonymous visitor gets, so probing this endpoint reveals
 * nothing about whether a given account is privileged.
 *
 * Obscurity is not the security boundary either way: `src/proxy.ts` and every
 * admin route and server action re-check the role server-side. This only
 * decides whether a shortcut is offered.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { ADMIN_LOCALE_COOKIE, INITIAL_ADMIN_LOCALE, isAdminLocale } from '@/app/(admin)/_i18n/types'
import { adminHref } from '@/app/(admin)/_lib/admin-path'
import { hasCapability } from '@/lib/auth/session'

/** Reads the session cookie; never cacheable, and Caddy marks /api no-store. */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const allowed = await hasCapability('admin.access')

  const response = NextResponse.json(
    { href: allowed ? adminHref() : null },
    {
      headers: {
        // Belt and braces with the Caddyfile: a shared cache holding one
        // admin's response and serving it to the next visitor would hand the
        // path to a stranger.
        'Cache-Control': 'no-store, private',
      },
    },
  )
  // Staff start the Studio in Arabic; the sidebar toggle changes it after.
  if (allowed && !isAdminLocale((await cookies()).get(ADMIN_LOCALE_COOKIE)?.value)) {
    response.cookies.set(ADMIN_LOCALE_COOKIE, INITIAL_ADMIN_LOCALE, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60,
    })
  }
  return response
}
