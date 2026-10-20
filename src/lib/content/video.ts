/**
 * Activity video links (YouTube / Vimeo), validated and turned into a
 * privacy-friendly embed URL. Nothing is fetched from either service until
 * the visitor presses play: the page shows our own photo as the poster, then
 * swaps in the player (youtube-nocookie / Vimeo with `dnt=1`).
 *
 * Pure (server, client, Studio validation, tests).
 */

export interface ParsedVideo {
  provider: 'youtube' | 'vimeo'
  id: string
  /** Embed URL that autoplays once inserted (it is inserted on click). */
  embedUrl: string
  /** The canonical watch URL, stored as typed by the owner after cleaning. */
  watchUrl: string
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{6,12}$/

export function parseVideoUrl(raw: string | null | undefined): ParsedVideo | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value === '') return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const parts = url.pathname.split('/').filter(Boolean)

  let youtube: string | null = null
  if (host === 'youtu.be') youtube = parts[0] ?? null
  else if (
    host === 'youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'music.youtube.com'
  ) {
    if (parts[0] === 'watch') youtube = url.searchParams.get('v')
    else if (
      parts[0] === 'embed' ||
      parts[0] === 'shorts' ||
      parts[0] === 'live' ||
      parts[0] === 'v'
    )
      youtube = parts[1] ?? null
  }
  if (youtube !== null) {
    if (!YOUTUBE_ID.test(youtube)) return null
    return {
      provider: 'youtube',
      id: youtube,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${youtube}`,
    }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = [...parts].reverse().find((part) => VIMEO_ID.test(part)) ?? null
    if (id === null) return null
    return {
      provider: 'vimeo',
      id,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`,
      watchUrl: `https://vimeo.com/${id}`,
    }
  }
  return null
}
