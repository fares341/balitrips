import Link from 'next/link'

import { conversationDetail } from '@/lib/assistant/store'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../../_lib/admin-path'
import { getAdminI18n } from '../../../../_lib/i18n'
import { requireCapability } from '../../../../_lib/session'
import { PageHead } from '../../../../_ui/shell'
import { Empty, Pill, When } from '../../../../_ui/table'

export const dynamic = 'force-dynamic'

/**
 * One website conversation, as the visitor saw it: their messages and the
 * assistant's replies (plain text, never rendered as HTML here either), plus
 * the changes it proposed and what became of them.
 */
export default async function AssistantConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireCapability('customers.read')
  const { id } = await params
  const { t } = await getAdminI18n()
  const detail = await conversationDetail(id)
  const back = (
    <Link className="a-btn ghost" href={adminHref('/assistant/conversations')}>
      {t('assistant.conv_back')}
    </Link>
  )
  if (detail === null || detail.conversation.kind !== 'public') {
    return (
      <>
        <PageHead title={t('assistant.conv_detail_title')} actions={back} />
        <Empty>{t('assistant.conv_not_found')}</Empty>
      </>
    )
  }
  const { conversation, messages, actions } = detail

  return (
    <>
      <PageHead
        title={t('assistant.conv_detail_title')}
        description={`${conversation.locale} · ${conversation.messageCount} · ${formatMoney(
          Math.round(Number(conversation.costMicros) / 10_000),
          'USD',
          'en',
        )}`}
        actions={back}
      />
      <div className="a-card a-ai-convo">
        <p className="a-muted">
          <When value={conversation.createdAt} />
          {conversation.lastModel ? (
            <>
              {' · '}
              <span dir="ltr">{t('assistant.conv_model', { model: conversation.lastModel })}</span>
            </>
          ) : null}
        </p>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`a-ai-msg ${message.role === 'user' ? 'is-user' : 'is-bot'}`}
          >
            <span className="a-sr">
              {message.role === 'user' ? t('assistant.you') : t('assistant.bot')}:{' '}
            </span>
            <div className="a-ai-bubble" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </div>
            {message.tools && message.tools.length > 0 ? (
              <p className="a-ai-tool a-muted" dir="ltr">
                {t('assistant.conv_tools', { tools: message.tools.join(', ') })}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {actions.length > 0 ? (
        <div className="a-card" style={{ marginBlockStart: 16 }}>
          <h2>{t('assistant.conv_actions')}</h2>
          {actions.map((action) => (
            <div key={action.id} className="a-ai-card" style={{ marginBlockEnd: 10 }}>
              <p className="a-ai-card-t">
                {action.kind}{' '}
                <Pill
                  tone={
                    action.status === 'done'
                      ? 'good'
                      : action.status === 'failed'
                        ? 'bad'
                        : 'neutral'
                  }
                >
                  {action.status}
                </Pill>
              </p>
              <dl>
                {Object.entries(action.summary)
                  .filter(([, value]) => value !== null && value !== '' && value !== undefined)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd dir="auto">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
