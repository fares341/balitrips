// CI-only stand-in for Places API (New) (full-test workflow): no network, no key.
// GOOGLE_PLACES_API_BASE=http://127.0.0.1:4010/v1 points the site here.
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_GOOGLE_PORT || 4010)
// 2x2 PNG (green).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkaGBgYGBiYGBgYGBgAAAJbQEBKWbF2wAAAABJRU5ErkJggg==',
  'base64',
)

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  const json = (body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname.startsWith('/img/')) {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
    return res.end(PNG)
  }
  let m = /^\/v1\/places\/([^/]+)\/photos\/([^/]+)\/media$/.exec(url.pathname)
  if (m)
    return json({
      name: `places/${m[1]}/photos/${m[2]}`,
      photoUri: `http://127.0.0.1:${PORT}/img/${m[2]}.png`,
    })
  m = /^\/v1\/places\/([^/]+)$/.exec(url.pathname)
  if (m && req.method === 'GET') {
    return json({
      photos: [1, 2, 3].map((n) => ({
        name: `places/${m[1]}/photos/mock${n}`,
        widthPx: 800,
        heightPx: 600,
        authorAttributions: [
          { displayName: `Mock Author ${n}`, uri: 'https://maps.google.com/maps/contrib/mock' },
        ],
        googleMapsUri: 'https://www.google.com/maps/place/mock',
      })),
    })
  }
  if (url.pathname === '/v1/places:searchText') return json({ places: [] })
  json({ error: 'not_found' }, 404)
}).listen(PORT, '127.0.0.1', () => console.log(`mock google places on ${PORT}`))
