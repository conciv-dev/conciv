import {render} from 'solid-js/web'
import {RouterProvider, createBrowserHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient} from '@conciv/contract'
import {parseConcivSettings} from './data/settings.js'
import {createConcivRouter} from './router.js'

function start(): void {
  const params = new URLSearchParams(window.location.search)
  const settings = parseConcivSettings(params.get('settings') ?? '')
  const apiBase = params.get('core') ?? ''
  window.__CONCIV_API_BASE__ = apiBase
  const router = createConcivRouter({
    rpc: makeBrowserRpcClient(apiBase, {transport: settings.transport}).rpc,
    history: createBrowserHistory(),
    environment: {rootNode: document, document},
    settings,
  })
  const root = document.getElementById('app')
  if (root) render(() => <RouterProvider router={router} />, root)
}

start()
