import {createRouter, useRouteContext, useRouter, type ErrorComponentProps} from '@tanstack/solid-router'
import {once, uniq} from 'es-toolkit'
import {z} from 'zod'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient, setupEngineReachability} from '@conciv/client'
import {createEffect, createRoot, onCleanup, type JSX, createMemo, onMount} from 'solid-js'
import {browserRpcConnection, type RpcClient, resetBrowserRpcConnection, type TrustListener} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import {routeTree} from './routeTree.gen'
import {QuickSearchSchema, quickPaneIds} from './lib/quick-search.js'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import {PendingPane} from './shell/pending.js'
import {becameTrusted, engineLock, engineLocked, type EngineLogin} from './app/engine-login.js'
import {createBrowserDraftStore, type DraftStore} from './runtime/persistence/drafts.js'
import {reserveComposedPlugins, type ComposedPlugin} from './runtime/plugin/root.js'
import {ErrorScreen} from './shell/error-screen.js'
import {classifyRpcError, rpcErrorCode, type RpcErrorClassification} from './shell/rpc-error-message.js'

const ENGINE_UNREACHABLE_MESSAGE = "conciv couldn't reach the engine. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.'

function defaultErrorComponent(props: ErrorComponentProps): JSX.Element {
  const router = useRouter()
  const apiBase = useRouteContext({strict: false, select: (context) => context.apiBase})
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const classification = createMemo<RpcErrorClassification>(() =>
    classifyRpcError(props.error, ENGINE_UNREACHABLE_MESSAGE, GENERIC_ERROR_MESSAGE),
  )
  const retry = async (): Promise<void> => {
    await login()?.requestTrust()
    if (classification().transportFailure) resetBrowserRpcConnection(apiBase()?.() ?? '')
    await router.invalidate()
  }
  const onTrustChange: TrustListener = (status, previous) => {
    if (becameTrusted(status, previous)) void retry()
  }
  onMount(() => {
    const {trust, release} = browserRpcConnection(apiBase()?.() ?? '')
    if (trust.isTrusted() && rpcErrorCode(props.error) === 'UNAUTHORIZED') void retry()
    onCleanup(trust.subscribe(onTrustChange))
    onCleanup(release)
  })
  return <ErrorScreen message={classification().message} onRetry={() => void retry()} />
}

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
  connected: () => boolean
  plugins: readonly ComposedPlugin[]
  servers: boolean
  bindApiBase?: (apiBase: string) => void
  grabProvider?: GrabProvider
  apiBase: () => string
  connectionGeneration: () => number
  bindActiveSession?: (read: () => string | null) => void
  dispose: () => void
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
  connected?: () => boolean
  plugins?: readonly ComposedPlugin[]
  servers?: boolean
  bindApiBase?: (apiBase: string) => void
  grabProvider?: GrabProvider
  apiBase?: () => string
  connectionGeneration?: () => number
  bindActiveSession?: (read: () => string | null) => void
  notifyInteractive?: () => void
  login?: EngineLogin
}

function openDraftStore(writable: () => boolean): DraftStore | null {
  try {
    return createBrowserDraftStore({writable})
  } catch (error) {
    console.error('[conciv] drafts stay engine-only', error)
    return null
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
  const apiBase = config.apiBase ?? (() => '')
  const data = makeAppData(
    config.rpc,
    queryClient,
    openDraftStore(() => !lockedOut()),
    lockedOut,
    apiBase,
  )
  const connected = config.connected ?? (() => true)
  const dispose = once(() => {
    engine.dispose()
    data.dispose()
  })
  function ConcivRouterWrap(props: {children: JSX.Element}): JSX.Element {
    onCleanup(dispose)
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
      connected,
      plugins: reserveComposedPlugins(config.plugins ?? []),
      servers: config.servers ?? false,
      bindApiBase: config.bindApiBase,
      grabProvider: config.grabProvider,
      apiBase,
      connectionGeneration: config.connectionGeneration ?? (() => 0),
      bindActiveSession: config.bindActiveSession,
      dispose,
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
  router.options.context.dispose()
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
