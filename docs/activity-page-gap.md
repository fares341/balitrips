# Activity details page v2 — gap audit

Source: client spec «Bali Trips — Activity Details Page» (sections 1–16 + FAQ
update + Advanced Improvements 1–18) and the reference image (Locavore Ubud).
Audited against `main` @ 59bbe09 before any change. Phase 1 (migrations
0017–0029) already covers most of the data model; this branch **extends** it.

Legend: ✅ exists · 🟡 partial · ❌ missing · → action taken on this branch.

## Spec sections 1–16

| # | Item | Before | Action |
|---|------|--------|--------|
| 1 | Basic info (titles ar/en/id, slug, main + sub categories, region, short/full description, featured, status, order, supplier) | ✅ | — |
| 1 | Rating / reviews count only when real | ✅ (`reviews` table, average computed) | Header shows rating only from real reviews (kept) |
| 1 | SEO per language | 🟡 (title/description derived) | → `seo_title`, `seo_description`, `og_image_id`, `canonical_url` columns + Studio fields + metadata |
| 2 | Gallery: main media, thumbnails, click switches, lightbox, swipe, video only if real | 🟡 (gallery + video embed, no thumbnails strip in hero layout) | → hero gallery rebuilt per image: main + thumbnail row, play button only with a real video, lightbox, swipe |
| 2 | Per media alt / poster / hidden / main flag | 🟡 (alt on media; order; hero = main) | Kept: alt lives on the media item, hero image is the main item. Poster = hero image. Hide = remove from gallery |
| 3 | Quick facts (location, duration, schedule, group size), hidden when empty | 🟡 (schedule always shown with "flexible") | → schedule hidden when no slots/time note; group min–max shown |
| 3 | Fixed times vs needs confirmation, timezone | ✅ (supplier confirm terms, Bali time) | — |
| 4 | Unlimited packages, name/tagline/description, price, currency, pricing type, min/max | ✅ | — |
| 4 | Compare-at price | ❌ | → `compare_at_price_minor`; discount shown only when > price |
| 4 | Included persons / couple never doubled | ✅ (`per_couple` = ceil(people/2)) | → `groupMax` relabelled «included persons» for group packages |
| 4 | Fixed price type | 🟡 (`per_group` without size) | → explicit `fixed` pricing (one price whatever the party) |
| 4 | Badge label + colour | 🟡 («most popular» only) | → `badge_label` (localized) + `badge_color` |
| 4 | Package image, package duration override | ❌ | → `image_id`, `duration` |
| 4 | Features list per package, not inherited | ✅ | — |
| 4 | «View all features» in place | ✅ | Restyled |
| 5 | Selected-package card (image, name, desc, badge, price, unit, participants, Book now, quick specs incl. confirmation + short cancellation) | 🟡 | → rebuilt per image |
| 5 | Four boxes switching per package; items with order, visibility, all-or-one-package | 🟡 (lists, order; no per-item visibility/scope) | → list items carry `hidden` + `pkg`; repeater gets show/hide + package scope |
| 6 | Add-ons: image, price, unit, +, available per package, removed with notice on switch | 🟡 (no notice) | → notice when a pick is dropped on package change |
| 6 | Pricing: once / per person / per unit / per hour / tiered by qty | 🟡 (no per hour, no tiers) | → `per_hour`, `tiered` (`price_tiers`) in the engine |
| 6 | Max qty, incompatible with | 🟡 (max qty only) | → `incompatible_with` + engine rejection |
| 7 | Server-side total, breakdown (package, people, add-ons with qty + unit, discount, fees, total, currency) | 🟡 | → breakdown lists each add-on unit × qty; spec example ($310) unit-tested |
| 8 | Tabs: important info / cancellation / FAQ; what to bring; meeting point | ✅ | Laid out per image (tabs + four cards) |
| 8 | Cancellation: platform default, no free-cancel promise unless set | ✅ | — |
| 8 | FAQ: unlimited, drag reorder, hide/show, package link | 🟡 (30 fixed slots) | → real FAQ repeater (JSON), unlimited (sane cap 200), hidden, package link |
| 9 | Map with marker + «view on Google Maps» | 🟡 (illustrated minimap) | → map card with pin, Google Maps button from `meeting_map_url`/coords; no geocoding from names |
| 10 | Related activities (manual + same region/category), favourite, only published | 🟡 (auto only) | → `related_ids` manual pick first, auto fill; row with arrows |
| 11 | Booking workflow, statuses separated from payment, instant vs approval | ✅ (phase 1 + supplier confirm + manual capture) | — |
| 12 | Studio list: thumbnail, region, category, package count, from price, status, bookable, updated | 🟡 | → added columns |
| 12 | Filters: needs review, no images, no packages, missing data; search by id | 🟡 | → added |
| 12 | Edit / duplicate / preview / archive | 🟡 | → duplicate + preview link + archive status |
| 13 | RTL/LTR, responsive, no empty sections, lazy images, keyboard | ✅ | Kept for the new layout; mobile sticky bar kept |
| 14 | DB structure | ✅ (jsonb lists on activity/tier rows instead of one table per list — documented choice) | — |
| 15 | CSV import with template + validation preview | ❌ (exports only) | → `/studio/activities/import`: template (CSV + BOM), preview with errors, then import as drafts |
| 16 | Phased delivery + reports | — | This file + PR |

## Advanced improvements 1–18

| # | Item | Before | Action |
|---|------|--------|--------|
| 1 | Dynamic repeaters everywhere (drag, hide) | 🟡 | → visibility toggle + package scope on activity lists; FAQ repeater |
| 2 | Duplicate activity / package (as draft, new slug) | ❌ | → both |
| 3 | Draft / In review / Published / Archived; preview; revision history | 🟡 | → `in_review`, `archived` statuses; history card from the audit log |
| 4 | Compare-at, couple, group, age, season prices; discount only with valid reference | 🟡 | → compare-at |
| 5 | Schedules / availability / capacity | ✅ | — |
| 6 | Age bands | ✅ (child band + infant) | — |
| 7 | Add-on rules (package, incompatible, people, max qty) | 🟡 | → incompatible + max qty shown |
| 8 | Content templates per activity type | ❌ | → six templates; applied items marked «needs review» |
| 9 | Mobile (cards, sticky book bar) | ✅ | Kept |
| 10 | Package comparison from data | ✅ | — |
| 11 | Reviews tied to bookings | ✅ (existing reviews system) | — |
| 12 | Dashboard reports | ✅ (reports section) | — |
| 13 | Roles + price change log | ✅ (`prices.write`, audit) | — |
| 14 | SEO per language, OG, canonical, structured data without fake ratings | 🟡 | → SEO fields |
| 15 | Incomplete data: no empty section, no fake price, no book button when not bookable, pre-publish checklist | 🟡 | → checklist blocks publishing |
| 16 | Performance + server price validation, price snapshot | ✅ | — |
| 17–18 | Audit existing first, deliver per feature | — | This document |

## Decisions for the owner

1. Ratings: the page shows only the average of real published reviews; no
   rating field is typed in by hand.
2. Reference prices (Couples $180, Basic $120, Comprehensive $200, Premium $240;
   add-ons $35/$15/$30/$40/$25) are used **only** in the CI screenshot fixture,
   never on the live database, until the client approves them.
3. Map: the location card uses the illustrated Bali map with a pin (no Google
   Maps API key on the site); «view on Google Maps» opens the stored link or
   the exact coordinates.
