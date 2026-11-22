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
          output: z.object({text: z.string()}),
          execute: ({text}) => Effect.succeed({output: {text}}),
        })
      })
    }),
})
