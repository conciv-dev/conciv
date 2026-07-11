import {render} from 'solid-js/web'
import {RouterProvider} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
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

async function boot(root: ShadowRoot, extensions: AnyExtension[]): Promise<void> {
  const apiBase = resolveApiBase()
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
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  root.appendChild(container)
  render(() => <RouterProvider router={router} />, container)
  startPagePlane({rpc, document, driver})
}

export function mountConciv(extensions: AnyExtension[]): void {
  if (document.querySelector('[data-conciv-root]')) return
  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
  const {root} = createShadowRoot()
  void boot(root, extensions)
}
