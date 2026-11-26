import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'

export default Plugin.define({
  id: 'greeter-effect',
  effect: (ctx) =>
    ctx.tool.transform((tools) => {
      tools.add({
        name: 'greet_effect',
        description: 'Greet someone from the Effect entry',
        input: z.object({name: z.string()}),
        output: z.object({greeting: z.string()}),
        execute: ({name}) => Effect.succeed({output: {greeting: `Hello ${name}, from the Effect entry`}}),
      })
    }),
})
