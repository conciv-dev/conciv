import {compose, type Entry} from '@conciv/frontend-plugin-api/host'
import type {Plugin} from '@conciv/frontend-plugin-api'
import page from '@conciv/plugin-page/renderer'
import {createPageSessionGrouper, pageSessionEntry} from '@conciv/plugin-page/client'
import terminal from '@internal/plugin-terminal/client'
import {BUILTINS_UPDATED} from '@internal/frontend-app-api/plugin/hmr'
import type {BuiltinPlugins} from '@internal/frontend-defaults'

function staticEntry({setup, ...declarations}: Plugin.Definition): Omit<Entry, 'id'> {
  return {...declarations, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

export const builtins: BuiltinPlugins = {
  entries: compose({terminal: staticEntry(terminal), 'conciv.page': staticEntry(page)}),
  engineHalf: ['conciv.page'],
  toolGroups: [{plugin: 'conciv.page', entry: pageSessionEntry, createGrouper: createPageSessionGrouper}],
}

if (import.meta.hot)
  import.meta.hot.accept('@internal/plugin-terminal/client', (module) => {
    if (module)
      window.dispatchEvent(
        new CustomEvent(BUILTINS_UPDATED, {detail: compose({terminal: staticEntry(module.default)})}),
      )
  })
