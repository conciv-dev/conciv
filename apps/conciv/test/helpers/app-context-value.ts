import {QueryClient} from '@tanstack/solid-query'
import {makeRpcClient} from '@conciv/contract'
import {type AppContextValue} from '../../src/app/context.js'
import {makeLiveSessions} from '../../src/app/live-sessions.js'
import {createWarmSession} from '../../src/app/warm-session.js'
import {makeAppData} from '../../src/data/app-data.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {makeLayerStack} from '../../src/shell/dialogs.js'
import type {ExtensionInstance} from '../../src/extension/extension-slots.js'

export type AppContextValueOptions = {
  base: string
  announce?: (message: string) => void
  instances?: ExtensionInstance[]
}

export function makeAppContextValue(options: AppContextValueOptions): AppContextValue {
  const rpc = makeRpcClient(options.base)
  const queryClient = new QueryClient()
  const announce = options.announce
  const data = makeAppData(rpc, queryClient)
  const connected = () => true
  return {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data,
    liveSessions: makeLiveSessions(),
    warmSession: createWarmSession(data, connected, queryClient),
    queryClient,
    announce: (message) => announce?.(message),
    layers: makeLayerStack(),
    suppressed: () => undefined,
    fabPosition: () => 'bottom-right',
    instances: options.instances ?? [],
    connected,
    arrivedFromConnect: () => false,
    connectBind: async () => '',
    connectMode: false,
    connectionGeneration: () => 0,
    apiBase: () => options.base,
    notifyInteractive: () => {},
    colorScheme: () => 'dark',
    widgetSettings: {
      scheme: () => ({value: 'auto', source: 'default'}),
      isLoading: () => false,
      isError: () => false,
      retry: () => {},
    },
  }
}
