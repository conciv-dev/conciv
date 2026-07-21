import {createRouter} from '@tanstack/solid-router'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'
import type {AnyExtension} from '@conciv/extension'
import {routeTree} from './routeTree.gen'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import type {ExtensionInstance} from './extension/extension-slots.js'
import highlight from './extensions/highlight.js'

export type ConcivEnvironment = {rootNode: Node; document: Document}

export type ConcivRouterContext = {
  rpc: RpcClient
  environment: ConcivEnvironment
  settings: ConcivSettings
  queryClient: QueryClient
  data: AppData
  extensions: AnyExtension[]
  instances: ExtensionInstance[]
  connected: () => boolean
  connectMode: boolean
  bindApiBase?: (apiBase: string) => void
  disconnect?: () => void
}

export type ConcivRouterConfig = {
  rpc: RpcClient
  history: RouterHistory
  environment: ConcivEnvironment
  settings: ConcivSettings
  extensions?: AnyExtension[]
  connected?: () => boolean
  connectMode?: boolean
  bindApiBase?: (apiBase: string) => void
  disconnect?: () => void
}

function createInstances(extensions: AnyExtension[]): ExtensionInstance[] {
  return extensions.map((extension) => {
    const result = extension.__client?.()
    return {extension, clientValue: result?.value ?? {}}
  })
}

export function createConcivRouter(config: ConcivRouterConfig) {
  const queryClient = new QueryClient()
  const data = makeAppData(config.rpc, queryClient)
  const extensions = [highlight, ...(config.extensions ?? [])]
  return createRouter({
    routeTree,
    history: config.history,
    scrollRestoration: () => false,
    context: {
      rpc: config.rpc,
      environment: config.environment,
      settings: config.settings,
      queryClient,
      data,
      extensions,
      instances: createInstances(extensions),
      connected: config.connected ?? (() => true),
      connectMode: config.connectMode ?? false,
      bindApiBase: config.bindApiBase,
      disconnect: config.disconnect,
    },
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createConcivRouter>
  }
}
