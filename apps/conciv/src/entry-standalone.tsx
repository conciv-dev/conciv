import {render} from 'solid-js/web'
import {RouterProvider, createBrowserHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {parseConcivSettings} from './data/settings.js'
import {createConcivRouter} from './router.js'

function start(): void {
  const params = new URLSearchParams(window.location.search)
  const router = createConcivRouter({
    rpc: makeRpcClient(params.get('core') ?? ''),
    history: createBrowserHistory(),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(params.get('settings') ?? ''),
  })
  const root = document.getElementById('app')
  if (root) render(() => <RouterProvider router={router} />, root)
}

start()
