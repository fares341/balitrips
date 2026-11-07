import { unstable_cache } from 'next/cache'

import { readSetting } from '@/app/(admin)/_lib/settings'

import { EMPTY_HOME_CONTENT, type HomeContent } from './home-content'

/** Dropped by Studio → «الصفحة الرئيسية» on save. */
export const HOME_CONTENT_TAG = 'home-content'

async function load(): Promise<HomeContent> {
  try {
    const value = await readSetting('homeContent')
    return { texts: value.texts, images: value.images, hidden: value.hidden }
  } catch (error) {
    // No database (build step, outage): the bundled texts and photos are shown.
    console.warn(`[home-content] using built-in content: ${String(error)}`)
    return EMPTY_HOME_CONTENT
  }
}

export const readHomeContent = unstable_cache(load, ['home-content-v1'], {
  tags: [HOME_CONTENT_TAG],
  revalidate: 300,
})
