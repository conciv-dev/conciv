import {createEffect, createRoot, createSignal, onCleanup} from 'solid-js'
import {render} from 'solid-js/web'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient, type RpcClient} from '@conciv/contract'
import {pageQueries} from '@conciv/client'
import {createWebStorageHistory} from '@conciv/storage-history'
import {
  collectClientEffects,
  collectClientTools,
  type AnyExtension,
  type ClientEffect,
  type ClientToolEntry,
} from '@conciv/extension'
import type {GrabProvider} from '@conciv/grab'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter, disposeConcivRouter} from '@conciv/app/router'
import {parseConcivSettings, type ConcivSettings} from '@conciv/app/settings'
import {createShadowRoot} from '@conciv/app/shadow'
import {resolveApiBase} from '@conciv/app/api-base'
import {createEngineLogin, engineConnected, startEngineLogin} from '@conciv/app/engine-login'
import {engineAddress} from './agent-base.js'
import {makeNavigationStorage} from './navigation-storage.js'
import type {ConcivInit, PluginEntry} from './mount.js'

type RebindDetail = {apiBase?: string}

declare global {
  interface Window {
    __CONCIV_PAGE_DRIVER__?: PageDriver
    __CONCIV_REACT_BRIDGE__?: typeof reactBridge
  }
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

type SessionPagePlaneConfig = {
  session: () => string | null
  apiBase: () => string
  rpc: RpcClient
  driver: () => PageDriver
  redoOnChange: () => unknown
  trusted: () => boolean
}

function startSessionPagePlane(config: SessionPagePlaneConfig): {dispose: () => void} {
  return createRoot((dispose) => {
    createEffect(() => {
      config.redoOnChange()
      const sessionId = config.session()
      const apiBase = config.apiBase()
      if (!sessionId || apiBase === '' || !config.trusted()) return
      const plane = startPagePlane({
        source: {
          queries: (signal) => pageQueries(config.rpc, signal),
          reply: (input) => config.rpc.page.reply(input),
        },
        driver: config.driver(),
      })
      onCleanup(() => plane.dispose())
    })
    return {dispose}
  })
}

type ActiveSessionBinding = {
  read: () => string | null
  bind: (read: () => string | null) => void
  dispose: () => void
}

function makeActiveSessionBinding(
  plane: (session: () => string | null) => {dispose: () => void},
): ActiveSessionBinding {
  const bound: {read: () => string | null; planeDispose: () => void} = {read: () => null, planeDispose: () => {}}
  return {
    read: () => bound.read(),
    bind: (read) => {
      bound.planeDispose()
      bound.read = read
      bound.planeDispose = plane(read).dispose
    },
    dispose: () => bound.planeDispose(),
  }
}

type BootNormalConfig = {
  root: ShadowRoot
  extensions: AnyExtension[]
  plugins: readonly PluginEntry[]
  settings: ConcivSettings
  apiBase: string
  grabProvider?: GrabProvider
  engineToken?: () => Promise<string>
}

type MountedRouter = {options: {context: {instances: {extension: AnyExtension; effects: readonly ClientEffect[]}[]}}}

function mountedClientTools(router: MountedRouter): ClientToolEntry[] {
  return collectClientTools(router.options.context.instances.map((instance) => instance.extension))
}

function mountedClientEffects(router: MountedRouter): ClientEffect[] {
  return collectClientEffects(
    router.options.context.instances.map((instance) => ({name: instance.extension.name, effects: instance.effects})),
  )
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

  const activeSession = makeActiveSessionBinding((session) =>
    startSessionPagePlane({
      session,
      apiBase,
      rpc,
      driver: () => driver,
      redoOnChange: connectionGeneration,
      trusted: () => login.status() === 'trusted',
    }),
  )

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
    extensions: config.extensions,
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
  const driver = makeDomPageDriver({tools: mountedClientTools(router), effects: mountedClientEffects(router)})
  window.__CONCIV_PAGE_DRIVER__ = driver

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
    activeSession.dispose,
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    driver.dispose,
    login.dispose,
    interactive.notify,
  ]
  return {dispose: () => runDisposers(disposers), rebind, interactive: interactive.promise}
}

type BootConnectConfig = {
  root: ShadowRoot
  extensions: AnyExtension[]
  plugins: readonly PluginEntry[]
  settings: ConcivSettings
  grabProvider?: GrabProvider
}

function bootConnect(config: BootConnectConfig): BootResult {
  const deferred = makeBrowserRpcClient(() => null, {session: () => activeSession.read()})
  const [apiBase, setApiBase] = createSignal('')
  const activeSession = makeActiveSessionBinding((session) =>
    startSessionPagePlane({
      session,
      apiBase,
      rpc: deferred.rpc,
      driver: () => driver,
      redoOnChange: apiBase,
      trusted: () => true,
    }),
  )
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
    extensions: config.extensions,
    plugins: config.plugins,
    servers: config.plugins.length > 0,
    connected: deferred.bound,
    bindApiBase,
    grabProvider: config.grabProvider,
    apiBase,
    bindActiveSession: activeSession.bind,
    notifyInteractive: interactive.notify,
  })
  window.__TSR_ROUTER__ = hostRouter
  const driver = makeDomPageDriver({tools: mountedClientTools(router), effects: mountedClientEffects(router)})
  window.__CONCIV_PAGE_DRIVER__ = driver

  const container = document.createElement('div')
  config.root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const disposers = [
    deferred.close,
    activeSession.dispose,
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    driver.dispose,
    interactive.notify,
  ]
  return {dispose: () => runDisposers(disposers), interactive: interactive.promise}
}

async function boot(root: ShadowRoot, init: ConcivInit): Promise<BootResult> {
  const extensions = typeof init.extensions === 'function' ? await init.extensions() : (init.extensions ?? [])
  const plugins = init.plugins ?? []
  const settings = initSettings(init)
  const grabProvider = init.grabProvider
  const engineToken = init.engineToken
  const apiBase = init.apiBase ?? resolveApiBase()
  if (apiBase) return bootNormal({root, extensions, plugins, settings, apiBase, grabProvider, engineToken})
  if (plugins.length > 0) return bootConnect({root, extensions, plugins, settings, grabProvider})
  return bootThroughConnectGate({root, extensions, plugins, settings, grabProvider})
}

async function bootThroughConnectGate(config: BootConnectConfig): Promise<BootResult> {
  const {root, extensions, plugins, settings, grabProvider} = config
  const apiBase = ''
  const gate = extensions.find((extension) => extension.connectGate)
  if (!gate?.connectGate) return bootNormal({root, extensions, plugins, settings, apiBase, grabProvider})
  const found = await gate.connectGate.preflight()
  if (found) return bootNormal({root, extensions, plugins, settings, ...engineAddress(found), grabProvider})
  return bootConnect({root, extensions, plugins, settings, grabProvider})
}

function initSettings(init: ConcivInit): ConcivSettings {
  return parseConcivSettings(init.settings ? JSON.stringify(init.settings) : metaContent('conciv-widget'))
}

export function mountImpl(
  init: ConcivInit,
  el: HTMLElement,
): {ready: Promise<void>; teardown: () => void; rebind: (apiBase: string) => Promise<void>} {
  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
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
      window.__CONCIV_PAGE_DRIVER__ = undefined
      window.__CONCIV_REACT_BRIDGE__ = undefined
    }
  }
  return {ready, teardown, rebind}
}
