export * as ConfigAgentPlugin from './agent.js'

import {Context, Effect} from 'effect'
import {define} from '@conciv/plugin/effect/plugin'
import type {Permission} from '@conciv/plugin/schema/permission'
import {tags} from '../../effect/app-node.js'
import {LayerNode} from '../../effect/layer-node.js'

export const ConfiguredPermissions = Context.Service<Permission.Ruleset>('@conciv/ConfiguredPermissions')

export const Plugin = define({
  id: 'conciv.config.agent',
  effect: Effect.fn(function* (ctx) {
    const permissions = yield* ConfiguredPermissions
    yield* ctx.agent.transform((editor) => {
      for (const current of editor.list()) {
        editor.update(current.id, (agent) => agent.permissions.push(...permissions))
      }
    })
  }),
})

export const configuredNode = LayerNode.unbound(ConfiguredPermissions, tags.values.location)
