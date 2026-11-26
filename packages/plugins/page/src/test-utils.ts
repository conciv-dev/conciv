import type {Plugin} from '@conciv/frontend-plugin-api'
import pageRenderer from './renderer.js'
import {createPageSessionGrouper, pageSessionEntry} from './client.js'

export const pageTestPlugin: {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly builtin: boolean
  readonly engineHalf: boolean
  readonly toolGroup: {readonly entry: typeof pageSessionEntry; readonly createGrouper: typeof createPageSessionGrouper}
} = {
  id: 'conciv.page',
  plugin: pageRenderer,
  builtin: true,
  engineHalf: true,
  toolGroup: {entry: pageSessionEntry, createGrouper: createPageSessionGrouper},
}
