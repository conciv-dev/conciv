import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'
import {Rpc} from '@conciv/plugin/rpc'
import {SessionId} from '@conciv/protocol/chat-types'

const Desk = Rpc.define({
  id: 'desk',
  methods: {
    pin: {input: z.object({sessionId: SessionId}), output: z.object({})},
  },
  events: {},
})

export default Plugin.define({
  id: 'desk',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'desk_echo',
          description: 'Say the text back',
          input: z.object({text: z.string()}),
          output: z.object({text: z.string(), callId: z.string()}),
          execute: ({text}, context) => Effect.succeed({output: {text, callId: context.id}}),
        })
        tools.add({
          name: 'desk_agent',
          description: 'Say which agent called this tool',
          input: z.object({}),
          output: z.object({agent: z.string()}),
          execute: (_input, context) => Effect.succeed({output: {agent: context.agent}}),
        })
      })
      yield* ctx.session.hook('context', (input) =>
        Effect.sync(() => {
          input.system.push({type: 'text', text: 'HOOKED'})
        }),
      )
      yield* ctx.rpc
        .register(Desk, {
          pin: ({sessionId}) =>
            ctx.session.instructions.entry
              .put({sessionId, key: 'desk', value: 'The desk keeps the notes of this session.'})
              .pipe(Effect.orDie, Effect.as({})),
        })
        .pipe(Effect.orDie)
    }),
})
