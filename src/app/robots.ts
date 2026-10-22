/** /robots.txt — public site open to crawlers; private areas kept out. */
import type { MetadataRoute } from 'next'

import { SHARE_ORIGIN } from '@/lib/seo/site-origin'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/account', '/*/checkout', '/*/cart', '/*/my-trip', '/*/trip/'],
    },
    sitemap: `${SHARE_ORIGIN}/sitemap.xml`,
    host: SHARE_ORIGIN,
  }
}
