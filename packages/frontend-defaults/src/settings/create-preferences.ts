import {type QueryClient, useQuery} from '@conciv/client'
import {createMemo} from 'solid-js'
import {isEqual, pickBy} from 'es-toolkit'
import {type Settings, mergeSettings} from '@conciv/client'
import {type SettingsScope} from '@conciv/protocol'
import type {AppData} from '../data/app-data.js'
import type {ConcivSettings, Launcher} from '../data/settings.js'
import {
  PreferencesSchema,
  SHORTCUT_DEFAULTS,
  type LauncherChoice,
  type Preferences,
  type PreferencesApi,
  type ShortcutCommand,
} from './preferences-schema.js'

type SettingsLayersOptions = {
  data: AppData
  queryClient: QueryClient
  connected: () => boolean
  namespace: string
}

const NOTES: Record<SettingsScope, string> = {project: 'From all projects', global: 'This project overrides it'}

function createSettingsLayers(options: SettingsLayersOptions) {
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
  const has = (scope: SettingsScope, key: string, entry?: string) => {
    const value = layer(scope)[key]
    if (entry === undefined) return Object.hasOwn(layer(scope), key)
    return typeof value === 'object' && value !== null && Object.hasOwn(value, entry)
  }
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
    note: (scope: SettingsScope, key: string, entry?: string): string | undefined => {
      if (scope === 'global') return has('project', key, entry) ? NOTES.global : undefined
      return !has('project', key, entry) && has('global', key, entry) ? NOTES.project : undefined
    },
  }
}

const HOST_LOCK = {
  launcher: 'Set in conciv({launcher}) by this project.',
  openOnLoad: 'Set in conciv({defaultOpen}) by this project.',
}

type PreferencesOptions = {
  settings: Settings
  data: AppData
  queryClient: QueryClient
  connected: () => boolean
  host: ConcivSettings
}

function launcherChoice(launcher: Launcher): LauncherChoice {
  if (launcher === false) return 'hidden'
  return launcher
}

export function createPreferences(options: PreferencesOptions): PreferencesApi {
  const layers = createSettingsLayers({
    data: options.data,
    queryClient: options.queryClient,
    connected: options.connected,
    namespace: 'conciv',
  })
  const stored = createMemo(() => PreferencesSchema.parse(layers.applied()))
  const global = createMemo(() => PreferencesSchema.parse(layers.shown('global')))
  const shown = (scope: SettingsScope) => (scope === 'project' ? stored() : global())
  const hostHotkeys = (command: ShortcutCommand): string[] | null =>
    command === 'quickTerminal' ? options.host.quickTerminal.hotkeys : null
  return {
    stored,
    shown,
    note: layers.note,
    status: layers.status,
    retry: layers.retry,
    launcher: () => (options.host.fromHost.launcher ? launcherChoice(options.host.launcher) : stored().launcher),
    openOnLoad: () => (options.host.fromHost.defaultOpen ? options.host.defaultOpen : stored().openOnLoad),
    lock: (key) => {
      const fromHost = key === 'launcher' ? options.host.fromHost.launcher : options.host.fromHost.defaultOpen
      return fromHost ? HOST_LOCK[key] : undefined
    },
    shortcut: (command, scope = 'project') =>
      hostHotkeys(command) ?? shown(scope).commandShortcuts[command] ?? SHORTCUT_DEFAULTS[command],
    shortcutLock: (command) =>
      command === 'togglePanel' ? undefined : shortcutLockReason(options.host, hostHotkeys(command)),
    write: (scope, key, value) => {
      const store = options.settings[scope]
      const below = PreferencesSchema.parse(layers.fallthrough(scope))
      if (key === 'commandShortcuts') {
        const own = ownShortcuts(value, below.commandShortcuts)
        return isEqual(own, {}) ? store.delete(key) : store.set(key, own)
      }
      return isEqual(value, below[key]) ? store.delete(key) : store.set(key, value)
    },
    reset: async (scope, keys) => {
      await Promise.all(keys.map((key) => options.settings[scope].delete(key)))
    },
    clear: async (scope) => {
      const all = await options.settings[scope].all()
      await Promise.all(Object.keys(all).map((key) => options.settings[scope].delete(key)))
    },
  }
}

function ownShortcuts(value: unknown, below: Preferences['commandShortcuts']): Preferences['commandShortcuts'] {
  return pickBy(
    PreferencesSchema.shape.commandShortcuts.parse(value),
    (keys, command) => !isEqual(keys, below[command] ?? SHORTCUT_DEFAULTS[command]),
  )
}

function shortcutLockReason(host: ConcivSettings, hotkeys: string[] | null): string | undefined {
  if (!host.quickTerminal.enabled) return 'The quick terminal is turned off in conciv({quickTerminal: false}).'
  if (hotkeys) return 'Set in conciv({quickTerminal: {hotkey}}) by this project.'
  return undefined
}
