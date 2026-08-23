import {createMemo, type Accessor} from 'solid-js'
import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {z} from 'zod'
import {
  settingsRegistry,
  type SettingsLayerValue,
  type SettingsRead,
  type SettingsSource,
} from '@conciv/protocol/settings-types'
import type {AppData} from './app-data.js'

export const SCHEME_KEY = 'appearance.scheme'

const SchemeValueSchema = z.enum(['auto', 'light', 'dark'])
export type SchemeValue = z.infer<typeof SchemeValueSchema>
export const SCHEME_VALUES: readonly SchemeValue[] = SchemeValueSchema.options

export const FALLBACK_SCHEME: SchemeValue = SchemeValueSchema.catch('auto').parse(
  settingsRegistry.entry(SCHEME_KEY)?.fallback,
)

export type SchemeLayers = {project: SettingsLayerValue; global: SettingsLayerValue}

export type SchemeSetting = {
  value: SchemeValue
  source: SettingsSource
  layers: SchemeLayers
}

export type SettingsRevisions = {project: string; global: string}

export const ABSENT_LAYER: SettingsLayerValue = {state: 'absent', value: undefined}

const DEFAULT_LAYERS: SchemeLayers = {project: ABSENT_LAYER, global: ABSENT_LAYER}

const DEFAULT_SCHEME: SchemeSetting = {value: FALLBACK_SCHEME, source: 'default', layers: DEFAULT_LAYERS}

const NO_REVISIONS: SettingsRevisions = {project: '', global: ''}

function schemeOf(read: SettingsRead | undefined): SchemeSetting {
  const view = read?.keys.find((entry) => entry.key === SCHEME_KEY)
  if (!view) return DEFAULT_SCHEME
  const parsed = SchemeValueSchema.safeParse(view.value)
  if (!parsed.success) return {value: FALLBACK_SCHEME, source: 'default', layers: view.layers}
  return {value: parsed.data, source: view.source, layers: view.layers}
}

function revisionsOf(read: SettingsRead | undefined): SettingsRevisions {
  if (!read) return NO_REVISIONS
  return {project: read.layers.project.revision, global: read.layers.global.revision}
}

export type WidgetSettings = {
  scheme: Accessor<SchemeSetting>
  revisions: Accessor<SettingsRevisions>
  isLoading: Accessor<boolean>
  isError: Accessor<boolean>
  retry: () => void
}

export function createWidgetSettings(data: AppData, queryClient: QueryClient): WidgetSettings {
  const query = useQuery(
    () => data.utils.settings.get.queryOptions({retry: false}),
    () => queryClient,
  )
  const scheme = createMemo(() => (query.isSuccess ? schemeOf(query.data) : DEFAULT_SCHEME))
  const revisions = createMemo(() => (query.isSuccess ? revisionsOf(query.data) : NO_REVISIONS))
  return {
    scheme,
    revisions,
    isLoading: () => query.isLoading,
    isError: () => query.isError,
    retry: () => void query.refetch(),
  }
}
