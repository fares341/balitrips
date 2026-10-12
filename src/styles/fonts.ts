import { Outfit, Tajawal } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * Font pipeline.
 *
 * The handoff loaded Outfit + Tajawal via a render-blocking Google Fonts
 * <link> and self-hosted Noor as three unsubsetted TTFs. Both are replaced
 * here: next/font self-hosts and preloads everything, eliminating the
 * third-party connection on the critical path.
 *
 * NOTE (Phase 1): the Noor TTFs are still unsubsetted at ~44 KB each,
 * ~130 KB total on every Arabic page. Convert to subsetted WOFF2 (Arabic
 * block + Latin digits + punctuation) before launch.
 */

export const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-outfit',
  display: 'swap',
})

export const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-tajawal',
  display: 'swap',
})

export const noor = localFont({
  src: [
    { path: '../assets/fonts/noor-light.ttf', weight: '300', style: 'normal' },
    { path: '../assets/fonts/noor-regular.ttf', weight: '400 500', style: 'normal' },
    { path: '../assets/fonts/noor-bold.ttf', weight: '600 800', style: 'normal' },
  ],
  variable: '--font-noor',
  display: 'swap',
})

export const fontVariables = [outfit.variable, tajawal.variable, noor.variable].join(' ')
