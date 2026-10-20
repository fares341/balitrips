'use client'

/**
 * The Studio assistant chat. Streams replies; proposed changes arrive as
 * confirmation cards showing the exact change, and only a Confirm click runs
 * them (server side, with this staff member's own session and capabilities).
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import {
  postJson,
  sendMessage,
  type ActionCardData,
  type ClientEvent,
} from '@/lib/assistant/client-stream'
import { parseReply, type Inline } from '@/lib/assistant/links'

import { useAdminT } from '../../_ui/i18n-provider'
import { Icon } from '../../_ui/icons'

type CardState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired' | 'forbidden'

interface Card extends ActionCardData {
  state: CardState
  message?: string
  href?: string | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  cards: Card[]
  tool: string | null
  error: string | null
  pending: boolean
}

const ERRORS: Record<string, string> = {
  rate_limited: 'assistant.err_rate',
  unavailable: 'assistant.err_unavailable',
  two_factor_required: 'assistant.err_two_factor',
}

let seq = 0
const nextId = () => `s${Date.now().toString(36)}${(seq += 1)}`

function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'bold' ? (
          <strong key={index}>{part.text}</strong>
        ) : part.type === 'link' ? (
          part.external ? (
            <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow">
              {part.text}
            </a>
          ) : (
            <Link key={index} href={part.href}>
              {part.text}
            </Link>
          )
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

function StudioReply({ text }: { text: string }) {
  const origin = typeof window === 'undefined' ? null : window.location.origin
  const blocks = useMemo(() => parseReply(text, origin), [text, origin])
  return (
    <div className="a-ai-reply">
      {blocks.map((block, index) =>
        block.type === 'p' ? (
          <p key={index}>
            <Parts parts={block.parts} />
          </p>
        ) : block.type === 'ul' ? (
          <ul key={index}>
            {block.items.map((item, i) => (
              <li key={i}>
                <Parts parts={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={index}>
            {block.items.map((item, i) => (
              <li key={i}>
                <Parts parts={item} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  )
}

export function StudioChat() {
  const { t } = useAdminT()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<string | null>(null)
  const conversation = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const update = (id: string, change: (m: Message) => Message) =>
    setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)))

  async function send(raw: string) {
    const text = raw.trim()
    if (text === '' || busy || text.length > 1000) return
    const botId = nextId()
    setMessages((all) => [
      ...all,
      { id: nextId(), role: 'user', text, cards: [], tool: null, error: null, pending: false },
      { id: botId, role: 'assistant', text: '', cards: [], tool: null, error: null, pending: true },
    ])
    setInput('')
    setBusy(true)
    const onEvent = (event: ClientEvent) => {
      switch (event.t) {
        case 'meta':
        case 'done':
          conversation.current = event.conversationId
          break
        case 'delta':
          update(botId, (m) => ({ ...m, text: m.text + event.text, tool: null }))
          break
        case 'tool':
          update(botId, (m) => ({ ...m, tool: event.name }))
          break
        case 'action':
          update(botId, (m) => ({
            ...m,
            cards: [...m.cards, { ...event.action, state: 'pending' }],
          }))
          break
        case 'error':
          update(botId, (m) => ({ ...m, error: event.code }))
          break
      }
    }
    const failure = await sendMessage(
      '/api/studio-assistant',
      { message: text, conversationId: conversation.current },
      onEvent,
    )
    update(botId, (m) => ({ ...m, pending: false, tool: null, error: failure ?? m.error }))
    setBusy(false)
    inputRef.current?.focus()
  }

  async function decide(messageId: string, card: Card, decision: 'confirm' | 'cancel') {
    const setCard = (patch: Partial<Card>) =>
      update(messageId, (m) => ({
        ...m,
        cards: m.cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)),
      }))
    setCard({ state: 'running' })
    const result = await postJson('/api/studio-assistant/confirm', { actionId: card.id, decision })
    if (decision === 'cancel') return setCard({ state: 'cancelled' })
    const message = typeof result.message === 'string' ? result.message : undefined
    const href = typeof result.href === 'string' ? result.href : null
    if (result.ok === true) return setCard({ state: 'done', message, href })
    if (result.error === 'expired') return setCard({ state: 'expired' })
    if (result.error === 'forbidden' || message === 'forbidden')
      return setCard({ state: 'forbidden' })
    // Codes from the server become plain sentences; Studio messages pass through.
    const reason =
      message === 'two_factor_required'
        ? t('assistant.err_two_factor')
        : message === undefined || message === 'error'
          ? t('assistant.err_generic')
          : message
    setCard({ state: 'failed', message: reason })
  }

  /**
   * "My current location": asked from the browser only on this click, and
   * sent as an ordinary message the staff member can see in the chat.
   */
  function sendMyLocation() {
    if (busy || locating) return
    setLocationNote(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNote(t('assistant.my_location_failed'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const { latitude, longitude, accuracy } = position.coords
        void send(
          t('assistant.my_location_msg', {
            lat: latitude.toFixed(6),
            lon: longitude.toFixed(6),
            meters: Math.max(1, Math.round(accuracy)),
          }),
        )
      },
      (error) => {
        setLocating(false)
        setLocationNote(
          t(
            error.code === error.PERMISSION_DENIED
              ? 'assistant.my_location_denied'
              : 'assistant.my_location_failed',
          ),
        )
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    )
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void send(input)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(input)
    }
  }

  const label = (key: string) => {
    const k = `assistant.f_${key}`
    const text = t(k)
    return text === k ? key : text
  }
  const show = (key: string, value: unknown) =>
    key === 'status' &&
    typeof value === 'string' &&
    t(`assistant.v_${value}`) !== `assistant.v_${value}`
      ? t(`assistant.v_${value}`)
      : typeof value === 'boolean'
        ? t(value ? 'assistant.yes' : 'assistant.no')
        : Array.isArray(value)
          ? value.join(', ')
          : String(value)

  const chips = [
    'assistant.chip_orders',
    'assistant.chip_bookings',
    'assistant.chip_leads',
    'assistant.chip_stats',
    'assistant.chip_place',
  ]

  return (
    <section className="a-card a-ai" aria-label={t('assistant.title')}>
      <div className="a-ai-log" ref={listRef} aria-live="polite" aria-busy={busy}>
        <div className="a-ai-msg is-bot">
          <div className="a-ai-bubble">{t('assistant.welcome')}</div>
        </div>
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="a-ai-msg is-user">
              <span className="a-sr">{t('assistant.you')}: </span>
              <div className="a-ai-bubble" dir="auto">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="a-ai-msg is-bot">
              <span className="a-sr">{t('assistant.bot')}: </span>
              {m.text !== '' ? (
                <div className="a-ai-bubble" dir="auto">
                  <StudioReply text={m.text} />
                </div>
              ) : m.pending ? (
                <div className="a-ai-bubble a-muted">{t('assistant.thinking')}</div>
              ) : null}
              {m.tool ? <p className="a-ai-tool a-muted">{t('assistant.looking_up')}</p> : null}
              {m.cards.map((card) => (
                <div key={card.id} className={`a-ai-card is-${card.state}`}>
                  <p className="a-ai-card-t">{t('assistant.card_title')}</p>
                  <dl>
                    {Object.entries(card.summary)
                      .filter(
                        ([key, value]) =>
                          key !== 'warnings' &&
                          value !== null &&
                          value !== undefined &&
                          value !== '',
                      )
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{label(key)}</dt>
                          <dd dir="auto">{show(key, value)}</dd>
                        </div>
                      ))}
                  </dl>
                  {Array.isArray(card.summary.warnings) && card.summary.warnings.length > 0 ? (
                    <div className="a-ai-warn" role="note">
                      <p>
                        <Icon name="alert" size={16} /> {t('assistant.f_warnings')}
                      </p>
                      <ul>
                        {card.summary.warnings.map((code) => (
                          <li key={String(code)}>{t(`assistant.w_${String(code)}`)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {card.state === 'pending' || card.state === 'running' ? (
                    <div className="a-row">
                      <button
                        type="button"
                        className="a-btn accent small"
                        disabled={card.state === 'running'}
                        onClick={() => void decide(m.id, card, 'confirm')}
                      >
                        {card.state === 'running' ? t('assistant.working') : t('assistant.confirm')}
                      </button>
                      <button
                        type="button"
                        className="a-btn ghost small"
                        disabled={card.state === 'running'}
                        onClick={() => void decide(m.id, card, 'cancel')}
                      >
                        {t('assistant.cancel')}
                      </button>
                    </div>
                  ) : null}
                  {card.state === 'done' ? (
                    <p className="a-ai-ok" role="status">
                      {card.message && card.message !== 'done' ? card.message : t('assistant.done')}{' '}
                      {card.href ? (
                        <Link href={card.href}>{t('assistant.open_result')}</Link>
                      ) : null}
                    </p>
                  ) : null}
                  {card.state === 'cancelled' ? (
                    <p className="a-muted">{t('assistant.cancelled')}</p>
                  ) : null}
                  {card.state === 'expired' ? (
                    <p className="a-muted">{t('assistant.expired')}</p>
                  ) : null}
                  {card.state === 'forbidden' ? (
                    <p className="a-ai-err" role="alert">
                      {t('assistant.forbidden')}
                    </p>
                  ) : null}
                  {card.state === 'failed' ? (
                    <p className="a-ai-err" role="alert">
                      {t('assistant.failed', { reason: card.message ?? '' })}
                    </p>
                  ) : null}
                </div>
              ))}
              {m.error ? (
                <p className="a-ai-err" role="alert">
                  {t(ERRORS[m.error] ?? 'assistant.err_generic')}
                </p>
              ) : null}
            </div>
          ),
        )}
      </div>

      {messages.length === 0 ? (
        <div className="a-ai-chips">
          {chips.map((key) => (
            <button
              key={key}
              type="button"
              className="a-btn ghost small"
              onClick={() => void send(t(key))}
            >
              {t(key)}
            </button>
          ))}
        </div>
      ) : null}

      <form className="a-ai-form" onSubmit={onSubmit}>
        <label htmlFor="a-ai-input" className="a-sr">
          {t('assistant.input_label')}
        </label>
        <textarea
          id="a-ai-input"
          ref={inputRef}
          className="a-textarea"
          rows={2}
          maxLength={1000}
          dir="auto"
          value={input}
          placeholder={t('assistant.placeholder')}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="a-ai-form-actions">
          <button
            type="button"
            className="a-btn ghost"
            title={t('assistant.my_location_title')}
            disabled={busy || locating}
            onClick={sendMyLocation}
          >
            <Icon name="pin" size={18} />
            <span>{locating ? t('assistant.my_location_busy') : t('assistant.my_location')}</span>
          </button>
          <button type="submit" className="a-btn" disabled={busy || input.trim() === ''}>
            <Icon name="send" size={18} />
            <span>{t('assistant.send')}</span>
          </button>
        </div>
      </form>
      {locationNote ? (
        <p className="a-ai-err" role="alert">
          {locationNote}
        </p>
      ) : null}
    </section>
  )
}
