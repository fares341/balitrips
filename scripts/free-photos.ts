/**
 * «Find free photos» from the command line (same job as Studio → Places →
 * Free photos). Needs DATABASE_URL; Unsplash is used only when
 * UNSPLASH_ACCESS_KEY is set (never printed).
 *
 *   tsx --conditions=react-server scripts/free-photos.ts [--limit N] [--recheck] [--no-auto]
 *
 * For a read-only coverage estimate against the public API use
 * scripts/free-photos-dry-run.ts instead (writes nothing).
 */

import { runFreePhotoJob } from '@/lib/free-photos/job'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
  const limit = arg('--limit')
  const progress = await runFreePhotoJob({
    limit: limit ? Number(limit) : undefined,
    recheck: process.argv.includes('--recheck'),
    autoApply: !process.argv.includes('--no-auto'),
    log: (line) => console.log(line),
  })
  console.log(JSON.stringify(progress))
  process.exit(progress.stopped === 'error' ? 1 : 0)
}

void main()
