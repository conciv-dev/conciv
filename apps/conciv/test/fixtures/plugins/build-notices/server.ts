import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'build-notices',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'notice',
        description: 'Admits a synthetic notice to the calling session',
        input: z.object({text: z.string(), description: z.string().optional(), resume: z.boolean().optional()}),
        output: z.unknown(),
        execute: async (notice, context) => ({
          output: await ctx.session.synthetic({...notice, sessionId: context.sessionId}),
        }),
      })
    })
  },
})
