export * as InstancePlugins from './instance.js'

import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {Context, Layer} from 'effect'
import type {Generation} from '../plugin.js'

export type List = readonly Plugin[]

export type Builtin = {
  readonly pre?: List
  readonly post?: List
}

export interface Interface {
  readonly all: () => readonly Generation[]
  readonly builtin: {
    readonly pre: () => readonly Generation[]
    readonly post: () => readonly Generation[]
  }
}

export const Service = Context.Service<Interface>('@conciv/InstancePlugins')

export const layer = bound([])

export function bound(plugins: List, builtin: Builtin = {}) {
  const pre = builtin.pre ?? []
  const post = builtin.post ?? []
  const listed = [...pre, ...plugins, ...post]
  const duplicates = listed.filter((plugin, index) => listed.findIndex((other) => other.id === plugin.id) !== index)
  if (duplicates.length > 0) {
    throw new Error(`duplicate instance plugin ids: ${duplicates.map((plugin) => plugin.id).join(', ')}`)
  }
  const stamped = plugins.map((plugin): Generation => ({...plugin, revision: 'instance', source: {type: 'sdk'}}))
  const stampBuiltin = (plugin: Plugin): Generation => ({...plugin, revision: 'internal', source: {type: 'builtin'}})
  const builtinPre = pre.map(stampBuiltin)
  const builtinPost = post.map(stampBuiltin)
  return Layer.succeed(
    Service,
    Service.of({all: () => stamped, builtin: {pre: () => builtinPre, post: () => builtinPost}}),
  )
}
