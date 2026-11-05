/**
 * Barber / laundry places filed under «malls» (owner, Nov 2026). Pure: the
 * one-time data job `scripts/data-jobs/recategorize-services.ts` uses it.
 *
 * A place's NAME decides first; the description only when the name says
 * nothing. Words must stand alone («cuts», not «haircutsalon» inside an
 * unrelated word), so mall names never match.
 */

export type ServiceKind = 'barber' | 'laundry'

const BARBER = [
  /\bbarber(s|shop|shops)?\b/i,
  /\bbarbershop\b/i,
  /\bcuts\b/i,
  /\bpangkas rambut\b/i,
  /\btukang cukur\b/i,
  /حلاق/,
]
const LAUNDRY = [
  /\blaundr(y|ies|omat)\b/i,
  /\bdry[ -]?clean(ing|er|ers)?\b/i,
  /\bbinatu\b/i,
  /مغسل[ةه]/,
  /غسيل ملابس/,
]

function kindOf(text: string): ServiceKind | null {
  const barber = BARBER.some((re) => re.test(text))
  const laundry = LAUNDRY.some((re) => re.test(text))
  if (barber) return 'barber'
  if (laundry) return 'laundry'
  return null
}

type Texts = Partial<Record<string, string | null | undefined>> | null | undefined

function join(texts: Texts): string {
  return Object.values(texts ?? {})
    .filter((v): v is string => typeof v === 'string')
    .join(' \n ')
}

/** Barber, laundry, or null (leave the place alone). */
export function serviceKind(name: Texts, description?: Texts): ServiceKind | null {
  return kindOf(join(name)) ?? kindOf(join(description))
}
