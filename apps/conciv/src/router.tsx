import {createRouter} from '@tanstack/solid-router'
import {once, uniq} from 'es-toolkit'
import {z} from 'zod'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient, setupEngineReachability} from '@conciv/client'
import {createEffect, createRoot, onCleanup, type JSX} from 'solid-js'
import {browserRpcConnection, type RpcClient} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import type {AnyExtension} from '@conciv/extension'
import {routeTree} from './routeTree.gen'
import {QuickSearchSchema, quickPaneIds} from './lib/quick-search.js'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import type {ExtensionInstance} from './extension/extension-slots.js'
import {createInstances} from './extension/create-instances.js'
import {PendingPane} from './shell/pending.js'
import {defaultErrorComponent} from './shell/default-error-component.js'
import {becameTrusted, engineLock, engineLocked, type EngineLogin} from './app/engine-login.js'
import {createBrowserDraftStore, type DraftStore} from './runtime/persistence/drafts.js'

const PaneParamsSchema = z.object({sessionId: z.string()})

export type ConcivEnvironment = {rootNode: ShadowRoot | Document; document: Document}

export type PanelKeyStatus = 'listed' | 'unlisted' | 'pending'

type PanelKeyLookup = (input: {readonly sessionId: string; readonly key: string}) => PanelKeyStatus

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
  pluginPanels: {
    bind: (lookup: PanelKeyLookup) => () => void
    status: PanelKeyLookup
  }
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

function openDraftStore(writable: () => boolean): DraftStore | null {
  try {
    return createBrowserDraftStore({writable})
  } catch (error) {
    console.error('[conciv] drafts stay engine-only', error)
    return null
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

type TrustHandlers = {rerunRefused: () => void; trusted: () => void; revoked: () => void}

type EngineWatch = {stop: () => void; locked: () => boolean}

function watchEngine(apiBase: string, handlers: TrustHandlers): EngineWatch {
  const stopReachability = setupEngineReachability(apiBase)
  const connection = browserRpcConnection(apiBase)
  if (connection.trust.isTrusted()) handlers.trusted()
  if (engineLock(connection.trust.status()) === 'revoked') handlers.revoked()
  const stopTrust = connection.trust.subscribe((status, previous) => {
    if (engineLock(status) === 'revoked') handlers.revoked()
    if (!becameTrusted(status, previous)) return
    handlers.rerunRefused()
    handlers.trusted()
  })
  return {
    stop: () => {
      stopReachability()
      stopTrust()
      connection.release()
    },
    locked: () => engineLocked(connection.trust.status()),
  }
}

function createPluginPanels(): ConcivRouterContext['pluginPanels'] {
  const bound: {lookup?: PanelKeyLookup} = {}

  return {
    bind(lookup) {
      bound.lookup = lookup

      return () => {
        if (bound.lookup === lookup) bound.lookup = undefined
      }
    },
    status: (input) => bound.lookup?.(input) ?? 'pending',
  }
}

function wireEngine(apiBase: () => string, handlers: TrustHandlers): {dispose: () => void; locked: () => boolean} {
  return createRoot((dispose) => {
    let wiredApiBase = apiBase()
    let watching = watchEngine(wiredApiBase, handlers)
    createEffect(() => {
      const nextApiBase = apiBase()
      if (nextApiBase === wiredApiBase) return
      watching.stop()
      wiredApiBase = nextApiBase
      watching = watchEngine(nextApiBase, handlers)
    })
    onCleanup(() => watching.stop())
    return {dispose, locked: () => watching.locked()}
  })
}

export function createConcivRouter(config: ConcivRouterConfig) {
  const queryClient = new QueryClient({
    defaultOptions: {queries: {staleTime: Infinity, refetchOnWindowFocus: 'always'}},
  })
  const lockedOut = (): boolean => engine.locked()
  const data = makeAppData(
    config.rpc,
    queryClient,
    openDraftStore(() => !lockedOut()),
    lockedOut,
  )
  const extensions = config.extensions ?? []
  const instances = createInstances(extensions)
  const apiBase = config.apiBase ?? (() => '')
  const connected = config.connected ?? (() => true)
  const disposeInstances = makeGuardedDisposer(instances, () => {
    engine.dispose()
    data.dispose()
  })
  function ConcivRouterWrap(props: {children: JSX.Element}): JSX.Element {
    onCleanup(disposeInstances)
    return <>{props.children}</>
  }
  const router = createRouter({
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
      pluginPanels: createPluginPanels(),
    },
  })
  const shownSessions = (): string[] =>
    uniq(
      router.matchRoutes(router.latestLocation).flatMap((match) => {
        const shown = match.routeId === '/quick' ? quickPaneIds(QuickSearchSchema.parse(match.search)) : []
        const opened = PaneParamsSchema.safeParse(match.params).data?.sessionId
        return opened === undefined ? shown : [opened, ...shown]
      }),
    )
  const engine = wireEngine(apiBase, {
    rerunRefused: () => {
      void queryClient.invalidateQueries({predicate: (query) => query.state.status === 'error'})
    },
    trusted: once(() => {
      void data.forgetGoneDrafts(shownSessions())
    }),
    revoked: () => {
      void data.forgetLocalDrafts()
    },
  })
  return router
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
