import {Effect} from 'effect'
import {Plugin} from '@conciv/backend-plugin-api/effect'

export default Plugin.define({
  id: 'reviewer-agent',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.agent.transform((editor) => {
        editor.update('reviewer', (agent) => {
          agent.mode = 'subagent'
          agent.description = 'Reviews the change before it ships'
        })
      })
    }),
})
