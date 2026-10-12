/**
 * Environment for a standalone process.
 *
 * Next reads `.env.local` during `next dev` and `next build`. Nothing reads it
 * for `tsx src/worker/index.ts` — the worker is a plain Node process — so it
 * would boot with no `DATABASE_URL` and die on the first query with an error
 * that says nothing about the actual problem.
 *
 * IMPORT ORDER MATTERS. This module performs the load as an import side
 * effect, and `src/worker/index.ts` imports it FIRST. ES modules are evaluated
 * in declaration order, so a top-level `loadEnvFiles()` call placed after the
 * other imports would run too late: `@/db` throws at module scope when
 * `DATABASE_URL` is unset, and that happens while its import is being
 * evaluated, before any statement in the entry file runs.
 *
 * Existing variables always win. On the droplet the real values arrive from
 * systemd or a compose `env_file`, and a stale `.env` copied into the image
 * must never be able to override them.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Checked in order; the first file to define a key wins, then the shell. */
const CANDIDATES = ['.env.local', '.env'] as const

function parse(contents: string): Map<string, string> {
  const out = new Map<string, string>()

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line
    const eq = withoutExport.indexOf('=')
    if (eq <= 0) continue

    const key = withoutExport.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = withoutExport.slice(eq + 1).trim()

    // Quoted values keep their inner whitespace and may contain a '#'.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    } else {
      const comment = value.indexOf(' #')
      if (comment !== -1) value = value.slice(0, comment).trim()
    }

    out.set(key, value)
  }

  return out
}

/** Returns the files that were actually read, for the startup log. */
export function loadEnvFiles(cwd: string = process.cwd()): string[] {
  const loaded: string[] = []

  for (const candidate of CANDIDATES) {
    const path = resolve(cwd, candidate)
    if (!existsSync(path)) continue

    try {
      for (const [key, value] of parse(readFileSync(path, 'utf8'))) {
        if (process.env[key] === undefined) process.env[key] = value
      }
      loaded.push(candidate)
    } catch (error) {
      console.warn(`[worker] could not read ${candidate}:`, error)
    }
  }

  return loaded
}

export const LOADED_ENV_FILES = loadEnvFiles()
