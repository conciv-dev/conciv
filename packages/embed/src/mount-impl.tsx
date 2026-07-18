import {render} from 'solid-js/web'
import {RouterProvider} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {createWebStorageHistory} from '@conciv/storage-history'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter} from 'conciv/router'
import {parseConcivSettings} from 'conciv/settings'
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

async function boot(root: ShadowRoot, init: ConcivInit): Promise<() => void> {
  const apiBase = init.apiBase ?? resolveApiBase()
  const rpc = makeRpcClient(apiBase)
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  const extensions = typeof init.extensions === 'function' ? await init.extensions() : (init.extensions ?? [])
  const storage = await makeNavigationStorage(rpc)
  const hostRouter = window.__TSR_ROUTER__
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: root, document},
    settings: parseConcivSettings(init.settings ? JSON.stringify(init.settings) : metaContent('pw-widget')),
    extensions,
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const plane = startPagePlane({rpc, document, driver})
  const disposers = [
    () => plane.dispose(),
    disposeApp,
    () => router.options.context.queryClient.clear(),
    driver.dispose,
  ]
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (error) {
        console.error('[conciv] teardown step failed', error)
      }
    }
  }
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
