import {render} from 'solid-js/web'
import {defineClient, type RequestMeta} from '@mandarax/api-client'
import {isSessionId} from '@mandarax/protocol/chat-types'
import {OpenSourceResultSchema, type OpenSourceResult} from '@mandarax/protocol/page-types'
import type {LocateResult} from '@mandarax/protocol/page-introspect-types'
import {mountExtension} from '@mandarax/extension'
import type {AnyExtension, ClientApi, ExtensionHostContext} from '@mandarax/extension'
import {makeHostGrab, makeHostPage} from './grab.js'
import {FixtureElement} from './fixture-element.js'

const SURFACE_ATTR = 'data-mandarax-effects'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function ensureSurface(): HTMLElement {
  const host = document.querySelector<HTMLElement>(`[${SURFACE_ATTR}]`) ?? createSurfaceHost()
  const root = host.shadowRoot ?? host.attachShadow({mode: 'open'})
  const existing = root.querySelector<HTMLElement>('[data-effect-root]')
  if (existing) return existing
  const container = document.createElement('div')
  container.setAttribute('data-effect-root', '')
  root.appendChild(container)
  return container
}

function createSurfaceHost(): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(SURFACE_ATTR, '')
  el.style.position = 'fixed'
  el.style.inset = '0'
  el.style.zIndex = '2147483000'
  document.body.appendChild(el)
  return el
}

function showToast(message: string): void {
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.appendChild(el)
}

async function openSource(apiBase: string, loc: LocateResult): Promise<OpenSourceResult> {
  const post = (path: string, body: unknown) =>
    fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    })
  try {
    if (loc.source) {
      await post('/api/editor/open', {file: loc.source.file, line: loc.source.line})
      return 'opened'
    }
    if (loc.frames.length)
      return OpenSourceResultSchema.parse(await (await post('/api/page/open-source', {frames: loc.frames})).json())
        .status
    return 'no-source'
  } catch {
    return 'failed'
  }
}

export function startHost(extension: AnyExtension): void {
  const apiBase = metaContent('mandarax-api-base')
  const session = metaContent('mandarax-session')
  const client = defineClient({apiBase})
  if (isSessionId(session)) client.setSessionId(session)
  const clientApi: ClientApi = {
    apiBase,
    activeSession: () => session,
    requestMeta: (): RequestMeta => ({}),
    page: makeHostPage(document),
    openSource: (loc) => openSource(apiBase, loc),
    toast: showToast,
    surface: ensureSurface,
    env: {reducedMotion: () => false, doc: document, win: window},
  }
  const hostContext: Omit<ExtensionHostContext, 'currentSlot'> = {
    apiBase,
    harnessId: session,
    sendMessage: () => {},
    insert: () => {},
    notify: showToast,
    setBusy: () => {},
    newSession: () => {},
    addDivider: () => {},
    compact: () => {},
    resetUsage: () => {},
    client,
    requestMeta: () => ({}),
    grab: makeHostGrab(document),
  }
  const mountRoot = document.createElement('div')
  document.body.appendChild(mountRoot)
  mountExtension(extension, {clientApi, hostContext, slot: 'composer', root: mountRoot})
  const fixtureRoot = document.createElement('div')
  document.body.appendChild(fixtureRoot)
  render(() => <FixtureElement />, fixtureRoot)
}
