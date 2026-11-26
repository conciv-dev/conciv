import {createRouter, useRouteContext, useRouter, type ErrorComponentProps} from '@tanstack/solid-router'
import {createLocalPersistence, type LocalPersistence} from '@internal/frontend-app-api/persistence/storage'
import {once, uniq} from 'es-toolkit'
import {z} from 'zod'
import type {RouterHistory} from '@tanstack/solid-router'
import {QueryClient, setupEngineReachability, type ChatConnectionOptions} from '@conciv/client'
import {createRoot, getOwner, onCleanup, runWithOwner, untrack, type JSX, createMemo, onMount} from 'solid-js'
import type {
  EngineConnection,
  EngineConnectionTimings,
  EngineTrust,
  ContractClient,
  TrustListener,
} from '@conciv/client'
import type {GrabProvider} from '@conciv/grab'
import {routeTree} from './routeTree.gen'
import {QuickSearchSchema, quickPaneIds} from './lib/quick-search.js'
import {makeAppData, type AppData} from './data/app-data.js'
import type {ConcivSettings} from './data/settings.js'
import {PendingPane} from './shell/pending.js'
import {becameTrusted, engineLock, engineLocked, type EngineLogin} from './app/engine-login.js'
import type {DraftStore} from './runtime/persistence/drafts.js'
import type {ComposedPlugin} from './runtime/plugin/root.js'
import {withShellBuiltins, type BuiltinPlugins} from './runtime/plugin/builtins.js'
import {ErrorScreen} from './shell/error-screen.js'
import {classifyRpcError, rpcErrorCode, type RpcErrorClassification} from './shell/rpc-error-message.js'

const ENGINE_UNREACHABLE_MESSAGE = "conciv couldn't reach the engine. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.'

function defaultErrorComponent(props: ErrorComponentProps): JSX.Element {
  const router = useRouter()
  const connection = useRouteContext({strict: false, select: (context) => context.connection})
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const classification = createMemo<RpcErrorClassification>(() =>
    classifyRpcError(props.error, ENGINE_UNREACHABLE_MESSAGE, GENERIC_ERROR_MESSAGE),
  )
  const retry = async (): Promise<void> => {
    if (classification().transportFailure) connection()?.()?.reset()
    await login()?.requestTrust()
    await router.invalidate()
  }
  const onTrustChange: TrustListener = (status, previous) => {
    if (becameTrusted(status, previous)) void retry()
  }
  onMount(() => {
    const trust = connection()?.()?.trust
    if (trust === undefined) return
    if (trust.isTrusted() && rpcErrorCode(props.error) === 'UNAUTHORIZED') void retry()
    onCleanup(trust.subscribe(onTrustChange))
  })
  return <ErrorScreen message={classification().message} onRetry={() => void retry()} />
}

const PaneParamsSchema = z.object({sessionId: z.string()})

export type ConcivTimings = {
  engine?: Partial<EngineConnectionTimings>
  chatRunReconnect?: ChatConnectionOptions['runReconnect']
  queryRetryDelayMs?: number
  picker?: {searchWaitMs?: number; previewWaitMs?: number}
}

export type ConcivEnvironment = {rootNode: ShadowRoot | Document; document: Document}

export type PanelKeyStatus = 'listed' | 'unlisted' | 'pending'

type PanelKeyLookup = (input: {readonly sessionId: string; readonly key: string}) => PanelKeyStatus

export type ConcivRouterContext = {
  rpc: ContractClient
  environment: ConcivEnvironment
  settings: ConcivSettings
  queryClient: QueryClient
  data: AppData
  connected: () => boolean
  plugins: readonly ComposedPlugin[]
  builtins: BuiltinPlugins
  servers: boolean
  bindApiBase?: (apiBase: string, token: string | undefined) => void
  grabProvider?: GrabProvider
  apiBase: () => string
  connection: () => EngineConnection | undefined
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
  localPersistence: LocalPersistence
}

export type ConcivRouterConfig = {
  rpc: ContractClient
  history: RouterHistory
  environment: ConcivEnvironment
  settings: ConcivSettings
  connected?: () => boolean
  plugins?: readonly ComposedPlugin[]
  builtins?: BuiltinPlugins
  servers?: boolean
  bindApiBase?: (apiBase: string, token: string | undefined) => void
  grabProvider?: GrabProvider
  apiBase: () => string
  connection: () => EngineConnection | undefined
  connectionGeneration?: () => number
  bindActiveSession?: (read: () => string | null) => void
  notifyInteractive?: () => void
  login?: EngineLogin
  timings?: ConcivTimings
  draftStore?: (writable: () => boolean) => DraftStore | undefined
}

type TrustHandlers = {rerunRefused: () => void; trusted: () => void; revoked: () => void}

type EngineWiring = {dispose: () => void; locked: () => boolean; watch: (handlers: TrustHandlers) => void}

function holdEngine(connection: EngineConnection | undefined): EngineTrust | undefined {
  if (connection === undefined) return undefined
  onCleanup(setupEngineReachability(connection))
  return connection.trust
}

function watchTrust(trust: EngineTrust | undefined, handlers: TrustHandlers): void {
  if (trust === undefined) return
  untrack(() => {
    if (trust.isTrusted()) handlers.trusted()
    if (engineLock(trust.status()) === 'revoked') handlers.revoked()
  })
  onCleanup(
    trust.subscribe((status, previous) => {
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

function wireEngine(connection: () => EngineConnection | undefined): EngineWiring {
  return createRoot((dispose) => {
    const owner = getOwner()
    const trust = createMemo(() => holdEngine(connection()))
    return {
      dispose,
      locked: () => {
        const current = untrack(trust)
        return current !== undefined && engineLocked(current.status())
      },
      watch: (handlers) => runWithOwner(owner, () => createMemo(() => watchTrust(trust(), handlers))),
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
  const apiBase = config.apiBase
  const engine = wireEngine(config.connection)
  const lockedOut = (): boolean => engine.locked()
  const data = makeAppData(
    config.rpc,
    queryClient,
    config.draftStore?.(() => !lockedOut()) ?? null,
    lockedOut,
    apiBase,
    () => config.connection()?.trust,
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
      builtins: config.builtins ?? withShellBuiltins(undefined),
      servers: config.servers ?? false,
      bindApiBase: config.bindApiBase,
      grabProvider: config.grabProvider,
      apiBase,
      connection: config.connection,
      connectionGeneration: config.connectionGeneration ?? (() => 0),
      bindActiveSession: config.bindActiveSession,
      timings,
      dispose,
      notifyInteractive: config.notifyInteractive ?? (() => {}),
      login: config.login,
      pluginPanels: createPluginPanels(),
      localPersistence: createLocalPersistence(),
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
