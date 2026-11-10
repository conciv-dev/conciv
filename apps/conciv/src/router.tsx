import {createRouter} from '@tanstack/solid-router'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient} from '@tanstack/solid-query'
import {createEffect, createRoot, onCleanup, type JSX} from 'solid-js'
import {browserRpcConnection, type RpcClient} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import type {AnyExtension} from '@conciv/extension'
import {setupEngineReachability} from '@conciv/client'
import {routeTree} from './routeTree.gen'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import type {ExtensionInstance} from './extension/extension-slots.js'
import {createInstances} from './extension/create-instances.js'
import highlight from './extensions/highlight.js'
import {PendingPane} from './shell/pending.js'
import {defaultErrorComponent} from './shell/default-error-component.js'
import {engineLocked, type EngineLogin} from './app/engine-login.js'

export type ConcivEnvironment = {rootNode: ShadowRoot | Document; document: Document}

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
  bindActiveSession?: (read: () => string | null) => void
  disposeInstances: () => void
  notifyInteractive: () => void
  login?: EngineLogin
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
  bindActiveSession?: (read: () => string | null) => void
  notifyInteractive?: () => void
  login?: EngineLogin
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

function watchEngine(apiBase: string, rerunRefused: () => void): () => void {
  const stopReachability = setupEngineReachability(apiBase)
  const stopTrust = browserRpcConnection(apiBase).trust.subscribe((status, previous) => {
    if (status === 'trusted' && engineLocked(previous)) rerunRefused()
  })
  return () => {
    stopReachability()
    stopTrust()
  }
}

function wireEngine(apiBase: () => string, rerunRefused: () => void): {dispose: () => void} {
  return createRoot((dispose) => {
    let wiredApiBase = apiBase()
    let stopWatching = watchEngine(wiredApiBase, rerunRefused)
    createEffect(() => {
      const nextApiBase = apiBase()
      if (nextApiBase === wiredApiBase) return
      stopWatching()
      wiredApiBase = nextApiBase
      stopWatching = watchEngine(nextApiBase, rerunRefused)
    })
    onCleanup(() => stopWatching())
    return {dispose}
  })
}

export function createConcivRouter(config: ConcivRouterConfig) {
  const queryClient = new QueryClient()
  const data = makeAppData(config.rpc, queryClient)
  const extensions = [highlight, ...(config.extensions ?? [])]
  const instances = createInstances(extensions)
  const apiBase = config.apiBase ?? (() => '')
  const connected = config.connected ?? (() => true)
  const engine = wireEngine(apiBase, () => {
    void queryClient.invalidateQueries({predicate: (query) => query.state.status === 'error'})
  })
  const disposeInstances = makeGuardedDisposer(instances, engine.dispose)
  function ConcivRouterWrap(props: {children: JSX.Element}): JSX.Element {
    onCleanup(disposeInstances)
    return <>{props.children}</>
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
      rpc: config.rpc,
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
      login: config.login,
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
  interface HistoryState {
    sessionMenuOpened?: true
    restoreFocus?: 'settings'
  }
}
