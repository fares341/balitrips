import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const SPACES = [
  'SPACES_REGION',
  'SPACES_ENDPOINT',
  'SPACES_KEY',
  'SPACES_SECRET',
  'SPACES_PUBLIC_BUCKET',
  'SPACES_PRIVATE_BUCKET',
]
const DEPLOY = {
  DATABASE_URL: 'postgres://u:p@localhost/db',
  NEXT_PUBLIC_SITE_URL: 'https://example.test',
  RESEND_API_KEY: 'k',
  EMAIL_FROM: 'a@example.test',
  GOTENBERG_URL: 'http://gotenberg:3000',
  PAYMENT_PROVIDER: 'sandbox',
}
const saved = { ...process.env }
let config: typeof import('./config')

beforeAll(async () => {
  Object.assign(process.env, DEPLOY)
  config = await import('./config')
})

afterEach(() => {
  for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name]
  Object.assign(process.env, saved, DEPLOY)
})

function withoutSpacesCredentials() {
  for (const name of SPACES) process.env[name] = 'set'
  process.env.SPACES_KEY = ''
  process.env.SPACES_SECRET = ''
}

describe('worker environment check', () => {
  it('is fatal in strict mode without Spaces credentials or a local volume', () => {
    withoutSpacesCredentials()
    delete process.env.PRIVATE_STORAGE_DIR
    const report = config.evaluateEnvironment(true)
    expect(report.fatal).toHaveLength(1)
    expect(report.fatal[0]).toContain('SPACES_KEY, SPACES_SECRET')
  })

  it('accepts the local private volume instead of Spaces in strict mode', () => {
    withoutSpacesCredentials()
    process.env.PRIVATE_STORAGE_DIR = '/app/storage/private'
    const report = config.evaluateEnvironment(true)
    expect(report.fatal).toEqual([])
    expect(report.brokenQueues.size).toBe(0)
    expect(report.notes.join('\n')).toContain('using local private storage')
  })

  it('still treats other deploy settings as fatal in strict mode', () => {
    process.env.PRIVATE_STORAGE_DIR = '/app/storage/private'
    process.env.GOTENBERG_URL = ''
    const report = config.evaluateEnvironment(true)
    expect(report.fatal.join('\n')).toContain('GOTENBERG_URL')
  })

  it('reports no note when Spaces is fully configured', () => {
    for (const name of SPACES) process.env[name] = 'set'
    process.env.PRIVATE_STORAGE_DIR = '/app/storage/private'
    expect(config.evaluateEnvironment(true).notes).toEqual([])
  })
})
