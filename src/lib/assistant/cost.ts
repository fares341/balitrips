/**
 * What one model call cost, in millionths of a US dollar.
 *
 * OpenRouter reports the real cost when asked (`usage: { include: true }`);
 * that number is used whenever it is present. Without it the spend is
 * estimated from the token counts at deliberately high prices (the fallback
 * model's input price, the primary's output price), so the daily budget trips
 * early rather than late.
 */

/** USD per million tokens, for the estimate only. */
export const ESTIMATE_PRICE = { inPerM: 0.1, outPerM: 0.89 }

export function costMicros(usage: {
  promptTokens: number
  completionTokens: number
  cost: number | null
}): number {
  if (usage.cost !== null) return Math.max(0, Math.round(usage.cost * 1_000_000))
  return Math.round(
    usage.promptTokens * ESTIMATE_PRICE.inPerM + usage.completionTokens * ESTIMATE_PRICE.outPerM,
  )
}
