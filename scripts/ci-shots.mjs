// Real-browser screenshots taken in CI (where the map tiles are reachable).
// Used by .github/workflows/preview-shots.yml; output goes to ./ci-shots.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:3000'
const OUT = 'ci-shots'
mkdirSync(OUT, { recursive: true })

const pages = [
  ['home', '/ar', 0],
  ['home', '/en', 0],
  ['map', '/ar/map', 14000],
  ['map', '/en/map', 14000],
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
for (const [name, path, wait] of pages) {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        log.push(`${path} ${w}: ${m.type()} ${m.text()}`)
    })
    page.on('pageerror', (e) => log.push(`${path} ${w}: pageerror ${e.message}`))
    await page
      .goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
      .catch((e) => log.push(`${path}: ${e.message}`))
    await page.waitForTimeout(wait || 1500)
    const lang = path.split('/')[1]
    const fonts = await page.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => `${f.family} ${f.weight}`),
    )
    log.push(`${path} ${w}: fonts loaded: ${[...new Set(fonts)].join(', ')}`)
    await page.screenshot({ path: `${OUT}/${name}-${lang}-${w}.png`, fullPage: name !== 'map' })
    await page.close()
  }
}
await browser.close()
const { writeFileSync } = await import('node:fs')
writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
