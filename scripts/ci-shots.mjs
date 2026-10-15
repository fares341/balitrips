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
for (const [name, path, wait] of pages) {
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
      if (name === 'mapdbg') {
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
          ['batur', 'm.jumpTo({center:[115.375,-8.242],zoom:12,pitch:60,bearing:20})'],
          ['street', 'm.jumpTo({center:[115.2635,-8.5069],zoom:17,pitch:45,bearing:0})'],
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
