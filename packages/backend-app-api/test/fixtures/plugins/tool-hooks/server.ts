import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'

export default Plugin.define({
  id: 'tool-hooks',
  async setup(ctx) {
    await ctx.tool.hook('execute.before', (event) => {
      if (event.tool !== 'measure_direct') return
      const {length} = z.object({length: z.number()}).parse(event.input)
      event.input = {length: length * 2}
    })
    await ctx.tool.hook('execute.after', (event) => {
      if (event.tool !== 'measure_direct' || event.status !== 'completed') return
      const {text} = z.object({text: z.string()}).parse(event.result.output)
      event.result = {output: {text: `${text}, checked`}, content: `${text}, checked`}
    })
  },
})
