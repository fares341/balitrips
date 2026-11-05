/**
 * Match map places with Google (same job as Studio → Places → Google photos →
 * «Match with Google»), from the command line.
 *
 *   tsx --conditions=react-server scripts/google-match.ts [--limit N] [--recheck]
 *
 * Idempotent and resumable: only places with no Google place ID and status
 * `none` are looked at (with --recheck also those already checked without a
 * match), and each result is saved as it is found. Needs DATABASE_URL and
 * GOOGLE_PLACES_API_KEY in the environment; the key is never printed.
 * Every call counts against GOOGLE_PLACES_DAILY_CAP like the site's own.
 */

import { runMatchJob } from '@/lib/google-places/match-job'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY is not set: nothing to do.')
    process.exit(1)
  }
  const limitRaw = arg('--limit')
  const limit = limitRaw === undefined ? undefined : Number(limitRaw)
  const result = await runMatchJob({
    limit: Number.isFinite(limit) ? limit : undefined,
    recheck: process.argv.includes('--recheck'),
    log: (line) => console.log(line),
  })
  console.log(
    `done ${result.done}/${result.total}: auto ${result.auto}, review ${result.review}, none ${result.none}, errors ${result.errors}` +
      (result.stopped ? ` — stopped: ${result.stopped}` : ''),
  )
  process.exit(result.stopped === 'error' ? 1 : 0)
}

void main()
