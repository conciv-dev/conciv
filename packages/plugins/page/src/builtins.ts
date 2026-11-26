import type {Plugin} from '@conciv/frontend-plugin-api'
import pageRenderer from './renderer.js'
import {createPageSessionGrouper, pageSessionEntry} from './client.js'

type PageBuiltin = {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly engineHalf: boolean
  readonly toolGroup: {readonly entry: typeof pageSessionEntry; readonly createGrouper: typeof createPageSessionGrouper}
}

export const builtins: readonly [PageBuiltin] = [
  {
    id: 'conciv.page',
    plugin: pageRenderer,
    engineHalf: true,
    toolGroup: {entry: pageSessionEntry, createGrouper: createPageSessionGrouper},
  },
]
