import {z} from 'zod'
import {readStorage, writeStorage} from '@conciv/ui-kit-system'

const SettingsTabSchema = z.enum(['general', 'views', 'shortcuts', 'plugins', 'advanced'])

const LastTabSchema = z.union([SettingsTabSchema, z.object({extension: z.string().min(1)})])

export type SettingsTabId = z.infer<typeof SettingsTabSchema>

export type LastTab = z.infer<typeof LastTabSchema>

const LAST_TAB_KEY = 'conciv:settings-tab'

export const SETTINGS_TAB_ROUTES = {
  general: '/panel/$sessionId/settings/general',
  views: '/panel/$sessionId/settings/views',
  shortcuts: '/panel/$sessionId/settings/shortcuts',
  plugins: '/panel/$sessionId/settings/plugins',
  advanced: '/panel/$sessionId/settings/advanced',
} as const

export function readLastTab(): LastTab {
  return readStorage(LAST_TAB_KEY, (raw) => LastTabSchema.safeParse(JSON.parse(raw)).data, 'general')
}

export function writeLastTab(tab: LastTab): void {
  writeStorage(LAST_TAB_KEY, tab, JSON.stringify)
}
