import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'echo-options',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'echo_options',
        description: 'Return the options this plugin was given',
        input: z.object({}),
        output: z.object({options: z.unknown()}),
        execute: async () => ({output: {options: ctx.options}}),
      })
    })
  },
})
