import { describe, expect, it } from 'vitest'

import { rungSrcSet } from './fallback'

describe('rungSrcSet', () => {
  const id = '3b9be7ea-ab41-4280-ae37-1e5e5991dfae'

  it('offers the smaller WebP rungs, capped at the given one', () => {
    expect(rungSrcSet(`/media/${id}/1280.webp`)).toBe(
      [320, 480, 640, 960, 1280].map((w) => `/media/${id}/${w}.webp ${w}w`).join(', '),
    )
  })

  it('keeps an off-ladder ceiling rung as the largest candidate', () => {
    expect(rungSrcSet(`/media/${id}/736.webp`)).toBe(
      [320, 480, 640, 736].map((w) => `/media/${id}/${w}.webp ${w}w`).join(', '),
    )
  })

  it('returns null for anything that is not a plain local WebP rung', () => {
    expect(rungSrcSet(`/media/${id}/320.webp`)).toBeNull()
    expect(rungSrcSet(`/media/${id}/1280.avif`)).toBeNull()
    expect(rungSrcSet(`/media/${id}/1280.webp?img-retry=1`)).toBeNull()
    expect(rungSrcSet('/brand/hero/hero-penida.webp')).toBeNull()
    expect(rungSrcSet(null)).toBeNull()
  })
})
