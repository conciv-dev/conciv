import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'model-lister',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'list_models',
        description: 'List the models the engine offers',
        input: z.object({}),
        output: z.object({models: z.array(z.object({id: z.string(), providerId: z.string(), name: z.string()}))}),
        execute: async () => ({
          output: {
            models: (await ctx.model.list()).data.map((model) => ({
              id: model.id,
              providerId: model.providerId,
              name: model.name,
            })),
          },
        }),
      })
    })
  },
})
