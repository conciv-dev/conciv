import {createContext, useContext, type Accessor} from 'solid-js'
import type {QueryClient, ChatSession} from '@conciv/client'
import type {ContractClient} from '@conciv/client'
import type {GrabProvider} from '@conciv/grab'
import type {AppData} from '../data/app-data.js'
import type {ConcivSettings} from '../data/settings.js'
import type {ConcivEnvironment} from '../router.js'
import type {LayerStack} from '@internal/frontend-app-api/lib/layers'
import type {LiveSessions} from './live-sessions.js'
import type {WarmSession} from './warm-session.js'
import type {HostTheme} from '../lib/color-scheme.js'
import type {LauncherAnchor} from '../lib/draggable-position.js'
import type {PreferencesApi} from '../settings/preferences-schema.js'
import type {ServerBinding} from '@internal/frontend-app-api/plugin/servers'
import type {LocalPersistence} from '@internal/frontend-app-api/persistence/storage'

export type AppContextValue = {
  rpc: ContractClient
  settings: ConcivSettings
  environment: ConcivEnvironment
  data: AppData
  liveSessions: LiveSessions
  warmSession: WarmSession
  queryClient: QueryClient
  announce: (message: string, assertive?: boolean) => void
  layers: LayerStack
  suppressed: () => '' | undefined
  fabAnchor: Accessor<LauncherAnchor>
  panelWidthCap: Accessor<number>
  connected: () => boolean
  arrivedFromConnect: () => boolean
  connectBind: (server: ServerBinding) => Promise<string>
  grabProvider?: GrabProvider
  connectionGeneration: () => number
  apiBase: () => string
  notifyInteractive: () => void
  theme: Accessor<HostTheme>
  preferences: PreferencesApi
  localPersistence: LocalPersistence
}

export const AppContext = createContext<AppContextValue>()

function useAppScope<Selected>(hook: string, select: (app: AppContextValue) => Selected): Selected {
  const value = useContext(AppContext)
  if (!value) throw new Error(`${hook} called outside the app provider`)
  return select(value)
}

export function useRpc(): ContractClient {
  return useAppScope('useRpc', (app) => app.rpc)
}

export function useLocalPersistence(): LocalPersistence {
  return useAppScope('useLocalPersistence', (app) => app.localPersistence)
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

export function usePaneChat(sessionId: Accessor<string>): Accessor<ChatSession> {
  return useLiveSessions().open(sessionId)
}

export function useWarmSession(): WarmSession {
  return useAppScope('useWarmSession', (app) => app.warmSession)
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

export function useFabAnchor(): Accessor<LauncherAnchor> {
  return useAppScope('useFabAnchor', (app) => app.fabAnchor)
}

export function usePanelWidthCap(): Accessor<number> {
  return useAppScope('usePanelWidthCap', (app) => app.panelWidthCap)
}

export function useConnected(): () => boolean {
  return useAppScope('useConnected', (app) => app.connected)
}

export function useArrivedFromConnect(): () => boolean {
  return useAppScope('useArrivedFromConnect', (app) => app.arrivedFromConnect)
}

export function useConnectBinding(): {bind: (server: ServerBinding) => Promise<string>} {
  return useAppScope('useConnectBinding', (app) => ({bind: app.connectBind}))
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

export function useHostTheme(): Accessor<HostTheme> {
  return useAppScope('useHostTheme', (app) => app.theme)
}

export function usePreferences(): PreferencesApi {
  return useAppScope('usePreferences', (app) => app.preferences)
}
