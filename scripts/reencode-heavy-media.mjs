#!/usr/bin/env node
/**
 * Re-encode stored WebP rungs that are over the byte budget (site audit,
 * Nov 2026: ten delivered images were 400–790 kB, all portrait photos whose
 * 1280px rung is 1700–1900px tall).
 *
 * Local media only (`public/media/<id>/<width>.webp`, the `media_data` volume
 * in production). For every rung over the budget it encodes the same width
 * again from `original.*` in that folder at a lower quality (the same steps
 * as src/lib/media/budget.ts) and replaces the file. Dimensions, names and
 * database rows are untouched. Idempotent: a rung that fits is skipped.
 *
 *   node scripts/reencode-heavy-media.mjs            # report only
 *   node scripts/reencode-heavy-media.mjs --apply    # rewrite the files
 *   node scripts/reencode-heavy-media.mjs --dir /path/to/media --max-kb 350
 */

import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? null : (args[at + 1] ?? null)
}
const APPLY = args.includes('--apply')
const ROOT = resolve(flag('--dir') ?? join(process.cwd(), 'public', 'media'))
const MAX_BYTES = Number(flag('--max-kb') ?? 350) * 1000
// Keep in step with WEBP_QUALITIES in src/lib/media/budget.ts (the first, 78,
// is what the rung was written with).
const QUALITIES = [68, 58, 50]

const sharp = createRequire(import.meta.url)('sharp')
const kb = (bytes) => `${Math.round(bytes / 1000)} kB`

let scanned = 0
let heavy = 0
let rewritten = 0
let saved = 0

const folders = await readdir(ROOT, { withFileTypes: true }).catch(() => {
  console.error(`No media folder at ${ROOT}`)
  process.exit(1)
})

for (const folder of folders) {
  if (!folder.isDirectory()) continue
  const dir = join(ROOT, folder.name)
  const files = await readdir(dir)
  const original = files.find((name) => /^original\.(jpe?g|png|webp|avif)$/i.test(name))
  for (const name of files) {
    const match = /^(\d+)\.webp$/.exec(name)
    if (!match) continue
    scanned += 1
    const path = join(dir, name)
    const before = (await stat(path)).size
    if (before <= MAX_BYTES) continue
    heavy += 1
    if (!original) {
      console.log(`skip  ${folder.name}/${name}  ${kb(before)}  (no original.* beside it)`)
      continue
    }
    const width = Number(match[1])
    const source = await readFile(join(dir, original))
    let best = null
    for (const quality of QUALITIES) {
      const out = await sharp(source)
        .rotate()
        .resize({ width, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality, effort: 4 })
        .toBuffer()
      if (best === null || out.byteLength < best.byteLength) best = out
      if (out.byteLength <= MAX_BYTES) break
    }
    if (best === null || best.byteLength >= before) {
      console.log(`keep  ${folder.name}/${name}  ${kb(before)}  (no smaller encode)`)
      continue
    }
    console.log(
      `${APPLY ? 'write' : 'would'} ${folder.name}/${name}  ${kb(before)} -> ${kb(best.byteLength)}`,
    )
    saved += before - best.byteLength
    if (APPLY) {
      // Written beside the file and renamed, so a reader never sees half a file.
      const tmp = `${path}.tmp-${process.pid}`
      await writeFile(tmp, best)
      await rename(tmp, path)
      rewritten += 1
    }
  }
}

console.log(
  `\n${scanned} WebP rungs scanned, ${heavy} over ${kb(MAX_BYTES)}, ` +
    `${APPLY ? `${rewritten} rewritten` : 'nothing written (add --apply)'}, ${kb(saved)} saved${APPLY ? '' : ' if applied'}.`,
)
