import {createSignal} from 'solid-js'
import {render} from 'solid-js/web'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeDeferredRpcClient, makeRebindableRpcClient} from '@conciv/contract'
import {createWebStorageHistory} from '@conciv/storage-history'
import type {AnyExtension} from '@conciv/extension'
import type {GrabProvider} from '@conciv/grab'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter} from 'conciv/router'
import {parseConcivSettings, type ConcivSettings} from 'conciv/settings'
import {createShadowRoot} from 'conciv/shadow'
import {resolveApiBase} from 'conciv/api-base'
import {makeNavigationStorage} from './navigation-storage.js'
import type {ConcivInit} from './mount.js'

declare global {
  interface Window {
    __CONCIV_PAGE_DRIVER__?: PageDriver
    __CONCIV_REACT_BRIDGE__?: typeof reactBridge
  }
}

type BootResult = {dispose: () => void; rebind?: (apiBase: string) => void}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function connectPath(settings: {defaultOpen: boolean}): string {
  return settings.defaultOpen ? '/panel/connect?open=true' : '/panel/connect'
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

async function bootNormal(config: BootNormalConfig): Promise<BootResult> {
  const {rpc, rebind: rebindClient} = makeRebindableRpcClient(config.apiBase)
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  const [connectionGeneration, setConnectionGeneration] = createSignal(0)
  let currentApiBase = config.apiBase

  const storage = await makeNavigationStorage(rpc)
  const hostRouter = window.__TSR_ROUTER__
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: config.root, document},
    settings: config.settings,
    extensions: config.extensions,
    connected: () => true,
    connectMode: config.connectMode,
    disconnect: config.connectMode ? makeDisconnect(() => currentApiBase) : undefined,
    grabProvider: config.grabProvider,
    connectionGeneration,
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  config.root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  let plane = startPagePlane({rpc, document, driver})

  const rebind = (nextApiBase: string): void => {
    plane.dispose()
    rebindClient(nextApiBase)
    currentApiBase = nextApiBase
    plane = startPagePlane({rpc, document, driver})
    router.options.context.queryClient.clear()
    setConnectionGeneration((generation) => generation + 1)
  }

  const disposers = [
    () => plane.dispose(),
    disposeApp,
    () => router.options.context.queryClient.clear(),
    driver.dispose,
  ]
  return {dispose: () => runDisposers(disposers), rebind}
}

type BootConnectConfig = {
  root: ShadowRoot
  extensions: AnyExtension[]
  settings: ConcivSettings
  grabProvider?: GrabProvider
}

function bootConnect(config: BootConnectConfig): BootResult {
  const deferred = makeDeferredRpcClient()
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  let boundApiBase: string | undefined
  let planeDispose: (() => void) | undefined
  const bindApiBase = (apiBase: string) => {
    boundApiBase = apiBase
    deferred.bind(apiBase)
    planeDispose = startPagePlane({rpc: deferred.rpc, document, driver}).dispose
  }
  const hostRouter = window.__TSR_ROUTER__
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
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  config.root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const disposers = [
    () => planeDispose?.(),
    disposeApp,
    () => router.options.context.queryClient.clear(),
    driver.dispose,
  ]
  return {dispose: () => runDisposers(disposers)}
}

async function boot(root: ShadowRoot, init: ConcivInit): Promise<BootResult> {
  const extensions = typeof init.extensions === 'function' ? await init.extensions() : (init.extensions ?? [])
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
  const {host, root} = createShadowRoot(inner)
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
  })
  const rebind = async (apiBase: string): Promise<void> => {
    await ready
    if (disposed) return
    rebindBoot?.(apiBase)
  }
  const onRebind = (event: Event): void => {
    const detail = (event as CustomEvent<{apiBase?: string}>).detail
    if (detail?.apiBase) void rebind(detail.apiBase)
  }
  window.addEventListener('conciv:rebind', onRebind)
  const teardown = (): void => {
    disposed = true
    window.removeEventListener('conciv:rebind', onRebind)
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
