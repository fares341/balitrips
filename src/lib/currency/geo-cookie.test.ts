import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { withGeoCurrency } from './geo-cookie'

function req(headers: Record<string, string>, cookie = '') {
  return new NextRequest('https://example.com/ar/activities', {
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
  })
}
const geo = (res: NextResponse) => res.cookies.get('bt_cur_geo')?.value

describe('proxy: geo currency cookie', () => {
  it('Egyptian, Saudi, UAE and Indonesian IPs behind Caddy (X-Forwarded-For) map correctly', () => {
    const cases: Array<[string, string]> = [
      ['41.32.0.1', 'EGP'],
      ['156.160.0.1', 'EGP'],
      ['197.32.0.1', 'EGP'],
      ['2.88.0.1', 'SAR'],
      ['94.200.0.1', 'AED'],
      ['36.80.0.1', 'IDR'],
    ]
    for (const [ip, cur] of cases) {
      expect(geo(withGeoCurrency(req({ 'x-forwarded-for': ip }), NextResponse.next())), ip).toBe(
        cur,
      )
    }
  })

  it('is written on every page request whose cookie is stale, not only the first', () => {
    const res = withGeoCurrency(
      req({ 'x-forwarded-for': '41.32.0.1' }, 'bt_cur_geo=SAR'),
      NextResponse.next(),
    )
    expect(geo(res)).toBe('EGP')
    const same = withGeoCurrency(
      req({ 'x-forwarded-for': '41.32.0.1' }, 'bt_cur_geo=EGP'),
      NextResponse.next(),
    )
    expect(same.cookies.get('bt_cur_geo')).toBeUndefined()
  })

  it('is still set when a switcher choice exists, and the legacy override is cleared', () => {
    const res = withGeoCurrency(
      req({ 'x-forwarded-for': '41.32.0.1' }, 'bt_currency=SAR'),
      NextResponse.next(),
    )
    expect(geo(res)).toBe('EGP')
    expect(res.cookies.get('bt_currency')?.value).toBe('')
  })
})
