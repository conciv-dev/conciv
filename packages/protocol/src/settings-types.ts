import {z} from 'zod'

export const SettingsSchemas = {
  scheme: z.enum(['auto', 'light', 'dark']).default('auto'),
} as const

export type SettingsKey = keyof typeof SettingsSchemas

export const SETTINGS_KEYS = Object.keys(SettingsSchemas) as SettingsKey[]

export type SettingsValueOf<K extends SettingsKey> = z.infer<(typeof SettingsSchemas)[K]>

export function isSettingsKey(key: string): key is SettingsKey {
  return (SETTINGS_KEYS as string[]).includes(key)
}

export function settingsDefault<K extends SettingsKey>(key: K): SettingsValueOf<K> {
  return SettingsSchemas[key].parse(undefined)
}

export const SettingsScopeSchema = z.enum(['project', 'global'])
export type SettingsScope = z.infer<typeof SettingsScopeSchema>

export const SettingsActorSchema = z.enum(['user', 'agent'])
export type SettingsActor = z.infer<typeof SettingsActorSchema>

export const SettingsSourceSchema = z.enum(['project', 'global', 'default'])
export type SettingsSource = z.infer<typeof SettingsSourceSchema>

export const ResolvedSettingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source: SettingsSourceSchema,
})
export type ResolvedSetting = z.infer<typeof ResolvedSettingSchema>

export const SETTINGS_CHANGED_EVENT = 'conciv.settings-changed'

export type SettingsChangedPayload = {key: string; scope: SettingsScope}

export const SettingsLogEntrySchema = z.object({
  scope: SettingsScopeSchema,
  id: z.number().int(),
  key: z.string(),
  value: z.unknown().nullable(),
  actor: SettingsActorSchema,
  createdAt: z.number(),
})
export type SettingsLogEntry = z.infer<typeof SettingsLogEntrySchema>
