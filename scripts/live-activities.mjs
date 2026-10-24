// Activity v2 audit of the LIVE site: for every activity linked from
// /ar/activities, which v2 sections render (and how full they are).
// Writes live/activities.json. Imported by live-check.
export async function auditActivities(browser, BASE, OUT, writeFileSync) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  await page.goto(BASE + '/ar/activities', { waitUntil: 'networkidle', timeout: 90000 })
  const slugs = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll('a[href*="/activities/"]')]
        .map((a) => new URL(a.href).pathname.match(/\/activities\/([^/?#]+)$/)?.[1])
        .filter(Boolean),
    ),
  ])
  const rows = []
  for (const slug of slugs) {
    try {
      await page.goto(`${BASE}/ar/activities/${slug}`, { waitUntil: 'networkidle', timeout: 90000 })
      const r = await page.evaluate(() => {
        const n = (sel) => document.querySelectorAll(sel).length
        const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())
        const imgs = [...document.querySelectorAll('.ahero-gal img, .mgal img')].map(
          (i) => i.currentSrc || i.src,
        )
        return {
          h1: document.querySelector('h1')?.textContent?.trim() ?? '',
          packages: n('.tname'),
          addons: n('.addon, .ad-price'),
          highlights: n('.hlist li'),
          infoCards: [...document.querySelectorAll('.icard-h')].map((b) => b.textContent.trim()),
          quickFacts: n('.qfacts2 li'),
          tabs,
          faqItems: n('.itabs-panel details, details.faq, .faq details'),
          description: !!document.querySelector('.act-desc'),
          galleryImgs: imgs.length,
          galleryUnique: new Set(imgs).size,
          galleryEmpty: !!document.querySelector('.gal-empty'),
        }
      })
      rows.push({ slug, ...r })
    } catch (e) {
      rows.push({ slug, error: e.message.split('\n')[0] })
    }
  }
  await page.close()
  writeFileSync(`${OUT}/activities.json`, JSON.stringify(rows, null, 2))
  return rows.map((r) => `ACTIVITY ${JSON.stringify(r)}`).join('\n')
}
