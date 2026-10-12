/**
 * حسابات جغرافية للأماكن القريبة.
 *
 * Haversine كافٍ تماماً هنا: مئات الأماكن في جزيرة عرضها ~150 كم، والخطأ
 * مقارنةً بمعادلات الإهليلج أقل من 0.5%. PostGIS سيكون اعتمادية ثقيلة لحل
 * مشكلة لا نملكها. الاستعلام يرشّح أولاً بصندوق إحداثيات (يستخدم فهرس
 * lat/lon) ثم يحسب المسافة الدقيقة للنتائج فقط.
 */

const EARTH_RADIUS_KM = 6371.0088

const rad = (deg: number) => (deg * Math.PI) / 180

export interface LatLon {
  lat: number
  lon: number
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** صندوق يحيط بدائرة نصف قطرها `radiusKm`. */
export function boundingBox(center: LatLon, radiusKm: number) {
  const dLat = radiusKm / 111.32
  const dLon = radiusKm / (111.32 * Math.max(Math.cos(rad(center.lat)), 0.01))
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLon: center.lon - dLon,
    maxLon: center.lon + dLon,
  }
}

/**
 * حدود بالي ونوسا التقريبية. موقع خارجها (سائح لم يصل بعد) لا يعني شيئاً
 * لـ "قريب مني"، فيُتجاهل وتُستخدم المنطقة المختارة أو البحث وحده.
 */
export const BALI_BOUNDS = { minLat: -8.95, maxLat: -8.05, minLon: 114.4, maxLon: 115.75 }

export function isInBali(point: LatLon): boolean {
  return (
    point.lat >= BALI_BOUNDS.minLat &&
    point.lat <= BALI_BOUNDS.maxLat &&
    point.lon >= BALI_BOUNDS.minLon &&
    point.lon <= BALI_BOUNDS.maxLon
  )
}

export function parseLatLon(lat: unknown, lon: unknown): LatLon | null {
  const la = typeof lat === 'string' ? Number.parseFloat(lat) : typeof lat === 'number' ? lat : NaN
  const lo = typeof lon === 'string' ? Number.parseFloat(lon) : typeof lon === 'number' ? lon : NaN
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null
  return { lat: la, lon: lo }
}
