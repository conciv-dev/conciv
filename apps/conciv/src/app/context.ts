import {createContext, useContext, type Accessor} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import type {AppData} from '../data/app-data.js'
import type {ConcivSettings} from '../data/settings.js'
import type {ConcivEnvironment} from '../router.js'
import type {LayerStack} from '../shell/dialogs.js'

export type AppContextValue = {
  rpc: RpcClient
  settings: ConcivSettings
  environment: ConcivEnvironment
  data: AppData
  queryClient: QueryClient
  announce: (message: string, assertive?: boolean) => void
  layers: LayerStack
  suppressed: () => '' | undefined
  fabPosition: Accessor<TriggerPosition>
}

export const AppContext = createContext<AppContextValue>()

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp called outside the app provider')
  return value
}
