import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'greeter-file',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'greet_file',
        description: 'Greet someone from a plugin the project config names by path',
        input: z.object({name: z.string()}),
        output: z.object({greeting: z.string()}),
        execute: async ({name}) => ({output: {greeting: `Hello ${name}, from the project`}}),
      })
    })
  },
})
