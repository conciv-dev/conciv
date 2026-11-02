import {render} from 'solid-js/web'
import {RouterProvider, createBrowserHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient} from '@conciv/contract'
import pageExtension from '@conciv/extension-page/client'
import {hubFor, renderLogin, type HubConnection} from './app/devframe-link.js'
import {parseConcivSettings} from './data/settings.js'
import {createConcivRouter} from './router.js'

type Link = {apiBase: string; hub?: HubConnection}

function linked(core: string): Promise<Link> {
  if (core === '') return Promise.resolve({apiBase: ''})
  const hub = hubFor(core)
  return new Promise((resolve) => {
    renderLogin(document.body, hub, core, (apiBase) => resolve({apiBase, hub}))
  })
}

async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const settings = parseConcivSettings(params.get('settings') ?? '')
  const link = await linked(params.get('core') ?? '')
  const apiBase = link.apiBase
  window.__CONCIV_API_BASE__ = apiBase
  const activeSession: {read: () => string | null} = {read: () => null}
  const router = createConcivRouter({
    rpc: makeBrowserRpcClient(apiBase, {session: () => activeSession.read()}).rpc,
    hubConnection: link.hub,
    history: createBrowserHistory(),
    environment: {rootNode: document, document},
    settings,
    extensions: [pageExtension],
    apiBase: () => apiBase,
    bindActiveSession: (read) => {
      activeSession.read = read
    },
  })
  const root = document.getElementById('app')
  if (root) render(() => <RouterProvider router={router} />, root)
}

start().catch((error: unknown) => console.error('conciv: the standalone app failed to start', error))
