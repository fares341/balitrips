import Link from 'next/link'

import { searchConversations } from '@/lib/assistant/store'
// AI usage is billed in real US dollars: shown in USD on purpose.
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { listParams } from '../../../_lib/list'
import { requireCapability } from '../../../_lib/session'
import { PageHead } from '../../../_ui/shell'
import { ListSearch } from '../../../_ui/list-search'
import { Empty, Pager, Pill, Table, When } from '../../../_ui/table'

export const dynamic = 'force-dynamic'

/** Studio → Assistant → website conversations, newest first (quality review). */
const LIST = adminHref('/assistant/conversations')

export default async function AssistantConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Visitors' own words, sometimes with their name or dates: customer data.
  await requireCapability('customers.read')
  const { t } = await getAdminI18n()
  const params = await searchParams
  // `q` searches what was said in the conversation (any message).
  const { q, page, offset, pageSize } = listParams(params)
  const { rows, total } = await searchConversations('public', q, pageSize, offset)
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
      <ListSearch basePath={LIST} searchParams={params} />
      {rows.length === 0 ? (
        <Empty>{q ? t('list.no_match', { q }) : t('assistant.conv_empty')}</Empty>
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
      <Pager basePath={LIST} searchParams={params} page={page} pageSize={pageSize} total={total} />
    </>
  )
}
