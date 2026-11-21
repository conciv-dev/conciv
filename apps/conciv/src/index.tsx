import {Show, createMemo, createRoot, from, getOwner, on, onCleanup, untrack, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {RouterProvider, createBrowserHistory, createMemoryHistory, type RouterHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient, normalizeApiBase, type BrowserRpcClient, type RpcClient} from '@conciv/contract'
import {createWebStorageHistory, type WebStorage, type WebStorageHistory} from '@conciv/storage-history'
import type {GrabProvider} from '@conciv/grab'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'
import {NavigationStateSchema, type NavigationState} from '@conciv/protocol/chat-types'
import {createConcivRouter, disposeConcivRouter, type ConcivRouterConfig, type ConcivTimings} from './router.js'
import {parseConcivSettings, type ConcivSettings} from './data/settings.js'
import {styleRoot} from './lib/shadow.js'
import {createEngineLogin, engineConnected, startEngineLogin} from './app/engine-login.js'
import {reserveComposedPlugins, type ComposedPlugin} from './runtime/plugin/root.js'
import type {DraftStore} from './runtime/persistence/drafts.js'

export {createDraftStore, openBrowserDraftStore, type DraftStore} from './runtime/persistence/drafts.js'

export type Platform = {
  engine: Accessor<{kind: 'bound'; apiBase: string; token?: () => Promise<string>} | {kind: 'servers'}>
  navigation: 'engine' | 'browser' | {history: RouterHistory}
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

type NavigationRpc = Pick<RpcClient, 'navigation'>

function parseNavigation(raw: string): NavigationState | null {
  try {
    const parsed = NavigationStateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

type NavigationStorage = WebStorage & {restored: Promise<void>}

type NavigationStorageState = {cache: string | null; lastStamp: number; wroteLocally: boolean}

type NavigationRestore = {current: () => boolean; apply: () => void}

function makeNavigationStorage(
  rpc: NavigationRpc,
  trust: {ready: Promise<boolean>; isTrusted: () => boolean},
  restore: NavigationRestore,
  appLife: AbortSignal,
): NavigationStorage {
  const state: NavigationStorageState = {cache: null, lastStamp: 0, wroteLocally: false}
  const stamp = (): number => {
    state.lastStamp = Math.max(Date.now(), state.lastStamp + 1)
    return state.lastStamp
  }
  const send = (navigation: NavigationState, updatedAt: number): void => {
    if (!trust.isTrusted()) return
    rpc.navigation.set({...navigation, updatedAt}, {signal: appLife}).catch((error: unknown) => {
      if (appLife.aborted) return
      console.warn('[conciv] could not save the navigation', error)
    })
  }
  const restored = trust.ready
    .then((isTrusted) => (isTrusted ? rpc.navigation.get(undefined) : null))
    .catch(() => null)
    .then((initial) => {
      if (!restore.current() || state.wroteLocally || !initial) return
      state.lastStamp = initial.updatedAt
      state.cache = JSON.stringify({entries: initial.entries, index: initial.index})
      if (initial.entries.length > 0) restore.apply()
    })
  return {
    getItem: () => state.cache,
    setItem: (_key, value) => {
      state.wroteLocally = true
      state.cache = value
      const parsed = parseNavigation(value)
      if (parsed) send(parsed, stamp())
    },
    restored,
  }
}

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

function navigationHistory(
  navigation: Platform['navigation'],
  engineHistory: RouterHistory | undefined,
): RouterHistory {
  if (navigation === 'browser') return createBrowserHistory()
  if (navigation === 'engine') return engineHistory ?? createMemoryHistory()
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

function renderRouter(
  router: ConcivRouter,
  ready: Accessor<boolean | undefined>,
  closeFirst: ReadonlyArray<() => void>,
): JSX.Element {
  const tree = createRoot(
    (disposeTree) => ({
      disposeTree,
      view: (
        <Show when={ready()}>
          <RouterProvider router={router} />
        </Show>
      ),
    }),
    getOwner(),
  )
  const teardown = [
    ...closeFirst,
    tree.disposeTree,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
  ]
  onCleanup(() => runDisposers(teardown))
  return tree.view
}

function restoreOnBoot(router: ConcivRouter, restore: NavigationRestore, history: WebStorageHistory): () => void {
  const boot = {href: router.state.location.href, moved: false}
  restore.apply = () => {
    if (boot.moved || router.state.location.href !== boot.href || router.state.status !== 'idle') return
    history.restore()
    router.load().catch((error: unknown) => {
      console.error('[conciv] the restored navigation did not load', error)
    })
  }
  const stop = router.subscribe('onBeforeNavigate', (event) => {
    if (event.hrefChanged) boot.moved = true
  })
  return () => {
    boot.moved = true
    stop()
  }
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
  const trusted = startEngineLogin(login)
  const connectionGeneration = createMemo(
    on(apiBase, (_apiBase, _previous, generation: number | undefined) =>
      generation === undefined ? 0 : generation + 1,
    ),
  )
  const firstApiBase = untrack(apiBase)
  const onFirstApiBase = createMemo(() => apiBase() === firstApiBase)
  const restore: NavigationRestore = {current: onFirstApiBase, apply: () => {}}
  const appLife = new AbortController()
  const storage =
    platform.navigation === 'engine'
      ? makeNavigationStorage(
          client.rpc,
          {ready: trusted, isTrusted: () => login.trust().isTrusted()},
          restore,
          appLife.signal,
        )
      : undefined
  const engineHistory = storage ? createWebStorageHistory({storage}) : undefined
  const router = createConcivRouter({
    ...routerConfig(
      {platform, settings: untrack(() => props.settings), plugins: untrack(() => props.plugins)},
      client,
      navigationHistory(platform.navigation, engineHistory),
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
  const stopRestore = engineHistory ? restoreOnBoot(router, restore, engineHistory) : () => {}
  const restored = storage
    ? from<boolean>((set) => {
        void storage.restored.then(() => set(true))
        return () => {}
      })
    : () => true
  return renderRouter(router, restored, [() => appLife.abort(), client.close, stopRestore])
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
      navigationHistory(platform.navigation, undefined),
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
  return renderRouter(router, () => true, [client.close])
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
