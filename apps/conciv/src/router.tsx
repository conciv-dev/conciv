import {createRouter, useRouteContext, useRouter, type ErrorComponentProps} from '@tanstack/solid-router'
import {once, uniq} from 'es-toolkit'
import {z} from 'zod'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient, setupEngineReachability, type ChatConnectionOptions} from '@conciv/client'
import {createRoot, getOwner, onCleanup, runWithOwner, untrack, type JSX, createMemo, onMount} from 'solid-js'
import {
  browserRpcConnection,
  type EngineConnectionTimings,
  type RpcClient,
  resetBrowserRpcConnection,
  type TrustListener,
} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import {routeTree} from './routeTree.gen'
import {QuickSearchSchema, quickPaneIds} from './lib/quick-search.js'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import {PendingPane} from './shell/pending.js'
import {becameTrusted, engineLock, engineLocked, type EngineLogin} from './app/engine-login.js'
import type {DraftStore} from './runtime/persistence/drafts.js'
import type {ComposedPlugin} from './runtime/plugin/root.js'
import {ErrorScreen} from './shell/error-screen.js'
import {classifyRpcError, rpcErrorCode, type RpcErrorClassification} from './shell/rpc-error-message.js'

const ENGINE_UNREACHABLE_MESSAGE = "conciv couldn't reach the engine. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.'

function defaultErrorComponent(props: ErrorComponentProps): JSX.Element {
  const router = useRouter()
  const apiBase = useRouteContext({strict: false, select: (context) => context.apiBase})
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const timings = useRouteContext({strict: false, select: (context) => context.timings})
  const classification = createMemo<RpcErrorClassification>(() =>
    classifyRpcError(props.error, ENGINE_UNREACHABLE_MESSAGE, GENERIC_ERROR_MESSAGE),
  )
  const retry = async (): Promise<void> => {
    if (classification().transportFailure) resetBrowserRpcConnection(apiBase()?.() ?? '')
    await login()?.requestTrust()
    await router.invalidate()
  }
  const onTrustChange: TrustListener = (status, previous) => {
    if (becameTrusted(status, previous)) void retry()
  }
  onMount(() => {
    const {trust, release} = browserRpcConnection(apiBase()?.() ?? '', undefined, timings()?.engine)
    if (trust.isTrusted() && rpcErrorCode(props.error) === 'UNAUTHORIZED') void retry()
    onCleanup(trust.subscribe(onTrustChange))
    onCleanup(release)
  })
  return <ErrorScreen message={classification().message} onRetry={() => void retry()} />
}

const PaneParamsSchema = z.object({sessionId: z.string()})

export type ConcivTimings = {
  engine?: Partial<EngineConnectionTimings>
  chatRunReconnect?: ChatConnectionOptions['runReconnect']
  queryRetryDelayMs?: number
}

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
  timings: ConcivTimings
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
  timings?: ConcivTimings
  draftStore?: (writable: () => boolean) => DraftStore | undefined
}

type TrustHandlers = {rerunRefused: () => void; trusted: () => void; revoked: () => void}

type HeldEngine = ReturnType<typeof browserRpcConnection>

type EngineWiring = {dispose: () => void; locked: () => boolean; watch: (handlers: TrustHandlers) => void}

function holdEngine(apiBase: string, timings: Partial<EngineConnectionTimings> | undefined): HeldEngine {
  const stopReachability = setupEngineReachability(apiBase, timings)
  const connection = browserRpcConnection(apiBase, undefined, timings)
  onCleanup(() => {
    stopReachability()
    connection.release()
  })
  return connection
}

function watchTrust(connection: HeldEngine, handlers: TrustHandlers): void {
  untrack(() => {
    if (connection.trust.isTrusted()) handlers.trusted()
    if (engineLock(connection.trust.status()) === 'revoked') handlers.revoked()
  })
  onCleanup(
    connection.trust.subscribe((status, previous) => {
      if (engineLock(status) === 'revoked') handlers.revoked()
      if (!becameTrusted(status, previous)) return
      handlers.rerunRefused()
      handlers.trusted()
    }),
  )
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

function wireEngine(apiBase: () => string, timings: Partial<EngineConnectionTimings> | undefined): EngineWiring {
  return createRoot((dispose) => {
    const owner = getOwner()
    const connection = createMemo(() => holdEngine(apiBase(), timings))
    return {
      dispose,
      locked: () => engineLocked(untrack(connection).trust.status()),
      watch: (handlers) => runWithOwner(owner, () => createMemo(() => watchTrust(connection(), handlers))),
    }
  })
}

export function createConcivRouter(config: ConcivRouterConfig) {
  const timings = config.timings ?? {}
  const retryDelay = timings.queryRetryDelayMs
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {staleTime: Infinity, refetchOnWindowFocus: 'always', ...(retryDelay === undefined ? {} : {retryDelay})},
    },
  })
  const apiBase = config.apiBase ?? (() => '')
  const engine = wireEngine(apiBase, timings.engine)
  const lockedOut = (): boolean => engine.locked()
  const data = makeAppData(
    config.rpc,
    queryClient,
    config.draftStore?.(() => !lockedOut()) ?? null,
    lockedOut,
    apiBase,
    timings.engine,
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
      plugins: config.plugins ?? [],
      servers: config.servers ?? false,
      bindApiBase: config.bindApiBase,
      grabProvider: config.grabProvider,
      apiBase,
      connectionGeneration: config.connectionGeneration ?? (() => 0),
      bindActiveSession: config.bindActiveSession,
      timings,
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
  engine.watch({
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
