import { describe, expect, it } from 'vitest'

import { encodeWithinBudget } from './budget'

const sized = (bytes: number) => ({ byteLength: bytes })

describe('encodeWithinBudget', () => {
  it('keeps the normal quality when it fits (one encode)', async () => {
    const tried: number[] = []
    const out = await encodeWithinBudget(
      async (q) => {
        tried.push(q)
        return sized(200)
      },
      300,
      [78, 68],
    )
    expect(out.byteLength).toBe(200)
    expect(tried).toEqual([78])
  })

  it('steps down until the rung fits', async () => {
    const tried: number[] = []
    const out = await encodeWithinBudget(
      async (q) => {
        tried.push(q)
        return sized(q * 10)
      },
      600,
      [78, 68, 58, 50],
    )
    expect(tried).toEqual([78, 68, 58])
    expect(out.byteLength).toBe(580)
  })

  it('returns the smallest when nothing fits', async () => {
    const out = await encodeWithinBudget(async (q) => sized(q * 10), 100, [78, 68, 58])
    expect(out.byteLength).toBe(580)
  })
})
