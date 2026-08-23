import {useMutation, type QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'
import type {SettingsRead, SettingsScope, SettingsSource} from '@conciv/protocol/settings-types'
import type {AppData} from '../data/app-data.js'
import {
  ABSENT_LAYER,
  FALLBACK_SCHEME,
  SCHEME_KEY,
  type SchemeLayers,
  type SchemeValue,
  type SettingsRevisions,
} from '../data/widget-settings.js'

export type SchemeWrite =
  | {kind: 'set'; value: SchemeValue; scope: SettingsScope; announcement: string}
  | {kind: 'clear'; scope: SettingsScope; announcement: string}
  | {kind: 'apply-globally'; value: SchemeValue; announcement: string}
  | {kind: 'reset'; announcement: string}

export type SchemeWriteError = {message: string; announcement: string; retryable: boolean}

export type SchemeWrites = {
  run: (write: SchemeWrite) => void
  isPending: () => boolean
  error: () => SchemeWriteError | undefined
  retryLast: () => void
}

export function schemeWriteFor(value: SchemeValue, source: SettingsSource): SchemeWrite {
  return {
    kind: 'set',
    value,
    scope: 'project',
    announcement:
      source === 'global'
        ? `Color scheme set to ${value} for this project only. Your global setting still applies to your other projects.`
        : `Color scheme set to ${value} for this project`,
  }
}

export function applyGloballyWrite(value: SchemeValue): SchemeWrite {
  return {kind: 'apply-globally', value, announcement: `Color scheme ${value} now applies to all projects`}
}

export function forkToProjectWrite(value: SchemeValue): SchemeWrite {
  return {
    kind: 'set',
    value,
    scope: 'project',
    announcement: `Color scheme ${value} now applies to this project only`,
  }
}

export function useGlobalValueWrite(): SchemeWrite {
  return {kind: 'clear', scope: 'project', announcement: 'Color scheme now follows your global value'}
}

export function resetWrite(): SchemeWrite {
  return {kind: 'reset', announcement: 'Color scheme reset to the default'}
}

function validLayer(value: SchemeValue) {
  return {state: 'valid' as const, value}
}

function layersAfter(layers: SchemeLayers, write: SchemeWrite): SchemeLayers {
  if (write.kind === 'apply-globally') return {project: ABSENT_LAYER, global: validLayer(write.value)}
  if (write.kind === 'set' && write.scope === 'project') return {...layers, project: validLayer(write.value)}
  if (write.kind === 'set') return {...layers, global: validLayer(write.value)}
  if (write.kind === 'reset') return {project: ABSENT_LAYER, global: ABSENT_LAYER}
  return {
    project: write.scope === 'project' ? ABSENT_LAYER : layers.project,
    global: write.scope === 'global' ? ABSENT_LAYER : layers.global,
  }
}

function resolvedFrom(layers: SchemeLayers): {value: unknown; source: SettingsSource} {
  if (layers.project.state === 'valid') return {value: layers.project.value, source: 'project'}
  if (layers.global.state === 'valid') return {value: layers.global.value, source: 'global'}
  return {value: FALLBACK_SCHEME, source: 'default'}
}

function optimisticRead(read: SettingsRead, write: SchemeWrite): SettingsRead {
  return {
    ...read,
    keys: read.keys.map((view) => {
      if (view.key !== SCHEME_KEY) return view
      const layers = layersAfter(view.layers, write)
      return {...view, layers, ...resolvedFrom(layers)}
    }),
  }
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if (!('code' in error)) return undefined
  const code = error.code
  return typeof code === 'string' ? code : undefined
}

const WRITE_ERRORS: Record<string, SchemeWriteError> = {
  REVISION_CONFLICT: {
    message: 'Your settings changed somewhere else. We reloaded them, so try that again.',
    announcement: 'Color scheme not saved because the settings were changed elsewhere. Reloaded, please choose again.',
    retryable: true,
  },
  LAYER_UNPARSEABLE: {
    message: 'Your settings file has a syntax error. Fix the file, then change this again.',
    announcement: 'Color scheme not saved because the settings file has a syntax error.',
    retryable: false,
  },
  LOCK_TIMEOUT: {
    message: 'Another server is saving your settings. Try again in a moment.',
    announcement: 'Color scheme not saved because another server is saving settings right now.',
    retryable: true,
  },
  INVALID_VALUE: {
    message: 'That value is not one this setting accepts.',
    announcement: 'Color scheme not saved because that value is not accepted.',
    retryable: false,
  },
  UNKNOWN_KEY: {
    message: 'This setting is not one the server knows about.',
    announcement: 'Color scheme not saved because the server does not know this setting.',
    retryable: false,
  },
}

const GENERIC_WRITE_ERROR: SchemeWriteError = {
  message: 'Could not save that setting.',
  announcement: 'Color scheme not saved. Please try again.',
  retryable: true,
}

function writeErrorFor(error: unknown): SchemeWriteError {
  const code = errorCodeOf(error)
  if (!code) return GENERIC_WRITE_ERROR
  return WRITE_ERRORS[code] ?? GENERIC_WRITE_ERROR
}

export function createSchemeWrites(options: {
  rpc: RpcClient
  data: AppData
  queryClient: QueryClient
  revisions: () => SettingsRevisions
  announce: (message: string, assertive?: boolean) => void
}): SchemeWrites {
  const queryKey = options.data.utils.settings.get.queryOptions().queryKey
  const mutation = useMutation(
    () => ({
      mutationFn: async (write: SchemeWrite) => {
        const revisions = options.revisions()
        if (write.kind === 'apply-globally') {
          await options.rpc.settings.applyGlobally({
            key: SCHEME_KEY,
            value: write.value,
            expectedRevisions: revisions,
          })
          return
        }
        if (write.kind === 'set') {
          await options.rpc.settings.set({
            key: SCHEME_KEY,
            value: write.value,
            scope: write.scope,
            expectedRevision: revisions[write.scope],
          })
          return
        }
        if (write.kind === 'reset') {
          await options.rpc.settings.reset({key: SCHEME_KEY, expectedRevisions: revisions})
          return
        }
        await options.rpc.settings.clear({
          key: SCHEME_KEY,
          scope: write.scope,
          expectedRevision: revisions[write.scope],
        })
      },
      onMutate: async (write: SchemeWrite) => {
        await options.queryClient.cancelQueries({queryKey})
        const previous = options.queryClient.getQueryData(queryKey)
        options.queryClient.setQueryData(queryKey, (read: SettingsRead | undefined) =>
          read ? optimisticRead(read, write) : read,
        )
        return {previous}
      },
      onError: (error: Error, _write: SchemeWrite, context: {previous?: SettingsRead} | undefined) => {
        if (context?.previous) options.queryClient.setQueryData(queryKey, context.previous)
        options.announce(writeErrorFor(error).announcement, true)
      },
      onSuccess: (_result: void, write: SchemeWrite) => options.announce(write.announcement),
      onSettled: () => options.data.invalidateSettings(),
    }),
    () => options.queryClient,
  )
  return {
    run: (write) => mutation.mutate(write),
    isPending: () => mutation.isPending,
    error: () => (mutation.isError ? writeErrorFor(mutation.error) : undefined),
    retryLast: () => {
      const last = mutation.variables
      if (last) mutation.mutate(last)
    },
  }
}
