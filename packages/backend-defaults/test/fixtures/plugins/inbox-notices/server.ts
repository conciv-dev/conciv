import {Schema} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'
import {SessionId} from '@conciv/protocol/schema/session-id'

const OptionsSchema = z.object({idleNotice: z.object({resume: z.boolean()}).optional()})

const NoticeSchema = z.object({
  sessionId: z.string().optional(),
  id: z.string().optional(),
  text: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.json()).optional(),
  delivery: z.enum(['steer', 'queue']).optional(),
  resume: z.boolean().optional(),
})

const ConflictSchema = z.object({sessionID: z.string(), inputID: z.string()})

export default Plugin.define({
  id: 'inbox-notices',
  async setup(ctx) {
    const readSessionId = Schema.decodeUnknownSync(SessionId)
    const {idleNotice} = OptionsSchema.parse(ctx.options)
    const idles: string[] = []
    const idled = {next: Promise.withResolvers<void>()}
    const heardIdles = async (count: number): Promise<string[]> => {
      while (idles.length < count) await idled.next.promise
      return [...idles]
    }
    await ctx.session.hook('experimental.idle', async (event) => {
      idles.push(event.sessionId)
      if (idleNotice !== undefined && idles.length === 1) {
        await ctx.session.synthetic({
          sessionID: event.sessionId,
          text: 'Keep going',
          description: 'Continuing',
          metadata: {source: 'test'},
          resume: idleNotice.resume,
        })
      }
      idled.next.resolve()
      idled.next = Promise.withResolvers<void>()
    })
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'notice',
        description: 'Admits a synthetic notice to a session, the calling one unless another is named',
        input: NoticeSchema,
        output: z.unknown(),
        execute: async ({sessionId, ...notice}, context) => {
          const target = sessionId === undefined ? context.sessionId : readSessionId(sessionId)
          return ctx.session.synthetic({...notice, sessionID: target}).then(
            (admitted) => ({output: admitted}),
            (error: unknown) => ({
              output: {
                refused: error instanceof Error ? error.name : String(error),
                conflict: ConflictSchema.safeParse(error).data,
              },
            }),
          )
        },
      })
      tools.add({
        name: 'idles_heard',
        description: 'Lists the sessions the idle hook saw, once it has run the given number of times',
        input: z.object({count: z.number()}),
        output: z.object({idles: z.array(z.string())}),
        execute: async ({count}) => ({output: {idles: await heardIdles(count)}}),
      })
      tools.add({
        name: 'session_remove',
        description: 'Deletes a session from the plugin',
        input: z.object({sessionId: z.string()}),
        output: z.object({removed: z.string()}),
        execute: async ({sessionId}) => {
          await ctx.session.remove({sessionId: readSessionId(sessionId)})
          return {output: {removed: sessionId}}
        },
      })
    })
  },
})
