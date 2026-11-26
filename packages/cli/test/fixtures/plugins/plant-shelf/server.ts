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
    watered: {input: Plant, output: z.object({plant: z.string(), told: z.number()})},
  },
  events: {},
})

export default Plugin.define({
  id: 'plant-shelf',
  async setup(ctx) {
    const stock = {count: 1}
    const watering: Array<(text: string) => void> = []
    await ctx.rpc.register(Shelf, {
      count: async ({plant}) => ({plant, count: stock.count}),
      sell: async ({plant}, call) => {
        if (stock.count === 0) return call.error('sold-out', `${plant} is sold out`, {plant})
        stock.count -= 1
        return {plant, count: stock.count}
      },
      watered: async ({plant}) => {
        const told = watering.splice(0)
        for (const finish of told) finish(`${plant} is watered`)
        return {plant, told: told.length}
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
        name: 'shelf_water',
        description: 'Start watering a plant on the shelf; the caller is told when it is watered',
        input: Plant,
        output: z.object({plant: z.string(), watering: z.boolean()}),
        execute: async ({plant}, tool) => {
          const finished = Promise.withResolvers<string>()
          watering.push(finished.resolve)
          await ctx.job.start({
            id: tool.id,
            type: 'page-queue',
            background: true,
            recovery: {kind: 'page-queue', sessionID: tool.sessionId, queueId: tool.id},
            metadata: {toolCallId: tool.id, origin: tool.origin},
            run: () => finished.promise,
          })
          return {output: {plant, watering: true}}
        },
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
