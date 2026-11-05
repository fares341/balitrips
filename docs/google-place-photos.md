# Google place photos

About 600 map places need photos. Instead of uploading them by hand, a place
can be matched to its Google Maps place and show that place's real Google
photos, fetched live from **Places API (New)**.

## How it works

- `map_places.google_place_id` + `google_match_status`
  (`none | auto | confirmed | review | rejected`), `google_match_score`,
  `google_checked_at` — migration `0040_google_place_photos.sql` (guarded,
  additive). `google_api_usage` keeps daily request counters.
- **Match with Google** (Studio → Places → *Match with Google*, or
  `tsx --conditions=react-server scripts/google-match.ts [--limit N] [--recheck]`):
  one Text Search (New) per unmatched place (`<name> <area> Bali`, location bias
  = 1 km circle around our coordinates, field mask
  `places.id,places.displayName,places.location,places.types`). Candidates are
  scored on name (EN/AR/ID normalised), distance and category/type.
  ≤150 m + strong name + compatible type + clear winner → `auto`; plausible →
  `review`; otherwise `none`. Runs in the background, rate-limited
  (`GOOGLE_MATCH_DELAY_MS`, retries 429/5xx with backoff), resumable: each
  result is saved as it goes and finished places are never redone.
- **Review** (same page): our place next to the live Google candidate (name,
  address, distance, Google Maps link) with Accept / Reject / Search again.
- **Photos**: `/api/places/<slug>/gphoto/<i>?w=` — same lock rule as the map
  APIs (a locked/VIP place is 404 for a viewer without access), then Place
  Details (`photos` only) → Place Photos (New) `media?skipHttpRedirect=true`
  → `302` to Google's `photoUri`. `/api/places/<slug>/gphotos` gives the live
  author attributions for the credit line.
- **Where**: place details only (owner, Nov 2026) — the map sheet gallery and
  the `/places/<slug>` hero and gallery (`MapPlaceRecord.detailImages`). Map
  carousel cards, list rows, peek / near-me thumbnails, search, teasers and
  listings keep our own media with the category-glyph fallback.
- **Precedence** (`resolvePlaceImages`, details only, at most ONE Google
  photo per place by default): (1) our own uploads that no other place uses,
  (2) then free photos from «Find free photos» (#51, `media.source` set) that
  no other place uses, (3) and only when both are empty: Google photo #0
  (`GOOGLE_PLACES_MAX_PHOTOS`, default 1, max 10). Photos shared with another
  place count as missing. Works whichever of #50 / #51 is merged first.
- **Attribution**: every Google photo (rendered through `Photo`/`SafeImg`)
  shows «Photo: <author, linked> · Google Maps (linked to the photo on Google
  Maps)».

## Terms that shaped the design

From the Places API policies
(https://developers.google.com/maps/documentation/places/web-service/policies)
and the Place Photos (New) page
(https://developers.google.com/maps/documentation/places/web-service/place-photos):

- The **place ID is exempt from the caching restrictions** → it is the only
  Google value we store.
- "You must not pre-fetch, cache, or store Places API content" otherwise, and
  "**You cannot cache a photo name. Also, the name can expire.**" → photo
  names, photo URIs, bytes and author attributions are fetched per request.
  There is no time-based cache of them; concurrent requests for the same
  place only share the call already in flight. The photo list call (Place
  Details with `photos` only) is the no-charge *Essentials (IDs Only)* SKU.
- The photo route redirects instead of proxying bytes, and its
  `Cache-Control` is `private, max-age=300` (only the viewer's own browser,
  never a CDN/shared cache; set `GOOGLE_PHOTO_REDIRECT_MAX_AGE=0` for
  `no-store`). The credit API is `private, no-store`.
- "If `authorAttributions` contains a value, you must include the additional
  attribution … wherever you display the image", users must be able to open the
  source photo on Google Maps (`googleMapsUri`), and Places data shown without
  a Google map needs Google attribution ("Google Maps" text is acceptable when
  space is limited) → the credit line on every Google photo.

## Owner setup (once)

1. Google Cloud console → create (or pick) a project.
2. **Billing** → link a billing account to the project (required even for
   free usage). Optionally set a budget alert.
3. **APIs & Services → Library** → enable **Places API (New)**.
4. **APIs & Services → Credentials → Create credentials → API key**.
5. Edit the key → **API restrictions**: *Restrict key* → only **Places API
   (New)**. **Application restrictions**: *IP addresses* → the server's public
   IP. Save. (Optionally lower the per-minute/per-day quotas of Places API (New)
   under *Quotas*.)
6. On the server, as root: add the key to `/opt/balitrips/.env.production`:
   `GOOGLE_PLACES_API_KEY=<key>` (and optionally `GOOGLE_PLACES_DAILY_CAP=`),
   keep the file `0600`, then run `/opt/balitrips/deploy/update.sh` (it runs
   migration 0040 and restarts the app with the new env). Never paste the key
   into chat, a ticket or git.
7. Studio → Places → **Match with Google** → *Match with Google*. ~600 places
   take ~3–5 minutes. Then open **Needs review** and Accept / Reject / Search
   again. Spot-check the **Auto** tab.
8. Watch **Google API usage** at the bottom of the same page.

## Cost

Prices: https://developers.google.com/maps/billing-and-pricing/pricing
(SKU fields: https://developers.google.com/maps/billing-and-pricing/sku-details/places),
per 1,000 requests at the 0–100k tier, with monthly free usage per SKU:

| Call | SKU | Free / month | Price / 1,000 |
|---|---|---|---|
| Matching search | Text Search Pro | 5,000 | $32 |
| Photo list (+ attributions) | Place Details Essentials (IDs Only) | unlimited | $0 |
| Review candidate | Place Details Pro | 5,000 | $17 |
| Each photo shown | Place Details Photos | 1,000 | $7 |

- **One-off matching of ~600 places**: ~600 Text Search + a few hundred review
  lookups → inside the free caps → **$0** (even running it 5–8 times).
- **Photos** are the only real cost: **one** billable Place Photos request
  when someone opens a place (map sheet or place page) that has no unique
  photo of its own. Opening a place with its own or a free photo costs
  nothing; map browsing, listings and search cost nothing. The photo list
  and attribution (Place Details, IDs Only) are free.

  | Paid place opens (no own photo) | Photo requests / month | Cost / month |
  |---|---|---|
  | 30/day (the cap below) | ≤ 930 | **$0** (inside the 1,000 free) |
  | 100/day | 3,000 | (3,000 − 1,000) × $7/1,000 = **$14** |
  | 300/day | 9,000 | **$56** |
  | 800/day | 24,000 | **$161** |
  | 2,000/day | 60,000 | **$413** |

  `GOOGLE_PLACES_DAILY_CAP=30` keeps photos inside the free 1,000/month
  (31 × 30 = 930), so **$0**. Over the cap a place shows its category
  illustration until the next UTC day. The cap counts every billable call,
  so for the one-off matching (≈600 Text Search, free up to 5,000/month)
  raise it for that day, then set it back to 30. Repeats of the same photo in
  the same browser within 5 minutes are free.
