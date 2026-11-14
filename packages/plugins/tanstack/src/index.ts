import {Plugin} from '@conciv/plugin'
import {info} from './skill.js'
import {register} from './tools.js'

export default Plugin.define({
  id: 'tanstack',
  async setup(ctx) {
    const dispose = await register(ctx.tool, ctx.bundler, ctx.location.directory)
    await ctx.skill.transform((editor) => editor.add(info))
    return dispose
  },
})
