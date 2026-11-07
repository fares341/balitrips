import 'server-only'

import { unstable_cache } from 'next/cache'

import { readSetting } from '@/app/(admin)/_lib/settings'

import { EMPTY_PAGE_CONTENT, slotMediaId, type PageContent, type SitePageId } from './page-content'
import { mediaUrlsByIds } from './queries'

/** Dropped by every «محتوى الموقع» save. */
export const PAGE_CONTENT_TAG = 'page-content'

async function load(): Promise<PageContent> {
  try {
    return (await readSetting('pageContent')) as PageContent
  } catch (error) {
    // No database (build step, outage): the shipped content is shown.
    console.warn(`[page-content] using built-in content: ${String(error)}`)
    return EMPTY_PAGE_CONTENT
  }
}

export const readPageContent = unstable_cache(load, ['page-content-v1'], {
  tags: [PAGE_CONTENT_TAG],
  revalidate: 300,
})

/**
 * Everything one public page needs: whether a section shows, and the URL of
 * each image slot (the picked media, or the built-in fallback).
 */
export async function pageView(page: SitePageId) {
  const content = await readPageContent()
  const ids = Object.values(content.pages[page]?.images ?? {}).filter((id) => id !== '')
  const urls = await mediaUrlsByIds(ids).catch(() => new Map<string, string>())
  return {
    content,
    shown: (section: string) => !(content.pages[page]?.hidden ?? []).includes(section),
    image: (slot: string, fallback: string): string => {
      const id = slotMediaId(content, page, slot)
      return (id ? urls.get(id) : undefined) ?? fallback
    },
  }
}
