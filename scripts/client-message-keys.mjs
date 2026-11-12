#!/usr/bin/env node
/**
 * Which message keys can client components ask for?
 *
 * The [locale] layout used to hand the WHOLE catalogue (~3,000 keys, ~230 kB
 * of Arabic) to <NextIntlClientProvider>, which serialises it into the RSC
 * payload of every HTML page. Server components read messages on the server
 * and never need them on the client, so only the keys reachable from client
 * code have to travel.
 *
 * This script walks the client module graph (every 'use client' file under
 * src/, excluding the Studio, plus everything those files import) and keeps
 * every key that appears there as a string literal, plus every key matching
 * a template literal (`cat_${id}`, `es_${kind}_t`) or a concatenation
 * ('cat_' + id). It errs on the side of
 * including too much: a key that is shipped but unused costs a few bytes, a
 * key that is missing renders as its name.
 *
 * Output: src/i18n/client-message-keys.json (committed). A vitest test
 * (client-message-keys.test.ts) fails when the file is out of date, so
 * `node scripts/client-message-keys.mjs` is the fix for that failure.
 *
 *   node scripts/client-message-keys.mjs           write the file
 *   node scripts/client-message-keys.mjs --check   exit 1 if it is stale
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(SRC, 'i18n', 'client-message-keys.json')
const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (EXTS.includes(path.extname(e.name))) acc.push(p)
  }
  return acc
}

const isTest = (f) => /\.(test|spec)\.[tj]sx?$/.test(f) || f.includes(`${path.sep}test${path.sep}`)
const isAdmin = (f) => f.includes(`${path.sep}(admin)${path.sep}`)

function resolveImport(from, spec) {
  let base
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  const tries = [
    base,
    ...EXTS.map((x) => base + x),
    ...EXTS.map((x) => path.join(base, 'index' + x)),
  ]
  for (const t of tries) if (fs.existsSync(t) && fs.statSync(t).isFile()) return t
  return null
}

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g

export function collectClientKeys() {
  const files = walk(SRC).filter((f) => !isTest(f))
  const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))
  const roots = files.filter(
    (f) =>
      !isAdmin(f) &&
      /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(sources.get(f)),
  )
  // Transitive closure over the client graph.
  const seen = new Set()
  const stack = [...roots]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const m of sources.get(f).matchAll(IMPORT_RE)) {
      const r = resolveImport(f, m[1] ?? m[2] ?? m[3])
      if (r && sources.has(r) && !isAdmin(r)) stack.push(r)
    }
  }

  const all = new Set()
  for (const loc of ['en', 'ar', 'id']) {
    for (const k of Object.keys(
      JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${loc}.json`), 'utf8')),
    ))
      all.add(k)
  }
  const keys = [...all]
  const keep = new Set()
  const prefixes = new Set()
  const suffixes = new Set()
  const patterns = new Set()

  for (const f of seen) {
    const s = sources.get(f)
    // Plain string literals.
    for (const m of s.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
      const lit = m[1] ?? m[2]
      if (all.has(lit)) keep.add(lit)
      else if (lit.length >= 2 && /[_.-]$/.test(lit)) prefixes.add(lit)
      else if (lit.length >= 3 && /^[_.-]/.test(lit)) suffixes.add(lit)
    }
    // Template literals: the whole template becomes a pattern, each
    // `${...}` standing for any key fragment (`es_${kind}_t` -> ^es_.*_t$).
    for (const m of s.matchAll(/`([^`]*)`/g)) {
      const body = m[1]
      if (!body.includes('${')) {
        if (all.has(body)) keep.add(body)
        continue
      }
      const parts = body.split(/\$\{[^}]*\}/)
      // Nothing static to anchor on (`${key}`): the key comes from elsewhere.
      if (parts.join('').length < 2) continue
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      patterns.add(new RegExp('^' + parts.map(esc).join('[\\w.-]*') + '$'))
    }
  }
  // Server components sometimes hand a client component a key rather than a
  // string (`labelKey: 'nav_map'`, `messageKey="err_x"`). Those literals live
  // outside the client graph, so pick up any key assigned to a *Key / *key
  // prop or field anywhere outside the Studio.
  for (const f of files) {
    if (isAdmin(f) || seen.has(f)) continue
    for (const m of sources
      .get(f)
      .matchAll(/[kK]eys?\w*\??\s*[:=]\s*\{?\s*\[?\s*['"]([^'"\n]+)['"]/g))
      if (all.has(m[1])) keep.add(m[1])
  }
  for (const k of keys) {
    if (keep.has(k)) continue
    for (const p of prefixes) {
      if (p[0] === '\0' ? k.includes(p.slice(1)) : k.startsWith(p)) {
        keep.add(k)
        break
      }
    }
    if (keep.has(k)) continue
    for (const re of patterns)
      if (re.test(k)) {
        keep.add(k)
        break
      }
    if (keep.has(k)) continue
    for (const x of suffixes)
      if (k.endsWith(x)) {
        keep.add(k)
        break
      }
  }
  return { keys: [...keep].sort(), clientFiles: seen.size, total: all.size }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { keys, clientFiles, total } = collectClientKeys()
  // Prettier's own layout for a long array of strings, so format:check passes.
  const json = JSON.stringify(keys, null, 2) + '\n'
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
    if (cur !== json) {
      console.error(
        'src/i18n/client-message-keys.json is stale: run node scripts/client-message-keys.mjs',
      )
      process.exit(1)
    }
  } else fs.writeFileSync(OUT, json)
  console.log(`${keys.length}/${total} keys reachable from ${clientFiles} client modules`)
}
