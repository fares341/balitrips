import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output keeps the production image small — it ships only the
  // traced dependencies rather than all of node_modules.
  output: 'standalone',

  // Contract summaries read PDF text on the server with pdfjs (legacy build);
  // kept as a plain Node package rather than bundled into the server code.
  serverExternalPackages: ['pdfjs-dist'],

  experimental: {
    serverActions: {
      /**
       * Next's default is 1 MB, which silently broke the media library (its
       * own limit is MEDIA_MAX_UPLOAD_BYTES, 12 MB) and would refuse almost
       * any custom-trip PDF. 25 MB covers both with headroom; the actions
       * enforce their own, smaller, per-kind limits.
       */
      bodySizeLimit: '25mb',
    },
  },

  // Images are pre-generated into Spaces and served through the CDN.
  // Runtime optimization is deliberately off: sharp on a 2 vCPU / 4 GiB box
  // competes with Postgres for memory, and the OOM killer takes Postgres.
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**.digitaloceanspaces.com' },
      { protocol: 'https', hostname: '**.cdn.digitaloceanspaces.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
