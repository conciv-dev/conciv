import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'

export default Plugin.define({
  id: 'greeter-promise',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'greet_promise',
        description: 'Greet someone from the Promise entry',
        input: z.object({name: z.string()}),
        output: z.object({greeting: z.string()}),
        execute: async ({name}) => ({output: {greeting: `Hello ${name}, from the Promise entry`}}),
      })
    })
  },
})
