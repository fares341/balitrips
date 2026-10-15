/**
 * The real (3D) map's MapLibre style. Pure data, no DOM.
 *
 * LICENCE-CLEAN BY DEFAULT (verified by the coordinator, 2026-10):
 *  - base map: OpenFreeMap vector tiles (OpenMapTiles schema) — commercial
 *    use allowed, no key; attribution "© OpenMapTiles © OpenStreetMap
 *    contributors" required. Styled here in the site palette after the
 *    client's artwork: deep ocean, a turquoise glow along the coast, green
 *    forest / grass / rice land, sand beaches, subtle roads.
 *  - terrain + hillshade: AWS Terrain Tiles (terrarium) — public data;
 *    credit "SRTM and GMTED2010 data courtesy of the U.S. Geological Survey;
 *    ETOPO1 NOAA".
 *  - satellite: OFF unless Studio → Map has a provider WITH a key AND the
 *    "licence confirmed" box ticked (`mapViewSettings`). Providers: ArcGIS
 *    Location Platform (Esri World Imagery, token) or Mapbox Raster Tiles
 *    (`mapbox.satellite`, token). The free public Esri endpoint and EOX
 *    Sentinel-2 cloudless (CC BY-NC-SA) are deliberately NOT here.
 *
 * Labels: in the viewer's language where OSM has it (`name:ar`, `name:en`,
 * `name:id`), else the Latin name. Arabic shaping needs MapLibre's RTL text
 * plugin, loaded lazily for the Arabic page (`ensureRtlTextPlugin`). Site
 * places and the client's landmarks are HTML markers in the site font.
 */

export const SATELLITE_PROVIDERS = ['none', 'esri', 'mapbox'] as const
export type SatelliteProvider = (typeof SATELLITE_PROVIDERS)[number]

/**
 * Studio → Map, as stored (site_settings key `map`). Admin-only: the keys are
 * public, domain-restricted browser tokens, but only the ACTIVE one is ever
 * sent to a page (`mapViewSettings`).
 */
export interface StoredMapSettings {
  satellite: SatelliteProvider
  /** ArcGIS Location Platform API key (basemap/imagery privilege). */
  esriKey: string
  /** Mapbox public access token (pk.…). */
  mapboxToken: string
  /** "I confirm the licence/plan for commercial use" — required for satellite. */
  licenceConfirmed: boolean
  /** Terrain relief on the real map; 1 = true scale. */
  exaggeration: number
  /** Camera tilt (degrees) of the 3D view. */
  tiltOnEnter: number
}

/** What a page receives: the effective provider and only its key. */
export interface MapSettings {
  satellite: SatelliteProvider
  satelliteKey: string
  exaggeration: number
  tiltOnEnter: number
}

export const STORED_MAP_DEFAULTS: StoredMapSettings = {
  satellite: 'none',
  esriKey: '',
  mapboxToken: '',
  licenceConfirmed: false,
  exaggeration: 1.5,
  tiltOnEnter: 50,
}

export const MAP_SETTING_DEFAULTS: MapSettings = {
  satellite: 'none',
  satelliteKey: '',
  exaggeration: 1.5,
  tiltOnEnter: 50,
}

export const EXAGGERATION_RANGE = { min: 1, max: 3 } as const
export const TILT_RANGE = { min: 0, max: 75 } as const

/**
 * Satellite is on only with a provider, its key and the licence confirmed;
 * anything less falls back to the vector map. The other provider's key is
 * never sent.
 */
export function mapViewSettings(stored: StoredMapSettings): MapSettings {
  const key =
    stored.satellite === 'esri'
      ? stored.esriKey.trim()
      : stored.satellite === 'mapbox'
        ? stored.mapboxToken.trim()
        : ''
  const on = stored.satellite !== 'none' && key !== '' && stored.licenceConfirmed
  return {
    satellite: on ? stored.satellite : 'none',
    satelliteKey: on ? key : '',
    exaggeration: stored.exaggeration,
    tiltOnEnter: stored.tiltOnEnter,
  }
}

type LngLat = [number, number]

interface Imagery {
  tiles: (key: string) => string
  size: number
  /** Deepest zoom the provider serves; MapLibre overzooms past it (no requests for missing tiles). */
  maxzoom: number
  attribution: string
}

const IMAGERY: Record<Exclude<SatelliteProvider, 'none'>, Imagery> = {
  esri: {
    tiles: (key) =>
      `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(key)}`,
    size: 256,
    maxzoom: 19,
    attribution: 'Powered by Esri | Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  mapbox: {
    tiles: (key) =>
      `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${encodeURIComponent(key)}`,
    // @2x tiles are 512 px: source zoom = map zoom − 1, so 18 here is map zoom 19.
    size: 512,
    maxzoom: 18,
    attribution: '© Mapbox © OpenStreetMap',
  },
}

const OMT_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'
const TERRAIN_ATTRIBUTION =
  'Terrain: SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1 NOAA'

/** The attribution line for exactly the layers in use. */
export function attributionsFor(settings: MapSettings): string[] {
  const out: string[] = []
  if (settings.satellite !== 'none') out.push(IMAGERY[settings.satellite].attribution)
  out.push(OMT_ATTRIBUTION, TERRAIN_ATTRIBUTION)
  return out
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

/** MapLibre's RTL text plugin (Arabic shaping), pinned; loaded lazily. */
/** Water ripple texture, drawn at runtime by real-map.ts (no sprite file). */
export const WAVES_IMAGE = 'bt-waves'

export const RTL_TEXT_PLUGIN_URL =
  'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js'

/** The artwork's palette. */
const C = {
  land: '#6c9a4a',
  forest: '#2f6a37',
  grass: '#7ea955',
  farm: '#9cc365',
  wetland: '#5c9a73',
  sand: '#ecdaa6',
  town: '#cdb894',
  park: '#4e8b46',
  ocean: '#0d4a73',
  shallow: '#2fb3bd',
  surf: '#86e0d4',
  river: '#2f8fb0',
  inland: '#3aa9d8',
  shore: '#155f86',
  road: 'rgba(255,248,235,',
  building: '#e9dccb',
}

const FONT = ['Noto Sans Regular']
const FONT_ITALIC = ['Noto Sans Italic']
const HALO = 'rgba(8,20,26,0.85)'

/** Name in the viewer's language where OSM has it, else the Latin name. */
export function nameExpression(locale: string): unknown[] {
  const own = locale === 'ar' ? 'name:ar' : locale === 'id' ? 'name:id' : 'name:en'
  return ['coalesce', ['get', own], ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']]
}

type Layer = Record<string, unknown>

function roadLayer(
  id: string,
  classes: string[],
  minzoom: number,
  alpha: number,
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
      'line-color': `${C.road}${alpha})`,
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], minzoom, w0, 18, w1],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], minzoom, 0, minzoom + 0.6, 1],
    },
  }
}

function fill(id: string, layer: string, classes: string[], color: string, opacity: number): Layer {
  return {
    id,
    type: 'fill',
    source: 'omt',
    'source-layer': layer,
    filter: ['in', ['get', 'class'], ['literal', classes]],
    paint: { 'fill-color': color, 'fill-opacity': opacity, 'fill-antialias': true },
  }
}

/**
 * A glow along the INSIDE of the water polygons (positive offset = right of
 * the ring = water side in vector tiles), so the sea turns turquoise near
 * every shore, like the artwork's shallows.
 */
function coastGlow(id: string, color: string, widths: number[], opacity: number): Layer {
  const [w6 = 4, w10 = 12, w14 = 36, w18 = 90] = widths
  const width = ['interpolate', ['exponential', 1.6], ['zoom'], 6, w6, 10, w10, 14, w14, 18, w18]
  const half = [
    'interpolate',
    ['exponential', 1.6],
    ['zoom'],
    6,
    w6 / 2,
    10,
    w10 / 2,
    14,
    w14 / 2,
    18,
    w18 / 2,
  ]
  return {
    id,
    type: 'line',
    source: 'omt',
    'source-layer': 'water',
    // the sea only: no glow around ponds, pools and rivers inland
    filter: ['==', ['get', 'class'], 'ocean'],
    paint: {
      'line-color': color,
      'line-width': width,
      'line-offset': half,
      'line-blur': half,
      'line-opacity': opacity,
    },
  }
}

export interface StyleOptions {
  /** Page language, for OSM labels. */
  locale?: string
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
  const NAME = nameExpression(options.locale ?? 'en')
  const dem = {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
    attribution: TERRAIN_ATTRIBUTION,
  }
  const satellite =
    (settings.satellite === 'esri' || settings.satellite === 'mapbox') &&
    settings.satelliteKey !== ''
  const layers: Layer[] = [
    { id: 'land', type: 'background', paint: { 'background-color': C.land } },
    fill('landcover-farm', 'landcover', ['farmland'], C.farm, 0.85),
    fill('landcover-grass', 'landcover', ['grass'], C.grass, 0.8),
    fill('landcover-wood', 'landcover', ['wood'], C.forest, 0.85),
    fill('landcover-wetland', 'landcover', ['wetland'], C.wetland, 0.7),
    fill('landcover-sand', 'landcover', ['sand'], C.sand, 0.95),
    fill(
      'landuse-town',
      'landuse',
      ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail'],
      C.town,
      0.38,
    ),
    {
      id: 'park',
      type: 'fill',
      source: 'omt',
      'source-layer': 'park',
      paint: { 'fill-color': C.park, 'fill-opacity': 0.45 },
    },
    // The sea: deep blue from afar, turning clearer blue as you come closer,
    // so it still reads as water at street level.
    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'],
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          C.ocean,
          11,
          '#16658f',
          14,
          '#2386b5',
          17,
          '#2f9bc9',
        ],
        'fill-antialias': true,
      },
    },
    // Lakes, rivers, ponds, pools: a brighter water blue with a clear shoreline.
    {
      id: 'water-inland',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      filter: ['!=', ['get', 'class'], 'ocean'],
      paint: { 'fill-color': C.inland, 'fill-antialias': true },
    },
    coastGlow('coast-shallows', C.shallow, [5, 16, 48, 120], 0.75),
    coastGlow('coast-surf', C.surf, [1.5, 3, 7, 16], 0.85),
    // Ripples on all water when close, so the surface looks like water.
    {
      id: 'water-texture',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      minzoom: 11,
      paint: {
        'fill-pattern': WAVES_IMAGE,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 13, 0.35, 16, 0.6],
      },
    },
    {
      id: 'water-shore',
      type: 'line',
      source: 'omt',
      'source-layer': 'water',
      minzoom: 10,
      paint: {
        'line-color': C.shore,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 14, 1.2, 18, 2.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 0.8],
      },
    },
    {
      id: 'waterway-casing',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['river', 'stream', 'canal']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': C.shore,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 1.6, 18, 9],
        'line-opacity': 0.7,
      },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 10,
      filter: ['in', ['get', 'class'], ['literal', ['river', 'stream', 'canal']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': C.inland,
        'line-width': [
          'interpolate',
          ['exponential', 1.4],
          ['zoom'],
          10,
          ['match', ['get', 'class'], 'river', 1.2, 0.5],
          18,
          ['match', ['get', 'class'], 'river', 7, 3.5],
        ],
      },
    },
  ]
  if (satellite) {
    layers.push({
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-fade-duration': 250, 'raster-saturation': 0.15, 'raster-contrast': 0.08 },
    })
  }
  layers.push(
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshade',
      paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'map',
        'hillshade-exaggeration': satellite
          ? ['interpolate', ['linear'], ['zoom'], 8, 0.3, 12, 0.18, 15, 0.08]
          : ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 0.45, 15, 0.25],
        'hillshade-shadow-color': 'rgba(18,44,30,0.7)',
        'hillshade-highlight-color': 'rgba(255,240,205,0.35)',
        'hillshade-accent-color': 'rgba(20,40,30,0.3)',
      },
    },
    roadLayer('road-path', ['path'], 15, 0.45, 0.6, 1.6),
    roadLayer('road-minor', ['minor', 'service', 'track'], 13.5, 0.55, 0.4, 5),
    roadLayer('road-tertiary', ['tertiary'], 11.5, 0.65, 0.5, 7),
    roadLayer('road-secondary', ['secondary'], 10, 0.7, 0.5, 9),
    roadLayer('road-primary', ['primary', 'trunk', 'motorway'], 8.5, 0.8, 0.6, 12),
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': C.building,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 4],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, 0.85],
      },
    },
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
      minzoom: 9,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': 12 },
      paint: { 'text-color': '#bff1f8', 'text-halo-color': HALO, 'text-halo-width': 1.2 },
    },
    {
      id: 'osm-waterway-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'waterway',
      minzoom: 13,
      filter: ['==', ['get', 'class'], 'river'],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': FONT_ITALIC,
        'text-size': 11.5,
      },
      paint: { 'text-color': '#d9f6ff', 'text-halo-color': C.shore, 'text-halo-width': 1.4 },
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

  const sources: Record<string, unknown> = {
    omt: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: OMT_ATTRIBUTION,
    },
    terrain: dem,
    hillshade: { ...dem },
  }
  if (satellite && settings.satellite !== 'none') {
    const img = IMAGERY[settings.satellite]
    sources.satellite = {
      type: 'raster',
      tiles: [img.tiles(settings.satelliteKey)],
      tileSize: img.size,
      maxzoom: img.maxzoom,
      attribution: img.attribution,
    }
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
        paint: { 'fill-color': '#06202c', 'fill-opacity': 0.4 },
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
