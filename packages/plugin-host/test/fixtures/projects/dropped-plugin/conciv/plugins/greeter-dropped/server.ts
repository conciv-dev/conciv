import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'greeter-dropped',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'greet_dropped',
        description: 'Greet someone from conciv/plugins',
        input: z.object({name: z.string()}),
        output: z.object({greeting: z.string()}),
        execute: async ({name}) => ({output: {greeting: `Hello ${name}, from conciv/plugins`}}),
      })
    })
  },
})
