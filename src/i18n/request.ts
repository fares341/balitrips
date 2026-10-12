import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'

import { BALI_TIME_ZONE } from '@/lib/booking-rules'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,

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
