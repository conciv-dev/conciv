import {z} from 'zod'
import {readStorage, writeStorage} from '@conciv/ui-kit-system'

const SettingsTabSchema = z.enum(['general', 'views', 'shortcuts', 'advanced'])

export type SettingsTabId = z.infer<typeof SettingsTabSchema>

const LAST_TAB_KEY = 'conciv:settings-tab'

export const SETTINGS_TAB_ROUTES = {
  general: '/panel/$sessionId/settings/general',
  views: '/panel/$sessionId/settings/views',
  shortcuts: '/panel/$sessionId/settings/shortcuts',
  advanced: '/panel/$sessionId/settings/advanced',
} as const

export function readLastTab(): SettingsTabId {
  return readStorage(LAST_TAB_KEY, (raw) => SettingsTabSchema.safeParse(raw).data, 'general')
}

export function writeLastTab(tab: SettingsTabId): void {
  writeStorage(LAST_TAB_KEY, tab)
}
