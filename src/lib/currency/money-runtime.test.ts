import { describe, expect, it } from 'vitest'

import { DEFAULT_FX } from './fx'
import { moneyRuntimeScript } from './money-runtime'
import { formatInCurrency } from './shared'

/** Just enough DOM for the runtime: price nodes, cookies, an observer stub. */
function run(cookie: string, lang = 'ar', supported: string[] = DEFAULT_FX.presentment) {
  const text = (value: string) => ({ nodeType: 3, nodeValue: value, nextSibling: null })
  const price = (minor: number, mode?: string) => {
    const attrs: Record<string, string> = { 'data-money': String(minor), 'data-from': 'SAR' }
    if (mode) attrs['data-money-mode'] = mode
    const node = {
      nodeType: 1,
      firstChild: text(formatInCurrency(minor, 'SAR', 'SAR', lang)) as { nodeValue: string } | null,
      get textContent() {
        return this.firstChild?.nodeValue ?? ''
      },
      set textContent(value: string) {
        this.firstChild = text(value)
      },
      getAttribute: (name: string) => attrs[name] ?? null,
      hasAttribute: (name: string) => name in attrs,
      querySelectorAll: () => [],
    }
    return node
  }
  const nodes = [price(22_100), price(7_500), price(22_100, 'approx')]
  const rootAttrs: Record<string, string> = {}
  const root = {
    nodeType: 1,
    lang,
    setAttribute: (k: string, v: string) => (rootAttrs[k] = v),
    getAttribute: (k: string) => rootAttrs[k] ?? null,
    hasAttribute: () => false,
    querySelectorAll: () => nodes,
  }
  const g = globalThis as Record<string, unknown>
  g.document = { cookie, documentElement: root }
  g.window = g
  g.MutationObserver = class {
    observe() {}
  }
  new Function(
    moneyRuntimeScript({
      rates: DEFAULT_FX.rates,
      supported,
      fallback: 'SAR',
    }),
  )()
  const api = g.__btMoney as { get(): string; set(code: string): void }
  api.set(api.get()) // first scan, as the observer would on insertion
  return { api, nodes, rootAttrs }
}

describe('money runtime (before first paint)', () => {
  it('a visitor from Egypt sees ≈ EGP, formatted exactly like the server', () => {
    const { api, nodes, rootAttrs } = run('bt_cur_geo=EGP')
    expect(api.get()).toBe('EGP')
    expect(rootAttrs['data-cur']).toBe('EGP')
    expect(nodes[0]!.textContent).toBe(
      formatInCurrency(22_100, 'SAR', 'EGP', 'ar', DEFAULT_FX.rates),
    )
    expect(nodes[0]!.textContent.startsWith('≈ ')).toBe(true)
    expect(nodes[2]!.textContent).toBe(nodes[0]!.textContent)
  })

  it('a Saudi visitor keeps the SAR text, and the approx line stays empty', () => {
    const { nodes } = run('bt_cur_geo=SAR')
    expect(nodes[0]!.textContent).toBe(formatInCurrency(22_100, 'SAR', 'SAR', 'ar'))
    expect(nodes[2]!.textContent).toBe('')
  })

  it('the switcher cookie wins over the country, and unsupported codes fall back to SAR', () => {
    expect(run('bt_cur_geo=EGP; bt_cur_choice=USD').api.get()).toBe('USD')
    expect(run('bt_cur_geo=JPY').api.get()).toBe('SAR')
    expect(run('').api.get()).toBe('SAR')
  })

  it('switching re-renders every price', () => {
    const { api, nodes } = run('bt_cur_geo=SAR', 'en')
    api.set('AED')
    expect(nodes[1]!.textContent).toBe(
      formatInCurrency(7_500, 'SAR', 'AED', 'en', DEFAULT_FX.rates),
    )
  })

  it('ignores the pre-v2 bt_currency override, so old pinned visitors get their country again', () => {
    expect(run('bt_cur_geo=EGP; bt_currency=SAR').api.get()).toBe('EGP')
  })

  it('applies the country currency even when the Studio switcher list does not offer it', () => {
    // Settings rows saved before #56 hold ['SAR','USD','IDR','AED','EUR'].
    const { api, nodes } = run('bt_cur_geo=EGP', 'ar', ['SAR', 'USD', 'IDR', 'AED', 'EUR'])
    expect(api.get()).toBe('EGP')
    expect(nodes[0]!.textContent).toContain('≈')
  })

  it('a switcher pick still has to be in the switcher list', () => {
    expect(run('bt_cur_choice=EGP', 'ar', ['SAR', 'USD']).api.get()).toBe('SAR')
  })
})
