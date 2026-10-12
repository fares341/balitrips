/**
 * Extracts the UI translation table from the design handoff into
 * messages/{en,ar,id}.json.
 *
 * The handoff stores strings as a flat `STR` object of
 * `{ key: { en, ar, id } }` in a no-build JSX file that ends by assigning to
 * `window`. Rather than parse JSX, we isolate the STR literal and evaluate
 * just that expression in a throwaway context.
 *
 * Run: node scripts/extract-messages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'design/handoff/sections-bt/i18n.jsx')
const OUT_DIR = resolve(root, 'messages')
const LOCALES = ['en', 'ar', 'id']

const src = readFileSync(SOURCE, 'utf8')

// Isolate `const STR = { ... };` — take from the opening brace to the
// matching close, counting depth so nested objects don't end it early.
const start = src.indexOf('const STR = {')
if (start === -1) throw new Error('STR table not found in ' + SOURCE)

const openBrace = src.indexOf('{', start)
let depth = 0
let end = -1
let inString = null
for (let i = openBrace; i < src.length; i++) {
  const ch = src[i]
  const prev = src[i - 1]
  if (inString) {
    if (ch === inString && prev !== '\\') inString = null
    continue
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    inString = ch
    continue
  }
  if (ch === '{') depth++
  else if (ch === '}') {
    depth--
    if (depth === 0) {
      end = i
      break
    }
  }
}
if (end === -1) throw new Error('Unbalanced braces in STR table')

const literal = src.slice(openBrace, end + 1)
const STR = vm.runInNewContext('(' + literal + ')')

const keys = Object.keys(STR)
mkdirSync(OUT_DIR, { recursive: true })

const missing = []
for (const locale of LOCALES) {
  const out = {}
  for (const key of keys) {
    const entry = STR[key]
    const value = entry?.[locale]
    if (typeof value !== 'string' || value.length === 0) {
      missing.push(`${locale}:${key}`)
      // Fall back to English so the site never renders an empty string.
      // The admin surfaces these as a missing-translations report.
      out[key] = entry?.en ?? key
    } else {
      out[key] = value
    }
  }
  const sorted = Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((k) => [k, out[k]]),
  )
  writeFileSync(resolve(OUT_DIR, `${locale}.json`), JSON.stringify(sorted, null, 2) + '\n', 'utf8')
}

console.log(`Extracted ${keys.length} keys x ${LOCALES.length} locales -> messages/`)
if (missing.length) {
  console.log(`\n${missing.length} missing translation(s), filled from English:`)
  for (const m of missing.slice(0, 40)) console.log('  ' + m)
  if (missing.length > 40) console.log(`  ... and ${missing.length - 40} more`)
}
