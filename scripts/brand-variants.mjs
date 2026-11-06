/**
 * Responsive variants of the fixed home-page photography.
 *
 * Runtime image optimisation is off (next.config.ts: sharp must not compete
 * with Postgres on the droplet), so the sizes a phone needs are generated
 * once, here, and committed under public/brand/r/. <BrandImg> (src/components/
 * ui/brand-img.tsx) builds the AVIF/WebP srcset from the same width list.
 *
 * Re-run after replacing a source photo:  node scripts/brand-variants.mjs
 */

import { mkdirSync } from 'node:fs'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

import { BRAND_SOURCES, BRAND_WIDTHS } from '../src/components/ui/brand-img-widths.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/brand/r')
mkdirSync(outDir, { recursive: true })

for (const src of BRAND_SOURCES) {
  const file = resolve(root, 'public', src.replace(/^\//, ''))
  const name = basename(file, extname(file))
  const { width = 0 } = await sharp(file).metadata()
  for (const w of BRAND_WIDTHS) {
    const target = Math.min(w, width)
    const img = sharp(file).resize({ width: target, withoutEnlargement: true })
    await img.clone().avif({ quality: 50, effort: 6 }).toFile(`${outDir}/${name}-${w}.avif`)
    await img.clone().webp({ quality: 72, effort: 6 }).toFile(`${outDir}/${name}-${w}.webp`)
  }
  console.log('variants:', name)
}
