/** Server half of `./public-sections` (the header imports the pure half). */

import 'server-only'

import { listArticles, listPackages } from './queries'
import { ALL_SECTIONS, type PublicSections } from './public-sections'

/** Reads the catalogue; on any error everything stays visible (never hide by accident). */
export async function loadPublicSections(): Promise<PublicSections> {
  try {
    const [packages, articles] = await Promise.all([listPackages(), listArticles({ limit: 1 })])
    return { packages: packages.length > 0, blog: articles.length > 0 }
  } catch (error) {
    console.error('[content] could not read public sections', error)
    return ALL_SECTIONS
  }
}
