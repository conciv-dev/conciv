import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'instruction-notes',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'note_put',
        description: "Put a note into this session's instructions",
        input: z.object({value: z.string()}),
        output: z.object({put: z.string()}),
        execute: async ({value}, context) => {
          await ctx.session.instructions.entry.put({sessionId: context.sessionId, key: 'units', value})
          return {output: {put: value}}
        },
      })
      tools.add({
        name: 'note_remove',
        description: "Remove the note from this session's instructions",
        input: z.object({}),
        output: z.object({removed: z.boolean()}),
        execute: async (_input, context) => {
          await ctx.session.instructions.entry.remove({sessionId: context.sessionId, key: 'units'})
          return {output: {removed: true}}
        },
      })
    })
  },
})
