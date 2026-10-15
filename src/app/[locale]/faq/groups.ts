/**
 * The FAQ page's questions: topic heading key, then question/answer message
 * keys. Shared with the website assistant (`site_info` tool), so the answers
 * it gives are the exact wording on /faq.
 */
export const FAQ_GROUPS: readonly { title: string; items: readonly { q: string; a: string }[] }[] =
  [
    {
      title: 'faq_g_map',
      items: [
        { q: 'home_faq1_q', a: 'home_faq1_a' },
        { q: 'home_faq2_q', a: 'home_faq2_a' },
        { q: 'it_faq_change_q', a: 'it_faq_change_a' },
      ],
    },
    {
      title: 'faq_g_book',
      items: [
        { q: 'ad_faq1_q', a: 'ad_faq1_a' },
        { q: 'faq_pay_q', a: 'faq_pay_a' },
        { q: 'faq_cancel_q', a: 'faq_cancel_a' },
        { q: 'ad_faq2_q', a: 'ad_faq2_a' },
        { q: 'home_faq3_q', a: 'home_faq3_a' },
      ],
    },
    {
      title: 'faq_g_driver',
      items: [
        { q: 'home_faq4_q', a: 'home_faq4_a' },
        { q: 'it_faq_driver_q', a: 'it_faq_driver_a' },
      ],
    },
    {
      title: 'faq_g_help',
      items: [{ q: 'home_faq5_q', a: 'home_faq5_a' }],
    },
  ]
