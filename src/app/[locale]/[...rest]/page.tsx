import { notFound } from 'next/navigation'

/**
 * Any path under a locale that matches no page: the locale-aware 404
 * (`../not-found.tsx`), with the site's header and footer, instead of the
 * bare global one.
 */
export default function CatchAll() {
  notFound()
}
