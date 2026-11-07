/**
 * Whether an itinerary may go on sale at this price: a positive base price,
 * or at least one positive level price. Zero / missing = never published and
 * never sold as free (Studio publish, the seed script and the quote all ask).
 */
export function hasSellablePrice(
  priceMinor: number | null | undefined,
  tierPrices?: Partial<Record<string, number>> | null,
): boolean {
  if (typeof priceMinor === 'number' && Number.isSafeInteger(priceMinor) && priceMinor > 0)
    return true
  return Object.values(tierPrices ?? {}).some(
    (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
  )
}
