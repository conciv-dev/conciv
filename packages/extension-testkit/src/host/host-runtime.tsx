import {render} from 'solid-js/web'
import {isSessionId, type RequestMeta} from '@conciv/protocol/chat-types'
import {makeRpcSessionClient} from './rpc-session-client.js'
import {ensureEffectsSurface, mountExtension, openSource} from '@conciv/extension/client'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import type {AnyExtension, ClientApi, ExtensionHostContext} from '@conciv/extension'
import {makeHostGrab, makeHostPage} from './grab.js'
import {FixtureElement} from './fixture-element.js'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function showToast(message: string): void {
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.appendChild(el)
}

export function startHost(extension: AnyExtension): void {
  const apiBase = metaContent('conciv-api-base')
  const session = metaContent('conciv-session')
  const client = makeRpcSessionClient({apiBase})
  if (isSessionId(session)) client.setSessionId(session)
  const clientApi: ClientApi = {
    apiBase,
    activeSession: () => session,
    requestMeta: (): RequestMeta => ({}),
    page: makeHostPage(document),
    openSource: (loc) => openSource(apiBase, loc),
    toast: showToast,
    surface: () => ensureEffectsSurface(),
    suppressWhile: () => () => {},
    yieldFocusWhile: () => () => {},
    Dialog: () => Dialog,
    Popover: () => Popover,
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
    view: {setLocked: () => {}, leave: () => {}, onInsert: () => {}},
  }
  const mountRoot = document.createElement('div')
  document.body.appendChild(mountRoot)
  mountExtension(extension, {clientApi, hostContext, slot: 'composer', root: mountRoot})
  const fixtureRoot = document.createElement('div')
  document.body.appendChild(fixtureRoot)
  render(() => <FixtureElement />, fixtureRoot)
}
