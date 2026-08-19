import {createRoot, createSignal} from 'solid-js'
import {render} from 'solid-js/web'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient} from '@conciv/contract'
import {engineOnline, subscribeEngineOnline} from '@conciv/client'
import {createWebStorageHistory} from '@conciv/storage-history'
import {
  collectClientEffects,
  collectClientTools,
  type AnyExtension,
  type ClientEffect,
  type ClientToolEntry,
} from '@conciv/extension'
import pageExtension from '@conciv/extension-page/client'
import type {GrabProvider} from '@conciv/grab'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter, disposeConcivRouter} from '@conciv/app/router'
import {parseConcivSettings, type ConcivSettings} from '@conciv/app/settings'
import {createShadowRoot} from '@conciv/app/shadow'
import {resolveApiBase} from '@conciv/app/api-base'
import {makeNavigationStorage} from './navigation-storage.js'
import type {ConcivInit} from './mount.js'

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

type ResolvedRouteMatch = {params: Record<string, unknown>}
type SessionAwareRouter = {state: {matches: ResolvedRouteMatch[]}}

function activeSessionId(router: SessionAwareRouter): string {
  const match = router.state.matches.findLast((entry) => typeof entry.params['sessionId'] === 'string')
  const sessionId = match?.params['sessionId']
  return typeof sessionId === 'string' ? sessionId : ''
}

function makeDisconnect(getApiBase: () => string | undefined): () => void {
  return () => {
    const base = getApiBase()
    if (base) void fetch(`${base}/api/shutdown`, {method: 'POST'}).catch(() => {})
    setTimeout(() => window.location.reload(), 150)
  }
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

type BootNormalConfig = {
  root: ShadowRoot
  extensions: AnyExtension[]
  settings: ConcivSettings
  apiBase: string
  grabProvider?: GrabProvider
  connectMode?: boolean
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
  } = makeBrowserRpcClient(config.apiBase, {
    transport: config.settings.transport,
  })

  const [connectionGeneration, setConnectionGeneration] = createSignal(0)
  const [apiBase, setApiBase] = createSignal(config.apiBase)

  const restore: {apply: (href: string) => void} = {apply: () => {}}
  const storage = makeNavigationStorage(rpc, (href) => restore.apply(href))
  const hostRouter = window.__TSR_ROUTER__
  const interactive = createInteractiveSignal()
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: config.root, document},
    settings: config.settings,
    extensions: config.extensions,
    connected: () => true,
    connectMode: config.connectMode,
    disconnect: config.connectMode ? makeDisconnect(apiBase) : undefined,
    grabProvider: config.grabProvider,
    apiBase,
    connectionGeneration,
    notifyInteractive: interactive.notify,
  })
  window.__TSR_ROUTER__ = hostRouter
  const driver = makeDomPageDriver({tools: mountedClientTools(router), effects: mountedClientEffects(router)})
  window.__CONCIV_PAGE_DRIVER__ = driver

  const reachabilityRoot = createRoot((dispose) => ({isOnline: engineOnline(), dispose}))

  const container = document.createElement('div')
  config.root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const session = {id: activeSessionId(router)}
  let plane = startPagePlane({
    rpc,
    document,
    driver,
    sessionId: session.id,
    isOnline: reachabilityRoot.isOnline,
    subscribeOnline: subscribeEngineOnline,
  })

  const restartPlane = (): void => {
    plane.dispose()
    plane = startPagePlane({
      rpc,
      document,
      driver,
      sessionId: session.id,
      isOnline: reachabilityRoot.isOnline,
      subscribeOnline: subscribeEngineOnline,
    })
  }

  const unsubscribeSession = router.subscribe('onResolved', () => {
    const nextSessionId = activeSessionId(router)
    if (nextSessionId === session.id) return
    session.id = nextSessionId
    restartPlane()
  })

  const rebind = (nextApiBase: string): void => {
    rebindClient(nextApiBase)
    storage.dispose()
    setApiBase(nextApiBase)
    restartPlane()
    router.options.context.queryClient.clear()
    setConnectionGeneration((generation) => generation + 1)
  }

  restore.apply = (href) => void router.navigate({href, replace: true})

  const disposers = [
    storage.dispose,
    unsubscribeSession,
    () => plane.dispose(),
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    driver.dispose,
    reachabilityRoot.dispose,
    closeConnection,
    interactive.notify,
  ]
  return {dispose: () => runDisposers(disposers), rebind, interactive: interactive.promise}
}

type BootConnectConfig = {
  root: ShadowRoot
  extensions: AnyExtension[]
  settings: ConcivSettings
  grabProvider?: GrabProvider
}

function bootConnect(config: BootConnectConfig): BootResult {
  const deferred = makeBrowserRpcClient(() => null, {transport: config.settings.transport})
  const reachabilityRoot = createRoot((dispose) => ({isOnline: engineOnline(), dispose}))

  let boundApiBase: string | undefined
  let planeDispose: (() => void) | undefined
  const [apiBase, setApiBase] = createSignal('')
  const bindApiBase = (nextApiBase: string) => {
    boundApiBase = nextApiBase
    deferred.bind(nextApiBase)
    setApiBase(nextApiBase)
    planeDispose = startPagePlane({
      rpc: deferred.rpc,
      document,
      driver,
      isOnline: reachabilityRoot.isOnline,
      subscribeOnline: subscribeEngineOnline,
    }).dispose
  }
  const hostRouter = window.__TSR_ROUTER__
  const interactive = createInteractiveSignal()
  const router = createConcivRouter({
    rpc: deferred.rpc,
    history: createMemoryHistory({initialEntries: [connectPath(config.settings)]}),
    environment: {rootNode: config.root, document},
    settings: config.settings,
    extensions: config.extensions,
    connected: deferred.bound,
    connectMode: true,
    bindApiBase,
    disconnect: makeDisconnect(() => boundApiBase),
    grabProvider: config.grabProvider,
    apiBase,
    notifyInteractive: interactive.notify,
  })
  window.__TSR_ROUTER__ = hostRouter
  const driver = makeDomPageDriver({tools: mountedClientTools(router), effects: mountedClientEffects(router)})
  window.__CONCIV_PAGE_DRIVER__ = driver

  const container = document.createElement('div')
  config.root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const disposers = [
    () => planeDispose?.(),
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    driver.dispose,
    reachabilityRoot.dispose,
    deferred.close,
    interactive.notify,
  ]
  return {dispose: () => runDisposers(disposers), interactive: interactive.promise}
}

async function boot(root: ShadowRoot, init: ConcivInit): Promise<BootResult> {
  const supplied = typeof init.extensions === 'function' ? await init.extensions() : (init.extensions ?? [])
  const extensions = [pageExtension, ...supplied]
  const settings = parseConcivSettings(init.settings ? JSON.stringify(init.settings) : metaContent('pw-widget'))
  const grabProvider = init.grabProvider
  const apiBase = init.apiBase ?? resolveApiBase()
  if (apiBase) return bootNormal({root, extensions, settings, apiBase, grabProvider})
  const gate = extensions.find((extension) => extension.connectGate)
  if (!gate?.connectGate) return bootNormal({root, extensions, settings, apiBase, grabProvider})
  const found = await gate.connectGate.preflight()
  if (found) return bootNormal({root, extensions, settings, apiBase: found, grabProvider, connectMode: true})
  return bootConnect({root, extensions, settings, grabProvider})
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
  const {host, root, dispose: disposeShadow} = createShadowRoot(inner)
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
