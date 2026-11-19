import {createRoot, createSignal} from 'solid-js'
import {render} from 'solid-js/web'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient, type RpcClient} from '@conciv/contract'
import {createWebStorageHistory, type WebStorage} from '@conciv/storage-history'
import type {GrabProvider} from '@conciv/grab'
import {installReactBridge} from '@conciv/page'
import {createConcivRouter, disposeConcivRouter} from '@conciv/app/router'
import {parseConcivSettings, type ConcivSettings} from '@conciv/app/settings'
import {createShadowRoot} from '@conciv/app/shadow'
import {resolveApiBase} from '@conciv/app/api-base'
import {createEngineLogin, engineConnected, startEngineLogin} from '@conciv/app/engine-login'
import type {ConcivInit, PluginEntry} from './mount.js'
import {NavigationStateSchema, type NavigationState} from '@conciv/protocol/chat-types'

type NavigationRpc = Pick<RpcClient, 'navigation'>

function parseNavigation(raw: string): NavigationState | null {
  try {
    const parsed = NavigationStateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

type NavigationStorage = WebStorage & {restored: Promise<void>; dispose: () => void}

type NavigationStorageState = {cache: string | null; lastStamp: number; wroteLocally: boolean; cancelled: boolean}

function makeNavigationStorage(
  rpc: NavigationRpc,
  trust: {ready: Promise<boolean>; isTrusted: () => boolean},
  onRestore: (href: string) => void,
): NavigationStorage {
  const state: NavigationStorageState = {cache: null, lastStamp: 0, wroteLocally: false, cancelled: false}
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
      if (state.cancelled || state.wroteLocally || !initial) return
      state.lastStamp = initial.updatedAt
      state.cache = JSON.stringify({entries: initial.entries, index: initial.index})
      const current = initial.entries[initial.index]
      if (current) onRestore(current.href)
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
    dispose: () => {
      state.cancelled = true
    },
  }
}

type RebindDetail = {apiBase?: string}

declare global {
  interface WindowEventMap {
    'conciv:rebind': CustomEvent<RebindDetail>
  }
}

type BootResult = {dispose: () => void; rebind?: (apiBase: string) => void; interactive: Promise<void>}

function createInteractiveSignal(): {promise: Promise<void>; notify: () => void} {
  let notify = () => {}
  const promise = new Promise<void>((resolve) => {
    notify = resolve
  })
  return {promise, notify}
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function connectPath(settings: {defaultOpen: boolean}): string {
  return settings.defaultOpen ? '/panel/connect?open=true' : '/panel/connect'
}

function runDisposers(disposers: Array<() => void>): void {
  for (const dispose of disposers) {
    try {
      dispose()
    } catch (error) {
      console.error('[conciv] teardown step failed', error)
    }
  }
}

type ActiveSessionBinding = {
  read: () => string | null
  bind: (read: () => string | null) => void
}

function makeActiveSessionBinding(): ActiveSessionBinding {
  const bound: {read: () => string | null} = {read: () => null}
  return {
    read: () => bound.read(),
    bind: (read) => {
      bound.read = read
    },
  }
}

type BootNormalConfig = {
  root: ShadowRoot
  plugins: readonly PluginEntry[]
  settings: ConcivSettings
  apiBase: string
  grabProvider?: GrabProvider
  engineToken?: () => Promise<string>
}

function bootNormal(config: BootNormalConfig): BootResult {
  const {
    rpc,
    rebind: rebindClient,
    close: closeConnection,
  } = makeBrowserRpcClient(config.apiBase, {session: () => activeSession.read()})

  const [connectionGeneration, setConnectionGeneration] = createSignal(0)
  const [apiBase, setApiBase] = createSignal(config.apiBase)
  const login = createRoot((dispose) => ({
    ...createEngineLogin({apiBase, tokenSource: config.engineToken}),
    dispose,
  }))
  const trusted = startEngineLogin(login)

  const activeSession = makeActiveSessionBinding()

  const restore: {apply: (href: string) => void} = {apply: () => {}}
  const storage = makeNavigationStorage(rpc, {ready: trusted, isTrusted: () => login.trust().isTrusted()}, (href) =>
    restore.apply(href),
  )
  const hostRouter = window.__TSR_ROUTER__
  const interactive = createInteractiveSignal()
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: config.root, document},
    settings: config.settings,
    plugins: config.plugins,
    connected: () => engineConnected(login.status()),
    grabProvider: config.grabProvider,
    apiBase,
    connectionGeneration,
    bindActiveSession: activeSession.bind,
    notifyInteractive: interactive.notify,
    login,
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  config.root.appendChild(container)
  const paint: {dispose: () => void; cancelled: boolean} = {dispose: () => {}, cancelled: false}
  void storage.restored.then(() => {
    if (paint.cancelled) return
    paint.dispose = render(() => <RouterProvider router={router} />, container)
  })
  const disposeApp = (): void => {
    paint.cancelled = true
    paint.dispose()
  }

  const rebind = (nextApiBase: string): void => {
    rebindClient(nextApiBase)
    storage.dispose()
    setApiBase(nextApiBase)
    void router.options.context.queryClient.resetQueries()
    setConnectionGeneration((generation) => generation + 1)
    void login.requestTrust()
  }

  const boot = {href: router.state.location.href, moved: false}
  const unsubscribeNavigation = router.subscribe('onBeforeNavigate', (event) => {
    if (event.hrefChanged) boot.moved = true
  })
  restore.apply = (href) => {
    if (boot.moved || router.state.location.href !== boot.href || router.state.status !== 'idle') return
    void router.navigate({href, replace: true})
  }

  const disposers = [
    closeConnection,
    unsubscribeNavigation,
    storage.dispose,
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    login.dispose,
    interactive.notify,
  ]
  return {dispose: () => runDisposers(disposers), rebind, interactive: interactive.promise}
}

type BootServersConfig = {
  root: ShadowRoot
  plugins: readonly PluginEntry[]
  settings: ConcivSettings
  grabProvider?: GrabProvider
}

function bootServers(config: BootServersConfig): BootResult {
  const deferred = makeBrowserRpcClient(() => null, {session: () => activeSession.read()})
  const [apiBase, setApiBase] = createSignal('')
  const activeSession = makeActiveSessionBinding()
  const bindApiBase = (nextApiBase: string) => {
    deferred.bind(nextApiBase)
    setApiBase(nextApiBase)
  }
  const hostRouter = window.__TSR_ROUTER__
  const interactive = createInteractiveSignal()
  const router = createConcivRouter({
    rpc: deferred.rpc,
    history: createMemoryHistory({initialEntries: [connectPath(config.settings)]}),
    environment: {rootNode: config.root, document},
    settings: config.settings,
    plugins: config.plugins,
    servers: true,
    connected: deferred.bound,
    bindApiBase,
    grabProvider: config.grabProvider,
    apiBase,
    bindActiveSession: activeSession.bind,
    notifyInteractive: interactive.notify,
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  config.root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const disposers = [
    deferred.close,
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    interactive.notify,
  ]
  return {dispose: () => runDisposers(disposers), interactive: interactive.promise}
}

async function boot(root: ShadowRoot, init: ConcivInit): Promise<BootResult> {
  const plugins = init.plugins ?? []
  const settings = initSettings(init)
  const grabProvider = init.grabProvider
  const engineToken = init.engineToken
  const apiBase = init.apiBase ?? resolveApiBase()
  if (!apiBase && plugins.length > 0) return bootServers({root, plugins, settings, grabProvider})
  return bootNormal({root, plugins, settings, apiBase, grabProvider, engineToken})
}

function initSettings(init: ConcivInit): ConcivSettings {
  return parseConcivSettings(init.settings ? JSON.stringify(init.settings) : metaContent('conciv-widget'))
}

export function mountImpl(
  init: ConcivInit,
  el: HTMLElement,
): {ready: Promise<void>; teardown: () => void; rebind: (apiBase: string) => Promise<void>} {
  installReactBridge()
  const hostRouter = window.__TSR_ROUTER__
  const inner = document.createElement('div')
  inner.setAttribute('data-conciv-root', '')
  el.appendChild(inner)
  const {host, root, dispose: disposeShadow} = createShadowRoot(inner, initSettings(init).surface)
  let disposed = false
  let disposeBoot: (() => void) | undefined
  let rebindBoot: ((apiBase: string) => void) | undefined
  const ready = boot(root, init).then((result) => {
    if (disposed) {
      result.dispose()
      return
    }
    disposeBoot = result.dispose
    rebindBoot = result.rebind
    return result.interactive
  })
  const rebind = async (apiBase: string): Promise<void> => {
    await ready
    if (disposed) return
    rebindBoot?.(apiBase)
  }
  const onRebind = (event: WindowEventMap['conciv:rebind']): void => {
    const detail = event.detail
    if (detail?.apiBase) void rebind(detail.apiBase)
  }
  window.addEventListener('conciv:rebind', onRebind)
  const teardown = (): void => {
    disposed = true
    window.removeEventListener('conciv:rebind', onRebind)
    disposeShadow()
    try {
      disposeBoot?.()
    } finally {
      host.remove()
      window.__TSR_ROUTER__ = hostRouter
    }
  }
  return {ready, teardown, rebind}
}
