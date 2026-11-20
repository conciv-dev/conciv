import type {GrabApi, GrabProvider} from '@conciv/grab'
import {grabApi as pageGrabApi} from '@conciv/plugin-page/client'
import type {GrabStaging} from './grab-staging.js'

export function makePaneGrabApi(staging: GrabStaging, provider?: GrabProvider): GrabApi {
  const actions = provider?.() ?? pageGrabApi
  return {
    pick: actions.pick,
    comment: actions.comment,
    cancel: actions.cancel,
    isActive: actions.isActive,
    grabbable: actions.grabbable,
    stage: staging.stage,
    staged: staging.staged,
    clear: staging.clear,
  }
}
