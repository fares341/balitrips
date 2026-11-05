# Free place photos

Studio → Places → **Free photos** (`/studio/places/free-photos`) finds openly
licensed photos for map places, as a free alternative to the (dormant, paid)
Google photos integration.

## Sources and rules

| Source | Key | How it is used | Stored |
| --- | --- | --- | --- |
| Wikimedia Commons (+ Wikidata P18) | none | geosearch ≤ 400 m around the pin, search by «name» and «name Bali», Wikidata items ≤ 1 km with an image | downloaded and run through our media pipeline (all rungs) |
| Openverse | none (anonymous: ≤ 20 per page, ~1 req/s) | search «name Bali», licence-filtered | downloaded, like Commons |
| Unsplash | `UNSPLASH_ACCESS_KEY` (optional) | search, only famous categories without a good free match | **hotlinked** (never re-hosted); download endpoint hit when used |

- Accepted licences: CC0, public domain / PDM, CC BY, CC BY-SA (and the
  Unsplash License). NC, ND, GFDL-only, fair use and unknown are refused.
- Every photo stores author, author link, licence, licence link and source
  link on its `media` row; the site shows «Photo: author · licence · source»
  under it (same style as the Google credit). CC BY-SA re-use of our crops
  stays under BY-SA.
- Requests: `User-Agent: BaliTrips/1.0 (https://balitrips.co)`, one request
  at a time per host with a gap, retries on 429/5xx with backoff.

## Scoring and auto-apply

Score = 0.45 × distance (Commons geotag / Wikidata item vs pin) + 0.4 × name
match + 0.15 × resolution (≥ 800 px wide required). Maps, logos, flags and
very wide/tall images are dropped. Exact (sha256) and near (dHash) duplicates
of a photo already applied to another place are marked «duplicate».

**Auto-apply** only when the geotag is within 150 m AND the name matches,
and ONLY on places with no photo or only a shared/duplicate one. A unique
photo the owner uploaded is never replaced. Auto-applied places are listed in
the «Auto-applied (spot-check)» tab.

«Replace shared/duplicate photos with category illustration» removes only
photos used by more than one place (audit-logged), so those places show
their category glyph until a real photo exists.

## Command line

    tsx --conditions=react-server scripts/free-photos.ts [--limit N] [--recheck] [--no-auto]
    tsx scripts/free-photos-dry-run.ts --limit=20   # read-only coverage estimate
