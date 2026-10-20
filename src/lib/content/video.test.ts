import { describe, expect, it } from 'vitest'

import { parseVideoUrl } from './video'

describe('parseVideoUrl', () => {
  it('reads the usual YouTube forms and embeds without cookies', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=10',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      const video = parseVideoUrl(url)
      expect(video?.provider).toBe('youtube')
      expect(video?.id).toBe('dQw4w9WgXcQ')
      expect(video?.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(
        true,
      )
    }
  })

  it('reads Vimeo links with do-not-track', () => {
    const video = parseVideoUrl('https://vimeo.com/76979871')
    expect(video).toMatchObject({ provider: 'vimeo', id: '76979871' })
    expect(video?.embedUrl).toContain('dnt=1')
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871')?.id).toBe('76979871')
  })

  it('refuses anything else', () => {
    for (const url of [
      '',
      'not a url',
      'javascript:alert(1)',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=short',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/channels/staffpicks',
      'ftp://youtu.be/dQw4w9WgXcQ',
    ]) {
      expect(parseVideoUrl(url)).toBeNull()
    }
    expect(parseVideoUrl(null)).toBeNull()
  })
})
