/**
 * READ-ONLY coverage estimate for free place photos.
 *
 * GETs public places from the live map API (or a JSON file), then asks
 * Wikimedia Commons, Wikidata and Openverse (and Unsplash when
 * UNSPLASH_ACCESS_KEY is set) for candidates. Writes nothing anywhere.
 *
 *   pnpm tsx scripts/free-photos-dry-run.ts [--limit=20] [--api=https://balitrips.co/api/map/places]
 */

import { collectCandidates } from '@/lib/free-photos/collect'
import { PoliteClient, USER_AGENT } from '@/lib/free-photos/http'

interface ApiPlace {
  slug: string
  name: string
  categoryKey: string | null
  lat: number
  lon: number
  locked?: boolean
}

const arg = (k: string) =>
  process.argv
    .find((a) => a.startsWith(`--${k}=`))
    ?.split('=')
    .slice(1)
    .join('=')

async function main() {
  const limit = Number(arg('limit') ?? 20)
  const api = arg('api') ?? 'https://balitrips.co/api/map/places'
  const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } })
  const body = (await res.json()) as { places: ApiPlace[] }
  const open = body.places.filter((p) => !p.locked && typeof p.lat === 'number')
  // Spread across categories.
  const byCat = new Map<string, ApiPlace[]>()
  for (const p of open)
    byCat.set(p.categoryKey ?? '-', [...(byCat.get(p.categoryKey ?? '-') ?? []), p])
  const pick: ApiPlace[] = []
  while (pick.length < Math.min(limit, open.length)) {
    for (const list of byCat.values())
      if (list.length && pick.length < limit) pick.push(list.shift()!)
  }

  const http = new PoliteClient()
  const tally = { high: 0, good: 0, fair: 0, none: 0 }
  for (const p of pick) {
    const c = await collectCandidates(
      { name: p.name, names: [p.name], lat: p.lat, lon: p.lon, categoryKey: p.categoryKey },
      { http, unsplashKey: process.env.UNSPLASH_ACCESS_KEY ?? null },
    )
    const best = c[0]
    const tier = best?.tier ?? 'none'
    tally[tier as keyof typeof tally] += 1
    console.log(
      `${tier.padEnd(5)} ${p.categoryKey?.padEnd(9)} ${p.name}` +
        (best
          ? `\n      -> [${best.source}/${best.via}] ${best.title} | ${best.license.label} | ${best.author ?? '?'} | ${best.distanceM ?? '-'} m | name ${best.nameScore} | ${best.width}px | ${best.sourceUrl}`
          : '') +
        ` (${c.length} candidates)`,
    )
  }
  console.log(JSON.stringify({ places: pick.length, ...tally, requests: http.requests }))
}

void main()
