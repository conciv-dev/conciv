import {render} from 'solid-js/web'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeDeferredRpcClient, makeRpcClient} from '@conciv/contract'
import {createWebStorageHistory} from '@conciv/storage-history'
import type {AnyExtension} from '@conciv/extension'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter, disposeConcivRouter} from 'conciv/router'
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

async function bootNormal(
  root: ShadowRoot,
  extensions: AnyExtension[],
  settings: ConcivSettings,
  apiBase: string,
  connectMode = false,
): Promise<() => void> {
  const rpc = makeRpcClient(apiBase)
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  const storage = await makeNavigationStorage(rpc)
  const hostRouter = window.__TSR_ROUTER__
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: root, document},
    settings,
    extensions,
    connected: () => true,
    connectMode,
    disconnect: connectMode ? makeDisconnect(() => apiBase) : undefined,
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const plane = startPagePlane({rpc, document, driver})
  const disposers = [
    () => plane.dispose(),
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    driver.dispose,
  ]
  return () => runDisposers(disposers)
}

function bootConnect(root: ShadowRoot, extensions: AnyExtension[], settings: ConcivSettings): () => void {
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
    history: createMemoryHistory({initialEntries: [connectPath(settings)]}),
    environment: {rootNode: root, document},
    settings,
    extensions,
    connected: deferred.bound,
    connectMode: true,
    bindApiBase,
    disconnect: makeDisconnect(() => boundApiBase),
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const disposers = [
    () => planeDispose?.(),
    disposeApp,
    () => disposeConcivRouter(router),
    () => router.options.context.queryClient.clear(),
    driver.dispose,
  ]
  return () => runDisposers(disposers)
}

async function boot(root: ShadowRoot, init: ConcivInit): Promise<() => void> {
  const extensions = typeof init.extensions === 'function' ? await init.extensions() : (init.extensions ?? [])
  const settings = parseConcivSettings(init.settings ? JSON.stringify(init.settings) : metaContent('pw-widget'))
  const apiBase = init.apiBase ?? resolveApiBase()
  if (apiBase) return bootNormal(root, extensions, settings, apiBase)
  const gate = extensions.find((extension) => extension.connectGate)
  if (!gate?.connectGate) return bootNormal(root, extensions, settings, apiBase)
  const found = await gate.connectGate.preflight()
  if (found) return bootNormal(root, extensions, settings, found, true)
  return bootConnect(root, extensions, settings)
}

export function mountImpl(init: ConcivInit, el: HTMLElement): {ready: Promise<void>; teardown: () => void} {
  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
  const hostRouter = window.__TSR_ROUTER__
  const inner = document.createElement('div')
  inner.setAttribute('data-conciv-root', '')
  el.appendChild(inner)
  const {host, root} = createShadowRoot(inner)
  let disposed = false
  let disposeBoot: (() => void) | undefined
  const ready = boot(root, init).then((dispose) => {
    if (disposed) {
      dispose()
      return
    }
    disposeBoot = dispose
  })
  const teardown = (): void => {
    disposed = true
    try {
      disposeBoot?.()
    } finally {
      host.remove()
      window.__TSR_ROUTER__ = hostRouter
      window.__CONCIV_PAGE_DRIVER__ = undefined
      window.__CONCIV_REACT_BRIDGE__ = undefined
    }
  }
  return {ready, teardown}
}
