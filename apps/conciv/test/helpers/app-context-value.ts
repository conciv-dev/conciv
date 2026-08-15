import {QueryClient} from '@tanstack/solid-query'
import {makeRpcClient} from '@conciv/contract'
import {type AppContextValue} from '../../src/app/context.js'
import {makeLiveSessions} from '../../src/app/live-sessions.js'
import {makeAppData} from '../../src/data/app-data.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {makeLayerStack} from '../../src/shell/dialogs.js'

export type AppContextValueOptions = {base: string; announce?: (message: string) => void}

export function makeAppContextValue(options: AppContextValueOptions): AppContextValue {
  const rpc = makeRpcClient(options.base)
  const queryClient = new QueryClient()
  const announce = options.announce
  return {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data: makeAppData(rpc, queryClient),
    liveSessions: makeLiveSessions(),
    queryClient,
    announce: (message) => announce?.(message),
    layers: makeLayerStack(),
    suppressed: () => undefined,
    fabPosition: () => 'bottom-right',
    instances: [],
    connected: () => true,
    arrivedFromConnect: () => false,
    connectBind: async () => '',
    connectMode: false,
    connectionGeneration: () => 0,
    apiBase: () => options.base,
  }
}
