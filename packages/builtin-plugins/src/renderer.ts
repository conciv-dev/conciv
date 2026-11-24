import {compose, type Entry} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'
import terminal from './terminal/renderer.js'

const ENGINE_HALVES: readonly string[] = []

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins: readonly (Entry & {readonly engineHalf: boolean})[] = compose({
  terminal: staticEntry(terminal),
}).map((entry) => ({...entry, engineHalf: ENGINE_HALVES.includes(entry.id)}))
