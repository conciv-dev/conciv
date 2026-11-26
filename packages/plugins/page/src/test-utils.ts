import type {Plugin} from '@conciv/frontend-plugin-api'
import {builtins} from './builtins.js'
import type {createPageSessionGrouper, pageSessionEntry} from './client.js'

const [page] = builtins

export const pageTestPlugin: {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly builtin: boolean
  readonly engineHalf: boolean
  readonly toolGroup: {readonly entry: typeof pageSessionEntry; readonly createGrouper: typeof createPageSessionGrouper}
} = {...page, builtin: true}
