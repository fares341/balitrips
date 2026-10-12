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

/** طول مسار يمر بالنقاط بالترتيب (كم). */
export function routeLengthKm(points: readonly LatLon[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1] as LatLon, points[i] as LatLon)
  }
  return total
}

/**
 * ترتيب أماكن اليوم في مسار قصير (الوثيقة 12.3: "ترتيب الأماكن حسب المسافة"،
 * "اقتراح مسار يومي").
 *
 * يبدأ من النقطة الأولى (ما وضعه المستخدم أولاً — فندقه غالباً)، ثم الأقرب
 * فالأقرب، ثم تحسين 2-opt يزيل تقاطعات المسار. مسار مفتوح (لا عودة للبداية).
 * أمثل تماماً لا يلزم: يوم سياحي فيه أماكن قليلة، والفرق دقائق قيادة.
 */
export function suggestRoute<T extends LatLon>(points: readonly T[]): T[] {
  if (points.length <= 2) return [...points]
  const [start, ...rest] = points as [T, ...T[]]
  const route: T[] = [start]
  const left = [...rest]
  while (left.length > 0) {
    const last = route[route.length - 1] as T
    let best = 0
    for (let i = 1; i < left.length; i += 1) {
      if (haversineKm(last, left[i] as T) < haversineKm(last, left[best] as T)) best = i
    }
    route.push(left.splice(best, 1)[0] as T)
  }

  // 2-opt على مسار مفتوح بنقطة بداية ثابتة: عكس أي مقطع يقصّر المسار.
  const d = (a: number, b: number) => haversineKm(route[a] as T, route[b] as T)
  let improved = true
  for (let pass = 0; improved && pass < 50; pass += 1) {
    improved = false
    for (let i = 1; i < route.length - 1; i += 1) {
      for (let k = i + 1; k < route.length; k += 1) {
        const before = d(i - 1, i) + (k + 1 < route.length ? d(k, k + 1) : 0)
        const after = d(i - 1, k) + (k + 1 < route.length ? d(i, k + 1) : 0)
        if (after + 1e-9 < before) {
          const segment = route.slice(i, k + 1).reverse()
          route.splice(i, segment.length, ...segment)
          improved = true
        }
      }
    }
  }
  return route
}
