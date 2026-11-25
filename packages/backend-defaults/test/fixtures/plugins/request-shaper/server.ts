import {Effect} from 'effect'
import {Plugin} from '@conciv/backend-plugin-api/effect'

export default Plugin.define({
  id: 'request-shaper',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.session.hook('prompt', (input) =>
        Effect.sync(() => {
          input.prompt.text = `${input.prompt.text}, rewritten by the plugin`
        }),
      )
      yield* ctx.session.hook('context', (input) =>
        Effect.sync(() => {
          input.system.push({type: 'text', text: 'Answer in French'})
          input.messages.push({role: 'user', content: 'The plugin was here'})
          const execute = input.tools.execute_typescript
          if (execute !== undefined) execute.description = 'Run a program the plugin allows'
        }),
      )
      yield* ctx.session.hook('compaction', (input) =>
        Effect.sync(() => {
          input.system.push({type: 'text', text: 'Keep the plugin notes in the summary'})
        }),
      )
    }),
})
