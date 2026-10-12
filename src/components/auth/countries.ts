/**
 * Country of residence, as ISO 3166-1 alpha-2.
 *
 * The handoff's country box was free text with the placeholder "UAE" — three
 * characters into `users.country varchar(2)`, which Postgres rejects outright.
 * Every value that reaches the database now comes from this list.
 *
 * Only the codes are stored here. Labels come from `Intl.DisplayNames`, which
 * every supported browser ships with the full CLDR region table in all three
 * of this site's languages — so a 249-entry list does not have to be
 * translated three times, and it stays correct when a country renames itself.
 * Where a runtime has no data for a code, the code itself is shown rather than
 * a blank row.
 */

import type { Locale } from '@/i18n/config'

/**
 * Officially assigned alpha-2 codes.
 *
 * Uninhabited territories (AQ, BV, HM, GS, TF, UM) are omitted: nobody
 * resides there, and their presence in a residence picker is noise.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

export const COUNTRY_CODES: readonly string[] = CODES.split(' ')

export type CountryOption = { code: string; label: string }

/**
 * The list, labelled and sorted for one locale.
 *
 * Sorted with `Intl.Collator`, not `String.localeCompare` defaults: Arabic
 * and Indonesian order their alphabets differently from English, and an
 * alphabetical list sorted by the wrong alphabet is harder to scan than an
 * unsorted one.
 *
 * Call this from a Client Component (or memoize it) — building 249 labels is
 * cheap but not free, and the result depends only on the locale.
 */
export function countryOptions(locale: Locale): CountryOption[] {
  let display: Intl.DisplayNames | null = null
  try {
    display = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    // Runtime without region data. Codes are still selectable.
    display = null
  }

  const collator = new Intl.Collator(locale)

  return COUNTRY_CODES.map((code) => ({
    code,
    label: display?.of(code) ?? code,
  })).sort((a, b) => collator.compare(a.label, b.label))
}
