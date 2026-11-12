import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('client message keys', () => {
  it('src/i18n/client-message-keys.json is up to date (run node scripts/client-message-keys.mjs)', () => {
    const script = path.resolve(__dirname, '../../scripts/client-message-keys.mjs')
    expect(() =>
      execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' }),
    ).not.toThrow()
  })
})
