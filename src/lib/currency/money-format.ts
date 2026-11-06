/**
 * The one price formatter, shared by React (server and client) and by the
 * tiny inline script that converts prices before first paint
 * (`./money-runtime`). The script is built from `formatMoneyText.toString()`,
 * so this function must stay self-contained: no imports, no closures, no
 * syntax a compiler would rewrite into a helper (spread, classes, ?.).
 */

/* eslint-disable no-var -- serialised into a pre-hydration inline script */
export function formatMoneyText(amount: number, currency: string, locale: string): string {
  var code = String(currency).toUpperCase()
  var whole = { IDR: 1, JPY: 1, EGP: 1, INR: 1, TRY: 1, CNY: 1 } as Record<string, number>
  var value = amount
  if (code === 'IDR') {
    value = amount >= 10000 ? Math.round(amount / 1000) * 1000 : Math.round(amount)
  } else if (whole[code] === 1 || amount >= 100) {
    value = Math.round(amount)
  } else {
    value = Math.round(amount * 100) / 100
  }
  var intl =
    locale === 'ar' || locale.indexOf('ar-') === 0
      ? 'ar-SA-u-nu-latn'
      : locale === 'id' || locale.indexOf('id-') === 0
        ? 'id-ID'
        : 'en-US'
  var isWhole = Math.round(value) === value
  try {
    return new Intl.NumberFormat(intl, {
      style: 'currency',
      currency: code,
      currencyDisplay:
        (code === 'USD' && intl !== 'en-US') || (code === 'EGP' && intl.indexOf('ar') === 0)
          ? 'symbol'
          : 'narrowSymbol',
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(value)
  } catch {
    return code + ' ' + value
  }
}
/* eslint-enable no-var */
