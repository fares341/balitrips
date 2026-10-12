/**
 * Run the production build locally.
 *
 * `output: 'standalone'` emits a self-contained server that deliberately
 * does NOT include `.next/static` or `public/` — Next expects the deploy
 * step to place them. Our Dockerfile does exactly that; running the built
 * output by hand does not, so without this the server boots, every page
 * returns 200, and every stylesheet, script and image 404s. The site renders
 * as unstyled HTML, which looks like a CSS bug rather than a packaging one.
 *
 * Usage: node scripts/serve-standalone.mjs [port]
 */

import { cpSync, existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const standalone = resolve(root, '.next/standalone')

if (!existsSync(resolve(standalone, 'server.js'))) {
  console.error('\n  No standalone build found. Run `pnpm build` first.\n')
  process.exit(1)
}

// Assets Next leaves for the deploy step.
cpSync(resolve(root, '.next/static'), resolve(standalone, '.next/static'), { recursive: true })
if (existsSync(resolve(root, 'public'))) {
  cpSync(resolve(root, 'public'), resolve(standalone, 'public'), { recursive: true })
}
console.log('  copied .next/static and public into the standalone bundle')

// The standalone server does not read .env files — Next only loads them in
// `next dev` and `next build`. Without this it boots with no DATABASE_URL
// and every dynamic route 500s.
const env = { ...process.env, PORT: process.argv[2] ?? '3000' }
const envFile = resolve(root, '.env.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  console.log('  loaded .env.local')
}

spawn(process.execPath, [resolve(standalone, 'server.js')], { stdio: 'inherit', env })
