import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'session-watcher',
  async setup(ctx) {
    const idled = Promise.withResolvers<void>()
    const created = Promise.withResolvers<unknown>()
    const watchCreated = async () => {
      for await (const event of ctx.event.subscribe({types: ['session.created']})) {
        created.resolve(event.data)
        return
      }
    }
    watchCreated().catch(created.reject)
    await ctx.session.hook('experimental.idle', async (event) => {
      await ctx.storage.set('idle', event.sessionId)
      idled.resolve()
    })
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'idle_session',
        description: 'Reports the session the idle hook last saw, once it has run',
        input: z.object({}),
        output: z.object({sessionId: z.unknown()}),
        execute: async () => {
          await idled.promise
          return {output: {sessionId: (await ctx.storage.get('idle')) ?? null}}
        },
      })
      tools.add({
        name: 'created_session',
        description: 'Reports the first created session the event subscription delivered',
        input: z.object({}),
        output: z.object({event: z.unknown()}),
        execute: async () => ({output: {event: await created.promise}}),
      })
      tools.add({
        name: 'session_create',
        description: 'Create a session from the plugin',
        input: z.object({title: z.string()}),
        output: z.object({id: z.string(), title: z.unknown()}),
        execute: async ({title}) => {
          const created = await ctx.session.create({title})
          return {output: {id: created.id, title: created.title ?? null}}
        },
      })
      tools.add({
        name: 'session_list',
        description: 'List the sessions the plugin sees',
        input: z.object({}),
        output: z.object({sessions: z.array(z.object({id: z.string(), title: z.unknown()}))}),
        execute: async () => ({
          output: {
            sessions: (await ctx.session.list()).data.map((session) => ({
              id: session.id,
              title: session.title ?? null,
            })),
          },
        }),
      })
    })
  },
})
