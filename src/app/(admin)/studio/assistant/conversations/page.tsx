import Link from 'next/link'

import { listConversations } from '@/lib/assistant/store'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'

export const dynamic = 'force-dynamic'

/** Studio → Assistant → website conversations, newest first (quality review). */
export default async function AssistantConversationsPage() {
  // Visitors' own words, sometimes with their name or dates: customer data.
  await requireCapability('customers.read')
  const { t } = await getAdminI18n()
  const rows = await listConversations('public', 100)
  const retention = Number.parseInt(process.env.ASSISTANT_RETENTION_DAYS ?? '', 10)
  const days = Number.isFinite(retention) && retention >= 1 ? retention : 90

  return (
    <>
      <PageHead
        title={t('assistant.conv_title')}
        description={t('assistant.conv_description', { days })}
        actions={
          <Link className="a-btn ghost" href={adminHref('/assistant')}>
            {t('assistant.title')}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <Empty>{t('assistant.conv_empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('assistant.conv_updated')}</th>
              <th>{t('assistant.conv_started')}</th>
              <th>{t('assistant.conv_account')}</th>
              <th>{t('assistant.conv_language')}</th>
              <th>{t('assistant.conv_messages')}</th>
              <th>{t('assistant.conv_cost')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.updatedAt} />
                </td>
                <td>
                  <When value={row.createdAt} />
                </td>
                <td>
                  <Pill tone={row.userId ? 'info' : 'neutral'}>
                    {row.userId ? t('assistant.conv_signed_in') : t('assistant.conv_guest')}
                  </Pill>
                </td>
                <td>{row.locale}</td>
                <td dir="ltr">{row.messageCount}</td>
                <td dir="ltr">
                  {formatMoney(Math.round(Number(row.costMicros) / 10_000), 'USD', 'en')}
                </td>
                <td>
                  <Link
                    className="a-btn ghost small"
                    href={adminHref(`/assistant/conversations/${row.id}`)}
                  >
                    {t('assistant.conv_open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
