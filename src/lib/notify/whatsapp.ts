/**
 * WhatsApp Business — Meta Cloud API.
 *
 * رسائل المبادرة (خارج نافذة الـ 24 ساعة بعد آخر رسالة من العميل) يجب أن تكون
 * **قوالب معتمدة** من Meta. لذلك كل نوع إشعار يُرسل كقالب:
 *
 *   اسم القالب  = `${WHATSAPP_TEMPLATE_PREFIX}${type}`   (افتراضياً `bali_order_paid`…)
 *   اللغة       = ar | en | id حسب لغة المستخدم
 *   المعاملات   = WHATSAPP_PARAM_ORDER[type]
 *
 * يجب إنشاء هذه القوالب واعتمادها في Meta Business Manager قبل التشغيل.
 * بدون `WHATSAPP_TOKEN` و`WHATSAPP_PHONE_NUMBER_ID` يتجاهل المرسل كل شيء ويسجّل
 * ذلك (بيئة التطوير).
 */

import { WHATSAPP_PARAM_ORDER, type NotificationParams, type NotificationType } from './types'

const GRAPH = 'https://graph.facebook.com/v20.0'

export interface WhatsappConfig {
  token: string
  phoneNumberId: string
  templatePrefix: string
}

export function whatsappConfig(): WhatsappConfig | null {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return null
  return { token, phoneNumberId, templatePrefix: process.env.WHATSAPP_TEMPLATE_PREFIX ?? 'bali_' }
}

/**
 * رقم بصيغة E.164 بلا `+`، أو null. أرقام المستخدمين مخزنة كما كُتبت.
 * 0-بادئة محلية بلا رمز دولة لا يمكن تخمينها → null (لا نرسل لرقم خاطئ).
 */
export function toWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  const normalized = trimmed.startsWith('00') ? digits.slice(2) : digits
  if (!international) return null
  return normalized.length >= 8 && normalized.length <= 15 ? normalized : null
}

export function buildTemplatePayload(
  to: string,
  type: NotificationType,
  params: NotificationParams,
  locale: string,
  prefix: string,
) {
  const order = WHATSAPP_PARAM_ORDER[type] ?? []
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: `${prefix}${type}`,
      language: { code: locale === 'ar' ? 'ar' : locale === 'id' ? 'id' : 'en' },
      components:
        order.length === 0
          ? []
          : [
              {
                type: 'body',
                parameters: order.map((key) => ({
                  type: 'text',
                  // حد Meta لكل معامل ~1024؛ نقصّر بأمان.
                  text: String(params[key] ?? '-').slice(0, 200),
                })),
              },
            ],
    },
  }
}

export type WhatsappResult =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: 'not_configured' | 'no_number' | 'rejected'; detail?: string }

export async function sendWhatsappTemplate(
  to: string | null,
  type: NotificationType,
  params: NotificationParams,
  locale: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsappResult> {
  const config = whatsappConfig()
  if (config === null) {
    console.info('[whatsapp] not configured; skipping', { type })
    return { sent: false, reason: 'not_configured' }
  }
  if (to === null) return { sent: false, reason: 'no_number' }

  const response = await fetchImpl(
    `${GRAPH}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTemplatePayload(to, type, params, locale, config.templatePrefix)),
    },
  )
  const body = (await response.json().catch(() => ({}))) as {
    messages?: { id?: string }[]
    error?: { message?: string; code?: number }
  }
  if (!response.ok) {
    // 4xx (قالب غير معتمد، رقم غير صالح) لا تتحسن بإعادة المحاولة؛ 5xx/429 تتحسن.
    if (response.status >= 500 || response.status === 429) {
      throw new Error(`WhatsApp HTTP ${response.status}: ${body.error?.message ?? ''}`)
    }
    return { sent: false, reason: 'rejected', detail: body.error?.message }
  }
  return { sent: true, messageId: body.messages?.[0]?.id ?? null }
}
