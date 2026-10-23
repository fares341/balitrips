// Places audit of the LIVE map: every place in the /ar/map payload, its page and
// its images. Writes live/places.json + live/places.csv. Imported by live-check.
const scanObjects = (text, key) => {
  // every JSON object that has `"<key>":` directly inside it
  const out = []
  const needle = `"${key}":`
  let at = text.indexOf(needle)
  while (at !== -1) {
    let depth = 0
    let start = -1
    for (let i = at; i >= 0; i--) {
      const c = text[i]
      if (c === '}') depth++
      else if (c === '{') {
        if (depth === 0) {
          start = i
          break
        }
        depth--
      }
    }
    if (start !== -1) {
      let d = 0
      let inStr = false
      for (let j = start; j < text.length; j++) {
        const c = text[j]
        if (inStr) {
          if (c === '\\') j++
          else if (c === '"') inStr = false
        } else if (c === '"') inStr = true
        else if (c === '{') d++
        else if (c === '}' && --d === 0) {
          try {
            out.push(JSON.parse(text.slice(start, j + 1)))
          } catch {}
          at = j
          break
        }
      }
    }
    at = text.indexOf(needle, at + 1)
  }
  return out
}

export async function auditPlaces(browser, BASE, OUT, writeFileSync) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const apis = []
  page.on('response', async (r) => {
    if (r.url().includes('/api/')) apis.push(`${r.status()} ${r.url().slice(0, 200)}`)
  })
  const res = await page.goto(BASE + '/ar/map', { waitUntil: 'networkidle', timeout: 90000 })
  // the RSC payload, from the raw HTML (self.__next_f.push([1,"…"]) chunks)
  const html = await (await page.context().request.get(BASE + '/ar/map')).text()
  let flight = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      flight += JSON.parse(m[1])
    } catch {}
  }
  const brokenImgsOnMap = await page.evaluate(() =>
    [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.currentSrc || i.src),
  )
  const seen = new Map()
  for (const o of scanObjects(flight, 'slug')) {
    if (typeof o.slug !== 'string' || !('locked' in o || 'lat' in o || 'heroImageUrl' in o))
      continue
    if (!seen.has(o.slug)) seen.set(o.slug, o)
  }
  const cats = scanObjects(flight, 'key').filter(
    (o) => 'label' in o && ('mapTier' in o || 'icon' in o),
  )
  const places = [...seen.values()]
  const req = page.context().request
  const headCache = new Map()
  const probe = async (url) => {
    if (headCache.has(url)) return headCache.get(url)
    const abs = url.startsWith('http') ? url : BASE + url
    let r
    try {
      const resp = await req.get(abs, { timeout: 30000, maxRedirects: 3 })
      const body = await resp.body()
      r = { status: resp.status(), bytes: body.length, type: resp.headers()['content-type'] ?? '' }
    } catch (e) {
      r = { status: 0, bytes: 0, type: '', error: e.message.split('\n')[0].slice(0, 120) }
    }
    r.host = (() => {
      try {
        return new URL(abs).host
      } catch {
        return '?'
      }
    })()
    headCache.set(url, r)
    return r
  }
  const baseHost = new URL(BASE).host
  const rows = []
  const queue = [...places]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const p = queue.shift()
        const issues = []
        if (p.locked) issues.push('locked')
        if (!p.locked && (typeof p.lat !== 'number' || typeof p.lon !== 'number'))
          issues.push('no-coords')
        if (!p.locked && !p.categoryKey) issues.push('no-category')
        if (p.locked && (p.lat != null || p.heroImageUrl)) issues.push('LOCKED-LEAK')
        const pagePath = `/ar/places/${encodeURIComponent(p.slug)}`
        const pg = await probe(pagePath)
        if (pg.status !== 200) issues.push(`page-${pg.status}`)
        const imgs = [p.heroImageUrl, ...(p.gallery ?? [])].filter(Boolean)
        if (!p.locked && !p.heroImageUrl) issues.push('no-hero')
        const imgResults = []
        for (const u of imgs) {
          const r = await probe(u)
          imgResults.push({ url: u, ...r })
          if (r.status !== 200) issues.push(`img-${r.status}`)
          else if (r.bytes === 0) issues.push('img-0b')
          else if (!r.type.startsWith('image/')) issues.push('img-type')
          if (/localhost|127\.0\.0\.1/.test(u)) issues.push('img-localhost')
          else if (r.host !== baseHost && !u.startsWith('/')) issues.push(`img-host:${r.host}`)
        }
        rows.push({
          slug: p.slug,
          name: p.name?.ar ?? p.name?.en ?? '',
          locked: !!p.locked,
          categoryKey: p.categoryKey ?? null,
          regionKey: p.regionKey ?? null,
          lat: p.lat ?? null,
          lon: p.lon ?? null,
          pageStatus: pg.status,
          hero: p.heroImageUrl ?? null,
          images: imgResults,
          issues: [...new Set(issues)],
        })
      }
    }),
  )
  await page.close()
  rows.sort((a, b) => a.slug.localeCompare(b.slug))
  const count = (k) => rows.filter((r) => r.issues.some((i) => i.startsWith(k))).length
  const summary = {
    mapStatus: res?.status(),
    flightBytes: flight.length,
    places: rows.length,
    open: rows.filter((r) => !r.locked).length,
    locked: rows.filter((r) => r.locked).length,
    categoriesInPayload: cats.map((c) => c.key),
    noHero: count('no-hero'),
    brokenImage: rows.filter((r) =>
      r.issues.some((i) => /^img-(\d|0b|type)/.test(i) && i !== 'img-200'),
    ).length,
    pageNot200: count('page-'),
    noCoords: count('no-coords'),
    noCategory: count('no-category'),
    lockedLeak: count('LOCKED-LEAK'),
    brokenImgsOnMap,
    apis,
    imageHosts: [...new Set([...headCache.values()].map((r) => r.host))],
    imageStatuses: Object.fromEntries(
      [...headCache.entries()]
        .filter(([u]) => !u.startsWith('/ar/places'))
        .reduce((m, [, r]) => {
          const k = `${r.status}${r.error ? ' ' + r.error : ''}`
          m.set(k, (m.get(k) ?? 0) + 1)
          return m
        }, new Map()),
    ),
  }
  writeFileSync(`${OUT}/places.json`, JSON.stringify({ summary, rows }, null, 1))
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  writeFileSync(
    `${OUT}/places.csv`,
    ['slug,name,locked,category,region,lat,lon,page,hero,issues']
      .concat(
        rows.map((r) =>
          [
            r.slug,
            r.name,
            r.locked,
            r.categoryKey,
            r.regionKey,
            r.lat,
            r.lon,
            r.pageStatus,
            r.hero,
            r.issues.join(' '),
          ]
            .map(esc)
            .join(','),
        ),
      )
      .join('\n') + '\n',
  )
  return `PLACES ${JSON.stringify(summary)}`
}
