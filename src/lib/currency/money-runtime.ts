/**
 * Display currency without a flash of the wrong price.
 *
 * Pages stay static (and cacheable): their HTML always carries SAR prices
 * as `<bdi data-money="<minor>" data-from="SAR">375 ر.س</bdi>`. The proxy
 * decides the visitor's currency on the server (switcher cookie, else the
 * country) and hands it over in a cookie; this script, inlined at the top of
 * <head>, reads it and rewrites every price node *as the parser inserts it*
 * (a MutationObserver fires before the first paint), so the visitor never
 * sees a riyal amount turn into a pound. React then hydrates against the
 * same nodes (`suppressHydrationWarning` on the <bdi>), and later client
 * updates are converted the same way.
 *
 *  - `data-money-mode="approx"`: only «≈ X» when the currency is not SAR,
 *    empty otherwise (the line next to the SAR charge at checkout).
 *  - no `data-money`: the text is never touched (SAR at checkout, invoices).
 */

import { BASE_CURRENCY } from './fx'
import { formatMoneyText } from './money-format'
import { CURRENCY_COOKIE, GEO_CURRENCY_COOKIE } from './shared'

export interface MoneyRuntimeConfig {
  rates: Record<string, number>
  /** The switcher list (what a visitor may pick). */
  supported: string[]
  fallback: string
}

/* eslint-disable no-var */
function runtime(
  cfg: MoneyRuntimeConfig & { base: string; cookie: string; geoCookie: string },
  fmt: (amount: number, currency: string, locale: string) => string,
) {
  var doc = document
  var root = doc.documentElement
  function readCookie(name: string): string {
    var parts = ('; ' + doc.cookie).split('; ' + name + '=')
    return parts.length > 1 ? decodeURIComponent(String(parts.pop()).split(';')[0] || '') : ''
  }
  function ok(code: string): boolean {
    return cfg.supported.indexOf(code) !== -1
  }
  // The country's currency applies whenever there is a rate for it, even if
  // the Studio switcher list does not offer it (pre-#56 settings rows store
  // a short list without EGP, which pinned Egypt to SAR).
  function rated(code: string): boolean {
    return code === cfg.base || (code !== '' && (cfg.rates[code] || 0) > 0)
  }
  var chosen = readCookie(cfg.cookie).toUpperCase()
  var geo = readCookie(cfg.geoCookie).toUpperCase()
  var cur = ok(chosen) ? chosen : rated(geo) ? geo : ok(cfg.fallback) ? cfg.fallback : cfg.base
  function exp(code: string): number {
    if ('BHD IQD JOD KWD LYD OMR TND'.indexOf(code) !== -1) return 3
    if ('JPY KRW VND CLP'.indexOf(code) !== -1) return 0
    return 2
  }
  function text(el: HTMLElement): string | null {
    var minor = Number(el.getAttribute('data-money'))
    if (!isFinite(minor)) return null
    var from = (el.getAttribute('data-from') || cfg.base).toUpperCase()
    var mode = el.getAttribute('data-money-mode')
    var lang = root.lang || 'ar'
    var fromRate = from === cfg.base ? 1 : cfg.rates[from]
    var toRate = cur === cfg.base ? 1 : cfg.rates[cur]
    if (!fromRate || !toRate) return null
    var sarMajor = minor / Math.pow(10, exp(from)) / fromRate
    if (cur === cfg.base) return mode === 'approx' ? '' : fmt(sarMajor, cfg.base, lang)
    return '≈ ' + fmt(sarMajor * toRate, cur, lang)
  }
  function apply(el: HTMLElement) {
    var want = text(el)
    if (want === null) return
    var first = el.firstChild
    if (first && first.nodeType === 3 && !first.nextSibling) {
      if (first.nodeValue !== want) first.nodeValue = want
    } else if (el.textContent !== want) {
      el.textContent = want
    }
  }
  function scan(node: Node) {
    if (node.nodeType !== 1) {
      var parent = node.parentElement
      var host = parent && (parent.closest('[data-money]') as HTMLElement | null)
      if (host) apply(host)
      return
    }
    var el = node as HTMLElement
    if (el.hasAttribute('data-money')) apply(el)
    var list = el.querySelectorAll('[data-money]')
    for (var i = 0; i < list.length; i++) apply(list[i] as HTMLElement)
  }
  root.setAttribute('data-cur', cur)
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i]!
      if (r.type === 'childList') {
        for (var j = 0; j < r.addedNodes.length; j++) scan(r.addedNodes[j]!)
      } else {
        scan(r.target)
      }
    }
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-money', 'data-from'],
  })
  ;(window as unknown as { __btMoney: unknown }).__btMoney = {
    get: function () {
      return cur
    },
    set: function (next: string) {
      if (!ok(next) && !rated(next)) return
      cur = next
      root.setAttribute('data-cur', cur)
      scan(root)
    },
  }
}
/* eslint-enable no-var */

/** The inline <head> script for this table. */
export function moneyRuntimeScript(config: MoneyRuntimeConfig): string {
  const cfg = {
    rates: config.rates,
    supported: config.supported,
    fallback: config.fallback,
    base: BASE_CURRENCY,
    cookie: CURRENCY_COOKIE,
    geoCookie: GEO_CURRENCY_COOKIE,
  }
  // `<` escaped so a value can never close the script element.
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c')
  return `(${runtime.toString()})(${json},${formatMoneyText.toString()});`
}
