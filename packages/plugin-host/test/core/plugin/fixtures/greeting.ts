import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'greeting',
  async setup(ctx) {
    await ctx.tool.transform((editor) =>
      editor.add({
        name: 'greet',
        description: typeof ctx.options.description === 'string' ? ctx.options.description : '',
        input: {},
        execute: async () => ({}),
      }),
    )
  },
})
