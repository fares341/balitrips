import { describe, expect, it } from 'vitest'

import { LANDMARKS, localizeLandmarks, visibleLandmarks } from './landmarks'

/**
 * Some of the client's landmarks share a name and a spot with paywalled site
 * places. The page sends landmarks to every visitor, so for a viewer without
 * access those must be dropped — otherwise the landmark layer names and
 * pinpoints the gated place the payload so carefully redacts.
 */
describe('visibleLandmarks', () => {
  const gated: { name: Record<string, string>; lat: number; lon: number }[] = [
    { name: { en: 'Uluwatu Temple', ar: 'معبد أولواتو' }, lat: -8.829, lon: 115.085 },
    { name: { en: 'Nusa Penida' }, lat: -8.727, lon: 115.544 },
  ]

  it('keeps everything when nothing is locked', () => {
    expect(visibleLandmarks(LANDMARKS, []).length).toBe(LANDMARKS.length)
  })

  it('drops landmarks that name or sit next to a locked place', () => {
    const ids = visibleLandmarks(LANDMARKS, gated).map((l) => l.id)
    expect(ids).not.toContain('uluwatu')
    expect(ids).not.toContain('penida')
    expect(ids).toContain('ubud')
    expect(ids).toContain('agung')
  })

  it('matches names in any language, ignoring case', () => {
    const ids = visibleLandmarks(LANDMARKS, [
      { name: { ar: 'جبل أغونغ' }, lat: 0, lon: 0 },
      { name: { en: 'lake batur' }, lat: 0, lon: 0 },
    ]).map((l) => l.id)
    expect(ids).not.toContain('agung')
    expect(ids).not.toContain('lake-batur')
    expect(ids).toContain('batur')
  })

  it('sends one language plus the Latin name', () => {
    const [first] = localizeLandmarks(LANDMARKS.slice(0, 1), 'ar')
    expect(first?.name).toBe('جزيرة مينجانغان')
    expect(first?.latin).toBe('Menjangan Island')
    expect(JSON.stringify(first)).not.toContain('Pulau Menjangan')
  })
})
