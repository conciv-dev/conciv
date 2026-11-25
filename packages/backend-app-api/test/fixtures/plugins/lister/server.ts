import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'

export default Plugin.define({
  id: 'lister',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'list_plugins',
        description: 'List the plugins the engine knows, with their state',
        input: z.object({}),
        output: z.object({plugins: z.unknown()}),
        execute: async () => ({output: {plugins: (await ctx.plugin.list({})).data}}),
      })
    })
  },
})
