import {createRouter} from '@tanstack/solid-router'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient} from '@tanstack/solid-query'
import {createEffect, createRoot, onCleanup, type Accessor, type JSX} from 'solid-js'
import type {RpcClient} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import type {ClientExtension} from '@conciv/extension'
import {setupEngineReachability} from '@conciv/client'
import type {HubConnection} from './app/devframe-link.js'
import {routeTree} from './routeTree.gen'
import {makeAppData, type AppData} from './data/app-data.js'
import {createHarnessMeta, HarnessMetaContext} from './data/harness-meta.js'
import type {ConcivSettings} from './data/settings.js'
import type {ExtensionInstance} from './extension/extension-slots.js'
import {createInstances} from './extension/create-instances.js'
import highlight from './extensions/highlight.js'
import {PendingPane} from './shell/pending.js'
import {defaultErrorComponent} from './shell/default-error-component.js'

export type ConcivEnvironment = {rootNode: Node; document: Document}

export type ConcivRouterContext = {
  rpc: RpcClient
  hub?: Accessor<HubConnection>
  environment: ConcivEnvironment
  settings: ConcivSettings
  queryClient: QueryClient
  data: AppData
  extensions: ClientExtension[]
  instances: ExtensionInstance[]
  connected: () => boolean
  connectMode: boolean
  bindApiBase?: (apiBase: string) => void
  disconnect?: () => void
  grabProvider?: GrabProvider
  apiBase: () => string
  connectionGeneration: () => number
  bindActiveSession?: (read: () => string | null) => void
  disposeInstances: () => void
  notifyInteractive: () => void
}

export type ConcivRouterConfig = {
  rpc: RpcClient
  hubConnection?: Accessor<HubConnection>
  history: RouterHistory
  environment: ConcivEnvironment
  settings: ConcivSettings
  extensions?: ClientExtension[]
  connected?: () => boolean
  connectMode?: boolean
  bindApiBase?: (apiBase: string) => void
  disconnect?: () => void
  grabProvider?: GrabProvider
  apiBase?: () => string
  connectionGeneration?: () => number
  bindActiveSession?: (read: () => string | null) => void
  notifyInteractive?: () => void
}

function disposeExtensionInstances(instances: ExtensionInstance[]): void {
  for (const instance of instances) {
    try {
      instance.dispose()
    } catch (error) {
      console.error('[conciv] extension instance teardown failed', error)
    }
  }
}

function makeGuardedDisposer(instances: ExtensionInstance[], extra: () => void): () => void {
  let disposed = false
  return function disposeInstances(): void {
    if (disposed) return
    disposed = true
    disposeExtensionInstances(instances)
    extra()
  }
}

function wireEngineConnection(
  apiBase: () => string,
  hubConnection: Accessor<HubConnection> | undefined,
  data: AppData,
): () => void {
  return createRoot((dispose) => {
    createEffect(() => onCleanup(setupEngineReachability(apiBase(), hubConnection?.())))
    createEffect(() => onCleanup(data.readHubState()))
    return dispose
  })
}

export function createConcivRouter(config: ConcivRouterConfig) {
  const queryClient = new QueryClient()
  const apiBase = config.apiBase ?? (() => '')
  const connected = config.connected ?? (() => true)
  const data = makeAppData(
    config.rpc,
    config.hubConnection ? {connection: config.hubConnection, connected} : undefined,
    queryClient,
  )
  const extensions = [highlight, ...(config.extensions ?? [])]
  const instances = createInstances(extensions)
  const disposeEngineConnection = wireEngineConnection(apiBase, config.hubConnection, data)
  const disposeInstances = makeGuardedDisposer(instances, disposeEngineConnection)
  function ConcivRouterWrap(props: {children: JSX.Element}): JSX.Element {
    onCleanup(disposeInstances)
    const harness = createHarnessMeta(data, connected, queryClient)
    return <HarnessMetaContext.Provider value={harness}>{props.children}</HarnessMetaContext.Provider>
  }
  return createRouter({
    routeTree,
    history: config.history,
    scrollRestoration: () => false,
    defaultPendingComponent: PendingPane,
    defaultPendingMs: 300,
    defaultPendingMinMs: 500,
    defaultErrorComponent,
    Wrap: ConcivRouterWrap,
    context: {
      rpc: data.rpc,
      hub: config.hubConnection,
      environment: config.environment,
      settings: config.settings,
      queryClient,
      data,
      extensions,
      instances,
      connected,
      connectMode: config.connectMode ?? false,
      bindApiBase: config.bindApiBase,
      disconnect: config.disconnect,
      grabProvider: config.grabProvider,
      apiBase,
      connectionGeneration: config.connectionGeneration ?? (() => 0),
      bindActiveSession: config.bindActiveSession,
      disposeInstances,
      notifyInteractive: config.notifyInteractive ?? (() => {}),
    },
  })
}

export function disposeConcivRouter(router: ReturnType<typeof createConcivRouter>): void {
  router.options.context.disposeInstances()
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createConcivRouter>
  }
}
