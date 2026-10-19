// Real-browser screenshots taken in CI (where the map tiles are reachable).
// Used by .github/workflows/preview-shots.yml; output goes to ./ci-shots.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:3000'
const OUT = 'ci-shots'
mkdirSync(OUT, { recursive: true })

const pages = [
  ['home', '/ar', 0],
  ['home', '/en', 0],
  ['map', '/ar/map', 14000],
  ['map', '/en/map', 14000],
  ['mapdbg', '/en/map?debugmap=1', 14000],
]
const sizes = [
  [1440, 900],
  [390, 844],
]

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
})
const log = []
process.on('exit', () => writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n'))
for (const [name, path, wait] of process.env.SHOTS_ONLY ? [] : pages) {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    try {
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning')
          log.push(`${path} ${w}: ${m.type()} ${m.text()}`)
      })
      page.on('pageerror', (e) => log.push(`${path} ${w}: pageerror ${e.message}`))
      page.on('requestfailed', (r) =>
        log.push(`${path} ${w}: FAILED ${r.url().slice(0, 160)} ${r.failure()?.errorText}`),
      )
      page.on('response', (r) => {
        if (r.status() >= 400) log.push(`${path} ${w}: HTTP ${r.status()} ${r.url().slice(0, 160)}`)
      })
      await page
        .goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
        .catch((e) => log.push(`${path}: ${e.message}`))
      await page.waitForTimeout(wait || 1500)
      const lang = path.split('/')[1]
      const diag = await page.evaluate(() => {
        const c = document.createElement('canvas')
        const gl = c.getContext('webgl2') || c.getContext('webgl')
        return {
          webgl: !!gl,
          maplibre: typeof window.maplibregl,
          canvases: document.querySelectorAll('canvas.maplibregl-canvas').length,
          mapClass: document.querySelector('[class*="map"]')?.className?.toString().slice(0, 120),
        }
      })
      log.push(`${path} ${w}: diag ${JSON.stringify(diag)}`)
      if (name === 'mapdbg' && w > 1000) {
        const info = await page.evaluate(() => {
          const m = window.__btMap
          if (!m) return { none: true }
          const st = m.getStyle()
          return {
            zoom: m.getZoom(),
            pitch: m.getPitch(),
            center: m.getCenter(),
            loaded: m.loaded(),
            tilesLoaded: m.areTilesLoaded(),
            layers: st.layers.map((l) => l.id).join(','),
            sky: st.sky,
            terrain: st.terrain,
            rendered: m.queryRenderedFeatures().length,
            canvas: (() => {
              const c = m.getCanvas()
              const r = c.getBoundingClientRect()
              const chain = []
              for (let el = c; el && el !== document.body; el = el.parentElement) {
                const cs = getComputedStyle(el)
                chain.push(
                  `${el.tagName}.${el.className}|op=${cs.opacity}|vis=${cs.visibility}|disp=${cs.display}|z=${cs.zIndex}|${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
                )
              }
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              return {
                w: c.width,
                h: c.height,
                rect: [r.left, r.top, r.width, r.height],
                chain,
                top: top && `${top.tagName}.${top.className}`,
              }
            })(),
          }
        })
        log.push(`${path} ${w}: MAP ${JSON.stringify(info).slice(0, 3000)}`)
        for (const [tag, fn] of [
          ['ubud', 'm.jumpTo({center:[115.262,-8.507],zoom:13.5,pitch:55,bearing:-15})'],
          [
            'lake',
            "m.getLayer('outside-free')&&m.setLayoutProperty('outside-free','visibility','none');m.jumpTo({center:[115.395,-8.255],zoom:14,pitch:50,bearing:20})",
          ],
          ['coast', 'm.jumpTo({center:[115.2655,-8.688],zoom:15.5,pitch:45,bearing:0})'],
          ['canggu14', 'm.jumpTo({center:[115.128,-8.655],zoom:14,pitch:45,bearing:0})'],
          ['canggu16', 'm.jumpTo({center:[115.1305,-8.6595],zoom:16.3,pitch:40,bearing:0})'],
          ['river', 'm.jumpTo({center:[115.2455,-8.497],zoom:16,pitch:45,bearing:0})'],
        ]) {
          await page.evaluate((code) => {
            const m = window.__btMap
            if (m) new Function('m', code)(m)
          }, fn)
          await page.waitForTimeout(5000)
          await page.screenshot({ path: `${OUT}/${name}-${lang}-${w}-${tag}.png`, timeout: 120000 })
        }
      }
      const fonts = await page.evaluate(() =>
        [...document.fonts]
          .filter((f) => f.status === 'loaded')
          .map((f) => `${f.family} ${f.weight}`),
      )
      log.push(`${path} ${w}: fonts loaded: ${[...new Set(fonts)].join(', ')}`)
      await page.screenshot({ path: `${OUT}/${name}-${lang}-${w}.png`, fullPage: name !== 'map' })
    } catch (e) {
      log.push(`${path} ${w}: SCRIPT ERROR ${e.message}`)
      console.log(`::error::${path} ${w}: ${String(e.message).slice(0, 500)}`)
    }
    await page.close()
  }
}
// ---------------------------------------------------------------------------
// Public pages sweep: every public page at 390 and 1440 (ar), key pages in en,
// plus a horizontal-overflow probe at 360/390/768/1440. Files: p/<name>-<lang>-<w>.png
// Detail pages are found from their listing page (first matching link).
// ---------------------------------------------------------------------------
const SWEEP = [
  ['home', '/'],
  ['services', '/services'],
  ['explore', '/explore'],
  ['region', { from: '/explore', match: '/explore/' }],
  ['help', '/help'],
  ['activities', '/activities'],
  ['activity', { from: '/activities', match: '/activities/' }],
  ['itineraries', '/itineraries'],
  ['itinerary', { from: '/itineraries', match: '/itineraries/' }],
  ['packages', '/packages'],
  ['package', { from: '/packages', match: '/packages/' }],
  ['place', { from: '/', match: '/places/' }],
  ['custom', '/custom'],
  ['my-trip', '/my-trip'],
  ['checkout', '/checkout'],
  ['account', '/account'],
  ['signin', '/account?signin=1'],
  ['register', '/register'],
  ['forgot', '/forgot-password'],
  ['search', '/search?q=ubud'],
  ['search-empty', '/search?q=zzqxv'],
  ['blog', '/blog'],
  ['article', { from: '/blog', match: '/blog/' }],
  ['about', '/about'],
  ['contact', '/contact'],
  ['faq', '/faq'],
  ['privacy', '/privacy'],
  ['refund', '/refund'],
  ['events', '/events'],
  ['plans', '/plans'],
  ['reviews', '/reviews'],
  ['driver', '/driver'],
  ['404', '/no-such-page-xyz'],
]
const TABLET = new Set(['home', 'activity', 'my-trip', 'checkout'])
const EN_KEY = new Set([
  'home',
  'services',
  'activities',
  'activity',
  'my-trip',
  'checkout',
  'packages',
])
const ONLY = (process.env.SHOTS_ONLY ?? '').split(',').filter(Boolean)
mkdirSync(`${OUT}/p`, { recursive: true })
const overflow = []
const resolved = {}
async function resolvePath(lang, target) {
  if (typeof target === 'string') return `/${lang}${target === '/' ? '' : target}`
  const key = `${lang}:${target.from}:${target.match}`
  if (resolved[key] !== undefined) return resolved[key]
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  let found = null
  try {
    await page.goto(`${BASE}/${lang}${target.from}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    found = await page.evaluate((m) => {
      for (const a of document.querySelectorAll('main a[href]')) {
        const u = new URL(a.href)
        const rest = u.pathname.split(m)[1]
        if (rest && !rest.includes('/')) return u.pathname
      }
      return null
    }, target.match)
  } catch (e) {
    log.push(`sweep resolve ${key}: ${e.message}`)
  }
  await page.close()
  resolved[key] = found
  return found
}
for (const [name, target] of SWEEP) {
  if (ONLY.length && !ONLY.includes(name)) continue
  for (const lang of EN_KEY.has(name) ? ['ar', 'en'] : ['ar']) {
    const path = await resolvePath(lang, target)
    if (!path) {
      log.push(`sweep ${name} ${lang}: no path`)
      continue
    }
    for (const w of [390, 1440, 360, 768]) {
      const shoot = w === 390 || w === 1440 || (w === 768 && TABLET.has(name))
      const page = await browser.newPage({
        viewport: { width: w, height: w < 500 ? 844 : 900 },
        deviceScaleFactor: 1,
      })
      try {
        page.on('pageerror', (e) => log.push(`sweep ${path} ${w}: pageerror ${e.message}`))
        const res = await page
          .goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
          .catch((e) => log.push(`sweep ${path} ${w}: ${e.message}`))
        if (res && w === 1440)
          log.push(`sweep ${name} ${lang}: ${path} -> HTTP ${res.status()} ${page.url()}`)
        await page.waitForTimeout(1200)
        // scroll through so lazy images and reveal-on-scroll sections render
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 120))
          }
          window.scrollTo(0, 0)
        })
        // every image decoded (lazy ones were triggered by the scroll above)
        if (shoot)
          await page
            .waitForFunction(
              () =>
                [...document.images]
                  .filter((i) => {
                    const r = i.getBoundingClientRect()
                    return r.width > 0 && r.right > 0 && r.left < innerWidth
                  })
                  .every((i) => i.complete),
              null,
              { timeout: 6000 },
            )
            .catch(() => log.push(`sweep ${path} ${w}: images still loading`))
        await page.waitForTimeout(1500)
        const ov = await page.evaluate(() => {
          const iw = innerWidth
          const sw = document.documentElement.scrollWidth
          const off = []
          if (sw > iw) {
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect()
              if (r.width && (r.right > iw + 1 || r.left < -1)) {
                let p = el.parentElement
                let clipped = false
                while (p && p !== document.body) {
                  if (getComputedStyle(p).overflowX !== 'visible') {
                    clipped = true
                    break
                  }
                  p = p.parentElement
                }
                if (!clipped)
                  off.push(
                    `${el.tagName}.${String(el.className).slice(0, 40)}[${Math.round(r.left)},${Math.round(r.right)}]`,
                  )
              }
            }
          }
          return { iw, sw, off: off.slice(0, 6) }
        })
        overflow.push(
          `${ov.sw > ov.iw ? 'OVERFLOW' : 'ok'} ${name}-${lang}-${w} sw=${ov.sw} ${ov.off.join(' ')}`,
        )
        if (shoot)
          await page.screenshot({
            path: `${OUT}/p/${name}-${lang}-${w}.png`,
            fullPage: true,
            timeout: 120000,
          })
      } catch (e) {
        log.push(`sweep ${name} ${lang} ${w}: SCRIPT ERROR ${e.message}`)
      }
      await page.close()
    }
  }
}
writeFileSync(`${OUT}/overflow.txt`, overflow.join('\n') + '\n')
// Signed-in pages: a customer created through the real sign-up page.
if (!ONLY.length || ONLY.includes('account')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}/ar/register`, { waitUntil: 'networkidle', timeout: 60000 })
    const stamp = String(Date.now()).slice(-6)
    await page.locator('input[autocomplete="name"]').fill('Sara CI')
    await page.locator('input[autocomplete="email"]').fill(`ci-${stamp}@example.com`)
    await page.locator('input[autocomplete="tel"]').fill(`+62812${stamp}`)
    const pw = page.locator('input[autocomplete="new-password"]')
    await pw.nth(0).fill('Bali-Trips-2026!')
    await pw.nth(1).fill('Bali-Trips-2026!')
    await page
      .locator('form:has(input[autocomplete="new-password"]) button[type="submit"]')
      .first()
      .click()
    await page.waitForTimeout(6000)
    log.push(`account: after sign-up at ${page.url()}`)
    // Something in the trip: an itinerary through the real "add to trip" link.
    const itinerary = await resolvePath('ar', { from: '/itineraries', match: '/itineraries/' })
    const itinerarySlug = itinerary?.split('/').pop()
    if (itinerarySlug) {
      await page
        .goto(`${BASE}/ar/itineraries/${itinerarySlug}`, {
          waitUntil: 'networkidle',
          timeout: 60000,
        })
        .catch(() => null)
      await page
        .locator('aside button.btn-primary')
        .first()
        .click()
        .catch((e) => log.push(`account: buy click ${e.message}`))
      await page.waitForURL(/\/my-trip/, { timeout: 20000 }).catch(() => {})
      log.push(`account: bought ${itinerarySlug}, at ${page.url()}`)
    }
    const ACCOUNT = [
      ['acct', '/ar/account'],
      ['acct-trip', '/ar/account/trip'],
      ['acct-files', '/ar/account/schedules'],
      ['acct-fav', '/ar/account/favorites'],
      ['acct-notif', '/ar/account/notifications'],
      ['my-trip-in', '/ar/my-trip'],
      ['checkout-in', '/ar/checkout'],
    ]
    for (const [name, path] of ACCOUNT) {
      for (const [w, h] of [
        [390, 844],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width: w, height: h })
        const res = await page
          .goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
          .catch(() => null)
        await page.waitForTimeout(1200)
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        overflow.push(`${ov > 0 ? 'OVERFLOW' : 'ok'} ${name}-ar-${w} +${ov}`)
        log.push(`account ${name} ${w}: HTTP ${res?.status()} ${page.url()}`)
        await page.screenshot({ path: `${OUT}/p/${name}-ar-${w}.png`, fullPage: true })
      }
    }
    writeFileSync(`${OUT}/overflow.txt`, overflow.join('\n') + '\n')
  } catch (e) {
    log.push(`account: SCRIPT ERROR ${e.message}`)
  }
  await ctx.close()
}

// Home hero: a few frames over time (video slider), phone + desktop.
for (const [w, h] of [
  [390, 844],
  [768, 1024],
  [1440, 900],
]) {
  if (ONLY.length && !ONLY.includes('home')) break
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  try {
    await page.goto(`${BASE}/ar`, { waitUntil: 'networkidle', timeout: 60000 })
    for (const t of [1, 4, 9]) {
      await page.waitForTimeout(t === 1 ? 1000 : t === 4 ? 3000 : 5000)
      await page.screenshot({ path: `${OUT}/p/hero-ar-${w}-t${t}.png` })
    }
    const st = await page.evaluate(() =>
      [...document.querySelectorAll('video')].map(
        (v) =>
          `${v.currentSrc.split('/').pop()} paused=${v.paused} t=${v.currentTime.toFixed(1)} rs=${v.readyState}`,
      ),
    )
    log.push(`hero ${w}: ${st.join(' | ')}`)
    // Viewport (not full-page) captures of the animated sections.
    for (const sel of ['.about-media', '.rmarq', '.svc']) {
      await page
        .locator(sel)
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {})
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${OUT}/p/home-view-${sel.slice(1)}-ar-${w}.png` })
    }
  } catch (e) {
    log.push(`hero ${w}: ${e.message}`)
  }
  await page.close()
}

// Hero search suggestions: type, look, then arrow-key and open the first one.
for (const [w, h] of [
  [390, 844],
  [1440, 900],
]) {
  if (ONLY.length && !ONLY.includes('home') && !ONLY.includes('suggest')) break
  for (const [lang, typed] of [
    ['ar', 'شا'],
    ['ar', 'او'],
    ['ar', 'تشانقو'],
    ['en', 'ubd'],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    try {
      await page.goto(`${BASE}/${lang}`, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(2200) // the box fades in
      const box = page.locator('.hv-search input[role="combobox"]')
      await box.click()
      await box.pressSequentially(typed, { delay: 90 })
      await page.waitForTimeout(500)
      const rows = await page.locator('.hv-sg-row').allInnerTexts()
      const tag = `${lang}-${w}-${encodeURIComponent(typed).replace(/%/g, '')}`.slice(0, 60)
      await page.screenshot({ path: `${OUT}/p/suggest-${tag}.png` })
      log.push(`suggest ${lang} ${w} "${typed}": ${rows.map((r) => r.replace(/\s+/g, ' ')).join(' | ')}`)
      await box.press('ArrowDown')
      await box.press('Enter')
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      log.push(`suggest ${lang} ${w} "${typed}" → ${page.url()}`)
    } catch (e) {
      log.push(`suggest ${lang} ${w} "${typed}": ${e.message}`)
    }
    await page.close()
  }
}

// Phone flow on the real map: region bubble → pin → card → details → list.
for (const lang of ['ar', 'en']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  const shot = (tag) =>
    page.screenshot({ path: `${OUT}/phone-${lang}-${tag}.png`, timeout: 120000 })
  page.on('pageerror', (e) => log.push(`phone ${lang}: pageerror ${e.message}`))
  try {
    await page.goto(`${BASE}/${lang}/map`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('.mp-view.is-map', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(6000)
    await shot('1-map')
    const bubble = page.locator('.mp-rb').filter({ hasText: lang === 'ar' ? 'أوبود' : 'Ubud' })
    if (await bubble.count()) {
      await bubble.first().tap()
      await page.waitForTimeout(5000)
      await shot('2-region')
    } else log.push(`phone ${lang}: no Ubud bubble`)
    const pin = page.locator('.mp-pin:not(.is-locked) .mp-dot')
    const n = await pin.count()
    let tapped = false
    for (let i = 0; i < n && !tapped; i += 1) {
      const box = await pin.nth(i).boundingBox()
      if (box && box.y > 160 && box.y < 600 && box.x > 20 && box.x < 330) {
        await pin.nth(i).tap()
        tapped = true
      }
    }
    log.push(`phone ${lang}: pins ${n}, tapped ${tapped}`)
    await page.waitForTimeout(2500)
    await shot('3-card')
    const details = page.locator('.mp-mcard a', { hasText: lang === 'ar' ? 'التفاصيل' : 'Details' })
    if (await details.count()) {
      await Promise.all([page.waitForURL(/\/places\//, { timeout: 30000 }), details.first().tap()])
      await page.waitForTimeout(3000)
      await page
        .locator('.pl-mini')
        .scrollIntoViewIfNeeded()
        .catch(() => {})
      await page.waitForTimeout(7000)
      await page.screenshot({
        path: `${OUT}/phone-${lang}-4-details.png`,
        fullPage: true,
        timeout: 120000,
      })
      log.push(
        `phone ${lang}: details ${page.url()} mini=${await page.locator('.pl-mini').getAttribute('class')}`,
      )
      await page.goBack({ waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(6000)
    } else log.push(`phone ${lang}: no card / Details button`)
    await page.locator('.mp-mtoggle button').nth(1).tap()
    await page.waitForTimeout(1500)
    await shot('5-list')
    log.push(
      `phone ${lang}: list rows ${await page.locator('.mp-side.is-list .mp-res').count()} overflow ${await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)}`,
    )
  } catch (e) {
    log.push(`phone ${lang}: SCRIPT ERROR ${e.message}`)
  }
  await ctx.close()
}

// Control: a bare MapLibre page with OpenFreeMap's own style (is WebGL rendering at all?)
{
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
  page.on('console', (m) => log.push(`gltest: ${m.type()} ${m.text().slice(0, 300)}`))
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css">
    <script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>
    <style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div><script>
    const map = new maplibregl.Map({ container: 'm', style: 'https://tiles.openfreemap.org/styles/liberty', center: [115.19, -8.41], zoom: 9 });
    map.on('error', (e) => console.error('maperror', e.error && e.error.message));
    map.on('idle', () => console.log('idle'));
    </script></body></html>`)
  await page.waitForTimeout(12000)
  await page.screenshot({ path: `${OUT}/gltest.png` })
  await page.close()
}
await browser.close()
writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
