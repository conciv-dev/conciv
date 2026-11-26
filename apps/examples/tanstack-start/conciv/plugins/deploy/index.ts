import {Plugin, Skill} from '@conciv/backend-plugin-api'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import {Deploy} from './rpc.js'

const description = 'Deploy the current branch'

const run = async ({env}: {env: 'staging' | 'prod'}) => ({url: `https://${env}.example.com`})

export default Plugin.define({
  id: 'deploy',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'run',
        description,
        input: Deploy.methods.run.input,
        output: Deploy.methods.run.output,
        options: {namespace: 'deploy'},
        execute: async (input) => ({output: await run(input)}),
      })
    })
    await ctx.skill.transform((skills) => {
      skills.add({
        id: Skill.Id.make('deploy'),
        name: Skill.Name.make('Deploy'),
        description: `${description}.`,
        path: AbsolutePath.make('skill://deploy/SKILL.md'),
        content: 'You can deploy from code mode with `external_deploy_run`.',
      })
    })
    const registration = await ctx.rpc.register(Deploy, {run})
    return () => registration.dispose()
  },
})
