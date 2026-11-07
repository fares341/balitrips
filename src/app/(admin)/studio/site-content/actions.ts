'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { FAQ_GROUPS } from '@/app/[locale]/faq/groups'
import { db } from '@/db'
import { BUNDLED_MESSAGES } from '@/lib/content/home-content-bundled'
import { HOME_CONTENT_TAG } from '@/lib/content/home-content-server'
import type { LocaleText } from '@/lib/content/message-overrides'
import {
  DEFAULT_OFFICES,
  faqFromSubmitted,
  isSitePageId,
  safeHref,
  sitePage,
  SOCIAL_NETWORKS,
  type SiteLink,
  type SitePageId,
} from '@/lib/content/page-content'
import { PAGE_CONTENT_TAG } from '@/lib/content/page-content-server'
import { MAX_VIDEO_BYTES, storePublicVideo, VIDEO_TYPES, videoKind } from '@/lib/media/video'
import { HERO_CLIPS } from '@/app/[locale]/_home/hero-media'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { ffaqRows, flocalizedRows, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { updateSetting } from '../../_lib/settings-write'
import { revalidateSiteTexts, textsFromForm, writeSiteTexts } from '../../_lib/site-texts'

type Outcome = { ok: string } | { err: string }

const screen = (page: SitePageId) => adminHref(`/site-content/${page}`)

function revalidateAll(): void {
  revalidateTag(PAGE_CONTENT_TAG, { expire: 0 })
  revalidateSiteTexts()
}

/** `<name>__json` link rows → stored links (bad addresses are refused). */
function linksFrom(form: FormData, name: string, err: (href: string) => string): SiteLink[] {
  const raw = form.get(`${name}__json`)
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: SiteLink[] = []
  for (const entry of parsed.slice(0, 30)) {
    if (typeof entry !== 'object' || entry === null) continue
    const { href, label, key } = entry as { href?: unknown; label?: unknown; key?: unknown }
    const value = typeof href === 'string' ? href.trim() : ''
    if (value === '') continue
    if (safeHref(value) === null) throw new Error(err(value))
    const text: LocaleText = {}
    for (const locale of ['ar', 'en', 'id'] as const) {
      const one = (label as Record<string, unknown> | null)?.[locale]
      if (typeof one === 'string' && one.trim() !== '') text[locale] = one.trim().slice(0, 80)
    }
    // A shipped link whose labels were not changed keeps following its key.
    const bundledKey = typeof key === 'string' ? key : undefined
    if (bundledKey) {
      for (const locale of ['ar', 'en', 'id'] as const) {
        if (text[locale] === BUNDLED_MESSAGES[locale]?.[bundledKey]) delete text[locale]
      }
    }
    out.push({ href: value.slice(0, 500), label: text, ...(bundledKey ? { key: bundledKey } : {}) })
  }
  return out
}

/**
 * Save one «محتوى الموقع» screen: its texts (site-text overrides), photos,
 * shown sections, and the page's own parts (FAQ, links, contact details…).
 */
export async function saveSitePage(page: string, form: FormData): Promise<void> {
  if (!isSitePageId(page)) redirect(adminHref('/site-content'))
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  const def = sitePage(page)
  let outcome: Outcome

  try {
    const keys = def.sections.flatMap((section) => section.texts)
    const images: Record<string, string> = {}
    for (const section of def.sections) {
      for (const slot of section.images ?? []) {
        const value = fstr(form, `img__${slot.id}`) ?? ''
        if (value !== '') images[slot.id] = value
      }
    }
    const hidden = def.sections
      .filter((section) => section.hideable && form.get(`show__${section.id}`) !== 'on')
      .map((section) => section.id)

    // Contact details (the shared `contact` setting: footer, WhatsApp button…).
    let contact: { whatsappNumber: string; whatsappDisplay: string; supportEmail: string } | null =
      null
    if (page === 'contact') {
      contact = {
        whatsappNumber: (fstr(form, 'whatsappNumber') ?? '').replace(/[^0-9]/g, ''),
        whatsappDisplay: fstr(form, 'whatsappDisplay') ?? '',
        supportEmail: (fstr(form, 'supportEmail') ?? '').toLowerCase(),
      }
    }
    const linkErr = (href: string) => t('sc.err_href', { href })

    await db.transaction(async (tx) => {
      await writeSiteTexts(textsFromForm(form, keys), session, t, tx)
      if (contact) await updateSetting('contact', () => contact, session, tx)
      await updateSetting(
        'pageContent',
        (current) => {
          const next = { ...current, pages: { ...current.pages, [page]: { images, hidden } } }
          if (page === 'contact') {
            const offices = flocalizedRows(form, 'offices', 6)
            const same =
              offices.length === DEFAULT_OFFICES.length &&
              offices.every((row, i) => row.en === DEFAULT_OFFICES[i] && !row.ar && !row.id)
            next.offices = same ? null : offices
          }
          if (page === 'faq') {
            next.faq =
              form.get('faq_reset') === 'on'
                ? null
                : faqFromSubmitted(
                    ffaqRows(
                      form,
                      'faq',
                      FAQ_GROUPS.map((group) => group.title),
                    ),
                    FAQ_GROUPS,
                    BUNDLED_MESSAGES,
                  )
          }
          if (page === 'header') {
            if (form.get('links__custom') === '1')
              next.headerLinks = linksFrom(form, 'links', linkErr)
            if (form.get('links_reset') === 'on') next.headerLinks = null
            const cta = (fstr(form, 'ctaHref') ?? '').trim()
            if (cta !== '' && safeHref(cta) === null) throw new Error(linkErr(cta))
            next.ctaHref = cta
          }
          if (page === 'footer') {
            if (form.get('quick__custom') === '1')
              next.footerQuick = linksFrom(form, 'quick', linkErr)
            if (form.get('info__custom') === '1') next.footerInfo = linksFrom(form, 'info', linkErr)
            if (form.get('quick_reset') === 'on') next.footerQuick = null
            if (form.get('info_reset') === 'on') next.footerInfo = null
            const social: Record<string, string> = {}
            for (const network of SOCIAL_NETWORKS) {
              const value = (fstr(form, `social__${network}`) ?? '').trim()
              if (value === '') continue
              if (!/^https:\/\/[^\s]+$/i.test(value)) throw new Error(linkErr(value))
              social[network] = value
            }
            next.social = social
          }
          return next
        },
        session,
        tx,
      )
    })
    outcome = { ok: t('sc.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  revalidateAll()
  redirect(withOutcome(screen(page), outcome))
}

/* ---------------- Hero videos ---------------- */

const CLIP_IDS = HERO_CLIPS.map((clip) => clip.id)

/** Replace one hero clip's MP4 or WebM (the other format is kept). */
export async function uploadHeroVideo(clip: string, form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!CLIP_IDS.includes(clip)) throw new Error(t('sc.err_clip'))
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error(t('places.err_choose_video'))
    if (file.size > MAX_VIDEO_BYTES) throw new Error(t('places.err_video_too_large'))
    if (file.type !== '' && !(file.type in VIDEO_TYPES)) throw new Error(t('places.err_video_type'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = videoKind(bytes)
    if (kind === null) throw new Error(t('places.err_video_invalid'))

    const url = await storePublicVideo(`media/hero/${clip}-${randomUUID()}.${kind}`, bytes, kind)
    await updateSetting(
      'pageContent',
      (current) => ({
        ...current,
        heroVideos: {
          ...current.heroVideos,
          // A new upload replaces the clip: drop the other format if it was
          // the bundled one, keep it if it was uploaded too.
          [clip]: { ...(current.heroVideos[clip] ?? {}), [kind]: url },
        },
      }),
      session,
    )
    await writeAudit({
      actor: session,
      action: 'hero_video.upload',
      entityType: 'setting',
      entityId: null,
      before: null,
      after: { clip, kind, url, bytes: bytes.byteLength },
    })
    outcome = { ok: t('sc.ok_video') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidateAll()
  revalidatePath('/[locale]', 'page')
  redirect(withOutcome(screen('videos'), outcome))
}

/** Back to the bundled clip. */
export async function resetHeroVideo(clip: string): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    await updateSetting(
      'pageContent',
      (current) => {
        const heroVideos = { ...current.heroVideos }
        delete heroVideos[clip]
        return { ...current, heroVideos }
      },
      session,
    )
    outcome = { ok: t('sc.ok_video_reset') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidateAll()
  revalidatePath('/[locale]', 'page')
  redirect(withOutcome(screen('videos'), outcome))
}

/** Hero posters live with the home page photos (homeContent.images). */
export async function saveHeroPosters(form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    await updateSetting(
      'homeContent',
      (current) => {
        const images = { ...current.images }
        for (const clip of CLIP_IDS) {
          const value = fstr(form, `img__hero_poster_${clip}`) ?? ''
          if (value === '') delete images[`hero_poster_${clip}`]
          else images[`hero_poster_${clip}`] = value
        }
        return { ...current, images }
      },
      session,
    )
    outcome = { ok: t('sc.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidateTag(HOME_CONTENT_TAG, { expire: 0 })
  revalidatePath('/[locale]', 'page')
  redirect(withOutcome(screen('videos'), outcome))
}
