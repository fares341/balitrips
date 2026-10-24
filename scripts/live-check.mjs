// Real-browser check of the LIVE site (fonts, build) from GitHub Actions.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

import { auditPlaces } from './live-places.mjs'
import { auditActivities } from './live-activities.mjs'

const BASE = process.env.LIVE_URL ?? 'https://152-42-252-61.sslip.io'
const OUT = 'live'
mkdirSync(OUT, { recursive: true })
const log = []
const browser = await chromium.launch()
for (const path of ['/ar', '/en', '/ar/map']) {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      ignoreHTTPSErrors: true,
    })
    const fontReqs = []
    page.on('response', (r) => {
      const u = r.url()
      if (/\.(woff2?|ttf|otf)(\?|$)/.test(u) || u.includes('fonts.g'))
        fontReqs.push(`${r.status()} ${u}`)
    })
    page.on('requestfailed', (r) =>
      log.push(`${path} ${w} FAILED ${r.url().slice(0, 200)} ${r.failure()?.errorText}`),
    )
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 })
      await page.waitForTimeout(2500)
      const info = await page.evaluate(() => {
        const pick = (sel) => {
          const el = document.querySelector(sel)
          return el ? getComputedStyle(el).fontFamily : null
        }
        return {
          htmlClass: document.documentElement.className,
          bodyFont: getComputedStyle(document.body).fontFamily,
          h1Font: pick('h1'),
          vars: (() => {
            const cs = getComputedStyle(document.documentElement)
            return {
              arabic: cs.getPropertyValue('--font-arabic'),
              latin: cs.getPropertyValue('--font-latin'),
              far: cs.getPropertyValue('--f-ar'),
            }
          })(),
          loaded: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
          css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href),
        }
      })
      log.push(`${path} ${w} ${JSON.stringify(info)}`)
      log.push(`${path} ${w} fontRequests: ${fontReqs.join(' | ')}`)
      await page.screenshot({ path: `${OUT}/${path.replace(/\//g, '_')}-${w}.png` })
    } catch (e) {
      log.push(`${path} ${w} ERROR ${e.message}`)
    }
    await page.close()
  }
}

// Studio entry points: only the default paths (the real one is a server secret).
// `/en/account?signin=1` opening the dialog by itself shows the Studio
// sign-in fix (d27107a) is deployed.
for (const path of [
  '/studio',
  '/studio-8f2a',
  ...(process.env.EXTRA_PATHS ?? '').split(',').filter(Boolean),
  '/en/account?signin=1',
  '/ar/account',
  '/api/admin-link',
  '/api/health',
]) {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      ignoreHTTPSErrors: true,
    })
    const errs = []
    page.on(
      'console',
      (m) => m.type() === 'error' && errs.push(`console ${m.text().slice(0, 200)}`),
    )
    page.on('pageerror', (e) => errs.push(`pageerror ${e.message.slice(0, 200)}`))
    page.on('requestfailed', (r) =>
      errs.push(`failed ${r.url().slice(0, 160)} ${r.failure()?.errorText}`),
    )
    page.on(
      'response',
      (r) => r.status() >= 400 && errs.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`),
    )
    try {
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(1500)
      const headers = res ? res.headers() : {}
      const info = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 100) ?? '',
        text: document.body?.innerText?.slice(0, 200) ?? '',
        signInDialogOpen: !!document.querySelector('input[autocomplete="current-password"]'),
        signInButton: [...document.querySelectorAll('main button')].some((b) =>
          /sign in|تسجيل الدخول|دخول|masuk/i.test(b.textContent ?? ''),
        ),
      }))
      log.push(
        `STUDIO ${path} ${w} status=${res?.status()} final=${page.url()} robots=${headers['x-robots-tag'] ?? ''} ` +
          `cache=${headers['cache-control'] ?? ''} csp=${headers['content-security-policy'] ?? ''} ${JSON.stringify(info)} errors=${JSON.stringify(errs)}`,
      )
      await page.screenshot({ path: `${OUT}/studio${path.replace(/[/?=]/g, '_')}-${w}.png` })
    } catch (e) {
      log.push(
        `STUDIO ${path} ${w} ERROR ${e.message.split('\n')[0]} errors=${JSON.stringify(errs)}`,
      )
    }
    await page.close()
  }
}

// Sticky probe: does the activities search bar follow the scroll?
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  })
  try {
    await page.goto(BASE + '/ar/activities', { waitUntil: 'networkidle', timeout: 90000 })
    const before = await page.evaluate(
      () => document.querySelector('.act-toolbar')?.getBoundingClientRect().top ?? null,
    )
    await page.mouse.wheel(0, 1500)
    await page.waitForTimeout(1200)
    const after = await page.evaluate(() => {
      const el = document.querySelector('.act-toolbar')
      return el
        ? {
            top: el.getBoundingClientRect().top,
            position: getComputedStyle(el).position,
            scrollY: window.scrollY,
          }
        : null
    })
    log.push(`STICKY /ar/activities before=${before} after=${JSON.stringify(after)}`)
  } catch (e) {
    log.push(`STICKY ERROR ${e.message}`)
  }
  await page.close()
}
// Places audit: every map place, its page and its images (live/places.{json,csv}).
try {
  log.push(await auditPlaces(browser, BASE, OUT, writeFileSync))
} catch (e) {
  log.push(`PLACES ERROR ${e.stack}`)
}
// Activity v2 audit: which sections render per live activity (live/activities.json).
try {
  log.push(await auditActivities(browser, BASE, OUT, writeFileSync))
} catch (e) {
  log.push(`ACTIVITIES ERROR ${e.stack}`)
}
await browser.close()
writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
