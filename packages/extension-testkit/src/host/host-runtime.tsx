import {render} from 'solid-js/web'
import {defineClient, type RequestMeta} from '@conciv/api-client'
import {isSessionId} from '@conciv/protocol/chat-types'
import {ensureEffectsSurface, mountExtension, openSource} from '@conciv/extension/client'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import {makeTableFactory, sessionsCollection, stateClient} from '@conciv/db'
import type {AnyExtension, ClientApi, ExtensionHostContext, HostApi} from '@conciv/extension'
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

function chatLog(): (line: string) => void {
  const log = document.createElement('ul')
  log.setAttribute('role', 'log')
  document.body.appendChild(log)
  return (line) => {
    const item = document.createElement('li')
    item.textContent = line
    log.appendChild(item)
  }
}

export function startHost(extension: AnyExtension): void {
  const apiBase = metaContent('conciv-api-base')
  const session = metaContent('conciv-session')
  const client = defineClient({apiBase})
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
  const stateBase = metaContent('conciv-state-base')
  const state = stateClient(stateBase)
  const record = chatLog()
  const host: HostApi = {
    state: {
      client: state,
      sessions: sessionsCollection(state),
      activeSession: () => (isSessionId(session) ? session : null),
      table: makeTableFactory(state, extension.name),
    },
    chat: {
      send: (text) => record(`send:${text}`),
      insert: (text) => record(`insert:${text}`),
      respondApproval: (id, approved) => record(`approval:${id}:${approved}`),
    },
    ui: {
      notify: showToast,
      dialog: () => Dialog,
      popover: () => Popover,
      surface: () => ensureEffectsSurface(),
    },
    page: {
      ...makeHostPage(document),
      openSource: (loc) => openSource(apiBase, loc),
      grab: makeHostGrab(document),
    },
  }
  const mountRoot = document.createElement('div')
  document.body.appendChild(mountRoot)
  mountExtension(extension, {clientApi, hostContext, slot: 'composer', root: mountRoot, host})
  const fixtureRoot = document.createElement('div')
  document.body.appendChild(fixtureRoot)
  render(() => <FixtureElement />, fixtureRoot)
}
