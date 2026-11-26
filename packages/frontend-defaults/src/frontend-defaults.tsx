import {Show, createMemo, createRoot, getOwner, on, onCleanup, untrack, type Accessor, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {RouterProvider, createBrowserHistory, createMemoryHistory, type RouterHistory} from '@tanstack/solid-router'
import {makeEngineRpcClient, normalizeApiBase, type EngineConnection, type ContractClient} from '@conciv/client'
import type {GrabProvider} from '@conciv/grab'
import type {ConcivSettingsInit} from '@conciv/types/config-types'
import {createConcivRouter, disposeConcivRouter, type ConcivRouterConfig, type ConcivTimings} from './router.js'
import {parseConcivSettings, type ConcivSettings} from './data/settings.js'
import {styleRoot} from './lib/shadow.js'
import {createEngineLogin, engineConnected, startEngineLogin} from './app/engine-login.js'
import {reserveComposedPlugins, type ComposedPlugin} from './runtime/plugin/root.js'
import {withShellBuiltins, type BuiltinPlugins} from './runtime/plugin/builtins.js'
import type {DraftStore} from './runtime/persistence/drafts.js'
import {keepLastScreen, readLastScreen} from './runtime/persistence/last-screen.js'

export {createDraftStore, openBrowserDraftStore, type DraftStore} from './runtime/persistence/drafts.js'
export {WIDGET_LAYER} from './lib/widget-layer.js'
export {createBrowserEngine, type BrowserEngine} from './app/browser-engine.js'
export {keepLastScreen} from './runtime/persistence/last-screen.js'
export type {BuiltinPlugins, DeclaredToolGroup} from './runtime/plugin/builtins.js'
export type {ComposedPlugin} from './runtime/plugin/root.js'

export type EngineBinding = {readonly apiBase: string; readonly connection: EngineConnection}

export type PlatformEngine = ({readonly kind: 'bound'} & EngineBinding) | {readonly kind: 'servers'}

export type Platform = {
  engine: Accessor<PlatformEngine>
  connect?: (apiBase: string, token: string | undefined) => void
  navigation: 'tab' | 'browser' | {history: RouterHistory}
  root: ShadowRoot | Document
  settings?: ConcivSettingsInit
  plugins?: readonly ComposedPlugin[]
  builtins?: BuiltinPlugins
  grabProvider?: GrabProvider
  onInteractive?: () => void
  timings?: ConcivTimings
  draftStore?: (writable: () => boolean) => DraftStore | undefined
}

declare global {
  interface WindowEventMap {
    'conciv:rebind': CustomEvent<{apiBase?: string; waitUntil?: (work: Promise<unknown>) => void} | undefined>
  }
}

type ConcivRouter = ReturnType<typeof createConcivRouter>

type AppParts = {
  platform: Platform
  settings: ConcivSettings
  plugins: readonly ComposedPlugin[]
  builtins: BuiltinPlugins
}

function runDisposers(disposers: ReadonlyArray<() => void>): void {
  for (const dispose of disposers) {
    try {
      dispose()
    } catch (error) {
      console.error('[conciv] teardown step failed', error)
    }
  }
}

function tabHistory(): RouterHistory {
  const history = createMemoryHistory({initialEntries: [readLastScreen()]})
  history.subscribe(({location}) => keepLastScreen(location.href))
  return history
}

function navigationHistory(navigation: Platform['navigation']): RouterHistory {
  if (navigation === 'browser') return createBrowserHistory()
  if (navigation === 'tab') return tabHistory()
  return navigation.history
}

function routerConfig(
  parts: AppParts,
  rpc: ContractClient,
  history: RouterHistory,
  session: {read: () => string | null},
) {
  return {
    rpc,
    history,
    environment: {rootNode: parts.platform.root, document},
    settings: parts.settings,
    plugins: parts.plugins,
    builtins: parts.builtins,
    grabProvider: parts.platform.grabProvider,
    notifyInteractive: parts.platform.onInteractive,
    timings: parts.platform.timings,
    draftStore: parts.platform.draftStore,
    bindActiveSession: (read: () => string | null) => {
      session.read = read
    },
  } satisfies Partial<ConcivRouterConfig>
}

function renderRouter(router: ConcivRouter, closeFirst: ReadonlyArray<() => void>): JSX.Element {
  const tree = createRoot((disposeTree) => ({disposeTree, view: <RouterProvider router={router} />}), getOwner())
  const teardown = [
    ...closeFirst,
    tree.disposeTree,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
  ]
  onCleanup(() => runDisposers(teardown))
  return tree.view
}

function readRebindApiBase(apiBase: string): string | undefined {
  try {
    return normalizeApiBase(apiBase)
  } catch (error) {
    console.error(`[conciv] the rebind names no engine base: ${apiBase}`, error)
    return undefined
  }
}

function boundEngine(platform: Platform): Accessor<EngineBinding | undefined> {
  return createMemo(() => {
    const engine = platform.engine()
    return engine.kind === 'bound' ? engine : undefined
  })
}

function BoundApp(props: AppParts & {binding: EngineBinding}): JSX.Element {
  const platform = untrack(() => props.platform)
  const first = untrack(() => props.binding)
  const engine = boundEngine(platform)
  const binding = (): EngineBinding => engine() ?? first
  const apiBase = (): string => binding().apiBase
  const connection = (): EngineConnection => binding().connection
  const session = {read: (): string | null => null}
  const client = makeEngineRpcClient(connection, () => session.read())
  const login = createEngineLogin(connection)
  startEngineLogin(login)
  const connectionGeneration = createMemo(
    on(apiBase, (_apiBase, _previous, generation: number | undefined) =>
      generation === undefined ? 0 : generation + 1,
    ),
  )
  const router = createConcivRouter({
    ...routerConfig(
      {
        platform,
        settings: untrack(() => props.settings),
        plugins: untrack(() => props.plugins),
        builtins: untrack(() => props.builtins),
      },
      client,
      navigationHistory(platform.navigation),
      session,
    ),
    connected: () => engineConnected(login.status()),
    apiBase,
    connection,
    connectionGeneration,
    login,
  })
  makeEventListener(window, 'conciv:rebind', (event) => {
    const asked = event.detail?.apiBase
    if (typeof asked !== 'string' || asked === '') return
    const nextApiBase = readRebindApiBase(asked)
    if (nextApiBase === undefined || nextApiBase === apiBase()) return
    if (platform.connect === undefined) {
      console.error(`[conciv] this host cannot rebind the widget to ${nextApiBase}`)
      return
    }
    platform.connect(nextApiBase, undefined)
    router.options.context.queryClient.resetQueries().catch((error: unknown) => {
      console.error('[conciv] the queries did not reset after a rebind', error)
    })
    const trusted = login.requestTrust().catch((error: unknown) => {
      console.error('[conciv] the trust check after a rebind failed', error)
    })
    event.detail?.waitUntil?.(trusted)
    const followed = router
      .navigate({
        to: '/',
        search: (previous) => (previous.core === undefined ? previous : {...previous, core: nextApiBase}),
        replace: true,
      })
      .catch((error: unknown) => {
        console.error('[conciv] the widget did not leave the other engine’s session after a rebind', error)
      })
    event.detail?.waitUntil?.(followed)
  })
  return renderRouter(router, [])
}

function ServersApp(props: AppParts): JSX.Element {
  const platform = untrack(() => props.platform)
  const binding = boundEngine(platform)
  const connection = (): EngineConnection | undefined => binding()?.connection
  const session = {read: (): string | null => null}
  const client = makeEngineRpcClient(connection, () => session.read())
  const router = createConcivRouter({
    ...routerConfig(
      {
        platform,
        settings: untrack(() => props.settings),
        plugins: untrack(() => props.plugins),
        builtins: untrack(() => props.builtins),
      },
      client,
      navigationHistory(platform.navigation),
      session,
    ),
    servers: true,
    connected: () => binding() !== undefined,
    apiBase: () => binding()?.apiBase ?? '',
    connection,
    bindApiBase: (nextApiBase, token) => {
      if (platform.connect === undefined) throw new Error('this host cannot bind the widget to an engine')
      if (binding() !== undefined) throw new Error('conciv rpc client already bound')
      platform.connect(nextApiBase, token)
    },
  })
  return renderRouter(router, [])
}

export function ConcivApp(props: {platform: Platform}): JSX.Element {
  const platform = untrack(() => props.platform)
  const builtins = withShellBuiltins(platform.builtins)
  const plugins = reserveComposedPlugins(platform.plugins ?? [], builtins)
  styleRoot(platform.root)
  const settings = parseConcivSettings(JSON.stringify(platform.settings ?? {}))
  const first = untrack(platform.engine)
  return (
    <Show
      when={first.kind === 'bound' ? first : undefined}
      fallback={<ServersApp platform={platform} settings={settings} plugins={plugins} builtins={builtins} />}
    >
      {(binding) => (
        <BoundApp platform={platform} settings={settings} plugins={plugins} builtins={builtins} binding={binding()} />
      )}
    </Show>
  )
}
