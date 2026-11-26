import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'

export default Plugin.define({
  id: 'engine-lister',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'engines_list',
          description: 'List the ids of the conciv engines running on this machine',
          input: z.object({}),
          output: z.object({ids: z.array(z.string())}),
          execute: () => Effect.sync(() => ({output: {ids: [...ctx.servers.list()]}})),
        })
      })
    }),
})
