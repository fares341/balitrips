/**
 * «تلخيص العقد» — an Arabic, structured summary of an operator contract,
 * from the existing OpenRouter integration (`@/lib/assistant`).
 *
 * The contract text is sent once, with `data_collection: 'deny'` (only
 * providers that do not keep or train on prompts). The answer must be JSON;
 * anything else is refused rather than stored. The summary is shown in the
 * Studio as AI output that a person must check against the contract.
 */

import type { ContractSummary } from '@/db/schema'

export const SUMMARY_FIELDS = [
  'prices',
  'paymentTerms',
  'cancellation',
  'liabilities',
  'duration',
  'other',
] as const

export function summaryPrompt(text: string): { system: string; user: string } {
  return {
    system: [
      'أنت مساعد يلخّص عقود مشغّلي الأنشطة السياحية في بالي لفريق شركة سياحة.',
      'اكتب بالعربية الفصحى المبسّطة، بإيجاز، واعتمد فقط على نص العقد المرفق.',
      'لا تخترع أرقامًا أو شروطًا. إن لم يذكر العقد بندًا فاكتب: «غير مذكور في العقد».',
      'أجب بكائن JSON فقط، بلا أي نص قبله أو بعده، بهذه المفاتيح:',
      '{"prices": "الأسعار وسعر الصافي والعمولة",',
      ' "paymentTerms": "شروط الدفع ومواعيده",',
      ' "cancellation": "الإلغاء والاسترداد",',
      ' "liabilities": "المسؤوليات والتأمين والحوادث",',
      ' "duration": "مدة العقد والتجديد والإنهاء",',
      ' "redFlags": ["بنود تستحق الانتباه أو تبدو مجحفة أو غامضة"],',
      ' "other": "أي شيء مهم آخر"}',
    ].join('\n'),
    user: `نص العقد:\n\n${text}`,
  }
}

function clean(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** The model's answer → a summary, or null when it is not the JSON asked for. */
export function parseSummary(answer: string): ContractSummary | null {
  const start = answer.indexOf('{')
  const end = answer.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let raw: unknown
  try {
    raw = JSON.parse(answer.slice(start, end + 1))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const summary: ContractSummary = {
    prices: clean(record.prices),
    paymentTerms: clean(record.paymentTerms),
    cancellation: clean(record.cancellation),
    liabilities: clean(record.liabilities),
    duration: clean(record.duration),
    other: clean(record.other),
    redFlags: Array.isArray(record.redFlags)
      ? record.redFlags
          .map((flag) => clean(flag, 500))
          .filter((flag) => flag !== '')
          .slice(0, 20)
      : [],
  }
  const empty =
    SUMMARY_FIELDS.every((field) => summary[field] === '') && summary.redFlags.length === 0
  return empty ? null : summary
}
