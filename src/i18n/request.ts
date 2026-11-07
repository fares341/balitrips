import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'

import { BALI_TIME_ZONE } from '@/lib/booking-rules'
import { applyTextOverrides } from '@/lib/content/home-content'
import { readHomeContent } from '@/lib/content/home-content-server'
import { applyMessageOverrides } from '@/lib/content/message-overrides'
import { readMessageOverrides } from '@/lib/content/message-overrides-server'

import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    // Studio overrides laid over the bundled strings: first the legacy home
    // page layer (homeContent setting), then every text edited in Studio
    // (message_overrides — «الترجمات» and «محتوى الموقع»). Blank overrides
    // keep the bundled text, so nothing changes until edited.
    messages: applyMessageOverrides(
      applyTextOverrides(
        (await import(`../../messages/${locale}.json`)).default,
        await readHomeContent(),
        locale,
      ),
      await readMessageOverrides(),
      locale,
    ),

    /**
     * Pin the formatting timezone.
     *
     * Left unset, next-intl falls back to the host's zone — which was
     * Africa/Cairo on the dev machine and would be Asia/Singapore on the
     * droplet. That makes the same page render differently depending on
     * where it was built, which is both a correctness bug and a cache
     * problem once pages are prerendered and served from the edge.
     *
     * Bali is the right anchor: every date this product displays is a
     * travel date on the island, not an instant in the reader's life.
     */
    timeZone: BALI_TIME_ZONE,
  }
})
