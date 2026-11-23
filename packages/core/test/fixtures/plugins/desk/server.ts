import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'desk',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'desk_echo',
          description: 'Say the text back',
          input: z.object({text: z.string()}),
          output: z.object({text: z.string(), callId: z.string()}),
          execute: ({text}, context) => Effect.succeed({output: {text, callId: context.id}}),
        })
        tools.add({
          name: 'desk_agent',
          description: 'Say which agent called this tool',
          input: z.object({}),
          output: z.object({agent: z.string()}),
          execute: (_input, context) => Effect.succeed({output: {agent: context.agent}}),
        })
      })
      yield* ctx.session.hook('context', (input) =>
        Effect.sync(() => {
          input.system.push({type: 'text', text: 'HOOKED'})
        }),
      )
    }),
})
