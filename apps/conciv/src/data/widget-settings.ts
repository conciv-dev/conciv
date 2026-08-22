import {createMemo, type Accessor} from 'solid-js'
import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {
  SettingsSchemas,
  type ResolvedSetting,
  type SettingsSource,
  type SettingsValueOf,
} from '@conciv/protocol/settings-types'
import type {AppData} from './app-data.js'

export type SchemeValue = SettingsValueOf<'scheme'>

export type SchemeSetting = {value: SchemeValue; source: SettingsSource}

export const SCHEME_VALUES: SchemeValue[] = ['auto', 'light', 'dark']

const DEFAULT_SCHEME: SchemeSetting = {value: 'auto', source: 'default'}

function schemeOf(rows: ResolvedSetting[]): SchemeSetting {
  const row = rows.find((entry) => entry.key === 'scheme')
  if (!row) return DEFAULT_SCHEME
  const parsed = SettingsSchemas.scheme.safeParse(row.value)
  if (!parsed.success) return DEFAULT_SCHEME
  return {value: parsed.data, source: row.source}
}

export type WidgetSettings = {
  scheme: Accessor<SchemeSetting>
  isLoading: Accessor<boolean>
  isError: Accessor<boolean>
  retry: () => void
}

export function createWidgetSettings(data: AppData, queryClient: QueryClient): WidgetSettings {
  const query = useQuery(
    () => data.utils.settings.get.queryOptions(),
    () => queryClient,
  )
  const scheme = createMemo(() => (query.isSuccess ? schemeOf(query.data ?? []) : DEFAULT_SCHEME))
  return {
    scheme,
    isLoading: () => query.isLoading,
    isError: () => query.isError,
    retry: () => void query.refetch(),
  }
}
