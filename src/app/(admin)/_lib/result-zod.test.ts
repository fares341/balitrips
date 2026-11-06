import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('@/lib/monitoring/errors', () => ({ reportError: () => undefined }))

import { translator } from '../_i18n'
import { errorMessage, localizeMessage } from './result'

const ar = translator('ar')
const en = translator('en')

function shown(schema: z.ZodType, value: unknown, t = ar): string {
  const parsed = schema.safeParse(value)
  if (parsed.success) throw new Error('expected a failure')
  return localizeMessage(errorMessage(parsed.error), t)
}

describe('zod issues in the Studio language', () => {
  it('never shows English validation text in Arabic', () => {
    const schema = z.object({
      maxPax: z.number().int().min(1).max(60),
      supportEmail: z.string().email(),
      whatsappNumber: z.string().regex(/^[0-9]{6,15}$/, 'Digits only, 6–15 of them'),
    })
    const tooBig = shown(schema, { maxPax: 99, supportEmail: 'a@b.co', whatsappNumber: '123456' })
    expect(tooBig).toBe('يجب ألا يتجاوز «أكثر عدد ركاب» 60.')
    const email = shown(schema, { maxPax: 2, supportEmail: 'nope', whatsappNumber: '123456' })
    expect(email).toBe('«بريد الدعم» ليس بريدًا إلكترونيًا صحيحًا.')
    const regex = shown(schema, { maxPax: 2, supportEmail: 'a@b.co', whatsappNumber: 'x' })
    expect(regex).toBe('صيغة «رقم واتساب» غير صحيحة.')
    for (const text of [tooBig, email, regex]) expect(text).not.toMatch(/[A-Za-z]{4,}/)
  })

  it('names an unknown field in plain words and reads well in English', () => {
    const text = shown(z.object({ someField: z.string().min(3) }), { someField: 'a' }, en)
    expect(text).toBe('“some Field” is too short (at least 3).')
  })
})
