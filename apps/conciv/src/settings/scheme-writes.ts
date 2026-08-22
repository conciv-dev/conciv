import {useMutation, type QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'
import type {ResolvedSetting, SettingsScope, SettingsSource} from '@conciv/protocol/settings-types'
import type {AppData} from '../data/app-data.js'
import type {SchemeSetting, SchemeValue} from '../data/widget-settings.js'

export type SchemeWrite = {
  set?: {value: SchemeValue; scope: SettingsScope}
  clear: SettingsScope[]
  announcement: string
  expected?: SchemeSetting
}

export type SchemeWrites = {
  run: (write: SchemeWrite) => void
  isPending: () => boolean
  isError: () => boolean
  retryLast: () => void
}

function scopeForSource(source: SettingsSource): SettingsScope {
  return source === 'global' ? 'global' : 'project'
}

export function scopeLabelFor(source: SettingsSource): string {
  return source === 'global' ? 'all projects' : 'this project'
}

export function schemeWriteFor(value: SchemeValue, source: SettingsSource): SchemeWrite {
  const scope = scopeForSource(source)
  return {
    set: {value, scope},
    clear: [],
    announcement: `Color scheme set to ${value} for ${scopeLabelFor(source)}`,
    expected: {value, source: scope},
  }
}

export function applyGloballyWrite(value: SchemeValue): SchemeWrite {
  return {
    set: {value, scope: 'global'},
    clear: ['project'],
    announcement: `Color scheme ${value} now applies to all projects`,
    expected: {value, source: 'global'},
  }
}

export function forkToProjectWrite(value: SchemeValue): SchemeWrite {
  return {
    set: {value, scope: 'project'},
    clear: [],
    announcement: `Color scheme ${value} now applies to this project only`,
    expected: {value, source: 'project'},
  }
}

export function useGlobalValueWrite(): SchemeWrite {
  return {clear: ['project'], announcement: 'Color scheme now follows your global value'}
}

export function resetWrite(layers: SettingsScope[]): SchemeWrite {
  return {clear: layers, announcement: 'Color scheme reset to the default'}
}

export function createSchemeWrites(options: {
  rpc: RpcClient
  data: AppData
  queryClient: QueryClient
  announce: (message: string, assertive?: boolean) => void
}): SchemeWrites {
  const queryKey = options.data.utils.settings.get.queryOptions().queryKey
  const mutation = useMutation(
    () => ({
      mutationFn: async (write: SchemeWrite) => {
        if (write.set) await options.rpc.settings.set({key: 'scheme', value: write.set.value, scope: write.set.scope})
        for (const scope of write.clear) await options.rpc.settings.clear({key: 'scheme', scope})
      },
      onMutate: async (write: SchemeWrite) => {
        if (!write.expected) return {previous: undefined}
        await options.queryClient.cancelQueries({queryKey})
        const previous = options.queryClient.getQueryData(queryKey)
        const expected = write.expected
        options.queryClient.setQueryData(queryKey, (rows: ResolvedSetting[] | undefined) =>
          (rows ?? [{key: 'scheme', value: expected.value, source: expected.source}]).map((row) =>
            row.key === 'scheme' ? {key: 'scheme', value: expected.value, source: expected.source} : row,
          ),
        )
        return {previous}
      },
      onError: (_error: Error, _write: SchemeWrite, context: {previous?: ResolvedSetting[]} | undefined) => {
        if (context?.previous) options.queryClient.setQueryData(queryKey, context.previous)
        options.announce('Could not save that setting. Please try again.', true)
      },
      onSuccess: (_result: void, write: SchemeWrite) => options.announce(write.announcement),
      onSettled: () => options.data.invalidateSettings(),
    }),
    () => options.queryClient,
  )
  return {
    run: (write) => mutation.mutate(write),
    isPending: () => mutation.isPending,
    isError: () => mutation.isError,
    retryLast: () => {
      const last = mutation.variables
      if (last) mutation.mutate(last)
    },
  }
}
