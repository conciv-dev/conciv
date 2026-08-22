import {createContext, useContext, type Accessor} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import type {AppData} from '../data/app-data.js'
import type {ConcivSettings} from '../data/settings.js'
import type {ConcivEnvironment} from '../router.js'
import type {LayerStack} from '../shell/dialogs.js'
import type {ExtensionInstance} from '../extension/extension-slots.js'
import type {LiveSessions} from './live-sessions.js'
import type {ColorScheme} from '../lib/color-scheme.js'

export type AppContextValue = {
  rpc: RpcClient
  settings: ConcivSettings
  environment: ConcivEnvironment
  data: AppData
  liveSessions: LiveSessions
  queryClient: QueryClient
  announce: (message: string, assertive?: boolean) => void
  layers: LayerStack
  suppressed: () => '' | undefined
  fabPosition: Accessor<TriggerPosition>
  instances: ExtensionInstance[]
  connected: () => boolean
  arrivedFromConnect: () => boolean
  connectBind: (apiBase: string) => Promise<string>
  connectMode: boolean
  disconnect?: () => void
  grabProvider?: GrabProvider
  connectionGeneration: () => number
  apiBase: () => string
  notifyInteractive: () => void
  colorScheme: Accessor<ColorScheme>
}

export const AppContext = createContext<AppContextValue>()

function useAppScope<Selected>(hook: string, select: (app: AppContextValue) => Selected): Selected {
  const value = useContext(AppContext)
  if (!value) throw new Error(`${hook} called outside the app provider`)
  return select(value)
}

export function useRpc(): RpcClient {
  return useAppScope('useRpc', (app) => app.rpc)
}

export function useSettings(): ConcivSettings {
  return useAppScope('useSettings', (app) => app.settings)
}

export function useAppData(): AppData {
  return useAppScope('useAppData', (app) => app.data)
}

export function useEnvironment(): ConcivEnvironment {
  return useAppScope('useEnvironment', (app) => app.environment)
}

export function useLiveSessions(): LiveSessions {
  return useAppScope('useLiveSessions', (app) => app.liveSessions)
}

export function useAppQueryClient(): QueryClient {
  return useAppScope('useAppQueryClient', (app) => app.queryClient)
}

export function useAnnounce(): (message: string, assertive?: boolean) => void {
  return useAppScope('useAnnounce', (app) => app.announce)
}

export function useLayers(): LayerStack {
  return useAppScope('useLayers', (app) => app.layers)
}

export function useSuppressed(): () => '' | undefined {
  return useAppScope('useSuppressed', (app) => app.suppressed)
}

export function useFabPosition(): Accessor<TriggerPosition> {
  return useAppScope('useFabPosition', (app) => app.fabPosition)
}

export function useInstances(): ExtensionInstance[] {
  return useAppScope('useInstances', (app) => app.instances)
}

export function useConnected(): () => boolean {
  return useAppScope('useConnected', (app) => app.connected)
}

export function useArrivedFromConnect(): () => boolean {
  return useAppScope('useArrivedFromConnect', (app) => app.arrivedFromConnect)
}

export function useConnectBinding(): {bind: (apiBase: string) => Promise<string>} {
  return useAppScope('useConnectBinding', (app) => ({bind: app.connectBind}))
}

export function useDisconnect(): {connectMode: boolean; disconnect?: () => void} {
  return useAppScope('useDisconnect', (app) => ({connectMode: app.connectMode, disconnect: app.disconnect}))
}

export function useGrabProvider(): GrabProvider | undefined {
  return useAppScope('useGrabProvider', (app) => app.grabProvider)
}

export function useConnectionGeneration(): () => number {
  return useAppScope('useConnectionGeneration', (app) => app.connectionGeneration)
}

export function useApiBase(): () => string {
  return useAppScope('useApiBase', (app) => app.apiBase)
}

export function useNotifyInteractive(): () => void {
  return useAppScope('useNotifyInteractive', (app) => app.notifyInteractive)
}

export function useColorScheme(): Accessor<ColorScheme> {
  return useAppScope('useColorScheme', (app) => app.colorScheme)
}
