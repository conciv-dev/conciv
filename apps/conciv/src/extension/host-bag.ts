import type {GrabApi} from '@conciv/grab'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {ExtensionViewHost} from '@conciv/extension'
import {grabApi as pageGrabApi} from '@conciv/page'
import type {AppContextValue} from '../app/context.js'
import type {PaneGrabStore} from '../app/pane-context.js'
import type {ExtensionHostBag} from './extension-slots.js'
import {makeSessionClient} from './session-client.js'
import {resolveApiBase} from '../lib/api-base.js'

export function makePaneGrabApi(store: PaneGrabStore): GrabApi {
  return {
    ...pageGrabApi,
    stage: store.stage,
    staged: () => store.grabs().flatMap((entry) => ('snapshot' in entry ? [entry] : [])),
    clear: store.clear,
  }
}

export function makeHostBag(deps: {
  app: AppContextValue
  sessionId: string
  toolCtx: ToolViewCtx
  insert: (text: string) => void
  notify: (message: string) => void
  newSession: () => void
  compact: () => void
  grab: GrabApi
  view?: ExtensionViewHost
}): ExtensionHostBag {
  return {
    ...deps.toolCtx,
    insert: deps.insert,
    notify: deps.notify,
    setBusy: () => {},
    newSession: deps.newSession,
    addDivider: () => {},
    compact: deps.compact,
    resetUsage: () => {},
    client: makeSessionClient({rpc: deps.app.rpc, apiBase: resolveApiBase(), sessionId: deps.sessionId}),
    requestMeta: () => ({}),
    grab: deps.grab,
    view: deps.view ?? {setLocked: () => {}, leave: () => {}, onInsert: () => {}},
  }
}
