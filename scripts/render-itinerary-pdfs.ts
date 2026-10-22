/**
 * Render the PDF of every published itinerary that is missing one — what the
 * worker's scheduled sweep does, run once from the command line.
 *
 * Used by the purchase check in CI (.github/workflows/preview-shots.yml),
 * which has Gotenberg and a private storage folder but no worker, so a paid
 * itinerary has a file to download. Also handy after a restore.
 *
 *   pnpm exec tsx scripts/render-itinerary-pdfs.ts
 */

import { generateItineraryDocuments, itinerariesMissingDocuments } from '@/lib/pdf/itinerary'

async function main(): Promise<void> {
  const ids = await itinerariesMissingDocuments(200)
  let failed = 0
  for (const id of ids) {
    try {
      const done = await generateItineraryDocuments(id)
      console.log(`${id}: ${done.filter((doc) => doc.rendered).length} rendered`)
    } catch (error) {
      failed += 1
      console.error(`${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log(`${ids.length} itineraries, ${failed} failed`)
  process.exit(failed > 0 && failed === ids.length ? 1 : 0)
}

void main()
