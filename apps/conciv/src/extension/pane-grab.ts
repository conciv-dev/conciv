import type {GrabApi} from '@conciv/grab'
import {grabApi as pageGrabApi} from '@conciv/page'
import type {PaneGrabStore} from '../app/pane-context.js'

export function makePaneGrabApi(store: PaneGrabStore): GrabApi {
  return {
    ...pageGrabApi,
    stage: store.stage,
    staged: () => store.grabs().flatMap((entry) => ('snapshot' in entry ? [entry] : [])),
    clear: store.clear,
  }
}
