/**
 * Home hero media — the ONLY place the hero videos and their posters are named.
 *
 * ⚠ VIDEO RIGHTS: these three clips come from the design package v3.4, whose
 * README says they were taken from Pinterest. They must be licensed, or
 * replaced with licensed footage (e.g. Pexels) or the client's own filming,
 * BEFORE LAUNCH. To swap them, drop the new files into public/brand/hero/ and
 * change the paths below — nothing else references them.
 *
 * Each clip: 8 s, 720×1280 (portrait), silent, WebM first then MP4; the JPG is
 * the poster (shown first, and the only thing shown with reduced motion).
 * `name`/`short` are message keys (the place changes with each clip).
 */

export type HeroClip = {
  /** Stable key. */
  id: string
  webm: string
  mp4: string
  poster: string
  /** Message key: the long label in the place pill, e.g. "Nusa Penida · Kelingking". */
  label: string
  /** Message key: the short name on the progress tab and the desktop caption. */
  short: string
}

export const HERO_CLIPS: readonly HeroClip[] = [
  {
    id: 'penida',
    webm: '/brand/hero/hero-penida.webm',
    mp4: '/brand/hero/hero-penida.mp4',
    poster: '/brand/hero/hero-penida.jpg',
    label: 'hv4_pl_penida',
    short: 'hv4_pl_penida_s',
  },
  {
    id: 'rice',
    webm: '/brand/hero/hero-rice.webm',
    mp4: '/brand/hero/hero-rice.mp4',
    poster: '/brand/hero/hero-rice.jpg',
    label: 'hv4_pl_rice',
    short: 'hv4_pl_rice_s',
  },
  {
    id: 'uluwatu',
    webm: '/brand/hero/hero-uluwatu.webm',
    mp4: '/brand/hero/hero-uluwatu.mp4',
    poster: '/brand/hero/hero-uluwatu.jpg',
    label: 'hv4_pl_uluwatu',
    short: 'hv4_pl_uluwatu_s',
  },
]

/** Milliseconds each clip stays active before the next one (package: 7 s). */
export const HERO_STEP_MS = 7000
