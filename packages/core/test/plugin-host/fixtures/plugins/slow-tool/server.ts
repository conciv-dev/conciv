import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'slow-tool',
  async setup(ctx) {
    const stopped = Promise.withResolvers<void>()
    const slow = await ctx.rpc.register(
      {id: 'slow', methods: {}, events: {started: {schema: z.object({call: z.string()})}}},
      {},
    )
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'wait_for_stop',
        description: 'Waits until the run is stopped',
        input: z.object({}),
        output: z.object({text: z.string()}),
        options: {codemode: false},
        execute: async (_input, context) => {
          const aborted = Promise.withResolvers<void>()
          context.signal.addEventListener('abort', () => aborted.resolve(), {once: true})
          await slow.events.emit('started', {call: context.id})
          await aborted.promise
          await ctx.storage.set('outcome', 'aborted')
          stopped.resolve()
          return {output: {text: 'stopped'}}
        },
      })
      tools.add({
        name: 'stop_outcome',
        description: 'Reports what the slow tool saw once it was stopped',
        input: z.object({}),
        output: z.object({outcome: z.unknown()}),
        execute: async () => {
          await stopped.promise
          return {output: {outcome: (await ctx.storage.get('outcome')) ?? null}}
        },
      })
    })
  },
})
