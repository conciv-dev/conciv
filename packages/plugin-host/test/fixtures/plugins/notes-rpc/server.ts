import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'notes-rpc',
  async setup(ctx) {
    const notes: string[] = []
    await ctx.rpc.register(
      {
        id: 'notes',
        methods: {
          add: {
            input: z.object({text: z.string()}),
            output: z.object({count: z.number()}),
            errors: {too_long: z.object({limit: z.number()})},
          },
          crash: {input: z.object({}), output: z.object({})},
        },
        events: {},
      },
      {
        add: async ({text}, context) => {
          if (text.length > 20) return context.error('too_long', 'A note holds at most 20 characters', {limit: 20})
          notes.push(text)
          return {count: notes.length}
        },
        crash: async () => {
          throw new Error('the notes handler crashed')
        },
      },
    )
  },
})
