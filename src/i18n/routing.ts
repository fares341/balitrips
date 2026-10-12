import { defineRouting } from 'next-intl/routing'
import { createNavigation } from 'next-intl/navigation'

import { defaultLocale, locales } from './config'

/**
 * Locale-prefixed routing.
 *
 * Every page gets a real, shareable, crawlable URL — the prototype had none
 * (`navigate()` pushed `"#" + name`, so every activity detail page was the
 * same URL `#activity`). Recovering this is the highest-value change in the
 * port for a business that lives on organic search.
 *
 * `always` prefixes every locale: /en/activities, /ar/activities,
 * /id/activities, with `/` redirecting to `/en`.
 *
 * This was `as-needed` (English at the bare path). Under next-intl 4.13 that
 * mode broke every unprefixed route on the built server: `GET /` answered
 * 307 with `Location: /` — a self-redirect loop — while emitting
 * `x-middleware-rewrite: /en` in the same response. Prefixed locales were
 * unaffected, so /ar and /id worked perfectly and only the default locale
 * was unreachable.
 *
 * `always` costs a redirect on the bare domain and slightly longer English
 * URLs. It buys a site that works, and it makes every locale symmetrical,
 * which is one fewer special case in canonical tags and hreflang.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
