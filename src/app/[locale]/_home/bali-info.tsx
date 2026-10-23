/**
 * The hero info strip (owner, Oct 2026): the time in Bali, the weather now,
 * and the visa-on-arrival price. Each item stands alone: no weather reading
 * → no weather item; no visa amount set in Studio → no visa item. Nothing
 * here is invented.
 */

import type { ReactNode } from 'react'

import type { BaliWeather, WeatherKind } from '@/lib/weather/bali'

import { BaliClock } from './bali-clock'

export interface VisaInfo {
  amount: string
  currency: string
  note: string | null
  link: string | null
}

export function BaliInfoStrip({
  locale,
  weather,
  visa,
  labels,
}: {
  locale: string
  weather: BaliWeather | null
  visa: VisaInfo | null
  labels: {
    region: string
    time: string
    zone: string
    weather: string
    kinds: Record<WeatherKind, string>
    visa: string
  }
}) {
  const now = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Makassar',
  }).format(new Date())

  const items: { key: string; icon: ReactNode; label: string; value: ReactNode }[] = [
    {
      key: 'time',
      icon: <ClockGlyph />,
      label: labels.time,
      value: (
        <>
          <BaliClock locale={locale} initial={now} /> <small>{labels.zone}</small>
        </>
      ),
    },
  ]
  if (weather !== null) {
    items.push({
      key: 'weather',
      icon: <WeatherGlyph kind={weather.kind} />,
      label: labels.weather,
      value: (
        <>
          <span className="num" dir="ltr">
            {weather.tempC}°C
          </span>{' '}
          <small>{labels.kinds[weather.kind]}</small>
        </>
      ),
    })
  }
  if (visa !== null) {
    const price = (
      <span className="num" dir="ltr">
        {visa.amount} {visa.currency}
      </span>
    )
    items.push({
      key: 'visa',
      icon: <PassportGlyph />,
      label: labels.visa,
      value: (
        <>
          {visa.link ? (
            <a href={visa.link} target="_blank" rel="noopener noreferrer">
              {price}
            </a>
          ) : (
            price
          )}
          {visa.note ? <small> {visa.note}</small> : null}
        </>
      ),
    })
  }

  return (
    <ul className="hv-info" aria-label={labels.region}>
      {items.map((item) => (
        <li key={item.key} className={`hv-info-i hv-info-${item.key}`}>
          <span className="hv-info-ic" aria-hidden="true">
            {item.icon}
          </span>
          <span className="hv-info-tx">
            <small className="hv-info-l">{item.label}</small>
            <b>{item.value}</b>
          </span>
        </li>
      ))}
    </ul>
  )
}

const SVG = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function ClockGlyph() {
  return (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function PassportGlyph() {
  return (
    <svg {...SVG}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10.5" r="3" />
      <path d="M9 16.5h6" />
    </svg>
  )
}

const CLOUD = 'M7.5 18.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7.5 18.5Z'

function WeatherGlyph({ kind }: { kind: WeatherKind }) {
  switch (kind) {
    case 'clear':
      return (
        <svg {...SVG}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      )
    case 'partly':
      return (
        <svg {...SVG}>
          <path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1" />
          <path d="M5.6 10.4A3 3 0 0 1 10.6 7" />
          <path d={CLOUD} />
        </svg>
      )
    case 'cloudy':
      return (
        <svg {...SVG}>
          <path d={CLOUD} />
        </svg>
      )
    case 'fog':
      return (
        <svg {...SVG}>
          <path d="M4 9h16M6 13h12M4 17h16" />
        </svg>
      )
    case 'drizzle':
    case 'rain':
      return (
        <svg {...SVG}>
          <path d="M7.5 15h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7.5 15Z" />
          <path d={kind === 'rain' ? 'M8 18l-1 3M12 18l-1 3M16 18l-1 3' : 'M9 18.5v1M13 18.5v1'} />
        </svg>
      )
    case 'storm':
      return (
        <svg {...SVG}>
          <path d="M7.5 15h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7.5 15Z" />
          <path d="m12.5 15-2 3.5h3l-2 3.5" />
        </svg>
      )
  }
}
