import { describe, expect, it } from 'vitest'

import { parseSummary, summaryPrompt } from './summary'

describe('contract summary', () => {
  it('asks for JSON in Arabic and carries the contract text', () => {
    const prompt = summaryPrompt('NET 450,000')
    expect(prompt.system).toContain('JSON')
    expect(prompt.system).toContain('redFlags')
    expect(prompt.user).toContain('NET 450,000')
  })

  it('reads a JSON answer, even wrapped in a code fence', () => {
    const summary = parseSummary(
      '```json\n{"prices":"450,000 روبية صافي","paymentTerms":"شهريًا","cancellation":"مجاني قبل 48 ساعة","liabilities":"","duration":"سنة","redFlags":["لا تأمين", 3, ""],"other":""}\n```',
    )
    expect(summary).not.toBeNull()
    expect(summary?.prices).toBe('450,000 روبية صافي')
    expect(summary?.redFlags).toEqual(['لا تأمين'])
  })

  it('refuses anything that is not the JSON asked for', () => {
    expect(parseSummary('Sorry, I cannot help.')).toBeNull()
    expect(parseSummary('{not json}')).toBeNull()
    expect(parseSummary('[1,2]')).toBeNull()
    expect(parseSummary('{"prices": ""}')).toBeNull()
  })
})
