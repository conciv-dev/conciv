import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {createMemo} from 'solid-js'
import {isEqual} from 'es-toolkit'
import type {SettingsStore} from '@conciv/extension'
import type {SettingsScope} from '@conciv/contract'
import type {AppData} from '../data/app-data.js'
import type {ConcivSettings} from '../data/settings.js'
import {
  PREFERENCE_DEFAULTS,
  PreferencesSchema,
  SHORTCUT_DEFAULTS,
  type PreferencesApi,
  type ShortcutCommand,
} from './preferences-schema.js'

const PREFERENCES_TARGET: {scope: SettingsScope; namespace: string} = {scope: 'project', namespace: 'conciv'}

type PreferencesOptions = {
  store: SettingsStore
  data: AppData
  queryClient: QueryClient
  connected: () => boolean
  host: ConcivSettings
}

export function createPreferences(options: PreferencesOptions): PreferencesApi {
  const snapshot = useQuery(
    () => ({
      ...options.data.utils.settings.changes.experimental_liveOptions({input: PREFERENCES_TARGET}),
      enabled: options.connected(),
    }),
    () => options.queryClient,
  )
  const stored = createMemo(() => PreferencesSchema.parse(snapshot.data?.value ?? {}))
  const hostHotkeys = (command: ShortcutCommand): string[] | null =>
    command === 'quickTerminal' ? options.host.quickTerminal.hotkeys : null
  return {
    stored,
    status: () => (snapshot.data ? 'success' : snapshot.status),
    retry: () => void snapshot.refetch(),
    shortcut: (command) => hostHotkeys(command) ?? stored().commandShortcuts[command] ?? SHORTCUT_DEFAULTS[command],
    shortcutLock: (command) => lockReason(options.host, hostHotkeys(command)),
    write: (key, value) =>
      isEqual(value, PREFERENCE_DEFAULTS[key]) ? options.store.delete(key) : options.store.set(key, value),
    clear: async () => {
      await Promise.all(Object.keys(snapshot.data?.value ?? {}).map((key) => options.store.delete(key)))
    },
  }
}

function lockReason(host: ConcivSettings, hotkeys: string[] | null): string | undefined {
  if (!host.quickTerminal.enabled) return 'The quick terminal is turned off in conciv({quickTerminal: false}).'
  if (hotkeys) return 'Set in conciv({quickTerminal: {hotkey}}) by this project.'
  return undefined
}
