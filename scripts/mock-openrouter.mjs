// A tiny stand-in for OpenRouter, for CI only (.github/workflows/assistant-check.yml).
//
// The app is started with OPENROUTER_BASE_URL=http://127.0.0.1:4011/api/v1 and a
// dummy key; this server answers /chat/completions with scripted, STREAMED (SSE)
// replies: text in small pieces, tool calls whose arguments are split across
// chunks, keep-alive comments and a final usage chunk with a cost — the same
// shapes the real API sends. The script is chosen from keywords in the latest
// user message, and the step from the tool results already in the request.
//
// Every request is appended to $MOCK_LOG (JSON lines) so the check script can
// assert what the model was shown (e.g. that locked places never reach it),
// and any contract violation (missing key, data collection not denied, no
// fallback model) is recorded in $MOCK_VIOLATIONS.
import { appendFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'

const PORT = Number(process.env.MOCK_PORT ?? 4011)
const LOG = process.env.MOCK_LOG ?? 'assistant-check/mock-requests.jsonl'
const VIOLATIONS = process.env.MOCK_VIOLATIONS ?? 'assistant-check/mock-violations.txt'
mkdirSync(dirname(LOG), { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lower = (s) => (typeof s === 'string' ? s.toLowerCase() : '')

function plusDays(days) {
  return new Date(Date.now() + 8 * 3600_000 + days * 86400_000).toISOString().slice(0, 10)
}

/** The current turn: the latest user message and the tool results after it. */
function turn(messages) {
  let last = -1
  messages.forEach((m, i) => {
    if (m.role === 'user') last = i
  })
  const user = last >= 0 ? String(messages[last].content) : ''
  const results = []
  for (const m of messages.slice(last + 1)) {
    if (m.role === 'tool') {
      let data = null
      try {
        data = JSON.parse(m.content)
      } catch {
        data = { raw: m.content }
      }
      results.push(data)
    }
  }
  const system = String(messages.find((m) => m.role === 'system')?.content ?? '')
  return { user: lower(user), results, studio: system.includes('Studio assistant') }
}

const call = (name, args) => ({ type: 'tool', name, args })
const say = (text) => ({ type: 'text', text })

/** Decide the next move. */
function script({ user, results, studio }) {
  const step = results.length
  const last = results[step - 1] ?? null

  if (studio) {
    // Add a map place from a location: find_location → propose_place_draft.
    if (
      user.includes('map place') ||
      user.includes('current location') ||
      user.includes('موقعي الحالي') ||
      user.includes('مكاناً على الخريطة')
    ) {
      if (step === 0) return call('find_location', { text: user })
      if (step === 1) {
        if (!last?.found) {
          const names = (last?.choices ?? []).map((c) => c.name).join(', ')
          return say(
            names ? `Which one do you mean: ${names}?` : String(last?.ask ?? 'Where is it?'),
          )
        }
        return call('propose_place_draft', {
          nameEn: 'CI Check Cafe',
          nameAr: 'مقهى الفحص',
          lat: last.lat,
          lon: last.lon,
          ...(last.categories?.[0] ? { categoryKey: last.categories[0].key } : {}),
          descriptionEn: 'A test place added by the assistant check.',
          descriptionAr: 'مكان تجريبي أضافه فحص المساعد.',
        })
      }
      if (!last?.proposed) return say(`I could not prepare it: ${JSON.stringify(last)}`)
      const warnings = last.shown?.warnings ?? []
      return say(
        `I prepared **${last.shown?.place}** as a draft at ${last.shown?.coordinates}.` +
          (warnings.length ? ` Please check: ${warnings.join(', ')}.` : '') +
          ' Press **Confirm** to add it.',
      )
    }
    if (user.includes('unpublish')) {
      if (step === 0)
        return call('list_content', { type: 'activity', status: 'published', limit: 1 })
      if (step === 1) {
        const item = last?.items?.[0]
        if (!item) return say('I found no published activity to unpublish.')
        return call('propose_publish', { type: 'activity', id: item.id, publish: false })
      }
      return say(
        last?.proposed
          ? `I prepared the change for **${Object.values(last.shown ?? {})[0]}**. Press **Confirm** to unpublish it.`
          : `I could not prepare it: ${JSON.stringify(last)}`,
      )
    }
    if (user.includes('order')) {
      if (step === 0) return call('list_orders', { range: 'today' })
      const n = last?.count ?? 0
      return say(`There are **${n}** orders today.${n === 0 ? ' Nothing is waiting.' : ''}`)
    }
    if (step === 0) return call('dashboard_stats', {})
    return say(`Summary: ${JSON.stringify(last).slice(0, 300)}`)
  }

  if (user.includes('hidden') || user.includes('place')) {
    if (step === 0) return call('search_places', {})
    const names = (last?.places ?? []).map((p) => p.name)
    return say(
      `I can show you **${names.length}** places: ${names.join(', ') || '—'}. ` +
        `${last?.lockedCount ?? 0} more are locked — see [the map plans](/plans).`,
    )
  }

  if (user.includes('trip') && user.includes('add')) {
    if (step === 0) return call('list_activities', { limit: 1, sort: 'price' })
    if (step === 1) {
      const a = last?.activities?.[0]
      if (!a) return say('No activities are listed yet.')
      return call('get_activity', { slug: a.slug })
    }
    if (step === 2) {
      const a = last
      if (!a?.found) return say('That activity is not available.')
      const pkg = (a.packages ?? []).find((p) => p.available)
      const args = { activitySlug: a.slug, date: plusDays(21), people: 2 }
      if (pkg) args.packageId = pkg.id
      if (Array.isArray(a.timeSlots) && a.timeSlots.length > 0) args.time = a.timeSlots[0]
      if (a.multiDay) args.endDate = plusDays(22)
      return call('propose_add_to_trip', args)
    }
    return say(
      last?.proposed
        ? `Ready: **${last.shownToVisitor.activity}** for ${last.shownToVisitor.people} people on ${last.shownToVisitor.date}, total **${last.shownToVisitor.total}**. Press **Confirm** to add it to My Trip.`
        : `That booking is not possible: ${(last?.problems ?? []).join(', ')}`,
    )
  }

  if (user.includes('my trip') || user.includes('رحلتي')) {
    if (step === 0) return call('my_trip', {})
    return say(
      last?.empty
        ? 'Your trip is empty.'
        : `Your trip total is **${last.total}** — [open My Trip](/my-trip).`,
    )
  }

  if (user.includes('activit') || user.includes('نشاط')) {
    if (step === 0) return call('list_activities', { limit: 3, sort: 'top' })
    const list = last?.activities ?? []
    const lines = list.map((a) => `- [${a.name}](${a.href}) — from ${a.priceFrom}`).join('\n')
    // The last line deliberately carries a script link and raw HTML: the panel
    // must show the label and the tags as plain text, never a link or markup.
    return say(
      `Here are some favourites:\n\n${lines}\n\nAlso see [this](javascript:alert(1)) and <b>bold?</b> and [Ubud on the map](https://www.google.com/maps/search/?api=1&query=-8.5069,115.2625).`,
    )
  }

  if (user.includes('ignore') || user.includes('system prompt')) {
    return say('I can only help with Bali trips on this site.')
  }

  return say('I can help with activities, packages, places and your trip in Bali.')
}

function sseChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

async function stream(res, move, model) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(': OPENROUTER PROCESSING\n\n')
  const base = { id: 'gen-mock', model, object: 'chat.completion.chunk' }
  if (move.type === 'text') {
    const pieces = move.text.match(/.{1,12}/gs) ?? ['']
    for (const piece of pieces) {
      sseChunk(res, { ...base, choices: [{ index: 0, delta: { content: piece } }] })
      await sleep(15)
    }
    sseChunk(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
  } else {
    const args = JSON.stringify(move.args)
    const cut = Math.ceil(args.length / 2)
    sseChunk(res, {
      ...base,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: `call_${Date.now()}`,
                type: 'function',
                function: { name: move.name, arguments: args.slice(0, cut) },
              },
            ],
          },
        },
      ],
    })
    await sleep(15)
    sseChunk(res, {
      ...base,
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(cut) } }] },
        },
      ],
    })
    sseChunk(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
  }
  sseChunk(res, {
    ...base,
    choices: [],
    usage: { prompt_tokens: 1800, completion_tokens: 60, cost: 0.0000786 },
  })
  res.write('data: [DONE]\n\n')
  res.end()
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
    res.writeHead(404).end()
    return
  }
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', async () => {
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      res.writeHead(400).end('bad json')
      return
    }
    const problems = []
    if (req.headers.authorization !== 'Bearer mock-key') problems.push('authorization header')
    if (!req.headers['http-referer'] || req.headers['x-title'] !== 'Bali Trips')
      problems.push('attribution headers')
    if (body.provider?.data_collection !== 'deny') problems.push('data_collection not denied')
    if (!Array.isArray(body.models) || body.models.length !== 2)
      problems.push('models [primary, fallback]')
    if (typeof body.max_tokens !== 'number') problems.push('max_tokens')
    if (body.stream !== true) problems.push('stream')
    if (problems.length > 0) appendFileSync(VIOLATIONS, `${problems.join(', ')}\n`)

    const t = turn(body.messages ?? [])
    const move = body.tool_choice === 'none' ? say('Done.') : script(t)
    appendFileSync(
      LOG,
      `${JSON.stringify({
        at: new Date().toISOString(),
        studio: t.studio,
        user: t.user,
        tools: (body.tools ?? []).map((tool) => tool.function?.name),
        toolResults: t.results,
        move,
      })}\n`,
    )
    await stream(res, move, body.models?.[0] ?? 'mock/model')
  })
})
server.listen(PORT, '127.0.0.1', () => console.log(`mock OpenRouter on http://127.0.0.1:${PORT}`))
