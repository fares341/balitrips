/**
 * Assistant configuration: the environment (secrets, endpoints) merged with
 * Studio settings (switches, models, caps).
 *
 * SERVER ONLY. `OPENROUTER_API_KEY` is read here, per call — never at module
 * scope (Next evaluates module scope at build time and would bake the value
 * into the image) and never under a `NEXT_PUBLIC_` name. Nothing in this file
 * is ever returned to a browser; the status endpoint reports only booleans.
 */

import { readSetting, type AssistantSetting } from '@/app/(admin)/_lib/settings'

/** Shipped defaults (2026-10): fast, cheap, tool-capable. */
export const DEFAULT_MODEL = 'google/gemini-2.5-flash'
export const DEFAULT_FALLBACK_MODEL = 'openai/gpt-6-luna'
export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

export interface AssistantRuntime {
  apiKey: string
  baseUrl: string
  models: [string, string]
  settings: AssistantSetting
  siteUrl: string
}

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

/** True when a key is configured. Says nothing else about it. */
export function hasApiKey(): boolean {
  return env('OPENROUTER_API_KEY') !== ''
}

/**
 * The base URL. Overridable ONLY for tests (the CI mock server); anything
 * that is not https is refused unless it points at this machine, so a
 * mistyped env value cannot send the key to a plain-http host.
 */
export function baseUrl(): string {
  const raw = env('OPENROUTER_BASE_URL')
  if (raw === '') return DEFAULT_BASE_URL
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) {
      return raw.replace(/\/+$/, '')
    }
  } catch {
    // fall through
  }
  console.warn('[assistant] OPENROUTER_BASE_URL ignored (must be https or localhost)')
  return DEFAULT_BASE_URL
}

export function modelsFor(
  settings: Pick<AssistantSetting, 'model' | 'fallbackModel'>,
): [string, string] {
  const primary = settings.model || env('OPENROUTER_MODEL') || DEFAULT_MODEL
  const fallback =
    settings.fallbackModel || env('OPENROUTER_FALLBACK_MODEL') || DEFAULT_FALLBACK_MODEL
  return [primary, fallback]
}

export type Availability = 'ok' | 'no_key' | 'disabled'

/**
 * Everything a request needs, or why the assistant is unavailable. Reading
 * settings never throws (a bad row falls back to the default).
 */
export async function loadRuntime(
  kind: 'public' | 'studio',
): Promise<{ status: Availability; runtime: AssistantRuntime | null; settings: AssistantSetting }> {
  const settings = await readSetting('assistant')
  const enabled = kind === 'public' ? settings.publicEnabled : settings.studioEnabled
  if (!hasApiKey()) return { status: 'no_key', runtime: null, settings }
  if (!enabled || settings.dailyBudgetUsd <= 0)
    return { status: 'disabled', runtime: null, settings }
  return {
    status: 'ok',
    settings,
    runtime: {
      apiKey: env('OPENROUTER_API_KEY'),
      baseUrl: baseUrl(),
      models: modelsFor(settings),
      settings,
      siteUrl: env('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000',
    },
  }
}
