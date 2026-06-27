import type {ClientApi} from '@mandarax/extension'
import type {ElementRect, ElementSource} from '@mandarax/grab'
import {fetchJazzConfig} from '../../src/client/jazz-client.js'
import {mountOverlay, type CommentPick} from '../../src/client/overlay.js'

declare global {
  interface Window {
    __CORE__: string
    __SHADOW_CSS__: string
    __commentReady: boolean
    commentOnElement: (source: ElementSource | null, rect: ElementRect | null) => void
  }
}

const params = new URLSearchParams(location.search)
const session = `mandarax_${params.get('session') ?? 'e3'}`

const surfaceHost = document.createElement('div')
surfaceHost.style.cssText = 'position:fixed;z-index:2147483000'
document.body.appendChild(surfaceHost)
const surfaceRoot = surfaceHost.attachShadow({mode: 'open'})
const style = document.createElement('style')
style.textContent = window.__SHADOW_CSS__
surfaceRoot.appendChild(style)
const properties = window.__SHADOW_CSS__.match(/@property\s+[^{]+\{[^}]*\}/g)
if (properties) {
  const head = document.createElement('style')
  head.textContent = properties.join('')
  document.head.appendChild(head)
}
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

let commentWriter: ((pick: CommentPick) => void) | undefined
window.commentOnElement = (source, rect) => commentWriter?.({source, rect})

const config = await fetchJazzConfig(`${window.__CORE__}/api/ext/whiteboard`)
mountOverlay({
  api,
  config,
  open: () => true,
  previewId: 'local',
  sessionId: () => session,
  registerComment: (write) => {
    commentWriter = write
    window.__commentReady = true
  },
})

export {}
