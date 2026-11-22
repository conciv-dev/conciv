import {Schema} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin'
import {SessionId} from '@conciv/plugin/schema/session-id'

export default Plugin.define({
  id: 'guarded',
  async setup(ctx) {
    const readSessionId = Schema.decodeUnknownSync(SessionId)
    const shown = (request: {id: string; action: string; resources: ReadonlyArray<string>}) => ({
      id: request.id,
      action: request.action,
      resources: request.resources,
    })
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'guarded_write',
        description: 'Writes a file once the guarded.write permission allows it',
        input: z.object({file: z.string()}),
        output: z.object({written: z.string()}),
        execute: async ({file}, context) => {
          await ctx.permission.assert({
            sessionId: context.sessionId,
            agent: context.agent,
            action: 'guarded.write',
            resources: [file],
            save: [file],
          })
          return {output: {written: file}}
        },
      })
      tools.add({
        name: 'guarded_read',
        description: 'Reads a file, asking even when every action is allowed',
        input: z.object({file: z.string()}),
        output: z.object({read: z.string()}),
        execute: async ({file}, context) => {
          await ctx.permission.assert({
            sessionId: context.sessionId,
            agent: context.agent,
            action: 'guarded.read',
            resources: [file],
            fallback: 'ask',
          })
          return {output: {read: file}}
        },
      })
    })
    await ctx.rpc.register(
      {
        id: 'asks',
        methods: {
          list: {input: z.object({sessionId: z.string()}), output: z.array(z.unknown())},
          get: {input: z.object({sessionId: z.string(), requestId: z.string()}), output: z.unknown()},
          reply: {
            input: z.object({
              sessionId: z.string(),
              requestId: z.string(),
              decision: z.enum(['once', 'always', 'reject']),
            }),
            output: z.object({replied: z.boolean()}),
          },
        },
        events: {},
      },
      {
        list: async ({sessionId}) => (await ctx.permission.list({sessionId: readSessionId(sessionId)})).map(shown),
        get: async ({sessionId, requestId}) =>
          shown(await ctx.permission.get({sessionId: readSessionId(sessionId), requestId})),
        reply: async ({sessionId, requestId, decision}) => {
          await ctx.permission.reply({sessionId: readSessionId(sessionId), requestId, decision})
          return {replied: true}
        },
      },
    )
  },
})
