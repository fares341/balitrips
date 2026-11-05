import { describe, expect, it } from 'vitest'

import {
  MAP_SETTING_DEFAULTS,
  STORED_MAP_DEFAULTS,
  attributionsFor,
  buildStyle,
  mapViewSettings,
  nameExpression,
} from './map-style'

/**
 * Licensing is enforced here: satellite imagery may only appear when Studio
 * has a provider, its key AND the licence confirmation — and the unlicensed
 * public endpoints must never come back.
 */
describe('satellite gating', () => {
  const stored = {
    ...STORED_MAP_DEFAULTS,
    esriKey: 'ESRI_KEY',
    mapboxToken: 'pk.MAPBOX',
  }

  it('is off by default', () => {
    expect(mapViewSettings(STORED_MAP_DEFAULTS).satellite).toBe('none')
  })

  it('stays off without the licence confirmation', () => {
    const view = mapViewSettings({ ...stored, satellite: 'esri' })
    expect(view.satellite).toBe('none')
    expect(view.satelliteKey).toBe('')
  })

  it('stays off without a key', () => {
    const view = mapViewSettings({
      ...stored,
      esriKey: ' ',
      satellite: 'esri',
      licenceConfirmed: true,
    })
    expect(view.satellite).toBe('none')
  })

  it('turns on with provider + key + confirmation, sending only that key', () => {
    const view = mapViewSettings({ ...stored, satellite: 'mapbox', licenceConfirmed: true })
    expect(view.satellite).toBe('mapbox')
    expect(view.satelliteKey).toBe('pk.MAPBOX')
    expect(JSON.stringify(view)).not.toContain('ESRI_KEY')
  })
})

describe('buildStyle', () => {
  it('uses no imagery source by default and only licence-clean hosts', () => {
    const json = JSON.stringify(buildStyle(MAP_SETTING_DEFAULTS))
    expect(json).not.toContain('"satellite"')
    expect(json).not.toContain('arcgisonline')
    expect(json).not.toContain('eox.at')
    expect(json).toContain('tiles.openfreemap.org')
  })

  it('puts satellite under the labels and roads, with the provider maxzoom', () => {
    const style = buildStyle({ ...MAP_SETTING_DEFAULTS, satellite: 'esri', satelliteKey: 'K' }) as {
      layers: { id: string }[]
      sources: Record<string, { maxzoom?: number; tiles?: string[] }>
    }
    const ids = style.layers.map((l) => l.id)
    expect(ids.indexOf('satellite')).toBeGreaterThan(ids.indexOf('water'))
    expect(ids.indexOf('satellite')).toBeLessThan(ids.indexOf('road-primary'))
    expect(ids.indexOf('satellite')).toBeLessThan(ids.indexOf('osm-places'))
    expect(style.sources.satellite?.maxzoom).toBe(19)
    expect(style.sources.satellite?.tiles?.[0]).toContain('ibasemaps-api.arcgis.com')
  })

  it('labels in the page language with a Latin fallback', () => {
    expect(JSON.stringify(nameExpression('ar'))).toContain('name:ar')
    expect(JSON.stringify(nameExpression('id'))).toContain('name:id')
    expect(JSON.stringify(nameExpression('en'))).toContain('name:latin')
  })
})

describe('attributionsFor', () => {
  it('credits exactly the sources in use', () => {
    const base = attributionsFor(MAP_SETTING_DEFAULTS).join(' ')
    expect(base).toContain('OpenStreetMap contributors')
    expect(base).toContain('U.S. Geological Survey')
    expect(base).not.toContain('Esri')
    const esri = attributionsFor({ ...MAP_SETTING_DEFAULTS, satellite: 'esri', satelliteKey: 'K' })
    expect(esri.join(' ')).toContain('Powered by Esri')
    const mapbox = attributionsFor({
      ...MAP_SETTING_DEFAULTS,
      satellite: 'mapbox',
      satelliteKey: 'K',
    })
    expect(mapbox.join(' ')).toContain('© Mapbox')
  })
})

describe('light style labels (map v3)', () => {
  it('bumps numbers, interpolate outputs and match outputs only', async () => {
    const { bumpSize } = await import('./map-style')
    expect(bumpSize(11, 2)).toBe(13)
    expect(bumpSize(['interpolate', ['linear'], ['zoom'], 14, 10, 18, 13], 2)).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      14,
      12,
      18,
      15,
    ])
    expect(
      bumpSize(['match', ['get', 'class'], ['city', 'town'], 13, ['village'], 12, 11], 2),
    ).toEqual(['match', ['get', 'class'], ['city', 'town'], 15, ['village'], 14, 13])
  })
  it('green base: no OSM POIs or place labels, roads from 13, curated colours', async () => {
    const { lightStyle, LIGHT } = await import('./map-style')
    const style = lightStyle(
      buildStyle(mapViewSettings(STORED_MAP_DEFAULTS), { locale: 'ar' }),
    ) as {
      layers: {
        id: string
        type: string
        minzoom?: number
        'source-layer'?: string
        layout?: Record<string, unknown>
        paint?: Record<string, unknown>
      }[]
    }
    const ids = style.layers.map((l) => l.id)
    for (const gone of [
      'osm-poi',
      'osm-places',
      'osm-waterway-names',
      'buildings-3d',
      'hillshade',
    ]) {
      expect(ids).not.toContain(gone)
    }
    for (const sl of ['poi', 'place', 'building', 'housenumber', 'aerodrome_label']) {
      expect(style.layers.some((l) => l['source-layer'] === sl)).toBe(false)
    }
    for (const id of ['road-minor', 'road-tertiary', 'road-secondary']) {
      expect(style.layers.find((l) => l.id === id)?.minzoom).toBe(13)
    }
    expect(style.layers.find((l) => l.id === 'land')?.paint?.['background-color']).toBe(LIGHT.land)
    expect(JSON.stringify(style.layers.find((l) => l.id === 'water')?.paint)).toContain(LIGHT.sea)
    expect(
      String(style.layers.find((l) => l.id === 'road-primary')?.paint?.['line-color']),
    ).toMatch(/^rgba\(255,255,255,/)
    const peaks = style.layers.find((l) => l.id === 'osm-peaks')
    expect(peaks?.minzoom).toBe(11)
    expect(peaks?.paint?.['text-halo-width']).toBe(1.8)
  })
})
