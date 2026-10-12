# Handoff: Bali Trips — Travel Booking Platform

## Overview
Bali Trips is a multi-language (English / العربية / Bahasa Indonesia) travel booking platform for the island of Bali. It is a **stateful multi-page application**: a single global store drives a router, a persistent header/footer shell, and 17 distinct page views. Users browse activities, book a private driver, buy ready-made itineraries and tour packages, explore an interactive freemium map, and check out through a unified "My Trip" cart.

The design is **RTL-first capable** — Arabic is a primary language, not an afterthought, and the entire layout mirrors correctly.

---

## About the Design Files
The files in this bundle are **design references created in HTML/React (via in-browser Babel)** — prototypes showing intended look and behavior, **not production code to copy directly**.

The task is to **recreate these designs in the target codebase's existing environment** (Next.js, Remix, Vue, native mobile, etc.) using its established patterns, routing, state management, and component libraries. If no environment exists yet, choose the most appropriate framework and implement there.

Specifically, do **not** ship:
- The in-browser Babel transformer (`<script type="text/babel">`) — precompile instead
- `Object.assign(window, {...})` as a module system — use real ES module imports
- The hand-rolled `history.pushState` router — use the framework's router
- `localStorage` as the source of truth for cart/auth — wire to a real backend

Everything else — layout, tokens, component structure, interaction logic, copy — should be reproduced faithfully.

---

## Fidelity
**High-fidelity (hifi).** These are pixel-level mockups with final colors, typography, spacing, imagery treatment, and interactions. Recreate the UI pixel-perfectly using the codebase's existing libraries and patterns. All exact values are documented in **Design Tokens** below.

---

## Architecture

### Routing
A single `route` object `{ name, params }` in app state selects which page component renders. `navigate(name, params)` pushes to `window.history` and scrolls to top; `popstate` restores. The header and footer persist across all routes.

Route table (17 routes):

| Route | Page | Params |
|---|---|---|
| `home` | Homepage | — |
| `services` | Services catalog (6 pillars) | — |
| `map` | Interactive map (standalone) | — |
| `activities` | Activities hub | `cat` (optional preselected filter) |
| `activity` | Activity detail + booking engine | `id` |
| `driver` | Driver booking engine | — |
| `itineraries` | Itineraries hub | — |
| `itinerary` | Itinerary detail | `id` |
| `packages` | Packages hub | — |
| `package` | Package detail | `id` |
| `custom` | Custom trip proposal engine | — |
| `plans` | Subscription plans | — |
| `explore` | Explore Bali (landmarks) | — |
| `about` | About / brand | — |
| `blog` | Blog hub | — |
| `article` | Article detail | `id` |
| `contact` | Contact us | — |
| `cart` | My Trip (unified cart) | — |

### Global store (React context, `useBT()`)
```
lang, setLang, t, dir            // i18n + direction
route, navigate                  // router
user, openAuth, signOut, openAccount
cart, addToTrip, removeFromTrip, setQty, clearCart, cartCount, cartTotal
favs, toggleFav, isFav
mapUnlocked, unlockMap           // freemium gate
toast, openSearch
```

Persisted to `localStorage`: `bt_lang`, `bt_cart`, `bt_favs`, `bt_mapunlock`, `bt_user`.

### Cart item shape (unified across all product types)
```js
{
  id: "act-x7f2a9",        // unique instance id
  kind: "activity" | "driver" | "itinerary" | "package" | "place",
  refId: "batur",          // id of the source entity
  name: { en, ar, id },
  flickr: "mount-batur,volcano",   // image query
  price: 55,               // unit price (0 for saved places)
  qty: 2,                  // guests for activities, days for driver
  date: "2026-08-12",
  time: "09:00",
  meta: { en, ar, id }     // human-readable summary line
}
```
The cart page groups by `kind`, subtotals each group, and sums a grand total of `price × qty`.

---

## Screens / Views

### 1. Homepage (`home`)
**Purpose:** Orient the visitor and route them into any of the five services.

**Layout:** Full-width stacked sections, each `padding-block: clamp(56px, 8vw, 96px)`, alternating `--ivory` / `--ivory-2` backgrounds with two `--forest` (dark) sections for rhythm. Content constrained by `.wrap` (`max-width: 1220px`, `padding-inline: var(--gutter)`).

**Section order (strict):**
1. **Hero** — `min-height: 88vh`. Full-bleed background photo, dual-layer veil (`linear-gradient(110deg, rgba(20,40,28,.78), rgba(20,40,28,.35) 60%, transparent)` + bottom fade). Eyebrow (palm green, uppercase, `.08em` tracking), `h1` at `clamp(40px, 8vw, 88px)` weight 800 in white, lede, two CTAs (orange primary "Explore the Interactive Map" → `map`, light secondary "Customize Your Trip" → `custom`). **Four stat cards inside the hero**, `rgba(255,255,255,.12)` with `blur(8px)` backdrop and `rgba(255,255,255,.22)` border: 500+ hand-picked places · 9 regions covered · 4.9★ traveler rating · 12k+ trips planned. *(RTL: the veil gradient is `scaleX(-1)` flipped.)*
2. **Platform intro** — centered, max 760px. Circular badge icon, `h2`, lede paragraph.
3. **Five platform sections** — 5-up grid at ≥1040px (2-up ≥600px, 1-up below). Each card: image with a 40×40 orange rounded-square icon overlay top-start, title, teaser, "Discover more →". Routes to `driver`, `activities`, `map`, `packages`, `itineraries`.
4. **Driver section** (`--forest` bg) — two columns at ≥940px. Left: eyebrow, h2, lede, 2×2 checked feature list. Right: **white booking card** (`border-radius: 20px`, `padding: 24px`, `--shadow-lg`) with start/end date inputs, passenger stepper, pickup-area select, and an auto-assigned vehicle strip (`--palm-soft` bg) that switches with passenger count. Orange full-width "Book your driver" → `driver`. **Note:** the white card must explicitly set `color: var(--forest)` because the dark section sets a light inherited color.
5. **Activities** — centered head, 7 category chips (Marine, Adventures, Culture, Families, Spa, Food, Romantic) each deep-linking to `activities` with that filter preselected, 3-up activity card grid, centered "See all activities & events".
6. **Interactive map** (largest section) — centered head + lede, then a `clamp(280px, 46vw, 520px)` tall clickable map teaser: photo, dark veil, 8 orange 38px circular pins absolutely positioned and bobbing (`translateY(-7px)`, 2.6s ease-in-out, staggered 0.25s), centered orange CTA. Below: 8 category tiles (Restaurants, Cafés, Beaches, Landmarks, Activities, Shopping, Resorts & spa, Near you) in an 8-up grid at ≥1000px.
7. **Packages** — 3-up grid of all 6 packages.
8. **Itineraries** — 4-up grid of all 8 itineraries, centered "See all itineraries".
9. **How it works** (`--forest` bg) — 4-up grid of steps. Each: absolutely-positioned orange number badge at `top: -14px`, icon tile, label.
10. **Landmarks** — region filter chips (All + 5 regions), 3-up landmark cards.
11. **Travelers love** — 6 collection chips (Best restaurants, Best cafés, Best beaches, Best activities, For families, For honeymoons); selecting one filters activities by that category sorted by rating, top 3.
12. **Reviews** — horizontal scroll carousel; each card shows stars, quote, a "Service used" tag, avatar initial, name, country.
13. **Articles** — section head with "See all" on the right, 3-up article cards.

---

### 2. Activity detail (`activity`) — the most complex view
**Purpose:** Sell and book a single experience.

**Layout:** Breadcrumbs, then a two-column grid at ≥960px: `1fr 360px`, gap 36px. The right column is `position: sticky; top: 150px`.

**Left column:**
- **Image slider** — 320px tall (440px ≥768px), cross-fading `opacity .4s`, prev/next 44px circular buttons at `rgba(20,40,28,.5)` with blur, dot indicators (active dot widens to 22px, `border-radius: 4px`).
- Category tags, `h1` at `clamp(28px, 5vw, 42px)`, meta row (rating + review count, location pin, duration clock).
- "About this experience" description.
- Gallery grid — `repeat(auto-fill, minmax(140px, 1fr))`, 120px tall, 12px radius.
- **What's included / What's excluded** — two columns ≥640px. Included items get a `--palm-soft` circle with a check; excluded get `rgba(255,144,0,.14)` with a cross.
- Cancellation policy — `--palm-soft` panel with a shield icon.
- **FAQ accordion** — one open at a time, chevron rotates 180° when open, active item border becomes `--orange`.

**Right column — booking engine:**
- Price header ("From $55 per person").
- **Date input** — native `type="date"`.
- **Time slots** — 4-up grid of buttons showing time + AM/PM sublabel; selected turns `--forest` with white text.
- **Guest stepper** — min 1, max 20.
- **Driver cross-sell toggle** — pill switch. When on, it reads the currently selected date and guest count, auto-assigns the vehicle class by capacity, and appends the fee to the summary.
- **Live order summary** (`--ivory-2`, 14px radius) — Date, Time, Guests, `Activity ($55 × 2)`, optional `Driver add-on · Standard Sedan`, then a bordered-top Grand total row in `--orange-deep` at 18px/800.
- Two CTAs: orange "Add to my trip", forest "Book now".

**Validation:** Both CTAs validate date and time. Missing fields get `border-color: var(--orange-deep)`, `background: rgba(255,144,0,.05)`, and an inline error message with a cross icon.

**Driver upsell interstitial:** If "Book now" is pressed *without* the driver toggle on, a modal intercepts: icon tile, "Add a driver to this trip?", body copy, "Yes, add a driver" (orange) / "No thanks, continue" (ghost). Either choice commits the booking and routes to `cart`.

**Below the fold (contextual e-commerce engine), in order:**
1. Packages that include this activity
2. Itineraries featuring this activity
3. "You might also like" — activities sharing a category
4. Reviews filtered to this activity's id and categories

---

### 3. Interactive map (`map`)
**Purpose:** The platform's competitive centerpiece — a freemium discovery surface.

- **Banner** with legend: free-preview count and locked count.
- **Map stage** on a `--forest` background. Real satellite imagery of Bali, GPS-projected pins via a lat/lon bounding box (`w: 114.05, e: 116.10, n: -7.75, s: -9.15`) mapped to percentage offsets.
- **Pan/zoom:** pointer-events drag to pan, wheel and two-finger pinch to zoom (scale clamped 1–5), translation clamped so the image never leaves the frame. Zoom in / zoom out / reset buttons.
- **Free pins** are colored by category with a pulsing halo and are fully interactive. **Locked pins** render at `rgba(255,255,255,.5)` with a small lock badge and are non-clickable. On wide screens each pin also has a floating info card; locked cards blur the thumbnail and mask the name to `•••••`.
- **Paywall bar** pinned to the bottom of the stage: `rgba(22,52,38,.85)` with `blur(12px)`, lock icon tile, headline + subcopy, orange "Unlock the full map" → routes to `plans`. Once unlocked, it is replaced by a palm-green "Full map unlocked" confirmation.
- **Node detail panel** — slides in at the inline-end of the stage (bottom sheet on ≤820px): hero image, category + region tags, name, rating, opening hours, description, 3-thumb gallery, "Add to favorites" toggle, orange "Add to my trip", and "View full details" → the linked activity.
- **HUD:** search field and category filter chips float above the stage and do not pan with it.

---

### 4. Driver (`driver`)
- Banner, then the same `1fr 360px` detail grid.
- **Left:** 6 value props in a 3-up grid (Private car, Fully air-conditioned, Family friendly, Group optimized, Knowledgeable local drivers, Seamless navigation); a 5-step numbered transparency protocol; a gallery.
- **Right:** start date, end date, passenger stepper.
- **Vehicle auto-assignment (hard rule):**
  | Passengers | Vehicle | Rate |
  |---|---|---|
  | 1–4 | Standard Sedan | $45/day |
  | 5–7 | Large SUV / MUV | $70/day |
  | 8+ | Luxury Transit Van | $95/day |
  The vehicle strip updates instantly and is labeled "Auto-matched to your group size".
- Total = `rate × days`, where days is inclusive of both end dates (min 1).
- CTAs: "Add driver to my trip", "Book now".

---

### 5. Itineraries (`itineraries` / `itinerary`)
**Hub:** 4-up grid of 8 itineraries — four by duration (5, 7, 8, 10 days) and four by theme (Honeymoon, Family, Adventure, Relaxation).

**Card:** image with an orange day-count badge, name, blurb, region tags, place-count and trip-type meta row, price, then two equal buttons — "View details" (ghost) and "Buy & download" (orange).

**Detail:** hero with day badge, overview, "Who it's for" audience tags, **day-by-day timeline** (each day is a clickable card routing to that activity; days without a scheduled activity show an italic "Free day to explore & relax"), recommended stops as clickable chips, and a sticky sidebar with price and a 4-point digital delivery checklist.

---

### 6. Packages (`packages` / `package`)
**Hub:** 3-up grid of 6 packages — Driver + Itinerary, Driver + Activities, Honeymoon, Family, Adventure, Relaxation.

**Card:** image with the package name overlaid on a bottom gradient, blurb, day/guest/driver tags, a "Regions" line, a "Services" row of 26px amenity icon tiles, price, "View package".

**Detail:** hero with day badge and driver-included flag, overview, included/excluded lists, **included activities roadmap** (full activity cards), and a sidebar with date picker, guest stepper capped at `maxGuests`, summary, "Add package to trip" and "Book now".

---

### 7. My Trip / cart (`cart`)
- Breadcrumbs, title, lede.
- **Empty state:** 72px circular icon, headline, body, orange "Explore activities".
- **Populated:** two columns at ≥900px (`1fr 340px`). Line items grouped by kind with a bordered group header showing an icon, label, and count. Each row: 72px thumbnail, name, meta line, quantity stepper (activities only), a "Remove" text button, and the line total at the inline-end in `--orange-deep`.
- **Sticky summary:** per-group subtotals, grand total, orange "Complete booking", ghost "Explore activities".
- **Checkout gate:** if no user is signed in, "Complete booking" opens the signup modal instead. On success the cart clears and a confirmation view renders with an 80px forest circle + check.

---

### 8. Remaining views
- **Services** — 6 pillar cards, each with icon, image, title, teaser, "Start Planning".
- **Custom trip** — questionnaire (date range, traveler count, theme, budget range slider $200–$3000 step $50, interest tags, private-driver toggle, freeform notes) → a recommendations view with matched activities, "Add all to my trip", and a prefilled WhatsApp deep link.
- **Plans** — 3 tiers (Explorer free / Map Access $19 "Most popular" / VIP $39). The featured tier gets a 2px orange border and `scale(1.04)` at ≥720px, plus a badge notch at `top: -13px`. Choosing a paid tier unlocks the map and routes to it.
- **Explore Bali** — region filter chips over a 3-up landmark grid; each card routes to its linked activity.
- **About** — story, vision/mission cards, "Why Bali?" dark band, 3 values, trust stats, reviews.
- **Blog** — search field + category chips, 2-up article grid, sticky "Most read" sidebar.
- **Article** — hero image, tags, title, body prose at 16.5px/1.8, and a **service bridge CTA** — a full-width forest gradient button whose destination depends on the article (map / activities / driver).
- **Contact** — 4 contact cards (WhatsApp, email, offices, support hours) beside a message form with a success state.

---

## Interactions & Behavior

**Navigation.** Every card, chip, and button routes — there are no dead ends and no in-page scroll jumps. Card images and titles are both clickable. `navigate()` always scrolls to top.

**Header.** Sticky, `backdrop-filter: blur(14px)`. Background goes from `rgba(255,251,248,0.8)` to `0.94` and gains a bottom border once `scrollY > 20`. Centered logo; account + language on the start side; search, cart (with count badge), and "Start Planning" on the end side; a second-row nav bar below that scrolls horizontally rather than wrapping. Under 900px the nav collapses into a hamburger drawer.

**Search overlay.** Opens from the header icon, autofocuses, closes on Escape or scrim click, and locks body scroll. Queries activities, map places, itineraries, packages, and articles simultaneously, matching against both the active language and English. Max 12 results, each with a thumbnail, title, subtitle, and type tag.

**Toast.** Slides up from the bottom center, forest pill, auto-dismisses after 2400ms.

**Animations.**
| Effect | Value |
|---|---|
| Card hover | `translateY(-4px)` + `--shadow-md`, 180ms |
| Card image hover | `scale(1.05)`, 400ms |
| Slider cross-fade | `opacity` 400ms |
| Map pin bob | `translateY(-7px)`, 2600ms ease-in-out infinite, 250ms stagger |
| Modal entry | `btPop` 220–250ms `cubic-bezier(.2,.8,.3,1)` |
| Scrim fade | `btFade` 200ms |
| Toast entry | 300ms ease |
| Accordion chevron | `rotate(180deg)`, 200ms |
| Nav underline | `width` 0→100%, 200ms |

**Responsive breakpoints:** 400, 520, 560, 600, 620, 640, 700, 720, 820, 860, 900, 940, 960, 980, 1000, 1040, 1180px. Mobile-first — every grid starts at 1 column.

**RTL.** Driven by `document.documentElement.dir`. All directional CSS uses logical properties (`inset-inline-start/end`, `padding-inline`, `margin-inline`). Directional icons carry a `.flip` class that mirrors them in RTL. The hero veil gradient is explicitly flipped.

**Accessibility notes to preserve:** all interactive targets are ≥42px (most 44px), icon-only buttons carry `aria-label`, modals use `role="dialog"` + `aria-modal`, breadcrumbs use `<nav aria-label="Breadcrumb">`, and the toast uses `role="status"`.

---

## State Management

**Global:** `lang`, `route`, `user`, `cart`, `favs`, `mapUnlocked`, `toastMsg`, plus transient `authMode`, `acctTab`, `searchOpen`.

**Per-page local state:**
- Activity detail — `qty`, `date`, `time`, `driver`, `err`, `upsell`
- Driver — `start`, `end`, `pax`
- Package detail — `guests`, `date`
- Activities hub — `cat`, `sort`
- Map — `filter`, `query`, `active`, `view {s, x, y}`, gesture refs
- Custom trip — `start`, `end`, `pax`, `theme`, `budget`, `ints[]`, `driver`, `notes`, `done`
- Blog — `cat`, `q`; Contact — form fields + `sent`

**Derived values (never stored):** `cartCount`, `cartTotal`, `vehicleFor(pax)`, `daysBetween(start, end)`, and all cross-reference lookups.

**Data fetching (to implement).** The prototype uses static in-memory arrays. A real implementation needs: activities, itineraries, packages, articles, map places, landmarks, and reviews (all with localized `{en, ar, id}` fields); auth; cart persistence; payment; and a subscription entitlement check for the map paywall.

---

## Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| `--forest` | `#26552E` | Primary brand, headings, dark sections |
| `--forest-deep` | `#1B3F22` | Deepest shade, gradient ends |
| `--forest-soft` | `#3A7043` | Secondary green, gradient partner |
| `--palm` | `#71FF85` | Accent on dark backgrounds, eyebrows, footer headings |
| `--palm-soft` | `#D8F5DD` | Light green fill for icon tiles and panels |
| `--orange` | `#FF9000` | Primary CTA, badges, active states |
| `--orange-deep` | `#E07800` | Prices, links, orange text on light |
| `--ivory` | `#FFFBF8` | Page background |
| `--ivory-2` | `#F7F1EA` | Alternating section background |
| `--white` | `#FFFFFF` | Cards, inputs |
| `--ink` | `#1F2A21` | Body text |
| `--muted` | `#6B7A6E` | Secondary text |
| `--line` | `#E3DAD0` | Borders |
| `--line-soft` | `#EFE7DE` | Subtle dividers |

### Typography
- **Latin:** Poppins — 400, 500, 600, 700, 800
- **Arabic:** Noor (brand font), applied via `--arabic` when `lang === "ar"`
- Display `clamp(40px, 8vw, 88px)` / 800 · Section title `clamp(28px, 5vw, 52px)` / 800 · h1 `clamp(28px, 5vw, 42px)` · h2 22–24px · h3 17–22px · Lede 16–19px / 1.6–1.7 · Body 14–16.5px · Meta 12.5–13.5px · Eyebrow 12–13px / 700 / uppercase / `.08em`
- Headings use `letter-spacing: -0.02em`; body uses `text-wrap: pretty`

### Spacing & shape
- Gutter: `clamp(20px, 5vw, 40px)` · Wrap max-width: 1220px · Section padding-block: `clamp(56px, 8vw, 96px)`
- Grid gaps: 8, 10, 12, 14, 16, 20, 24px
- Radii: `--r-md` 16px · `--r-lg` 20px · `--r-xl` 28px · pills 999px · inputs/small cards 12–14px
- Shadows: `--shadow-sm` `0 2px 8px -2px rgba(31,42,33,.08)` · `--shadow-md` `0 12px 28px -10px rgba(31,42,33,.18)` · `--shadow-lg` `0 24px 56px -20px rgba(31,42,33,.28)`

### Buttons (unified globally)
Min height 44px, `border-radius: 999px`, weight 700, `gap: 8px`, inline-flex centered.
- `.btn-orange` — `--orange` bg, white text (primary)
- `.btn-forest` — `--forest` bg, `--ivory` text (secondary)
- `.btn-ghost` — transparent, `--line` border, `--forest` text
- `.btn-light` — white bg, `--forest` text (for dark backgrounds)
- `.btn-block` — full width

---

## Assets
- **Photography:** all images are placeholders sourced by keyword query (e.g. `mount-batur,volcano`, `tegallalang,rice`, `canggu,beach`) through a `flickr(query, w, h, seed)` helper. **Replace every one with licensed client photography before launch.** The helper signature is the seam to swap in a real CDN/image service.
- **Satellite map:** `assets/bali-satellite.jpg` — a real satellite image of Bali, referenced by the map's lat/lon projection. Keep the bounding box in sync if the image is replaced.
- **Logo:** inline SVG `Logo` component, height-parameterized.
- **Icons:** a single inline-SVG `Icon` component with a ~45-glyph set (`pin`, `car`, `suv`, `van`, `compass`, `cal`, `clock`, `star`, `heart`, `users`, `check`, `cross`, `plus`, `minus`, `search`, `globe`, `user`, `cart`, `lock`, `shield`, `mail`, `phone`, `whatsapp`, `chevron`, `chevronr`, `arrow`, `filter`, `tag`, `wave`, `mountain`, `coffee`, `sparkle`, `gem`, `route`, `sun`, `grid`, `book`, `plane`, `home`, `trash`, `quote`, …). All stroke-based, `currentColor`-compatible, with `size` and `color` props. Map to the target codebase's icon library where equivalents exist.
- **Fonts:** Poppins (Google Fonts) + Noor (brand file, embedded).

---

## Files
| File | Contents |
|---|---|
| `Bali Trips.html` | Entry point — head, fonts, script includes, `#root` |
| `Bali Trips - Shareable.html` | Fully self-contained single-file build (open this to view offline) |
| `bt-styles.css` | Complete design system and all component CSS |
| `bt-data.jsx` | All content: activities, itineraries, packages, articles, map places, landmarks, reviews, plus cross-reference helpers |
| `bt-ui.jsx` | Context/store consumer, shared cards, banner, breadcrumbs, filter bar, contextual cross-sell blocks, search overlay, toast, footer |
| `bt-app.jsx` | App root — router, global store, providers |
| `sections-bt/i18n.jsx` | All three languages' strings + `makeT()` |
| `sections-bt/primitives.jsx` | `Icon`, `Photo`, `Logo`, `Head`, `flickr()`, `useReveal()` |
| `sections-bt/header.jsx` | Header, nav, language switcher |
| `sections-bt/page-home.jsx` | Homepage (13 sections) |
| `sections-bt/page-activities.jsx` | Activities hub, activity detail, slider, accordion |
| `sections-bt/page-driver.jsx` | Driver booking engine |
| `sections-bt/page-plans.jsx` | Itineraries + packages, hubs and details |
| `sections-bt/page-content.jsx` | Custom trip, blog, article |
| `sections-bt/page-map.jsx` | Interactive map + node panel |
| `sections-bt/page-explore.jsx` | Explore Bali + Contact |
| `sections-bt/page-static.jsx` | Services, subscriptions, about |
| `sections-bt/page-cart.jsx` | My Trip cart |
| `sections-bt/auth.jsx` | Sign in / sign up / forgot password |
| `sections-bt/account.jsx` | Account dashboard (6 tabs) |
| `sections-bt/account-menu.jsx` | Header account dropdown |
| `assets/` | Satellite map image, brand font |

**Start here:** open `Bali Trips - Shareable.html` in a browser to click through the whole platform, then read `bt-app.jsx` (routing + store) and `bt-styles.css` (tokens) before implementing.

---

## Known gaps to close in production
1. **WhatsApp number is a placeholder** — `WA_NUMBER` in `sections-bt/page-content.jsx`. Replace everywhere.
2. **Auth is mocked** in `localStorage` — no real accounts, sessions, or password handling.
3. **No payment integration** — "Complete booking" clears the cart and shows a confirmation; no charge occurs.
4. **Map paywall is client-side only** — `mapUnlocked` is a boolean in `localStorage` and is trivially bypassed. Locked place data is also present in the client bundle. Gate this server-side and don't ship locked content to unentitled clients.
5. **All imagery is placeholder** — see Assets.
6. **Content is static** — needs a CMS or API behind it.
7. **Arabic and Indonesian copy should be reviewed by native speakers** before launch.
