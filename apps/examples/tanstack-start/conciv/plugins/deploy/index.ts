import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

const run = async ({env}: {env: 'staging' | 'prod'}) => ({url: `https://${env}.example.com`})

export default Plugin.define({
  id: 'deploy',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'run',
        description: 'Deploy the current branch',
        input: z.object({env: z.enum(['staging', 'prod'])}),
        output: z.object({url: z.string()}),
        options: {namespace: 'deploy'},
        execute: async (input) => ({output: await run(input)}),
      })
    })
  },
})
