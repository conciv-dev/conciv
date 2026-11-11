import {useQuery, type QueryClient} from '@conciv/client'
import {createMemo} from 'solid-js'
import type {SettingsScope} from '@conciv/contract'
import type {AppData} from '../data/app-data.js'
import {mergeSettings} from '@conciv/extension'

type SettingsLayersOptions = {
  data: AppData
  queryClient: QueryClient
  connected: () => boolean
  namespace: string
}

const NOTES: Record<SettingsScope, string> = {project: 'From all projects', global: 'This project overrides it'}

export function createSettingsLayers(options: SettingsLayersOptions) {
  const follow = (scope: SettingsScope) =>
    useQuery(
      () => ({
        ...options.data.utils.settings.changes.experimental_liveOptions({
          input: {scope, namespace: options.namespace},
        }),
        enabled: options.connected(),
      }),
      () => options.queryClient,
    )
  const snapshots = {project: follow('project'), global: follow('global')}
  const layer = (scope: SettingsScope): Record<string, unknown> => {
    const snapshot = snapshots[scope]
    return snapshot.isPending ? {} : (snapshot.data?.value ?? {})
  }
  const has = (scope: SettingsScope, key: string) => Object.hasOwn(layer(scope), key)
  const applied = createMemo(() => mergeSettings(layer('project'), layer('global')))
  return {
    status: (): 'pending' | 'error' | 'success' => {
      if (snapshots.project.isPending || snapshots.global.isPending) return 'pending'
      return snapshots.project.data && snapshots.global.data ? 'success' : 'error'
    },
    retry: () => {
      void snapshots.project.refetch()
      void snapshots.global.refetch()
    },
    applied,
    shown: (scope: SettingsScope) => (scope === 'project' ? applied() : layer('global')),
    fallthrough: (scope: SettingsScope) => (scope === 'project' ? layer('global') : {}),
    note: (scope: SettingsScope, key: string): string | undefined => {
      if (scope === 'global') return has('project', key) ? NOTES.global : undefined
      return !has('project', key) && has('global', key) ? NOTES.project : undefined
    },
  }
}
