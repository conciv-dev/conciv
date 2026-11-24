import {compose, type Entry} from '@conciv/plugin/experimental/host'
import page from '@conciv/plugin-page/renderer'
import type {Plugin} from '@conciv/plugin/experimental'

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins = compose({
  'conciv.page': staticEntry(page),
})

export const BUILTINS_WITH_ENGINE_HALF: ReadonlySet<string> = new Set(['conciv.page'])
