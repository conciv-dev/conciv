import {render} from 'solid-js/web'
import {RouterProvider, createBrowserHistory} from '@tanstack/solid-router'
import {createRoot} from 'solid-js'
import {makeBrowserRpcClient} from '@conciv/contract'
import pageExtension from '@conciv/extension-page/client'
import {parseConcivSettings} from './data/settings.js'
import {createConcivRouter} from './router.js'
import {createEngineLogin, engineConnected, startEngineLogin} from './app/engine-login.js'

function start(): void {
  const params = new URLSearchParams(window.location.search)
  const settings = parseConcivSettings(params.get('settings') ?? '')
  const core = params.get('core') ?? ''
  window.__CONCIV_API_BASE__ = core
  const login = createRoot(() => createEngineLogin({apiBase: () => core}))
  void startEngineLogin(login)
  const activeSession: {read: () => string | null} = {read: () => null}
  const router = createConcivRouter({
    rpc: makeBrowserRpcClient(core, {session: () => activeSession.read()}).rpc,
    history: createBrowserHistory(),
    environment: {rootNode: document, document},
    settings,
    extensions: [pageExtension],
    apiBase: () => core,
    connected: () => engineConnected(login.status()),
    login,
    bindActiveSession: (read) => {
      activeSession.read = read
    },
  })
  const root = document.getElementById('app')
  if (root) render(() => <RouterProvider router={router} />, root)
}

start()
