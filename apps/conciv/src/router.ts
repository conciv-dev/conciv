import {createRouter} from '@tanstack/solid-router'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import type {AnyExtension} from '@conciv/extension'
import {routeTree} from './routeTree.gen'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import type {ExtensionInstance} from './extension/extension-slots.js'
import highlight from './extensions/highlight.js'
import {PendingPane} from './shell/pending.js'

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
  grabProvider?: GrabProvider
  apiBase: () => string
  connectionGeneration: () => number
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
  grabProvider?: GrabProvider
  apiBase?: () => string
  connectionGeneration?: () => number
}

function createInstances(extensions: AnyExtension[]): ExtensionInstance[] {
  return extensions.flatMap((extension) => {
    try {
      const result = extension.__client?.()
      return [
        {
          extension,
          clientValue: result?.value ?? {},
          effects: result?.effects ?? [],
          dispose: result?.dispose ?? (() => {}),
        },
      ]
    } catch (error) {
      console.error(`[conciv] extension "${extension.name}" failed to mount`, error)
      return []
    }
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
    defaultPendingComponent: PendingPane,
    defaultPendingMs: 300,
    defaultPendingMinMs: 500,
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
      grabProvider: config.grabProvider,
      apiBase: config.apiBase ?? (() => ''),
      connectionGeneration: config.connectionGeneration ?? (() => 0),
    },
  })
}

export function disposeConcivRouter(router: ReturnType<typeof createConcivRouter>): void {
  for (const instance of router.options.context.instances) {
    try {
      instance.dispose()
    } catch (error) {
      console.error('[conciv] extension instance teardown failed', error)
    }
  }
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createConcivRouter>
  }
}
