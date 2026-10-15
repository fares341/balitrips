'use client'

/**
 * The website assistant's chat panel (loaded on first open).
 *
 * A floating panel on wide screens, a full-screen sheet on phones. Replies
 * stream in word by word and are rendered as markdown-lite (./reply.tsx).
 * Changes the assistant proposes — add to My Trip, send a custom request —
 * arrive as cards; nothing happens until the visitor presses Confirm, which
 * posts only the action's id (the server holds the exact change).
 */

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { whatsappLink } from '@/components/layout/contact-config'
import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { BUDGET_TIER_LABEL, type BudgetTier } from '@/lib/budget-tier'
import {
  postJson,
  sendMessage,
  type ActionCardData,
  type ClientEvent,
} from '@/lib/assistant/client-stream'

import { Reply } from './reply'

export type AssistantStatus =
  | { state: 'unknown' }
  | { state: 'loading' }
  | { state: 'off' }
  | { state: 'ok'; welcome: string | null }

type CardState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired'

interface Card extends ActionCardData {
  state: CardState
  href?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  cards: Card[]
  status: string | null
  error: string | null
  pending: boolean
}

const MAX = 1000

/** Message key for the "looking up…" line, per tool. */
const TOOL_STATUS: Record<string, string> = {
  search_site: 'ai_status_search',
  list_activities: 'ai_status_activities',
  get_activity: 'ai_status_activities',
  packages: 'ai_status_catalog',
  itineraries: 'ai_status_catalog',
  list_regions_categories: 'ai_status_catalog',
  driver_info: 'ai_status_catalog',
  search_places: 'ai_status_places',
  get_place: 'ai_status_places',
  site_info: 'ai_status_info',
  quote_activity: 'ai_status_price',
  propose_add_to_trip: 'ai_status_price',
  propose_custom_request: 'ai_status_info',
  my_trip: 'ai_status_trip',
  my_orders: 'ai_status_orders',
}

const ERROR_KEYS: Record<string, string> = {
  rate_limited: 'ai_err_rate',
  daily_cap: 'ai_err_daily',
  too_long: 'ai_err_long',
  unavailable: 'ai_err_unavailable',
}

/** Card rows, in display order, with their label keys. */
const FIELDS: Record<string, [string, string][]> = {
  add_to_trip: [
    ['activity', 'ai_f_activity'],
    ['package', 'ai_f_package'],
    ['date', 'ai_f_date'],
    ['time', 'ai_f_time'],
    ['people', 'ai_f_people'],
    ['addons', 'ai_f_addons'],
    ['driver', 'ai_f_driver'],
    ['total', 'ai_f_total'],
  ],
  custom_request: [
    ['name', 'ai_f_name'],
    ['email', 'ai_f_email'],
    ['phone', 'ai_f_phone'],
    ['dates', 'ai_f_dates'],
    ['travellers', 'ai_f_travellers'],
    ['theme', 'ai_f_theme'],
    ['budget', 'ai_f_budget'],
    ['interests', 'ai_f_interests'],
    ['areas', 'ai_f_areas'],
    ['driver', 'ai_f_driver'],
    ['notes', 'ai_f_notes'],
  ],
}

const THEME_KEYS: Record<string, string> = {
  family: 'ct_type_family',
  honey: 'ct_type_honey',
  youth: 'ct_type_youth',
  solo: 'ct_type_solo',
}

let seq = 0
const nextId = () => `m${Date.now().toString(36)}${(seq += 1)}`

export function AssistantPanel({
  open,
  status,
  onClose,
}: {
  open: boolean
  status: AssistantStatus
  onClose: () => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const conversation = useRef<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const origin = typeof window === 'undefined' ? null : window.location.origin
  const wa = whatsappLink(t('ai_human_wa'))

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  useEffect(() => () => abort.current?.abort(), [])

  const update = (id: string, change: (message: Message) => Message) =>
    setMessages((all) => all.map((message) => (message.id === id ? change(message) : message)))

  async function send(raw: string) {
    const text = raw.trim()
    if (text === '' || busy || status.state !== 'ok') return
    if (text.length > MAX) return
    const botId = nextId()
    setMessages((all) => [
      ...all,
      { id: nextId(), role: 'user', text, cards: [], status: null, error: null, pending: false },
      {
        id: botId,
        role: 'assistant',
        text: '',
        cards: [],
        status: null,
        error: null,
        pending: true,
      },
    ])
    setInput('')
    setBusy(true)
    const controller = new AbortController()
    abort.current = controller

    const onEvent = (event: ClientEvent) => {
      switch (event.t) {
        case 'meta':
        case 'done':
          conversation.current = event.conversationId
          break
        case 'delta':
          update(botId, (m) => ({ ...m, text: m.text + event.text, status: null }))
          break
        case 'tool':
          update(botId, (m) => ({ ...m, status: TOOL_STATUS[event.name] ?? 'ai_thinking' }))
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
      '/api/assistant',
      { message: text, conversationId: conversation.current, locale },
      onEvent,
      controller.signal,
    )
    update(botId, (m) => ({
      ...m,
      pending: false,
      status: null,
      error: failure !== null && failure !== 'aborted' ? failure : m.error,
    }))
    setBusy(false)
    inputRef.current?.focus()
  }

  async function decide(messageId: string, card: Card, decision: 'confirm' | 'cancel') {
    const setCard = (state: CardState, href?: string) =>
      update(messageId, (m) => ({
        ...m,
        cards: m.cards.map((c) => (c.id === card.id ? { ...c, state, href } : c)),
      }))
    setCard('running')
    const result = await postJson('/api/assistant/confirm', { actionId: card.id, decision, locale })
    if (decision === 'cancel') return setCard('cancelled')
    if (result.ok === true) {
      if (card.kind === 'add_to_trip') window.dispatchEvent(new Event(CART_CHANGED_EVENT))
      return setCard('done', typeof result.href === 'string' ? result.href : undefined)
    }
    setCard(result.error === 'expired' ? 'expired' : 'failed')
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

  function value(key: string, raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null
    if (typeof raw === 'boolean') return raw ? t('ai_yes') : t('ai_no')
    if (Array.isArray(raw))
      return raw.length === 0 ? null : raw.map(String).join(locale === 'ar' ? '، ' : ', ')
    if (key === 'theme' && typeof raw === 'string' && THEME_KEYS[raw]) return t(THEME_KEYS[raw])
    if (key === 'budget' && typeof raw === 'string' && raw in BUDGET_TIER_LABEL) {
      return t(BUDGET_TIER_LABEL[raw as BudgetTier])
    }
    return String(raw)
  }

  const chips = ['ai_chip_1', 'ai_chip_2', 'ai_chip_3', 'ai_chip_4'].map((key) => t(key))
  const showChips = status.state === 'ok' && messages.length === 0

  return (
    <section
      className="ai-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-title"
      hidden={!open}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="ai-head">
        <span className="ai-avatar" aria-hidden="true">
          <Icon name="sparkle" size={18} />
        </span>
        <div className="ai-head-text">
          <h2 id="ai-title">{t('ai_title')}</h2>
          <p>{t('ai_subtitle')}</p>
        </div>
        <button type="button" className="ai-close" onClick={onClose} aria-label={t('ai_close')}>
          <Icon name="cross" size={18} />
        </button>
      </header>

      <div className="ai-body" ref={listRef} aria-live="polite" aria-busy={busy}>
        {status.state === 'loading' || status.state === 'unknown' ? (
          <div className="ai-msg ai-bot">
            <div className="ai-bubble ai-typing" aria-label={t('ai_thinking')}>
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : status.state === 'off' ? (
          <div className="ai-off">
            <Icon name="chat" size={28} />
            <h3>{t('ai_unavailable_t')}</h3>
            <p>{t('ai_unavailable_p')}</p>
          </div>
        ) : (
          <>
            <div className="ai-msg ai-bot">
              <div className="ai-bubble">
                <p>{status.welcome ?? t('ai_welcome')}</p>
              </div>
            </div>
            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="ai-msg ai-user">
                  <span className="sr-only">{t('ai_you')}: </span>
                  <div className="ai-bubble" dir="auto">
                    {message.text}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="ai-msg ai-bot">
                  <span className="sr-only">{t('ai_bot')}: </span>
                  {message.text !== '' ? (
                    <div className="ai-bubble" dir="auto">
                      <Reply text={message.text} origin={origin} onNavigate={onClose} />
                    </div>
                  ) : null}
                  {message.pending && message.text === '' ? (
                    <div className="ai-bubble ai-typing" aria-label={t('ai_thinking')}>
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                  {message.status ? <p className="ai-status">{t(message.status)}</p> : null}
                  {message.cards.map((card) => (
                    <ActionCard
                      key={card.id}
                      card={card}
                      title={t(card.kind === 'add_to_trip' ? 'ai_card_add_t' : 'ai_card_custom_t')}
                      rows={(FIELDS[card.kind] ?? [])
                        .map(([key, label]) => [t(label), value(key, card.summary[key])] as const)
                        .filter((row): row is readonly [string, string] => row[1] !== null)}
                      onDecide={(decision) => void decide(message.id, card, decision)}
                      onNavigate={onClose}
                    />
                  ))}
                  {message.error ? (
                    <p className="ai-error" role="alert">
                      {t(ERROR_KEYS[message.error] ?? 'ai_err_generic')}
                    </p>
                  ) : null}
                </div>
              ),
            )}
          </>
        )}
      </div>

      {showChips ? (
        <div className="ai-chips" role="group" aria-label={t('ai_chips_label')}>
          {chips.map((chip) => (
            <button key={chip} type="button" className="ai-chip" onClick={() => void send(chip)}>
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <footer className="ai-foot">
        {status.state === 'ok' ? (
          <form className="ai-form" onSubmit={onSubmit}>
            <label htmlFor="ai-input" className="sr-only">
              {t('ai_placeholder')}
            </label>
            <textarea
              id="ai-input"
              ref={inputRef}
              rows={1}
              maxLength={MAX}
              dir="auto"
              value={input}
              placeholder={t('ai_placeholder')}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="submit"
              className="ai-send"
              disabled={busy || input.trim() === ''}
              aria-label={t('ai_send')}
            >
              <Icon name="arrow" size={18} className="flip" />
            </button>
          </form>
        ) : null}
        {input.length > MAX - 200 ? (
          <p className="ai-count" dir="ltr">
            {input.length}/{MAX}
          </p>
        ) : null}
        <div className="ai-foot-row">
          {wa !== null ? (
            <a className="ai-human" href={wa} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={16} />
              {t('ai_human')}
            </a>
          ) : (
            <Link className="ai-human" href="/contact" onClick={onClose}>
              <Icon name="chat" size={16} />
              {t('ai_human')}
            </Link>
          )}
          <span className="ai-note">{t('ai_disclaimer')}</span>
        </div>
      </footer>
    </section>
  )
}

function ActionCard({
  card,
  title,
  rows,
  onDecide,
  onNavigate,
}: {
  card: Card
  title: string
  rows: (readonly [string, string])[]
  onDecide: (decision: 'confirm' | 'cancel') => void
  onNavigate: () => void
}) {
  const t = useTranslations()
  const activityHref = typeof card.summary.href === 'string' ? card.summary.href : null
  return (
    <div className={`ai-card is-${card.state}`}>
      <p className="ai-card-t">{title}</p>
      <dl>
        {rows.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd dir="auto">{text}</dd>
          </div>
        ))}
      </dl>
      {card.state === 'pending' || card.state === 'running' ? (
        <div className="ai-card-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={card.state === 'running'}
            onClick={() => onDecide('confirm')}
          >
            {card.state === 'running' ? t('ai_working') : t('ai_confirm')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={card.state === 'running'}
            onClick={() => onDecide('cancel')}
          >
            {t('ai_cancel')}
          </button>
        </div>
      ) : null}
      {card.state === 'done' ? (
        <p className="ai-card-done" role="status">
          <Icon name="check" size={16} />
          {card.kind === 'add_to_trip' ? t('ai_done_added') : t('ai_done_sent')}{' '}
          {card.kind === 'add_to_trip' ? (
            <Link href="/my-trip" onClick={onNavigate}>
              {t('ai_view_trip')}
            </Link>
          ) : null}
        </p>
      ) : null}
      {card.state === 'cancelled' ? <p className="ai-card-note">{t('ai_cancelled')}</p> : null}
      {card.state === 'expired' ? <p className="ai-card-note">{t('ai_expired')}</p> : null}
      {card.state === 'failed' ? (
        <p className="ai-card-note is-err" role="alert">
          {card.kind === 'add_to_trip' ? t('ai_failed') : t('ai_failed_custom')}{' '}
          {card.kind === 'add_to_trip' && activityHref ? (
            <Link href={activityHref} onClick={onNavigate}>
              {t('ai_open_activity')}
            </Link>
          ) : card.kind === 'custom_request' ? (
            <Link href="/custom" onClick={onNavigate}>
              {t('ai_open_custom')}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
