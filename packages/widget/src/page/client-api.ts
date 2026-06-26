import {defineClient, type RequestMeta} from '@mandarax/api-client'
import type {ClientApi} from '@mandarax/extension'
import type {LocateResult} from '@mandarax/protocol/page-introspect-types'
import {OpenSourceResultSchema, type OpenSourceResult} from '@mandarax/protocol/page-types'
import {describe, locate} from './react-bridge.js'
import {showToast} from './effect-toast.js'
import type {Refs} from './page-snapshot.js'
import {registerWind4Properties} from '../shadow.js'
import styles from '../styles.css?inline'

const EFFECTS_MARKER = 'data-mandarax-effects'

// One shared, max-z, shadow-mounted overlay container that page-control extensions render into. The
// styles are injected once so the overlay's UnoCSS utilities resolve outside the widget's own root.
function ensureSurface(): HTMLElement {
  const host =
    document.querySelector<HTMLDivElement>(`[${EFFECTS_MARKER}]`) ??
    (() => {
      const el = document.createElement('div')
      el.setAttribute(EFFECTS_MARKER, '')
      el.setAttribute('aria-hidden', 'true')
      el.style.position = 'fixed'
      el.style.zIndex = '2147483000'
      document.body.appendChild(el)
      return el
    })()
  const root = host.shadowRoot ?? host.attachShadow({mode: 'open'})
  const existing = root.querySelector<HTMLElement>('[data-effect-root]')
  if (existing) return existing
  const style = document.createElement('style')
  style.textContent = styles
  root.appendChild(style)
  const container = document.createElement('div')
  container.setAttribute('data-effect-root', '')
  root.appendChild(container)
  return container
}

// elementFromPoint, but blind to the overlay host itself so a hit-test lands on the user's app element.
function elementAt(x: number, y: number): Element | null {
  const host = document.querySelector<HTMLElement>(`[${EFFECTS_MARKER}]`)
  const prev = host?.style.pointerEvents
  if (host) host.style.pointerEvents = 'none'
  const el = document.elementFromPoint(x, y)
  if (host) host.style.pointerEvents = prev ?? ''
  return el
}

async function openSource(apiBase: string, loc: LocateResult): Promise<OpenSourceResult> {
  const post = (path: string, body: unknown) =>
    fetch(`${apiBase}${path}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})
  try {
    if (loc.source) {
      await post('/api/editor/open', {file: loc.source.file, line: loc.source.line})
      return 'opened'
    }
    if (loc.frames.length) return OpenSourceResultSchema.parse(await (await post('/api/page/open-source', {frames: loc.frames})).json()).status
    return 'no-source'
  } catch {
    return 'failed'
  }
}

// The concrete ClientApi the widget hands to every extension's .client() at mount: the chat client plus
// the page capabilities a page-control extension drives. Built once, server-independent.
export function makeWidgetClientApi(deps: {apiBase: string; refs: Refs}): ClientApi {
  registerWind4Properties()
  return {
    apiBase: deps.apiBase,
    client: defineClient({apiBase: deps.apiBase}),
    requestMeta: (): RequestMeta => ({}),
    page: {elementAt, describe, locate: (el) => locate(el, deps.refs)},
    openSource: (loc) => openSource(deps.apiBase, loc),
    toast: showToast,
    surface: ensureSurface,
    env: {reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, doc: document, win: window},
  }
}
