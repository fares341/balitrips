import { describe, expect, it } from 'vitest'

import { listingFooterHtml, listingHtml } from './listing-html'

describe('listing PDF html', () => {
  const html = listingHtml(
    {
      title: 'الطلبات',
      sections: [
        {
          title: 'الطلبات',
          columns: [{ label: 'الطلب' }, { label: 'الإجمالي (ر.س)', num: true }],
          rows: [['BT-1', '100.00 ر.س']],
          totals: [['الإجمالي (ر.س)', '100.00 ر.س']],
          truncated: 0,
        },
      ],
    },
    {
      dir: 'rtl',
      lang: 'ar',
      brand: 'Bali Trips',
      period: '1 نوفمبر – 30 نوفمبر',
      filters: [['الحالة', 'paid']],
      generatedAt: 'اليوم',
      labels: {
        period: 'الفترة',
        filters: 'الفلاتر',
        noFilters: 'بدون',
        generated: 'تاريخ الإنشاء',
        totals: 'الإجماليات',
        truncated: (n) => `أول ${n}`,
        empty: 'لا شيء',
      },
    },
  )

  it('is Arabic, right to left, self-contained, with the site font and logo', () => {
    expect(html).toContain('dir="rtl"')
    expect(html).toContain("font-family:'Almarai'")
    expect(html).toContain("url('almarai-400.woff')")
    expect(html).toContain('src="bt-logo.png"')
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).toContain('100.00 ر.س')
    expect(html).toContain('الحالة: <b>paid</b>')
  })

  it('numbers pages in the footer', () => {
    const footer = listingFooterHtml({ dir: 'rtl', page: 'صفحة', of: 'من', brand: 'Bali Trips' })
    expect(footer).toContain('class="pageNumber"')
    expect(footer).toContain('class="totalPages"')
  })
})
