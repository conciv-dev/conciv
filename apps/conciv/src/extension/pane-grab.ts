import type {GrabApi, GrabProvider} from '@conciv/grab'
import {grabApi as pageGrabApi} from '@conciv/page'
import type {PaneGrabStore} from '../app/pane-context.js'

export function makePaneGrabApi(store: PaneGrabStore, provider?: GrabProvider): GrabApi {
  const actions = provider?.() ?? pageGrabApi
  return {
    pick: actions.pick,
    comment: actions.comment,
    cancel: actions.cancel,
    isActive: actions.isActive,
    grabbable: actions.grabbable,
    stage: store.stage,
    staged: () => store.grabs().flatMap((entry) => ('preview' in entry ? [entry] : [])),
    clear: store.clear,
  }
}
