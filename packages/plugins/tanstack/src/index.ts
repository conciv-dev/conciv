import {Plugin} from '@conciv/plugin'
import {Definition} from './rpc.js'
import {info} from './skill.js'
import {capabilities, failureMessage, register} from './tools.js'

export default Plugin.define({
  id: 'tanstack',
  async setup(ctx) {
    const tanstack = capabilities(ctx.bundler, ctx.location.directory)
    await register(ctx.tool, tanstack)
    const registration = await ctx.rpc.register(Definition, {
      buildErrors: async (_input, {error}) => {
        try {
          return tanstack.buildErrors()
        } catch (cause) {
          return error('BUNDLER_UNAVAILABLE', failureMessage(cause), {})
        }
      },
    })
    await ctx.skill.transform((editor) => editor.add(info))
    return async () => {
      await registration.dispose()
      tanstack.dispose()
    }
  },
})
