import activityEditor from './activity-editor'
import assistant from './assistant'
import catalog from './catalog'
import commerce from './commerce'
import common from './common'
import content from './content'
import dashboard from './dashboard'
import people from './people'
import protection from './protection'
import system from './system'
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
