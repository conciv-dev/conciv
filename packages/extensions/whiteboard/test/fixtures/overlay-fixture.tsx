import type {ClientApi} from '@mandarax/extension'
import {fetchJazzConfig} from '../../src/client/jazz-client.js'
import {mountOverlay} from '../../src/client/overlay.js'

declare global {
  interface Window {
    __CORE__: string
  }
}

const params = new URLSearchParams(location.search)
const session = `mandarax_${params.get('session') ?? 'e3'}`

const surfaceHost = document.createElement('div')
surfaceHost.style.cssText = 'position:fixed;z-index:2147483000'
document.body.appendChild(surfaceHost)
const surfaceRoot = surfaceHost.attachShadow({mode: 'open'})
const functional = document.createElement('style')
functional.textContent =
  'button,input{pointer-events:auto} [aria-label$="comment, open"]{width:24px;height:24px} [aria-label="Comment thread"]{position:fixed;right:1rem;bottom:1rem;min-width:18rem;background:#fff}'
surfaceRoot.appendChild(functional)
const surfaceContainer = document.createElement('div')
surfaceRoot.appendChild(surfaceContainer)

const api = {
  apiBase: window.__CORE__,
  client: {sessionId: () => session},
  requestMeta: () => ({}),
  page: {elementAt: () => null, describe: () => ({component: '', file: null}), locate: async () => null},
  openSource: async () => 'no-source',
  toast: () => {},
  surface: () => surfaceContainer,
  env: {reducedMotion: () => false, doc: document, win: window},
} as unknown as ClientApi

const config = await fetchJazzConfig(`${window.__CORE__}/api/ext/whiteboard`)
mountOverlay({api, config, open: () => true, previewId: 'local', sessionId: () => session})

export {}
