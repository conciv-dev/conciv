import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'

export default Plugin.define({
  id: 'engine-tool',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'echo',
        description: 'Answer with the text it is given',
        input: z.object({text: z.string()}),
        output: z.object({text: z.string()}),
        execute: async ({text}) => ({output: {text}}),
      })
    })
  },
})
