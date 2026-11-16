export * as ConfigAgentPlugin from './agent.js'

import {Context, Effect} from 'effect'
import {define} from '../../../plugin/effect/plugin.js'
import type {Permission} from '../../../schema/permission.js'

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
