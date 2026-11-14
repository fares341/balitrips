/**
 * The one price formatter, shared by React (server and client) and by the
 * tiny inline script that converts prices before first paint
 * (`./money-runtime`). The script is built from `formatMoneyText.toString()`,
 * so this function must stay self-contained: no imports, no closures, no
 * syntax a compiler would rewrite into a helper (spread, classes, ?.).
 */

/* eslint-disable no-var -- serialised into a pre-hydration inline script */
/**
 * `approx` puts «≈ » in front, inside the same direction run as the amount.
 *
 * Direction (site audit, Nov 2026). In Arabic, Intl prints a foreign amount
 * as number-then-symbol with a right-to-left mark ("‏26.67 US$"), which the
 * page then drew mirrored: «US$ 26.67 ≈». So in Arabic:
 *  - a currency with an Arabic symbol (ر.س. / د.إ. / ج.م.) keeps Intl's Arabic
 *    form, which starts with a right-to-left mark: «≈ 98 د.إ.»;
 *  - any other currency is written the way that currency is written
 *    everywhere ("$26.67", "€24.53", "Rp 435,000"), isolated left-to-right,
 *    with «≈» before the amount.
 * The isolate (U+2066 … U+2069) makes the amount read the same wherever it
 * lands: a <bdi>, a sentence, an attribute. English and
 * Indonesian text is left-to-right throughout and needs none.
 */
export function formatMoneyText(
  amount: number,
  currency: string,
  locale: string,
  approx?: boolean,
): string {
  var code = String(currency).toUpperCase()
  var whole = { IDR: 1, JPY: 1, EGP: 1, INR: 1, TRY: 1, CNY: 1 } as Record<string, number>
  var value = amount
  if (code === 'IDR') {
    value = amount >= 10000 ? Math.round(amount / 1000) * 1000 : Math.round(amount)
  } else if (whole[code] === 1 || (amount >= 100 && code !== 'SAR')) {
    // SAR is the charged currency: shown exactly (246.90, not 247). Only the
    // «≈» conversions are rounded for readability.
    value = Math.round(amount)
  } else {
    value = Math.round(amount * 100) / 100
  }
  var arabic = locale === 'ar' || locale.indexOf('ar-') === 0
  var intl = arabic
    ? 'ar-SA-u-nu-latn'
    : locale === 'id' || locale.indexOf('id-') === 0
      ? 'id-ID'
      : 'en-US'
  var isWhole = Math.round(value) === value
  var prefix = approx ? '≈ ' : ''
  function format(tag: string, display: 'symbol' | 'narrowSymbol'): string {
    return new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: code,
      currencyDisplay: display,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(value)
  }
  // «$» alone means US dollars on this site: other dollars keep their prefix.
  function plain(tag: string): string {
    var narrow = format(tag, 'narrowSymbol')
    return code !== 'USD' && narrow.indexOf('$') !== -1 ? format(tag, 'symbol') : narrow
  }
  try {
    if (!arabic) {
      return prefix + (code === 'USD' && intl !== 'en-US' ? format(intl, 'symbol') : plain(intl))
    }
    // EGP's narrow symbol is the Latin «E£»; its full Arabic symbol is «ج.م.».
    var local = format(intl, code === 'EGP' ? 'symbol' : 'narrowSymbol')
    // Arabic symbol: Intl's own right-to-left form (it carries the marks).
    if (/[\u0600-\u06FF]/.test(local)) return prefix + local
    return '\u2066' + prefix + plain('en-US') + '\u2069'
  } catch {
    return prefix + code + ' ' + value
  }
}
/* eslint-enable no-var */
