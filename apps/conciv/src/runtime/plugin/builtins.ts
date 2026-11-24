import {compose, type Entry} from '@conciv/plugin/experimental/host'
import page from '@conciv/plugin-page/renderer'
import terminal from '@conciv/plugin-terminal/client'
import type {Plugin} from '@conciv/plugin/experimental'

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins = compose({
  terminal: staticEntry(terminal),
  'conciv.page': staticEntry(page),
})

export const BUILTINS_WITH_ENGINE_HALF: ReadonlySet<string> = new Set(['conciv.page'])

export const BUILTINS_UPDATED = 'conciv:experimental-plugins-updated'

if (import.meta.hot)
  import.meta.hot.accept('@conciv/plugin-terminal/client', (module) => {
    if (module)
      window.dispatchEvent(
        new CustomEvent(BUILTINS_UPDATED, {detail: compose({terminal: staticEntry(module.default)})}),
      )
  })
