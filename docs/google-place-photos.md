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
- **One photo per place, everywhere** (owner, Nov 2026, final): map
  carousel cards, the map list, the map sheet and the `/places` pages show
  exactly one photo, chosen by `resolvePlaceImages`:
  1. the owner's own upload that no other place uses;
  2. otherwise **Google photo #0** (usable match, feature on, daily cap not
     reached);
  3. otherwise a free photo («Find free photos», #51) no other place uses;
  4. otherwise a photo shared with one other place;
  5. otherwise the category glyph.

  A photo used by 3 or more places is never shown. No Google galleries.
  Search results, teasers and other listings keep our own media.
- **Cards load lazily**: a Google photo on a map card (and the sheet's
  peek / near-me thumbs) gets its `src` only once the card is in or near the
  viewport (IntersectionObserver, 200 px margin), so scrolling the carousel
  does not fire a request per card.
- **Daily cap**: once today's billable calls reach `GOOGLE_PLACES_DAILY_CAP`,
  pages pick the next photo in the list (free photo / glyph) silently (within
  ~60 s through the map cache; until then the photo route answers 404 and the
  slot shows the glyph).
- **Attribution**: every Google photo (rendered through `Photo`/`SafeImg`)
  shows «Photo: <author, linked> · Google Maps (linked to the photo on Google
  Maps)»; map cards and small thumbs show a compact «© <author> · Google
  Maps».

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
- **Photos** are the only real cost: one billable Place Photos request per
  **unique place photo a visitor actually views** — a Google photo that
  scrolls into view on a map card, or an opened place (sheet / place page) —
  for places without an own unique upload. The same photo again in the same
  browser within 5 minutes is free (`private, max-age=300`). A card thumb
  (400 px) and the opened place (1280 px) are two requests. Places with their
  own upload, search and listings cost nothing; the photo list and
  attribution (Place Details, IDs Only) are free.

  | Unique Google place photos viewed / day (all visitors) | Requests / month | Cost / month |
  |---|---|---|
  | 30 (the cap below) | ≤ 930 | **$0** (inside the 1,000 free) |
  | 100 | 3,000 | (3,000 − 1,000) × $7/1,000 = **$14** |
  | 300 | 9,000 | **$56** |
  | 1,000 | 30,000 | **$203** |
  | 3,000 | 90,000 | **$623** |

  Example: 100 map visits/day × ~6 Google cards seen + 1 opened place ≈ 700
  views/day ≈ 21,000/month ≈ **$140/month**.

  `GOOGLE_PLACES_DAILY_CAP=30` keeps photos inside the free 1,000/month
  (31 × 30 = 930): **$0**. Over the cap, places show their free photo or
  category glyph until the next UTC day. The cap counts every billable call,
  so for the one-off matching (≈600 Text Search, free up to 5,000/month)
  raise it for that day, then set it back.
