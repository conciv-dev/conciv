export * as InstancePlugins from './instance.js'

import type {Plugin} from '@conciv/plugin/effect/plugin'
import {Context, Layer} from 'effect'
import type {Generation} from '../plugin.js'

export type List = readonly Plugin[]

export interface Interface {
  readonly all: () => readonly Generation[]
}

export const Service = Context.Service<Interface>('@conciv/InstancePlugins')

export const layer = bound([])

export function bound(plugins: List) {
  const duplicates = plugins.filter((plugin, index) => plugins.findIndex((other) => other.id === plugin.id) !== index)
  if (duplicates.length > 0) {
    throw new Error(`duplicate instance plugin ids: ${duplicates.map((plugin) => plugin.id).join(', ')}`)
  }
  const stamped = plugins.map((plugin): Generation => ({...plugin, revision: 'instance', source: {type: 'sdk'}}))
  return Layer.succeed(Service, Service.of({all: () => stamped}))
}
