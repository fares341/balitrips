import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Photo } from '@/components/ui/photo'
import { SafeImg } from '@/components/ui/safe-img'

import { imageCandidates, RETRY_PARAM } from './fallback'
import { rungsFor } from './ladder'

const ID = '7d2ccd38-ad60-52df-ae72-77d992f62c00'

describe('imageCandidates', () => {
  it('is empty for missing or blank sources', () => {
    expect(imageCandidates(null)).toEqual([])
    expect(imageCandidates(undefined)).toEqual([])
    expect(imageCandidates('  ')).toEqual([])
  })

  it('retries once, then steps down to a smaller rung and 320', () => {
    expect(imageCandidates(`/media/${ID}/1280.webp`)).toEqual([
      `/media/${ID}/1280.webp`,
      `/media/${ID}/1280.webp?${RETRY_PARAM}=1`,
      `/media/${ID}/960.webp`,
      `/media/${ID}/320.webp`,
    ])
  })

  it('handles CDN hosts, avif and non-ladder widths', () => {
    const cdn = `https://x.cdn.digitaloceanspaces.com/media/${ID}/1885.avif`
    expect(imageCandidates(cdn)).toEqual([
      cdn,
      `${cdn}?${RETRY_PARAM}=1`,
      `https://x.cdn.digitaloceanspaces.com/media/${ID}/1600.webp`,
      `https://x.cdn.digitaloceanspaces.com/media/${ID}/320.webp`,
    ])
  })

  it('a 320 thumb falls back to nothing smaller than 320', () => {
    expect(imageCandidates(`/media/${ID}/320.webp`)).toEqual([
      `/media/${ID}/320.webp`,
      `/media/${ID}/320.webp?${RETRY_PARAM}=1`,
    ])
  })

  it('every ladder fallback is a rung the pipeline writes for any accepted source', () => {
    for (const width of [320, 350, 700, 1200, 1280, 3840]) {
      for (const rung of rungsFor(width)) {
        const [, , ...ladder] = imageCandidates(`/media/${ID}/${rung}.webp`)
        for (const url of ladder) {
          const w = Number(/\/(\d+)\.webp$/.exec(url)![1])
          expect(rungsFor(width)).toContain(w)
        }
      }
    }
  })

  it('appends the retry param to an existing query and keeps the hash', () => {
    expect(imageCandidates('/media/legacy/a.jpg?v=2#x')).toEqual([
      '/media/legacy/a.jpg?v=2#x',
      `/media/legacy/a.jpg?v=2&${RETRY_PARAM}=1#x`,
    ])
  })
})

describe('rendering', () => {
  it('SafeImg renders the fallback when there is no src', () => {
    const html = renderToStaticMarkup(
      createElement(SafeImg, { src: null, fallback: createElement('span', { id: 'ph' }) }),
    )
    expect(html).toBe('<span id="ph"></span>')
  })

  it('SafeImg renders the img when there is a src', () => {
    const html = renderToStaticMarkup(createElement(SafeImg, { src: '/a.webp', alt: '' }))
    expect(html).toContain('src="/a.webp"')
  })

  it('Photo shows the branded placeholder (not a bare box) without a src', () => {
    const html = renderToStaticMarkup(createElement(Photo, { src: null, alt: '' }))
    expect(html).toContain('ph-fallback')
    expect(html).toContain('<svg')
    expect(html).not.toContain('background:var(--ivory-2)')
  })

  it('Photo uses a caller placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(Photo, { src: '', alt: '', placeholder: createElement('i', { id: 'glyph' }) }),
    )
    expect(html).toContain('<i id="glyph"></i>')
  })
})
