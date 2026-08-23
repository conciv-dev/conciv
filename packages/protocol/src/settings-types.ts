import {z} from 'zod'

export const SETTINGS_CHANGED_EVENT = 'conciv.settings-changed'

export const SettingsScopeSchema = z.enum(['project', 'global'])
export type SettingsScope = z.infer<typeof SettingsScopeSchema>

export const SETTINGS_SCOPES = SettingsScopeSchema.options

export const SettingsSourceSchema = z.enum(['project', 'global', 'default'])
export type SettingsSource = z.infer<typeof SettingsSourceSchema>

export const SettingsActorSchema = z.enum(['user', 'agent', 'file'])
export type SettingsActor = z.infer<typeof SettingsActorSchema>

export const SettingsLayerStateSchema = z.enum(['absent', 'valid', 'invalid'])
export type SettingsLayerState = z.infer<typeof SettingsLayerStateSchema>

export const SettingsLayerFormatSchema = z.enum(['jsonc', 'json', 'absent'])
export type SettingsLayerFormat = z.infer<typeof SettingsLayerFormatSchema>

export type SettingsKeySpec = {
  name: string
  schema: z.ZodType
  fallback: unknown
  label: string
  description: string
}

export type SettingsGroupSpec = {
  namespace: string
  label: string
  keys: readonly SettingsKeySpec[]
}

export type SettingsEntry = {
  key: string
  namespace: string
  name: string
  schema: z.ZodType
  fallback: unknown
  label: string
  description: string
}

export type SettingsRegistry = {
  entries: readonly SettingsEntry[]
  entry: (key: string) => SettingsEntry | undefined
}

function entriesOfGroup(group: SettingsGroupSpec): SettingsEntry[] {
  const seen: string[] = []
  return group.keys.map((spec) => {
    if (seen.includes(spec.name)) {
      throw new Error(`settings registry: namespace "${group.namespace}" registers the key "${spec.name}" twice`)
    }
    seen.push(spec.name)
    return {
      key: `${group.namespace}.${spec.name}`,
      namespace: group.namespace,
      name: spec.name,
      schema: spec.schema,
      fallback: spec.fallback,
      label: spec.label,
      description: spec.description,
    }
  })
}

export function createSettingsRegistry(groups: readonly SettingsGroupSpec[]): SettingsRegistry {
  const namespaces: string[] = []
  const entries: SettingsEntry[] = []
  for (const group of groups) {
    if (namespaces.includes(group.namespace)) {
      throw new Error(`settings registry: the namespace "${group.namespace}" is registered twice`)
    }
    namespaces.push(group.namespace)
    entries.push(...entriesOfGroup(group))
  }
  return {
    entries,
    entry: (key) => entries.find((candidate) => candidate.key === key),
  }
}

export const APPEARANCE_SETTINGS_GROUP: SettingsGroupSpec = {
  namespace: 'appearance',
  label: 'Appearance',
  keys: [
    {
      name: 'scheme',
      schema: z.enum(['auto', 'light', 'dark']),
      fallback: 'auto',
      label: 'Color scheme',
      description: 'Whether the widget follows the host page scheme or pins itself to light or dark.',
    },
  ],
}

export const settingsRegistry = createSettingsRegistry([APPEARANCE_SETTINGS_GROUP])

export const SettingsLayerValueSchema = z.object({
  state: SettingsLayerStateSchema,
  value: z.unknown(),
})
export type SettingsLayerValue = z.infer<typeof SettingsLayerValueSchema>

export const SettingsLayerStatusSchema = z.object({
  path: z.string(),
  format: SettingsLayerFormatSchema,
  revision: z.string(),
  parseError: z.string().nullable(),
  warning: z.string().nullable(),
})
export type SettingsLayerStatus = z.infer<typeof SettingsLayerStatusSchema>

export const SettingsKeyViewSchema = z.object({
  key: z.string(),
  namespace: z.string(),
  label: z.string(),
  description: z.string(),
  value: z.unknown(),
  source: SettingsSourceSchema,
  layers: z.object({project: SettingsLayerValueSchema, global: SettingsLayerValueSchema}),
})
export type SettingsKeyView = z.infer<typeof SettingsKeyViewSchema>

export const SettingsReadSchema = z.object({
  keys: z.array(SettingsKeyViewSchema),
  layers: z.object({project: SettingsLayerStatusSchema, global: SettingsLayerStatusSchema}),
})
export type SettingsRead = z.infer<typeof SettingsReadSchema>

export const SettingsHistoryEntrySchema = z.object({
  ts: z.number(),
  actor: SettingsActorSchema,
  scope: SettingsScopeSchema,
  key: z.string(),
  from: z.unknown().optional(),
  to: z.unknown().optional(),
  opId: z.string(),
})
export type SettingsHistoryEntry = z.infer<typeof SettingsHistoryEntrySchema>

export const SettingsChangedPayloadSchema = z.object({
  opId: z.string(),
  keys: z.array(z.string()),
  scopes: z.array(SettingsScopeSchema),
})
export type SettingsChangedPayload = z.infer<typeof SettingsChangedPayloadSchema>
