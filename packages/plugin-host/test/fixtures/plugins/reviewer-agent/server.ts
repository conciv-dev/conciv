import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'reviewer-agent',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.agent.transform((agents) => {
        agents.update('reviewer', (agent) => {
          agent.permissions.push({action: 'guarded.write', resource: '*', effect: 'deny'})
        })
      })
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'become_reviewer',
          description: 'Switch this session to the reviewer agent',
          input: z.object({}),
          output: z.object({agent: z.string()}),
          execute: (_input, context) =>
            ctx.session
              .switchAgent({sessionId: context.sessionId, agent: 'reviewer'})
              .pipe(Effect.orDie, Effect.as({output: {agent: 'reviewer'}})),
        })
      })
    }),
})
