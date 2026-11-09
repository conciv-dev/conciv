import {z} from 'zod'
import {DEFAULT_SKIN_NAME, isSkinName, type SkinName} from '@conciv/ui-kit-system'

const SkinSchema = z.custom<SkinName>((value) => typeof value === 'string' && isSkinName(value))

const ShortcutCommandSchema = z.enum(['quickTerminal', 'quickNewPane'])

export const PreferencesSchema = z.object({
  colorScheme: z.enum(['page', 'light', 'dark']).default('page').catch('page'),
  skin: SkinSchema.default(DEFAULT_SKIN_NAME).catch(DEFAULT_SKIN_NAME),
  docksHidden: z.array(z.string()).default([]).catch([]),
  docksCustomOrder: z.record(z.string(), z.number()).default({}).catch({}),
  commandShortcuts: z.partialRecord(ShortcutCommandSchema, z.array(z.string())).default({}).catch({}),
})

export type Preferences = z.infer<typeof PreferencesSchema>

export type ShortcutCommand = z.infer<typeof ShortcutCommandSchema>

export const PREFERENCE_DEFAULTS: Preferences = PreferencesSchema.parse({})

export const SHORTCUT_DEFAULTS: Record<ShortcutCommand, string[]> = {
  quickTerminal: ['Mod+`'],
  quickNewPane: ['Mod+D'],
}

export type PreferencesApi = {
  stored: () => Preferences
  status: () => 'pending' | 'error' | 'success'
  retry: () => void
  shortcut: (command: ShortcutCommand) => string[]
  shortcutLock: (command: ShortcutCommand) => string | undefined
  write: (key: keyof Preferences, value: unknown) => Promise<void>
  clear: () => Promise<void>
}

export const PreferenceKeySchema = PreferencesSchema.keyof()
