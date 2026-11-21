import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'
import {Rpc} from '@conciv/plugin/rpc'

const Desk = Rpc.define({
  id: 'desk',
  methods: {
    echo: {input: z.object({text: z.string()}), output: z.object({text: z.string()})},
    lock: {
      input: z.object({}),
      output: z.object({}),
      errors: {LOCKED: z.object({reason: z.string()})},
    },
    crash: {input: z.object({}), output: z.object({})},
  },
  events: {},
})

export default Plugin.define({
  id: 'desk',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.rpc
        .register(Desk, {
          echo: ({text}) => Effect.succeed({text}),
          lock: (_input, call) => Effect.fail(call.error('LOCKED', 'The desk is locked', {reason: 'night shift'})),
          crash: () => Effect.die(new Error('the desk broke')),
        })
        .pipe(Effect.orDie)
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'desk_echo',
          description: 'Say the text back',
          input: z.object({text: z.string()}),
          output: z.object({text: z.string()}),
          execute: ({text}) => Effect.succeed({output: {text}}),
        })
      })
    }),
})
