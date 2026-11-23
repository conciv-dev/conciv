import {compose, type Entry} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'
import page from '@conciv/plugin-page/renderer'
import terminal from '@conciv/plugin-terminal/client'

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins = compose({
  terminal: staticEntry(terminal),
  page: staticEntry(page),
})
