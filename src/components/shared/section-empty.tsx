/**
 * A section with nothing published yet (owner, Oct 2026): a short, honest
 * note and where to go instead — never «no results match your filters».
 * The nav already hides the section's links while it is empty.
 */

import { getTranslations } from 'next-intl/server'

import { Icon } from '@/components/ui'

import { LinkButton } from './button'

export async function SectionEmpty({ kind }: { kind: 'packages' | 'blog' }) {
  const t = await getTranslations()
  return (
    <div className="section-empty" role="status">
      <span className="section-empty-ic" aria-hidden="true">
        <Icon name={kind === 'packages' ? 'box' : 'doc'} size={34} stroke={1.6} />
      </span>
      <h2 className="h3">{t(`es_${kind}_t`)}</h2>
      <p className="muted">{t(`es_${kind}_b`)}</p>
      <div className="section-empty-go">
        <LinkButton href="/itineraries" variant="forest">
          {t('es_go_itin')}
        </LinkButton>
        <LinkButton href="/activities" variant="ghost">
          {t('es_go_act')}
        </LinkButton>
        <LinkButton href="/custom" variant="ghost">
          {t('es_go_custom')}
        </LinkButton>
      </div>
    </div>
  )
}
