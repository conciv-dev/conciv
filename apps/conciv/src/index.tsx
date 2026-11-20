import {Show, createMemo, createRoot, from, getOwner, on, onCleanup, untrack, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {RouterProvider, createBrowserHistory, createMemoryHistory, type RouterHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient, normalizeApiBase, type BrowserRpcClient, type RpcClient} from '@conciv/contract'
import {createWebStorageHistory, type WebStorage} from '@conciv/storage-history'
import type {GrabProvider} from '@conciv/grab'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'
import {NavigationStateSchema, type NavigationState} from '@conciv/protocol/chat-types'
import {createConcivRouter, disposeConcivRouter, type ConcivRouterConfig} from './router.js'
import {parseConcivSettings, type ConcivSettings} from './data/settings.js'
import {styleRoot} from './lib/shadow.js'
import {createEngineLogin, engineConnected, startEngineLogin} from './app/engine-login.js'
import {reserveComposedPlugins, type ComposedPlugin} from './runtime/plugin/root.js'

export type Platform = {
  engine: Accessor<{kind: 'bound'; apiBase: string; token?: () => Promise<string>} | {kind: 'servers'}>
  navigation: 'engine' | 'browser' | {memory: string | readonly string[]}
  root: ShadowRoot | Document
  settings?: ConcivSettingsInit
  plugins?: readonly ComposedPlugin[]
  grabProvider?: GrabProvider
  onInteractive?: () => void
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

type NavigationRestore = {current: () => boolean; apply: (href: string) => void}

function makeNavigationStorage(
  rpc: NavigationRpc,
  trust: {ready: Promise<boolean>; isTrusted: () => boolean},
  restore: NavigationRestore,
): NavigationStorage {
  const state: NavigationStorageState = {cache: null, lastStamp: 0, wroteLocally: false}
  const stamp = (): number => {
    state.lastStamp = Math.max(Date.now(), state.lastStamp + 1)
    return state.lastStamp
  }
  const send = (navigation: NavigationState, updatedAt: number): void => {
    if (!trust.isTrusted()) return
    rpc.navigation.set({...navigation, updatedAt}).catch((error: unknown) => {
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
      const current = initial.entries[initial.index]
      if (current) restore.apply(current.href)
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

function navigationHistory(navigation: Platform['navigation'], storage: NavigationStorage | undefined): RouterHistory {
  if (navigation === 'browser') return createBrowserHistory()
  if (navigation === 'engine') return storage ? createWebStorageHistory({storage}) : createMemoryHistory()
  return createMemoryHistory({initialEntries: [navigation.memory].flat()})
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

function restoreOnBoot(router: ConcivRouter, restore: NavigationRestore): () => void {
  const boot = {href: router.state.location.href, moved: false}
  restore.apply = (href) => {
    if (boot.moved || router.state.location.href !== boot.href || router.state.status !== 'idle') return
    void router.navigate({href, replace: true})
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
  const client = makeBrowserRpcClient(apiBase, {session: () => session.read()})
  const login = createEngineLogin({apiBase, tokenSource: first.kind === 'bound' ? first.token : undefined})
  const trusted = startEngineLogin(login)
  const connectionGeneration = createMemo(
    on(apiBase, (_apiBase, _previous, generation: number | undefined) =>
      generation === undefined ? 0 : generation + 1,
    ),
  )
  const firstApiBase = untrack(apiBase)
  const onFirstApiBase = createMemo(() => apiBase() === firstApiBase)
  const restore: NavigationRestore = {current: onFirstApiBase, apply: () => {}}
  const storage =
    platform.navigation === 'engine'
      ? makeNavigationStorage(client.rpc, {ready: trusted, isTrusted: () => login.trust().isTrusted()}, restore)
      : undefined
  const router = createConcivRouter({
    ...routerConfig(
      {platform, settings: untrack(() => props.settings), plugins: untrack(() => props.plugins)},
      client,
      navigationHistory(platform.navigation, storage),
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
  const stopRestore = storage ? restoreOnBoot(router, restore) : () => {}
  const restored = storage
    ? from<boolean>((set) => {
        void storage.restored.then(() => set(true))
        return () => {}
      })
    : () => true
  return renderRouter(router, restored, [client.close, stopRestore])
}

function ServersApp(props: AppParts): JSX.Element {
  const platform = untrack(() => props.platform)
  const [bound, setBound] = createStore({apiBase: ''})
  const session = {read: (): string | null => null}
  const client = makeBrowserRpcClient(() => null, {session: () => session.read()})
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
