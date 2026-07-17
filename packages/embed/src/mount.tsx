import {render} from 'solid-js/web'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeDeferredRpcClient, makeRpcClient} from '@conciv/contract'
import {createWebStorageHistory} from '@conciv/storage-history'
import type {AnyExtension} from '@conciv/extension'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter} from 'conciv/router'
import {parseConcivSettings} from 'conciv/settings'
import {createShadowRoot} from 'conciv/shadow'
import {resolveApiBase} from 'conciv/api-base'
import {makeNavigationStorage} from './navigation-storage.js'

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

async function bootNormal(
  root: ShadowRoot,
  extensions: AnyExtension[],
  apiBase: string,
  connectMode = false,
): Promise<void> {
  const rpc = makeRpcClient(apiBase)
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  const storage = await makeNavigationStorage(rpc)
  const hostRouter = window.__TSR_ROUTER__
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: root, document},
    settings: parseConcivSettings(metaContent('pw-widget')),
    extensions,
    connected: () => true,
    connectMode,
    disconnect: connectMode ? makeDisconnect(() => apiBase) : undefined,
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  root.appendChild(container)
  render(() => <RouterProvider router={router} />, container)
  startPagePlane({rpc, document, driver})
}

function bootConnect(root: ShadowRoot, extensions: AnyExtension[]): void {
  const deferred = makeDeferredRpcClient()
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  const settings = parseConcivSettings(metaContent('pw-widget'))
  let boundApiBase: string | undefined
  const bindApiBase = (apiBase: string) => {
    boundApiBase = apiBase
    deferred.bind(apiBase)
    startPagePlane({rpc: deferred.rpc, document, driver})
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
  render(() => <RouterProvider router={router} />, container)
}

async function boot(root: ShadowRoot, extensions: AnyExtension[]): Promise<void> {
  const apiBase = resolveApiBase()
  if (apiBase) return bootNormal(root, extensions, apiBase)
  const gate = extensions.find((extension) => extension.connectGate)
  if (!gate?.connectGate) return bootNormal(root, extensions, apiBase)
  const found = await gate.connectGate.preflight()
  if (found) return bootNormal(root, extensions, found, true)
  bootConnect(root, extensions)
}

export function mountConciv(extensions: AnyExtension[]): void {
  if (document.querySelector('[data-conciv-root]')) return
  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
  const {root} = createShadowRoot()
  void boot(root, extensions)
}
