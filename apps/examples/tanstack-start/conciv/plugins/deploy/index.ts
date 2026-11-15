import {Plugin} from '@conciv/plugin'
import {Deploy} from './rpc.js'

const run = async ({env}: {env: 'staging' | 'prod'}) => ({url: `https://${env}.example.com`})

export default Plugin.define({
  id: 'deploy',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'run',
        description: 'Deploy the current branch',
        input: Deploy.methods.run.input,
        output: Deploy.methods.run.output,
        options: {namespace: 'deploy'},
        execute: async (input) => ({output: await run(input)}),
      })
    })
    const registration = await ctx.rpc.register(Deploy, {run})
    return () => registration.dispose()
  },
})
