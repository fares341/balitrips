import { describe, expect, it } from 'vitest'

import { canonicalPolicyHref, policyLink } from './routes'

describe('canonicalPolicyHref', () => {
  it('sends Arabic per-policy pages to the policies centre (they only redirect)', () => {
    expect(canonicalPolicyHref('/terms', 'ar')).toBe('/policies')
    expect(canonicalPolicyHref('/refund', 'ar')).toBe('/policies')
    expect(policyLink('/refund', 'ar')).toBe('/policies#cancellation')
  })

  it('keeps en/id policy pages and every other route', () => {
    expect(canonicalPolicyHref('/terms', 'en')).toBe('/terms')
    expect(canonicalPolicyHref('/terms', 'id')).toBe('/terms')
    expect(canonicalPolicyHref('/activities', 'ar')).toBe('/activities')
  })
})
