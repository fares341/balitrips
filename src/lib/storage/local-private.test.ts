import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isPrivateStorageAvailable,
  localPrivateRoot,
  readPrivateObject,
  resolveKey,
  writeLocalPrivate,
} from './local-private'

const SPACES = [
  'SPACES_REGION',
  'SPACES_ENDPOINT',
  'SPACES_KEY',
  'SPACES_SECRET',
  'SPACES_PUBLIC_BUCKET',
  'SPACES_PRIVATE_BUCKET',
]
let dir: string
const saved: Record<string, string | undefined> = {}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'private-'))
  for (const name of [...SPACES, 'PRIVATE_STORAGE_DIR']) saved[name] = process.env[name]
  for (const name of SPACES) delete process.env[name]
  process.env.PRIVATE_STORAGE_DIR = dir
})

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  await rm(dir, { recursive: true, force: true })
})

describe('local private storage', () => {
  it('is available when PRIVATE_STORAGE_DIR is set and Spaces is not', () => {
    expect(localPrivateRoot()).toBe(path.resolve(dir))
    expect(isPrivateStorageAvailable()).toBe(true)
    delete process.env.PRIVATE_STORAGE_DIR
    expect(isPrivateStorageAvailable()).toBe(false)
  })

  it('defers to Spaces when Spaces is configured', () => {
    for (const name of SPACES) process.env[name] = 'x'
    process.env.SPACES_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    expect(localPrivateRoot()).toBeNull()
  })

  it('round-trips bytes with owner-only permissions', async () => {
    const written = await writeLocalPrivate('/itineraries/a/en.pdf', '%PDF-1.7')
    expect(written).toBe(8)
    const file = path.join(dir, 'itineraries/a/en.pdf')
    expect(await readFile(file, 'utf8')).toBe('%PDF-1.7')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    const back = await readPrivateObject('itineraries/a/en.pdf')
    expect(Buffer.from(back ?? []).toString('utf8')).toBe('%PDF-1.7')
  })

  it('returns null for a missing object', async () => {
    expect(await readPrivateObject('nope.pdf')).toBeNull()
  })

  it.each(['../etc/passwd', 'a/../../b', './a', 'a//b', '', 'a\\..\\b', 'a\0b', '..'])(
    'refuses unsafe key %j',
    async (key) => {
      expect(resolveKey(path.resolve(dir), key)).toBeNull()
      await expect(writeLocalPrivate(key, 'x')).rejects.toThrow()
      expect(await readPrivateObject(key)).toBeNull()
    },
  )

  it('keeps resolved paths inside the root', () => {
    const root = path.resolve(dir)
    expect(resolveKey(root, '//a/b.pdf')).toBe(path.join(root, 'a/b.pdf'))
  })
})
