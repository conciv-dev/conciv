import {z} from 'zod'
import type {SettingsScope} from '@conciv/contract'
import {DEFAULT_SKIN_NAME, isSkinName, type SkinName} from '@conciv/ui-kit-system'

const SkinSchema = z.custom<SkinName>((value) => typeof value === 'string' && isSkinName(value))

const ShortcutCommandSchema = z.enum(['togglePanel', 'quickTerminal', 'quickNewPane'])

const LauncherChoiceSchema = z.enum(['mascot', 'native', 'hidden'])

export const PreferencesSchema = z.object({
  colorScheme: z.enum(['page', 'light', 'dark']).default('page').catch('page'),
  skin: SkinSchema.default(DEFAULT_SKIN_NAME).catch(DEFAULT_SKIN_NAME),
  launcher: LauncherChoiceSchema.default('mascot').catch('mascot'),
  openOnLoad: z.boolean().default(false).catch(false),
  closeOnOutsideClick: z.boolean().default(false).catch(false),
  docksHidden: z.array(z.string()).default([]).catch([]),
  docksPinned: z.array(z.string()).default([]).catch([]),
  docksCustomOrder: z.record(z.string(), z.number()).default({}).catch({}),
  commandShortcuts: z.partialRecord(ShortcutCommandSchema, z.array(z.string())).default({}).catch({}),
})

export type Preferences = z.infer<typeof PreferencesSchema>

export type PreferenceKey = keyof Preferences

export type ShortcutCommand = z.infer<typeof ShortcutCommandSchema>

export type LauncherChoice = z.infer<typeof LauncherChoiceSchema>

export const SHORTCUT_DEFAULTS: Record<ShortcutCommand, string[]> = {
  togglePanel: ['Mod+.'],
  quickTerminal: ['Mod+`'],
  quickNewPane: ['Mod+D'],
}

export type PreferencesApi = {
  stored: () => Preferences
  shown: (scope: SettingsScope) => Preferences
  note: (scope: SettingsScope, key: string, entry?: string) => string | undefined
  status: () => 'pending' | 'error' | 'success'
  retry: () => void
  launcher: () => LauncherChoice
  openOnLoad: () => boolean
  lock: (key: 'launcher' | 'openOnLoad') => string | undefined
  shortcut: (command: ShortcutCommand, scope?: SettingsScope) => string[]
  shortcutLock: (command: ShortcutCommand) => string | undefined
  write: (scope: SettingsScope, key: PreferenceKey, value: unknown) => Promise<void>
  reset: (scope: SettingsScope, keys: readonly PreferenceKey[]) => Promise<void>
  clear: (scope: SettingsScope) => Promise<void>
}

export const PreferenceKeySchema = PreferencesSchema.keyof()
