import {compose, type Entry} from '@conciv/plugin/experimental/host'
import page from '@conciv/plugin-page/renderer'
import terminal from '@conciv/plugin-terminal/client'
import type {Plugin} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import {useHostApis} from './host-apis-context'

const provideGrab: Plugin.Setup = (ctx) => {
  ctx.provide(GrabApi, useHostApis().grab)
}

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins = compose({
  terminal: staticEntry(terminal),
  page: staticEntry(page),
  grab: {windowEntry: () => Promise.resolve({default: provideGrab})},
})

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

if (import.meta.hot)
  import.meta.hot.accept('@conciv/plugin-terminal/client', (module) => {
    if (module)
      window.dispatchEvent(
        new CustomEvent(BUILTINS_UPDATED, {detail: compose({terminal: staticEntry(module.default)})}),
      )
  })
