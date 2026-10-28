import activityEditor from './activity-editor'
import activityV2 from './activity-v2'
import activitySheet from './activity-sheet'
import ownerRequests from './owner-requests'
import assistant from './assistant'
import catalog from './catalog'
import clientAnswers from './client-answers'
import commerce from './commerce'
import common from './common'
import content from './content'
import dashboard from './dashboard'
import financeCrm from './finance-crm'
import ops from './ops'
import people from './people'
import phase3 from './phase3'
import protection from './protection'
import reports from './reports'
import suppliers from './suppliers'
import system from './system'
import whatsapp from './whatsapp'
import { format, type AdminLocale, type Messages, type Vars } from './types'

export * from './types'

const SECTIONS = [
  common,
  dashboard,
  catalog,
  content,
  commerce,
  people,
  protection,
  system,
  assistant,
  activityEditor,
  suppliers,
  phase3,
  financeCrm,
  reports,
  ops,
  clientAnswers,
  activityV2,
  activitySheet,
  ownerRequests,
  whatsapp,
]

const MESSAGES: Record<AdminLocale, Messages> = {
  en: Object.assign({}, ...SECTIONS.map((section) => section.en)) as Messages,
  ar: Object.assign({}, ...SECTIONS.map((section) => section.ar)) as Messages,
}

export function messagesFor(locale: AdminLocale): Messages {
  return MESSAGES[locale]
}

export type Translate = (key: string, vars?: Vars) => string

export function translator(locale: AdminLocale): Translate {
  const own = MESSAGES[locale]
  const fallback = MESSAGES.en
  return (key, vars) => format(own[key] ?? fallback[key] ?? key, vars)
}
