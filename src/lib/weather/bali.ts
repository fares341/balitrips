/**
 * Current weather in Bali for the home hero strip (owner, Oct 2026).
 *
 * Open-Meteo's free forecast API: no key, no account. Fetched on the server
 * and cached for 15 minutes; any failure (network, timeout, odd payload)
 * returns null and the strip simply leaves the weather item out. Nothing is
 * ever guessed.
 */

const ENDPOINT =
  'https://api.open-meteo.com/v1/forecast?latitude=-8.65&longitude=115.22&current=temperature_2m,weather_code'

/** Seconds the reading is reused (Next data cache). */
export const WEATHER_REVALIDATE = 900

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'storm'

export interface BaliWeather {
  /** Rounded °C. */
  tempC: number
  kind: WeatherKind
}

/** WMO weather interpretation code → a small set of kinds with an icon each. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 95) return 'storm'
  return 'rain'
}

/** Parse Open-Meteo's `current` block; null when it is not what we expect. */
export function parseWeather(payload: unknown): BaliWeather | null {
  if (typeof payload !== 'object' || payload === null) return null
  const current = (payload as { current?: unknown }).current
  if (typeof current !== 'object' || current === null) return null
  const { temperature_2m: temp, weather_code: code } = current as Record<string, unknown>
  if (typeof temp !== 'number' || !Number.isFinite(temp)) return null
  if (typeof code !== 'number' || !Number.isInteger(code)) return null
  return { tempC: Math.round(temp), kind: weatherKind(code) }
}

export async function getBaliWeather(): Promise<BaliWeather | null> {
  try {
    const response = await fetch(ENDPOINT, {
      next: { revalidate: WEATHER_REVALIDATE },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    return parseWeather(await response.json())
  } catch {
    return null
  }
}
