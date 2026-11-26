import {compose, type Entry} from '@conciv/frontend-plugin-api/host'
import type {Plugin} from '@conciv/frontend-plugin-api'
import {builtins as pageBuiltins} from '@conciv/plugin-page/builtins'
import {builtins as terminalBuiltins} from '@internal/plugin-terminal/builtins'
import {BUILTINS_UPDATED} from '@internal/frontend-app-api/plugin/hmr'
import type {ToolGroup} from '@internal/frontend-app-api'
import type {BuiltinPlugins} from '@internal/frontend-defaults'

type Builtin = {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly engineHalf?: boolean
  readonly toolGroup?: ToolGroup
}

function staticEntry({id, plugin: {setup, ...declarations}}: Builtin): Entry {
  return {...declarations, id, windowEntry: setup && (() => Promise.resolve({default: setup}))}
}

const DRIVE = 'conciv.simulation.ui'

const driveEntries: readonly Entry[] =
  process.env.NODE_ENV === 'production'
    ? []
    : compose({[DRIVE]: {windowEntry: () => import('@internal/frontend-defaults/drive')}})

const plugins: readonly Builtin[] = [...terminalBuiltins, ...pageBuiltins]

export const builtins: BuiltinPlugins = {
  entries: [...plugins.map(staticEntry), ...driveEntries],
  engineHalf: [
    ...plugins.flatMap((plugin) => (plugin.engineHalf === true ? [plugin.id] : [])),
    ...driveEntries.map((entry) => entry.id),
  ],
  toolGroups: plugins.flatMap((plugin) => (plugin.toolGroup ? [{...plugin.toolGroup, plugin: plugin.id}] : [])),
}

if (import.meta.hot)
  import.meta.hot.accept('@internal/plugin-terminal/builtins', (module) => {
    if (module) window.dispatchEvent(new CustomEvent(BUILTINS_UPDATED, {detail: module.builtins.map(staticEntry)}))
  })
