// UX audit of the LIVE site: screenshots + checks. Output to ./ux
import { chromium, devices } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const BASE = process.env.LIVE_URL || 'https://balitrips.co'
const OUT = 'ux'; mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const iphone = devices['iPhone 13']
const ctxOpts = {
  m: { ...iphone, viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true },
  d: { viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true },
}
const ctx = { m: await browser.newContext(ctxOpts.m), d: await browser.newContext(ctxOpts.d) }
const results = {}
const slug = (p) => p.replace(/^\//, '').replace(/[\/?=&]+/g, '_') || 'root'
async function dismissConsent(page) {
  const b = page.locator('.bt-consent-btn').first()
  if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(500) }
}
async function discover(path, re) {
  const p = await ctx.d.newPage()
  try { await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(2000)
    const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
    return hrefs.find((h) => re.test(h)) || null } catch { return null } finally { await p.close() }
}
const pkg = await discover('/ar/packages', /\/packages\/[^/?#]+$/)
const itin = await discover('/ar/itineraries', /\/itineraries\/[^/?#]+$/)
const art = await discover('/ar/blog', /\/blog\/[^/?#]+$/)
const strip = (h) => h && h.replace(/^https?:\/\/[^/]+/, '')
const arPaths = ['/ar', '/ar/activities', '/ar/activities/water-sports-bali', '/ar/activities/hot-air-balloon-ubud', '/ar/packages', strip(pkg), '/ar/itineraries', strip(itin), '/ar/map', '/ar/map?cat=hospitals', '/ar/shopping', '/ar/explore', '/ar/blog', strip(art), '/ar/about', '/ar/plans', '/ar/checkout', '/ar/login', '/ar/signup', '/ar/privacy', '/ar/terms', '/ar/this-page-does-not-exist-404'].filter(Boolean)
const paths = [...arPaths, '/en']
results._discovered = { pkg, itin, art }
let firstConsent = { m: true, d: true }
for (const path of paths) {
  for (const k of ['m', 'd']) {
    const page = await ctx[k].newPage()
    const r = { console: [], failed: [], status: null }
    page.on('console', (m) => { if (m.type() === 'error') r.console.push(m.text().slice(0, 300)) })
    page.on('pageerror', (e) => r.console.push('PAGEERROR ' + String(e).slice(0, 300)))
    page.on('requestfailed', (q) => r.failed.push(q.url().slice(0, 200) + ' ' + q.failure()?.errorText))
    const name = `${k === 'm' ? '390' : '1440'}_${slug(path)}`
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(async () => null)
      r.status = resp?.status() ?? null; r.finalUrl = page.url()
      await page.waitForTimeout(2000)
      if (firstConsent[k]) { await page.screenshot({ path: `${OUT}/${name}__consent.png` }); firstConsent[k] = false }
      await dismissConsent(page)
      if (k === 'm') await page.screenshot({ path: `${OUT}/${name}__fold.png` })
      // lazy load
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((s) => setTimeout(s, 120)) } window.scrollTo(0, 0) })
      await page.waitForTimeout(1200)
      r.checks = await page.evaluate(() => {
        const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 }
        const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(0, 160))
        const small = []; [...document.querySelectorAll('a,button,[role=button],input,select,summary')].forEach((el) => { if (!vis(el)) return; const b = el.getBoundingClientRect(); if (b.width < 40 || b.height < 40) small.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`) })
        const tiny = new Set(); document.querySelectorAll('body *').forEach((el) => { if (!vis(el)) return; const t = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' '); if (!t) return; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) tiny.add(`${fs}px ${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 30)} "${t.slice(0, 30)}"`) })
        const over = []; const W = document.documentElement.clientWidth; document.querySelectorAll('body *').forEach((el) => { const b = el.getBoundingClientRect(); if ((b.right > W + 1 || b.left < -1) && vis(el) && getComputedStyle(el).position !== 'fixed') over.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)} L${Math.round(b.left)} R${Math.round(b.right)}`) })
        return { title: document.title, lang: document.documentElement.lang, dir: document.documentElement.dir, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, hOverflow: document.documentElement.scrollWidth > window.innerWidth, overflowEls: over.slice(0, 15), brokenImgs, smallTapCount: small.length, smallTap: small.slice(0, 25), tinyTextCount: tiny.size, tinyText: [...tiny].slice(0, 20), h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 80)), height: document.body.scrollHeight }
      })
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
      try { const ax = await new AxeBuilder({ page }).analyze(); r.axe = ax.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })) } catch (e) { r.axe = 'ERR ' + e }
      if (path === '/ar') {
        await page.evaluate(() => window.scrollTo(0, 1400)); await page.waitForTimeout(800)
        await page.screenshot({ path: `${OUT}/${name}__scrolled_header.png` })
        if (k === 'm') { await page.evaluate(() => window.scrollTo(0, 0)); const mb = page.locator('.menu-btn').first(); if (await mb.isVisible().catch(() => false)) { await mb.click(); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${name}__menu_open.png` }) } }
      }
    } catch (e) { r.error = String(e).slice(0, 300) }
    results[`${k}:${path}`] = r
    await page.close()
  }
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
await browser.close()
