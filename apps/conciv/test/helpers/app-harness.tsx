import {render} from 'solid-js/web'
import {RouterProvider} from '@tanstack/solid-router'
import {createWebStorageHistory, type WebStorage} from '@conciv/storage-history'
import {makeRpcClient} from '@conciv/contract'
import type {AnyExtension} from '@conciv/extension'
import {createShadowRoot} from '../../src/lib/shadow.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../../src/router.js'
import {CORE_BASE} from './fake-core.js'

function makeMemoryStorage(): WebStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

export type AppMount = {dispose: () => void; shadowRoot: ShadowRoot}

export function mountApp(config: {extensions?: AnyExtension[]; initialPath?: string} = {}): AppMount {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const {root} = createShadowRoot(host)
  const container = document.createElement('div')
  root.appendChild(container)
  const history = createWebStorageHistory({storage: makeMemoryStorage()})
  if (config.initialPath) history.push(config.initialPath)
  const router = createConcivRouter({
    rpc: makeRpcClient(CORE_BASE),
    history,
    environment: {rootNode: root, document},
    settings: parseConcivSettings('{"modal": false}'),
    extensions: config.extensions,
  })
  const dispose = render(() => <RouterProvider router={router} />, container)
  return {
    shadowRoot: root,
    dispose: () => {
      dispose()
      disposeConcivRouter(router)
      host.remove()
    },
  }
}
