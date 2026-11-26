import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'
import * as Rpc from '@conciv/protocol/schema/rpc'

const Plant = z.object({plant: z.string()})

const Stock = z.object({plant: z.string(), count: z.number()})

const Shelf = Rpc.define({
  id: 'plant-shelf',
  methods: {
    count: {input: Plant, output: Stock},
    sell: {input: Plant, output: Stock, errors: {'sold-out': Plant}},
  },
  events: {},
})

export default Plugin.define({
  id: 'plant-shelf',
  async setup(ctx) {
    const stock = {count: 1}
    await ctx.rpc.register(Shelf, {
      count: async ({plant}) => ({plant, count: stock.count}),
      sell: async ({plant}, call) => {
        if (stock.count === 0) return call.error('sold-out', `${plant} is sold out`, {plant})
        stock.count -= 1
        return {plant, count: stock.count}
      },
    })
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'shelf_label',
        description: 'Print a label for a plant on the shelf',
        input: z.object({
          plant: z.string(),
          pots: z.number().optional(),
          sunny: z.boolean().optional(),
          potColor: z.string().optional(),
        }),
        output: z.object({
          plant: z.string(),
          pots: z.number().optional(),
          sunny: z.boolean().optional(),
          potColor: z.string().optional(),
        }),
        execute: async (input) => ({output: input}),
      })
      tools.add({
        name: 'shelf_restock',
        description: 'Restock a plant on the shelf, after the user allows it',
        input: Plant,
        output: z.object({plant: z.string(), restocked: z.boolean()}),
        execute: async ({plant}, tool) => {
          await ctx.permission.assert({
            sessionId: tool.sessionId,
            agent: tool.agent,
            action: 'shelf_restock',
            resources: [plant],
            save: [plant],
            metadata: {},
            source: {type: 'tool', messageId: tool.messageId, id: tool.id},
            fallback: 'ask',
          })
          return {output: {plant, restocked: true}}
        },
      })
    })
  },
})
