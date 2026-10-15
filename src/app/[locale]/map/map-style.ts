/**
 * The real (3D) map's MapLibre style — port of the client's bali-map.js
 * `buildStyle()`. Pure data, no DOM.
 *
 *  - satellite: Esri World Imagery (default) or Sentinel-2 cloudless (EOX)
 *  - terrain + hillshade: AWS Terrain Tiles (terrarium encoding)
 *  - roads, water, 3D buildings and OSM labels: OpenFreeMap vector tiles
 *  - sky / fog
 *
 * Labels from OpenStreetMap use `name:latin` (Latin script), so no RTL text
 * plugin is needed. Site places and the client's landmarks are NOT style
 * layers: they are HTML markers drawn by the page in the site font, which
 * shapes Arabic correctly.
 *
 * Every host here is a runtime fetch from the visitor's browser; none needs an
 * API key. Keep `ATTRIBUTION` in step with the sources.
 */

export const IMAGERY_PROVIDERS = ['esri', 'sentinel2'] as const
export type ImageryProvider = (typeof IMAGERY_PROVIDERS)[number]

/** Studio → Map settings (site_settings key `map`). */
export interface MapSettings {
  imagery: ImageryProvider
  /** Terrain relief on the real map; 1 = true scale. */
  exaggeration: number
  /** Camera tilt (degrees) after entering the real map. */
  tiltOnEnter: number
}

export const MAP_SETTING_DEFAULTS: MapSettings = {
  imagery: 'esri',
  exaggeration: 1.5,
  tiltOnEnter: 50,
}

export const EXAGGERATION_RANGE = { min: 1, max: 3 } as const
export const TILT_RANGE = { min: 0, max: 75 } as const

type LngLat = [number, number]

interface Imagery {
  tiles: string
  size: number
  maxzoom: number
  attribution: string
}

const IMAGERY: Record<ImageryProvider, Imagery> = {
  esri: {
    tiles:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    size: 256,
    maxzoom: 18,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  sentinel2: {
    tiles:
      'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
    size: 256,
    maxzoom: 14,
    attribution:
      'Sentinel-2 cloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)',
  },
}

const TERRAIN_ATTRIBUTION = 'Elevation: AWS Terrain Tiles (SRTM, ETOPO1 — USGS, NOAA)'
const OMT_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data © OpenStreetMap contributors'

/** What the attribution line must say for these settings (shown on the real map). */
export function attributionsFor(settings: MapSettings): string[] {
  return [IMAGERY[settings.imagery].attribution, OMT_ATTRIBUTION, TERRAIN_ATTRIBUTION]
}

/** The opening camera box (the main island). */
export const REAL_BOUNDS: [LngLat, LngLat] = [
  [114.4, -8.88],
  [115.72, -8.05],
]
/** Panning stops here. */
export const REAL_MAX_BOUNDS: [LngLat, LngLat] = [
  [113.6, -9.6],
  [116.6, -7.3],
]
export const REAL_MIN_ZOOM = 6
export const REAL_MAX_ZOOM = 19
export const REAL_MAX_PITCH = 80

const FONT = ['Noto Sans Regular']
const FONT_ITALIC = ['Noto Sans Italic']
const NAME = ['coalesce', ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']]
const HALO = 'rgba(8,20,26,0.88)'

type Layer = Record<string, unknown>

function roadLayer(
  id: string,
  classes: string[],
  minzoom: number,
  color: string,
  w0: number,
  w1: number,
): Layer {
  return {
    id,
    type: 'line',
    source: 'omt',
    'source-layer': 'transportation',
    minzoom,
    filter: [
      'all',
      ['in', ['get', 'class'], ['literal', classes]],
      ['!=', ['get', 'brunnel'], 'tunnel'],
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], minzoom, w0, 18, w1],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], minzoom, 0, minzoom + 0.6, 1],
    },
  }
}

export interface StyleOptions {
  /** OpenStreetMap road / water / peak / place labels. */
  labels?: boolean
  /**
   * The free area's outline (closed lon/lat ring). When given, everything
   * outside it is dimmed and the outline is drawn — for viewers without
   * full-map access.
   */
  freeZone?: LngLat[] | null
}

/** A rectangle well beyond the max bounds, with the free zone cut out of it. */
export function outsideMask(ring: readonly LngLat[]): LngLat[][] {
  const outer: LngLat[] = [
    [110, -12],
    [120, -12],
    [120, -5],
    [110, -5],
    [110, -12],
  ]
  return [outer, [...ring].reverse()]
}

export function buildStyle(settings: MapSettings, options: StyleOptions = {}): Layer {
  const img = IMAGERY[settings.imagery] ?? IMAGERY.esri
  const labels = options.labels ?? true
  const dem = {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
    attribution: TERRAIN_ATTRIBUTION,
  }
  const layers: Layer[] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b2a3d' } },
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: {
        'raster-fade-duration': 250,
        'raster-saturation': 0.32,
        'raster-contrast': 0.14,
        'raster-brightness-min': 0.03,
      },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshade',
      paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'map',
        'hillshade-exaggeration': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          0.42,
          12,
          0.28,
          15,
          0.12,
        ],
        'hillshade-shadow-color': 'rgba(12,28,52,0.62)',
        'hillshade-highlight-color': 'rgba(255,214,160,0.22)',
        'hillshade-accent-color': 'rgba(20,30,40,0.25)',
      },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['river', 'stream', 'canal']]],
      paint: {
        'line-color': 'rgba(120,210,230,0.55)',
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 0.6, 18, 3],
      },
    },
    roadLayer('road-minor', ['minor', 'service', 'track'], 13.5, 'rgba(255,248,235,0.55)', 0.4, 5),
    roadLayer('road-path', ['path'], 15, 'rgba(255,248,235,0.45)', 0.6, 1.6),
    roadLayer('road-tertiary', ['tertiary'], 11.5, 'rgba(255,244,222,0.7)', 0.5, 7),
    roadLayer('road-secondary', ['secondary'], 10, 'rgba(255,236,200,0.75)', 0.5, 9),
    roadLayer(
      'road-primary',
      ['primary', 'trunk', 'motorway'],
      8.5,
      'rgba(255,214,150,0.85)',
      0.6,
      12,
    ),
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#e9dccb',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 4],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, 0.82],
      },
    },
  ]
  if (labels) {
    layers.push(
      {
        id: 'osm-road-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 13],
        },
        paint: { 'text-color': '#fff7e8', 'text-halo-color': HALO, 'text-halo-width': 1.4 },
      },
      {
        id: 'osm-water-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        minzoom: 11,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': 12 },
        paint: { 'text-color': '#bff1f8', 'text-halo-color': HALO, 'text-halo-width': 1.3 },
      },
      {
        id: 'osm-poi',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'poi',
        minzoom: 15,
        filter: ['<=', ['coalesce', ['get', 'rank'], 99], 25],
        layout: {
          'text-field': NAME,
          'text-font': FONT,
          'text-size': 11,
          'text-max-width': 9,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.4,
        },
        paint: { 'text-color': '#ffe9c7', 'text-halo-color': HALO, 'text-halo-width': 1.3 },
      },
      {
        id: 'osm-peaks',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'mountain_peak',
        minzoom: 10.5,
        layout: {
          'text-field': [
            'case',
            ['has', 'ele'],
            [
              'format',
              NAME,
              {},
              '\n',
              {},
              ['concat', ['to-string', ['get', 'ele']], ' m'],
              { 'font-scale': 0.82 },
            ],
            NAME,
          ],
          'text-font': FONT,
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.5],
        },
        paint: { 'text-color': '#ffd6c2', 'text-halo-color': HALO, 'text-halo-width': 1.3 },
      },
      {
        id: 'osm-places',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 10.5,
        filter: [
          'in',
          ['get', 'class'],
          [
            'literal',
            [
              'city',
              'town',
              'village',
              'suburb',
              'hamlet',
              'neighbourhood',
              'quarter',
              'island',
              'islet',
            ],
          ],
        ],
        layout: {
          'text-field': NAME,
          'text-font': FONT,
          'text-max-width': 8,
          'text-size': [
            'match',
            ['get', 'class'],
            ['city', 'town'],
            13,
            ['village', 'island'],
            12,
            11,
          ],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': HALO, 'text-halo-width': 1.4 },
      },
    )
  }

  const sources: Record<string, unknown> = {
    satellite: {
      type: 'raster',
      tiles: [img.tiles],
      tileSize: img.size,
      maxzoom: img.maxzoom,
      attribution: img.attribution,
    },
    terrain: dem,
    hillshade: { ...dem },
    omt: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: OMT_ATTRIBUTION,
    },
  }

  const zone = options.freeZone
  if (zone && zone.length > 3) {
    sources['free-zone'] = {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [zone] } },
    }
    sources['outside-free'] = {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: outsideMask(zone) },
      },
    }
    layers.push(
      {
        id: 'outside-free',
        type: 'fill',
        source: 'outside-free',
        paint: { 'fill-color': '#06202c', 'fill-opacity': 0.58 },
      },
      {
        id: 'free-zone-line',
        type: 'line',
        source: 'free-zone',
        paint: { 'line-color': '#71FF85', 'line-width': 2.5, 'line-dasharray': [3, 2.8] },
      },
    )
  }

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources,
    terrain: { source: 'terrain', exaggeration: settings.exaggeration },
    sky: {
      'sky-color': '#2f74c2',
      'horizon-color': '#f3d9b1',
      'fog-color': '#cfe0ea',
      'sky-horizon-blend': 0.55,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.82,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0.4, 14, 0],
    },
    layers,
  }
}
