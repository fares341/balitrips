import { describe, expect, it, vi } from 'vitest'

import { locales } from '@/i18n/config'

import {
  AUTOMATION_KEYS,
  AUTOMATIONS,
  messageLocale,
  renderText,
  templateValues,
} from './automations'
import { createMazbotProvider, mazbotTemplatePayload, resetMazbotToken } from './providers'
import type { ResolvedCredentials } from './settings'

const creds: ResolvedCredentials = {
  provider: 'mazbot',
  apiUrl: 'https://mazbot.example/api',
  apiKey: 'test-key',
  loginEmail: 'staff@example.com',
  password: 'pw',
  senderNumber: null,
  fromEnv: { apiUrl: false, apiKey: false, loginEmail: false, password: false },
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('automation catalogue', () => {
  it('has a default text in every language that uses only its own variables', () => {
    for (const key of AUTOMATION_KEYS) {
      for (const locale of locales) {
        const text = AUTOMATIONS[key].defaults[locale]
        expect(text.length).toBeGreaterThan(10)
        const used = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
        for (const name of used) expect(AUTOMATIONS[key].vars).toContain(name)
      }
    }
  })

  it('renders variables and keeps unknown ones visible', () => {
    expect(renderText('Hi {name} {x}', { name: 'Ahmed' })).toBe('Hi Ahmed {x}')
  })

  it('orders template values and never sends an empty one', () => {
    expect(templateValues('order_received', { name: 'A', order: '' })).toEqual(['A', '-', '-'])
  })

  it('falls back to English', () => {
    expect(messageLocale('ar')).toBe('ar')
    expect(messageLocale('fr')).toBe('en')
    expect(messageLocale(null)).toBe('en')
  })
})

describe('Mazbot provider', () => {
  it('builds 1-based template parameters', () => {
    expect(
      mazbotTemplatePayload({
        to: '62812',
        text: '',
        locale: 'en',
        template: '42',
        params: ['a', 'b'],
      }),
    ).toEqual({
      template_id: 42,
      mobile: '62812',
      body_matchs: { '1': 'input_value', '2': 'input_value' },
      body_values: { '1': 'a', '2': 'b' },
    })
  })

  it('logs in, sends with apikey + bearer, and treats success:false as a failure', async () => {
    resetMazbotToken()
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> })
      if (String(url).endsWith('/login')) return json({ data: { token: 'jwt-1' } })
      if (calls.length === 2) return json({ success: true, message_id: 9821 })
      return json({ success: false, message: 'insufficient_conversation_limit' })
    }) as unknown as typeof fetch
    const provider = createMazbotProvider(creds, fetchImpl)
    const message = { to: '62812', text: 'hi', locale: 'en' as const, template: '7', params: [] }
    expect(await provider.send(message)).toEqual({ ok: true, messageId: '9821' })
    expect(calls[1]?.url).toBe('https://mazbot.example/api/whatsapp/send-template')
    expect(calls[1]?.headers.apikey).toBe('test-key')
    expect(calls[1]?.headers.Authorization).toBe('Bearer jwt-1')
    const failed = await provider.send({ ...message, template: null })
    expect(failed).toEqual({
      ok: false,
      retryable: false,
      error: 'insufficient_conversation_limit',
    })
    expect(calls[2]?.url).toBe('https://mazbot.example/api/send-message')
  })
})
