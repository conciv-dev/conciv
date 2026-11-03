import {render} from 'solid-js/web'
import {createStore} from 'solid-js/store'
import {RouterProvider, createBrowserHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient} from '@conciv/contract'
import pageExtension from '@conciv/extension-page/client'
import {hubFor, makeHubLogin} from './app/devframe-link.js'
import {parseConcivSettings} from './data/settings.js'
import {createConcivRouter} from './router.js'

function engineLink(core: string) {
  const [link, setLink] = createStore<{apiBase: string | null}>({apiBase: null})
  const hub = hubFor(core)
  const login = makeHubLogin(hub, core, (trustedApiBase) => {
    window.__CONCIV_API_BASE__ = trustedApiBase
    setLink('apiBase', trustedApiBase)
  })
  return {link, hub, login}
}

function sameOriginLink() {
  return {link: {apiBase: ''}, hub: undefined, login: undefined}
}

function linkFor(core: string) {
  return core === '' ? sameOriginLink() : engineLink(core)
}

function start(): void {
  const params = new URLSearchParams(window.location.search)
  const settings = parseConcivSettings(params.get('settings') ?? '')
  const core = params.get('core') ?? ''
  const {link, hub, login} = linkFor(core)
  const activeSession: {read: () => string | null} = {read: () => null}
  const router = createConcivRouter({
    rpc: makeBrowserRpcClient(() => link.apiBase, {session: () => activeSession.read()}).rpc,
    hubConnection: hub,
    login,
    history: createBrowserHistory(),
    environment: {rootNode: document, document},
    settings,
    extensions: [pageExtension],
    connected: () => link.apiBase !== null,
    apiBase: () => link.apiBase ?? '',
    bindActiveSession: (read) => {
      activeSession.read = read
    },
  })
  const root = document.getElementById('app')
  if (root) render(() => <RouterProvider router={router} />, root)
}

start()
