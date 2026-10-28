import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { test } from '../support/fixtures'

import { ADMIN, check, signInAs } from './_support'

/**
 * Nobody but staff reaches the Studio: anonymous visitors are sent to sign
 * in, customers get a 404, and export/route handlers refuse both.
 */

const NAV = [
  ...readFileSync(resolve(__dirname, '..', '..', 'src/app/(admin)/_ui/nav.ts'), 'utf8').matchAll(
    /path: '([^']*)'/g,
  ),
].map((m) => m[1] ?? '')

const HANDLERS = [
  '/orders/export',
  '/customers/export',
  '/leads/export',
  '/payments/export',
  '/profit/export',
  '/protection/activity/export',
  '/activity-import/template',
]

function denied(status: number, url: string): boolean {
  if (status === 404 || status === 401 || status === 403) return true
  // Anonymous: redirected to the public sign-in.
  return /\/account\?signin=1|\/login/.test(url) && !new URL(url).pathname.startsWith(ADMIN)
}

test('anonymous visitor is denied every Studio page and handler', async ({ page }, info) => {
  for (const path of [...NAV, ...HANDLERS]) {
    const response = await page.request.get(`${ADMIN}${path}`, { maxRedirects: 5 })
    check(
      info,
      'studio permissions/anon',
      `GET ${path || '/'}`,
      denied(response.status(), response.url()),
      `${response.status()} ${response.url()}`,
    )
  }
  const api = await page.request.post('/api/studio-assistant', { data: { message: 'hi' } })
  check(
    info,
    'studio permissions/anon',
    'POST /api/studio-assistant',
    api.status() >= 400 && api.status() < 500,
    `${api.status()}`,
  )
})

test('customer is denied every Studio page and handler', async ({ page }, info) => {
  test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')
  await signInAs(page, 'customer')
  for (const path of [...NAV, ...HANDLERS]) {
    const response = await page.request.get(`${ADMIN}${path}`, { maxRedirects: 5 })
    check(
      info,
      'studio permissions/customer',
      `GET ${path || '/'}`,
      denied(response.status(), response.url()),
      `${response.status()} ${response.url()}`,
    )
  }
  const api = await page.request.post('/api/studio-assistant', { data: { message: 'hi' } })
  check(
    info,
    'studio permissions/customer',
    'POST /api/studio-assistant',
    api.status() >= 400 && api.status() < 500,
    `${api.status()}`,
  )
})

test('content editor cannot open team or money pages', async ({ page }, info) => {
  test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')
  await signInAs(page, 'content_editor')
  for (const path of ['/team', '/payments', '/profit', '/config', '/whatsapp']) {
    const response = await page.request.get(`${ADMIN}${path}`, { maxRedirects: 5 })
    check(
      info,
      'studio permissions/content_editor',
      `GET ${path}`,
      response.status() === 404 || response.status() === 403,
      `${response.status()}`,
    )
  }
})
