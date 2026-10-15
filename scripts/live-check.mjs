// Real-browser check of the LIVE site (fonts, build) from GitHub Actions.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

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
await browser.close()
writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
