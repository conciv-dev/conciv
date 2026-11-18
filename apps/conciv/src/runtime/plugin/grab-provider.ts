import type {Plugin} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import {useHostApis} from './host-apis-context'

export const provideGrab: Plugin.Setup = (ctx) => {
  ctx.provide(GrabApi, useHostApis().grab)
}
