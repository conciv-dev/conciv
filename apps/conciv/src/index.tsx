import {Show, createMemo, createRoot, getOwner, on, onCleanup, untrack, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {RouterProvider, createBrowserHistory, createMemoryHistory, type RouterHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient, normalizeApiBase, type BrowserRpcClient} from '@conciv/contract'
import type {GrabProvider} from '@conciv/grab'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'
import {createConcivRouter, disposeConcivRouter, type ConcivRouterConfig, type ConcivTimings} from './router.js'
import {parseConcivSettings, type ConcivSettings} from './data/settings.js'
import {styleRoot} from './lib/shadow.js'
import {createEngineLogin, engineConnected, startEngineLogin} from './app/engine-login.js'
import {reserveComposedPlugins, type ComposedPlugin} from './runtime/plugin/root.js'
import type {DraftStore} from './runtime/persistence/drafts.js'
import {keepLastScreen, readLastScreen} from './runtime/persistence/last-screen.js'

export {createDraftStore, openBrowserDraftStore, type DraftStore} from './runtime/persistence/drafts.js'
export {WIDGET_LAYER} from './lib/widget-layer.js'
export {keepLastScreen} from './runtime/persistence/last-screen.js'

export type Platform = {
  engine: Accessor<{kind: 'bound'; apiBase: string; token?: () => Promise<string>} | {kind: 'servers'}>
  navigation: 'tab' | 'browser' | {history: RouterHistory}
  root: ShadowRoot | Document
  settings?: ConcivSettingsInit
  plugins?: readonly ComposedPlugin[]
  grabProvider?: GrabProvider
  onInteractive?: () => void
  timings?: ConcivTimings
  draftStore?: (writable: () => boolean) => DraftStore | undefined
}

declare global {
  interface WindowEventMap {
    'conciv:rebind': CustomEvent<{apiBase?: string} | undefined>
  }
}

type ConcivRouter = ReturnType<typeof createConcivRouter>

type AppParts = {platform: Platform; settings: ConcivSettings; plugins: readonly ComposedPlugin[]}

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
  rpc: BrowserRpcClient,
  history: RouterHistory,
  session: {read: () => string | null},
) {
  return {
    rpc: rpc.rpc,
    history,
    environment: {rootNode: parts.platform.root, document},
    settings: parts.settings,
    plugins: parts.plugins,
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

function enteredApiBase(apiBase: string): string {
  return apiBase === '' ? '' : normalizeApiBase(apiBase)
}

function readRebindApiBase(apiBase: string): string | undefined {
  try {
    return normalizeApiBase(apiBase)
  } catch (error) {
    console.error(`[conciv] the rebind names no engine base: ${apiBase}`, error)
    return undefined
  }
}

function BoundApp(props: AppParts): JSX.Element {
  const platform = untrack(() => props.platform)
  const first = untrack(platform.engine)
  const [bound, setBound] = createStore({apiBase: first.kind === 'bound' ? enteredApiBase(first.apiBase) : ''})
  const apiBase = (): string => bound.apiBase
  const session = {read: (): string | null => null}
  const client = makeBrowserRpcClient(apiBase, {session: () => session.read(), timings: platform.timings?.engine})
  const login = createEngineLogin({
    apiBase,
    tokenSource: first.kind === 'bound' ? first.token : undefined,
    timings: platform.timings?.engine,
  })
  startEngineLogin(login)
  const connectionGeneration = createMemo(
    on(apiBase, (_apiBase, _previous, generation: number | undefined) =>
      generation === undefined ? 0 : generation + 1,
    ),
  )
  const router = createConcivRouter({
    ...routerConfig(
      {platform, settings: untrack(() => props.settings), plugins: untrack(() => props.plugins)},
      client,
      navigationHistory(platform.navigation),
      session,
    ),
    connected: () => engineConnected(login.status()),
    apiBase,
    connectionGeneration,
    login,
  })
  makeEventListener(window, 'conciv:rebind', (event) => {
    const asked = event.detail?.apiBase
    if (typeof asked !== 'string' || asked === '') return
    const nextApiBase = readRebindApiBase(asked)
    if (nextApiBase === undefined || nextApiBase === bound.apiBase) return
    setBound('apiBase', nextApiBase)
    router.options.context.queryClient.resetQueries().catch((error: unknown) => {
      console.error('[conciv] the queries did not reset after a rebind', error)
    })
    login.requestTrust().catch((error: unknown) => {
      console.error('[conciv] the trust check after a rebind failed', error)
    })
    if (router.state.location.search.core === undefined) return
    router
      .navigate({to: '.', search: (previous) => ({...previous, core: nextApiBase}), replace: true})
      .catch((error: unknown) => {
        console.error('[conciv] the address did not follow the rebind', error)
      })
  })
  return renderRouter(router, [client.close])
}

function ServersApp(props: AppParts): JSX.Element {
  const platform = untrack(() => props.platform)
  const [bound, setBound] = createStore({apiBase: ''})
  const session = {read: (): string | null => null}
  const client = makeBrowserRpcClient(() => null, {session: () => session.read(), timings: platform.timings?.engine})
  const router = createConcivRouter({
    ...routerConfig(
      {platform, settings: untrack(() => props.settings), plugins: untrack(() => props.plugins)},
      client,
      navigationHistory(platform.navigation),
      session,
    ),
    servers: true,
    connected: client.bound,
    apiBase: () => bound.apiBase,
    bindApiBase: (nextApiBase) => {
      client.bind(nextApiBase)
      setBound('apiBase', nextApiBase)
    },
  })
  return renderRouter(router, [client.close])
}

export function ConcivApp(props: {platform: Platform}): JSX.Element {
  const platform = untrack(() => props.platform)
  const plugins = reserveComposedPlugins(platform.plugins ?? [])
  styleRoot(platform.root)
  const settings = parseConcivSettings(JSON.stringify(platform.settings ?? {}))
  return (
    <Show
      when={untrack(platform.engine).kind === 'servers'}
      fallback={<BoundApp platform={platform} settings={settings} plugins={plugins} />}
    >
      <ServersApp platform={platform} settings={settings} plugins={plugins} />
    </Show>
  )
}
