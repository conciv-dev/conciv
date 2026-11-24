import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'session-watcher',
  async setup(ctx) {
    const idled = Promise.withResolvers<void>()
    const created: unknown[] = []
    const arrived = {next: Promise.withResolvers<void>()}
    const watchCreated = async () => {
      for await (const event of ctx.event.subscribe({types: ['session.created']})) {
        created.push(event.data)
        arrived.next.resolve()
        arrived.next = Promise.withResolvers<void>()
      }
    }
    watchCreated().catch((error: unknown) => arrived.next.reject(error))
    const runs: string[] = []
    const ran = {next: Promise.withResolvers<void>()}
    const watchRuns = async () => {
      for await (const event of ctx.event.subscribe({
        types: [
          'session.execution.started',
          'session.execution.succeeded',
          'session.execution.failed',
          'session.execution.interrupted',
        ],
      })) {
        runs.push(event.type)
        ran.next.resolve()
        ran.next = Promise.withResolvers<void>()
      }
    }
    watchRuns().catch((error: unknown) => ran.next.reject(error))
    const heardRuns = async (count: number): Promise<string[]> => {
      while (runs.length < count) await ran.next.promise
      return [...runs]
    }
    const createdEvent = async (sessionID: string): Promise<unknown> => {
      const matches = (data: unknown) =>
        z
          .object({sessionID: z.literal(sessionID)})
          .loose()
          .safeParse(data).success
      while (!created.some(matches)) await arrived.next.promise
      return created.find(matches)
    }
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
        description: 'Reports the session.created event the subscription delivered for a session',
        input: z.object({sessionID: z.string()}),
        output: z.object({event: z.unknown()}),
        execute: async ({sessionID}) => ({output: {event: await createdEvent(sessionID)}}),
      })
      tools.add({
        name: 'runs_heard',
        description: 'Lists the run events the subscription delivered, once it has heard the given number',
        input: z.object({count: z.number()}),
        output: z.object({heard: z.array(z.string())}),
        execute: async ({count}) => ({output: {heard: await heardRuns(count)}}),
      })
      tools.add({
        name: 'session_rename',
        description: 'Renames the session that calls the tool and reads its title back',
        input: z.object({title: z.string()}),
        output: z.object({title: z.unknown()}),
        execute: async ({title}, context) => {
          await ctx.session.update({sessionId: context.sessionId, title})
          return {output: {title: (await ctx.session.get({sessionId: context.sessionId})).title ?? null}}
        },
      })
      tools.add({
        name: 'session_create',
        description: 'Create a session from the plugin',
        input: z.object({title: z.string()}),
        output: z.object({id: z.string(), title: z.unknown()}),
        execute: async ({title}) => {
          const made = await ctx.session.create({title})
          return {output: {id: made.id, title: made.title ?? null}}
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
