/**
 * Any path under a locale that matches no page: the localized 404, rendered
 * on the server, with status 404.
 *
 * This was a page that called `notFound()`, for which Next sends a bare
 * error shell and builds the real page in the browser. A route handler can
 * set the status itself, so it returns the HTML of `/[locale]/not-found-page`
 * (fetched from this same server over the loopback). If that fetch fails,
 * a small self-contained page in the right language is sent instead.
 */

import type { NextRequest } from 'next/server'

import { fallbackLocale, isLocale, localeConfig } from '@/i18n/config'
import { NOT_FOUND_PAGE } from '@/lib/seo/not-found-routing'

import ar from '../../../../messages/ar.json'
import en from '../../../../messages/en.json'
import id from '../../../../messages/id.json'

export const dynamic = 'force-dynamic'

const MESSAGES = { ar, en, id }

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
} as const

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function plainPage(locale: keyof typeof MESSAGES): string {
  const m = MESSAGES[locale]
  const { dir } = localeConfig[locale]
  return `<!DOCTYPE html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(m.nf5_meta)} · Bali Trips</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:64px 16px;color:#1f3d2b;background:#fffaf5"><h1>${escapeHtml(m.nf4_title)}</h1><p>${escapeHtml(m.nf4_body)}</p><p><a href="/${locale}">${escapeHtml(m.nf4_home)}</a> · <a href="/${locale}/map">${escapeHtml(m.nf4_map)}</a> · <a href="/${locale}/search">${escapeHtml(m.nf4_search)}</a></p></body></html>`
}

async function respond(request: NextRequest, locale: string, withBody: boolean) {
  const lang = isLocale(locale) ? locale : fallbackLocale
  let html: string | null = null
  try {
    const port = process.env.PORT || request.nextUrl.port || '3000'
    const page = await fetch(`http://127.0.0.1:${port}/${lang}/${NOT_FOUND_PAGE}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
      headers: { cookie: request.headers.get('cookie') ?? '' },
    })
    const text = await page.text()
    // The page answers 404 by design; anything else is not our page.
    if (page.status === 404 && text.includes('<html')) html = text
  } catch {
    html = null
  }
  return new Response(withBody ? (html ?? plainPage(lang)) : null, {
    status: 404,
    headers: HEADERS,
  })
}

type Context = { params: Promise<{ locale: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  return respond(request, (await params).locale, true)
}

export async function HEAD(request: NextRequest, { params }: Context) {
  return respond(request, (await params).locale, false)
}
