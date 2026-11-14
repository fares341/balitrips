/**
 * How long a plan lasts, as a message: "3 months of access", "1 year of
 * access", "lifetime". A year is said as a year — not as 365 days beside a
 * card that is called the yearly plan. Shared by /plans and /plans/buy/<id>.
 */
export function planAccessMessage(durationDays: number | null): {
  key: 'pl_lifetime' | 'sub_for_years' | 'sub_for_months' | 'sub_for_days'
  values?: Record<string, number>
} {
  if (durationDays === null) return { key: 'pl_lifetime' }
  if (durationDays % 365 === 0)
    return { key: 'sub_for_years', values: { years: durationDays / 365 } }
  if (durationDays % 30 === 0)
    return { key: 'sub_for_months', values: { months: durationDays / 30 } }
  return { key: 'sub_for_days', values: { days: durationDays } }
}
