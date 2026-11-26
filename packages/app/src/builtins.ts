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

const DRIVE = 'conciv.simulation.ui'

const driveEntries: Readonly<Record<string, Omit<Entry, 'id'>>> =
  process.env.NODE_ENV === 'production'
    ? {}
    : {[DRIVE]: {windowEntry: () => import('@internal/frontend-defaults/drive')}}

export const builtins: BuiltinPlugins = {
  entries: compose({terminal: staticEntry(terminal), 'conciv.page': staticEntry(page), ...driveEntries}),
  engineHalf: process.env.NODE_ENV === 'production' ? ['conciv.page'] : ['conciv.page', DRIVE],
  toolGroups: [{plugin: 'conciv.page', entry: pageSessionEntry, createGrouper: createPageSessionGrouper}],
}

if (import.meta.hot)
  import.meta.hot.accept('@internal/plugin-terminal/client', (module) => {
    if (module)
      window.dispatchEvent(
        new CustomEvent(BUILTINS_UPDATED, {detail: compose({terminal: staticEntry(module.default)})}),
      )
  })
